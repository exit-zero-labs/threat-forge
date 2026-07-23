import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamConversationHandlers } from "@/lib/ai/protocol/client";
import type { StreamEvent } from "@/lib/ai/protocol/events";
import { useHistoryStore } from "@/stores/history-store";
import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { ThreatModel } from "@/types/threat-model";
import { useAiTurnStore } from "./ai-turn-store";
import { useChatStore } from "./chat-store";

const streamConversationMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/lib/ai/protocol/client", () => ({ streamConversation: streamConversationMock }));
vi.mock("@/lib/adapters/get-chat-transport", () => ({
	getChatTransport: () => Promise.resolve({ open: vi.fn() }),
}));

const model: ThreatModel = {
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

/** Queue one scripted event list per provider request. */
function script(...responses: StreamEvent[][]): void {
	let index = 0;
	streamConversationMock.mockImplementation(
		async (
			_request: unknown,
			_transport: unknown,
			handlers: StreamConversationHandlers,
			signal?: AbortSignal,
		) => {
			const events = responses[index] ?? [{ type: "message_stop", stopReason: "end_turn" }];
			index += 1;
			for (const event of events) {
				if (signal?.aborted) {
					handlers.onEvent({ type: "aborted" });
					return;
				}
				handlers.onEvent(event);
			}
		},
	);
}

/** Drain the microtask/timer queue so the fire-and-forget runner settles. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
	vi.clearAllMocks();
	useAiTurnStore.getState().resetTurn();
	useModelStore.getState().clearModel();
	useHistoryStore.getState().clear();
	useModelStore.getState().setModel(structuredClone(model), null);
	useHistoryStore.getState().clear();
	useChatStore.setState({ provider: "anthropic" });
	useSettingsStore.setState((state) => ({
		settings: { ...state.settings, aiModelAnthropic: "claude-sonnet-4-20250514" },
	}));
});

describe("submitTurn against a tool-capable model", () => {
	it("pauses for approval, commits on approve, and settles completed", async () => {
		script(
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
				{ type: "message_start", model: "m" },
				{ type: "text_delta", text: "done" },
				{ type: "message_stop", stopReason: "end_turn" },
			],
		);

		await useAiTurnStore.getState().submitTurn("add a cache", model);
		await flush();

		expect(useAiTurnStore.getState().turn?.phase).toBe("awaiting_approval");
		// Nothing committed while the call is pending — the review gate holds.
		expect(useModelStore.getState().model?.elements.some((e) => e.name === "Cache")).toBe(false);

		useAiTurnStore.getState().approveCall("c1");
		await flush();

		const turn = useAiTurnStore.getState().turn;
		expect(turn?.phase).toBe("settled");
		expect(turn?.outcome).toBe("completed");
		expect(useModelStore.getState().model?.elements.some((e) => e.name === "Cache")).toBe(true);

		// One undo reverts the whole turn.
		useAiTurnStore.getState().undoTurn();
		expect(useModelStore.getState().model?.elements.some((e) => e.name === "Cache")).toBe(false);
	});
});

describe("submitTurn against a tool-incapable model", () => {
	it("runs a text-only turn with an empty tool set and a fenced prompt", async () => {
		useSettingsStore.setState((state) => ({
			settings: { ...state.settings, aiModelAnthropic: "some-unlisted-model" },
		}));
		script([
			{ type: "message_start", model: "m" },
			{ type: "text_delta", text: "```actions\n[]\n```" },
			{ type: "message_stop", stopReason: "end_turn" },
		]);

		await useAiTurnStore.getState().submitTurn("hello", model);
		await flush();

		const turn = useAiTurnStore.getState().turn;
		expect(turn?.outcome).toBe("completed");
		expect(turn?.toolSet.list()).toHaveLength(0);
		// The request advertised no tools, so preflight allowed the unknown model.
		const request = streamConversationMock.mock.calls[0][0];
		expect(request.tools).toHaveLength(0);
		// The system prompt kept the fenced actions instructions.
		expect(request.system).toContain("```actions");
	});
});

describe("cancelling a live turn", () => {
	it("settles the turn cancelled and commits nothing", async () => {
		script([
			{ type: "message_start", model: "m" },
			{
				type: "tool_call_complete",
				id: "c1",
				name: "add_element",
				input: { action: "add_element", element: { type: "process", name: "Cache" } },
			},
			{ type: "message_stop", stopReason: "tool_use" },
		]);

		await useAiTurnStore.getState().submitTurn("add a cache", model);
		await flush();
		expect(useAiTurnStore.getState().turn?.phase).toBe("awaiting_approval");

		useAiTurnStore.getState().cancelActiveTurn();
		await flush();

		expect(useAiTurnStore.getState().turn?.outcome).toBe("cancelled");
		expect(useModelStore.getState().model?.elements.some((e) => e.name === "Cache")).toBe(false);
	});
});

describe("stopGenerating integration", () => {
	it("is an idempotent no-op when no turn is running", () => {
		// The idle contract document-registry depends on: synchronous, throws nothing.
		expect(() => useChatStore.getState().stopGenerating()).not.toThrow();
		expect(useChatStore.getState().isStreaming).toBe(false);
		expect(useAiTurnStore.getState().turn).toBeNull();
	});

	it("settles a live turn when the chat store cancels", async () => {
		script([
			{ type: "message_start", model: "m" },
			{
				type: "tool_call_complete",
				id: "c1",
				name: "add_element",
				input: { action: "add_element", element: { type: "process", name: "Cache" } },
			},
			{ type: "message_stop", stopReason: "tool_use" },
		]);
		await useAiTurnStore.getState().submitTurn("add a cache", model);
		await flush();

		useChatStore.getState().stopGenerating();
		await flush();

		expect(useAiTurnStore.getState().turn?.outcome).toBe("cancelled");
	});
});

describe("resetTurn clears conversation context", () => {
	const textTurn = (text: string): StreamEvent[] => [
		{ type: "message_start", model: "m" },
		{ type: "text_delta", text },
		{ type: "message_stop", stopReason: "end_turn" },
	];

	it("clears the turn and in-memory history so the next request sends no prior messages", async () => {
		script(textTurn("first reply"), textTurn("second reply"));
		await useAiTurnStore.getState().submitTurn("first question", model);
		await flush();
		expect(useAiTurnStore.getState().turn?.outcome).toBe("completed");

		useAiTurnStore.getState().resetTurn();
		expect(useAiTurnStore.getState().turn).toBeNull();

		await useAiTurnStore.getState().submitTurn("second question", model);
		await flush();

		const calls = streamConversationMock.mock.calls;
		const lastRequest = calls[calls.length - 1][0];
		const texts = lastRequest.messages
			.flatMap((m: { content: Array<{ type: string; text?: string }> }) => m.content)
			.filter((b: { type: string }) => b.type === "text")
			.map((b: { text?: string }) => b.text);
		expect(texts).toContain("second question");
		expect(texts).not.toContain("first question");
		expect(texts).not.toContain("first reply");
	});

	it("carries prior turn context into a follow-up turn when not reset (control)", async () => {
		script(textTurn("first reply"), textTurn("second reply"));
		await useAiTurnStore.getState().submitTurn("first question", model);
		await flush();
		await useAiTurnStore.getState().submitTurn("second question", model);
		await flush();

		const calls = streamConversationMock.mock.calls;
		const lastRequest = calls[calls.length - 1][0];
		const texts = lastRequest.messages
			.flatMap((m: { content: Array<{ type: string; text?: string }> }) => m.content)
			.filter((b: { type: string }) => b.type === "text")
			.map((b: { text?: string }) => b.text);
		// Without a reset, the follow-up continues the conversation.
		expect(texts).toContain("first question");
		expect(texts).toContain("second question");
	});
});

describe("undoAvailability", () => {
	it("is undoable after a committed turn and superseded after a later edit", async () => {
		script(
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
				{ type: "message_start", model: "m" },
				{ type: "text_delta", text: "done" },
				{ type: "message_stop", stopReason: "end_turn" },
			],
		);
		await useAiTurnStore.getState().submitTurn("add a cache", model);
		await flush();
		useAiTurnStore.getState().approveCall("c1");
		await flush();

		expect(useAiTurnStore.getState().undoAvailability()).toBe("undoable");

		// A later unrelated edit supersedes the turn's single undo entry.
		const current = useModelStore.getState().model;
		if (current) useHistoryStore.getState().pushSnapshot(current);
		expect(useAiTurnStore.getState().undoAvailability()).toBe("superseded");
	});

	it("is already_undone before any turn has run", () => {
		expect(useAiTurnStore.getState().undoAvailability()).toBe("already_undone");
	});
});
