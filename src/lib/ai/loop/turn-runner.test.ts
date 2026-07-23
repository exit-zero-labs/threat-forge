import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ConversationRequest } from "@/lib/ai/protocol/client";
import type { StreamEvent } from "@/lib/ai/protocol/events";
import { GRAPH_ACTION_TOOLS } from "@/lib/ai/tools/graph-action-tools";
import { useHistoryStore } from "@/stores/history-store";
import { useModelStore } from "@/stores/model-store";
import type { ThreatModel } from "@/types/threat-model";
import { resolveTurnLimits } from "./limits";
import { createToolRegistry, defineExecutableTool, type ToolOutcome } from "./tool-runtime";
import { createTurnRunner, type TurnConfig } from "./turn-runner";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const baseModel: ThreatModel = {
	version: "1.0",
	metadata: {
		title: "T",
		author: "A",
		created: "2026-01-01",
		modified: "2026-01-01",
		description: "",
	},
	elements: [
		{
			id: "web-app",
			type: "process",
			name: "Web App",
			trust_zone: "internal",
			description: "",
			technologies: [],
		},
	],
	data_flows: [],
	trust_boundaries: [],
	threats: [],
	diagrams: [],
};

/** A fake provider that dispatches a scripted event list per request and records each request. */
function scriptedStream(scripts: StreamEvent[][]) {
	const requests: ConversationRequest[] = [];
	let index = 0;
	const stream = async (
		request: ConversationRequest,
		onEvent: (event: StreamEvent) => void,
		signal: AbortSignal,
	): Promise<void> => {
		requests.push(request);
		const events = scripts[index] ?? [{ type: "message_stop", stopReason: "end_turn" }];
		index += 1;
		for (const event of events) {
			if (signal.aborted) {
				onEvent({ type: "aborted" });
				return;
			}
			onEvent(event);
		}
	};
	return { stream, requests };
}

function config(
	toolSet: TurnConfig["toolSet"],
	limits: TurnConfig["limits"] = resolveTurnLimits(),
): TurnConfig {
	return {
		text: "help",
		baseMessages: [],
		provider: "anthropic",
		modelId: "claude-sonnet-4-20250514",
		system: "SYSTEM",
		toolSet,
		limits,
		maxOutputTokens: 4096,
	};
}

const rateLimited: StreamEvent = {
	type: "error",
	error: { code: "rate_limited", message: "Rate limited; wait and try again." },
};

const getDocument = () => useModelStore.getState().model;

beforeEach(() => {
	useModelStore.getState().clearModel();
	useHistoryStore.getState().clear();
	useModelStore.getState().setModel(structuredClone(baseModel), null);
	useHistoryStore.getState().clear();
});

describe("the corrective feedback channel", () => {
	it("returns a prepare failure's field-level issue to the model as a tool_result", async () => {
		const registry = createToolRegistry(GRAPH_ACTION_TOOLS);
		const { stream, requests } = scriptedStream([
			[
				{ type: "message_start", model: "m" },
				// add_element with no name fails prepare.
				{
					type: "tool_call_complete",
					id: "c1",
					name: "add_element",
					input: { action: "add_element", element: { type: "process" } },
				},
				{ type: "message_stop", stopReason: "tool_use" },
			],
			[
				{ type: "message_start", model: "m" },
				{ type: "text_delta", text: "sorry" },
				{ type: "message_stop", stopReason: "end_turn" },
			],
		]);
		const runner = createTurnRunner({ stream, getDocument });
		await runner.submit(config(registry));

		expect(runner.getState().outcome).toBe("completed");
		// The second request carries a tool_result whose content names the missing field.
		const secondRequest = requests[1];
		const toolResults = secondRequest.messages.flatMap((m) =>
			m.content.filter((b) => b.type === "tool_result"),
		);
		expect(toolResults).toHaveLength(1);
		expect(toolResults[0].type === "tool_result" && toolResults[0].content).toContain("name");
	});
});

describe("a tool-incapable turn", () => {
	it("issues a request with an empty tool list when the tool set is empty", async () => {
		const emptyRegistry = createToolRegistry([]);
		const { stream, requests } = scriptedStream([
			[
				{ type: "message_start", model: "m" },
				{ type: "text_delta", text: "hi" },
				{ type: "message_stop", stopReason: "end_turn" },
			],
		]);
		const runner = createTurnRunner({ stream, getDocument });
		await runner.submit(config(emptyRegistry));

		expect(requests[0].tools).toHaveLength(0);
		expect(runner.getState().outcome).toBe("completed");
	});
});

describe("cancellation mid-execution", () => {
	it("discards an in-flight tool outcome and leaves the document unchanged", async () => {
		let resolveRun: (outcome: ToolOutcome) => void = () => {};
		const runGate = new Promise<ToolOutcome>((resolve) => {
			resolveRun = resolve;
		});
		const slowTool = defineExecutableTool({
			name: "slow_add",
			description: "A slow add.",
			input: { name: z.string().min(1) },
			effect: "mutate",
			destructive: false,
			summarize: (i) => `Add ${i.name}`,
			execute: () => runGate,
		});
		const registry = createToolRegistry([slowTool]);
		const { stream, requests } = scriptedStream([
			[
				{ type: "message_start", model: "m" },
				{ type: "tool_call_complete", id: "c1", name: "slow_add", input: { name: "DB" } },
				{ type: "message_stop", stopReason: "tool_use" },
			],
		]);
		const runner = createTurnRunner({ stream, getDocument });
		const documentBefore = useModelStore.getState().model;

		await runner.submit(config(registry));
		expect(runner.getState().phase).toBe("awaiting_approval");

		// Approve, which begins running the slow tool; do not await yet.
		const executing = runner.approveCall("c1");
		// Cancel while the tool is mid-run, then let the run resolve.
		runner.cancel();
		resolveRun({
			status: "ok",
			result: "added",
			document: { ...baseModel, metadata: { ...baseModel.metadata, title: "hijacked" } },
		});
		await executing;

		expect(runner.getState().outcome).toBe("cancelled");
		// The outcome was discarded: the document is reference-identical, and no
		// second request was opened.
		expect(useModelStore.getState().model).toBe(documentBefore);
		expect(requests).toHaveLength(1);
	});
});

describe("a mid-turn context overflow", () => {
	it("settles failed but keeps the committed call, which one undo reverts", async () => {
		const registry = createToolRegistry(GRAPH_ACTION_TOOLS);
		const { stream } = scriptedStream([
			[
				{ type: "message_start", model: "m" },
				{
					type: "tool_call_complete",
					id: "c1",
					name: "add_element",
					input: { action: "add_element", element: { type: "process", name: "Cache" } },
				},
				{ type: "message_stop", stopReason: "tool_use" },
			],
			[
				{
					type: "error",
					error: {
						code: "context_overflow",
						message: "This conversation is too long for the selected model.",
					},
				},
			],
		]);
		const runner = createTurnRunner({ stream, getDocument });
		const preTurn = useModelStore.getState().model;

		await runner.submit(config(registry));
		// Iteration 1 pauses for approval; approve and let it commit, then iteration 2 overflows.
		await runner.approveCall("c1");

		expect(runner.getState().outcome).toBe("failed");
		// The committed element survived the failure.
		expect(useModelStore.getState().model?.elements.some((e) => e.name === "Cache")).toBe(true);

		// One undo reverts the whole turn back to the pre-turn document.
		runner.undo();
		expect(useModelStore.getState().model).toEqual(preTurn);
	});
});

describe("the turn-level retry budget", () => {
	it("retries a transient pre-content failure and completes on the next attempt", async () => {
		const emptyRegistry = createToolRegistry([]);
		const { stream, requests } = scriptedStream([
			[rateLimited],
			[
				{ type: "message_start", model: "m" },
				{ type: "text_delta", text: "recovered" },
				{ type: "message_stop", stopReason: "end_turn" },
			],
		]);
		const runner = createTurnRunner({ stream, getDocument });

		await runner.submit(config(emptyRegistry, resolveTurnLimits({ maxRetriesPerTurn: 2 })));

		expect(runner.getState().outcome).toBe("completed");
		// One retry: the first attempt failed, the second succeeded.
		expect(requests).toHaveLength(2);
		expect(runner.getState().budget.retriesUsed).toBe(1);
	});

	it("stops retrying at the ceiling and settles failed", async () => {
		const emptyRegistry = createToolRegistry([]);
		const { stream, requests } = scriptedStream([[rateLimited], [rateLimited], [rateLimited]]);
		const runner = createTurnRunner({ stream, getDocument });

		await runner.submit(config(emptyRegistry, resolveTurnLimits({ maxRetriesPerTurn: 2 })));

		expect(runner.getState().outcome).toBe("failed");
		// Two retries were spent, then the failure surfaced on the third attempt.
		expect(requests).toHaveLength(3);
		expect(runner.getState().budget.retriesUsed).toBe(2);
	});
});
