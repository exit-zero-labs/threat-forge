import { describe, expect, it } from "vitest";
import { z } from "zod";
import { assertToolPairing } from "@/lib/ai/protocol/messages";
import { resolveTurnLimits } from "./limits";
import { createToolRegistry, defineExecutableTool } from "./tool-runtime";
import {
	createIdleTurnState,
	reduceTurn,
	type TurnInput,
	type TurnPhase,
	type TurnState,
} from "./turn-machine";

const addTool = defineExecutableTool({
	name: "add_thing",
	description: "Add a thing.",
	input: { name: z.string().min(1) },
	effect: "mutate",
	destructive: false,
	summarize: (input) => `Add ${input.name}`,
	execute: async (input) => ({ status: "ok", result: `added ${input.name}` }),
});

const readTool = defineExecutableTool({
	name: "read_thing",
	description: "Read a thing.",
	input: { q: z.string().min(1) },
	effect: "read",
	destructive: false,
	summarize: () => "read",
	execute: async () => ({ status: "ok", result: "read ok" }),
});

const deleteTool = defineExecutableTool({
	name: "delete_thing",
	description: "Delete a thing.",
	input: { id: z.string().min(1) },
	effect: "mutate",
	destructive: true,
	summarize: (input) => `Delete ${input.id}`,
	execute: async (input) => ({ status: "ok", result: `deleted ${input.id}` }),
});

const registry = createToolRegistry([addTool, readTool, deleteTool]);

function submit(overrides: Partial<Extract<TurnInput, { type: "submit" }>> = {}): TurnInput {
	return {
		type: "submit",
		text: "hi",
		baseMessages: [],
		toolSet: registry,
		limits: resolveTurnLimits(),
		nowMs: 0,
		...overrides,
	};
}

/** A stateful reducer driver that records the phase after every input. */
function driver(initial: TurnState = createIdleTurnState()) {
	let state = initial;
	const phases: TurnPhase[] = [];
	return {
		apply(input: TurnInput) {
			const prev = state.phase;
			state = reduceTurn(state, input);
			if (state.phase !== prev) phases.push(state.phase);
			return state;
		},
		get: () => state,
		requestingCount: () => phases.filter((p) => p === "requesting").length,
	};
}

/** A driver already advanced through `submit`, so the first request transition is recorded. */
function started(overrides: Partial<Extract<TurnInput, { type: "submit" }>> = {}) {
	const d = driver();
	d.apply(submit(overrides));
	return d;
}

/** Drive one auto-approved read-only iteration to completion of its calls, then advance. */
function autoIteration(d: ReturnType<typeof driver>, callId: string, nowMs: number): void {
	d.apply({ type: "message_start", model: "test-model" });
	d.apply({ type: "tool_call_complete", id: callId, name: "read_thing", input: { q: "x" } });
	d.apply({ type: "message_stop", stopReason: "tool_use" });
	d.apply({ type: "startCall", callId });
	d.apply({ type: "callSettled", callId, outcome: { status: "ok", result: "read ok" } });
	d.apply({ type: "advance", nowMs });
}

describe("submit", () => {
	it("freezes the tool set and starts the budget on the first request", () => {
		const state = reduceTurn(createIdleTurnState(), submit({ text: "hello" }));
		expect(state.phase).toBe("requesting");
		expect(state.iteration).toBe(1);
		expect(state.budget.iterationsStarted).toBe(1);
		expect(state.toolSet).toBe(registry);
		expect(state.messages).toEqual([{ role: "user", content: [{ type: "text", text: "hello" }] }]);
	});
});

describe("streaming and message assembly", () => {
	it("builds one assistant message with text then a tool_call block", () => {
		const d = driver();
		d.apply(submit());
		d.apply({ type: "message_start", model: "m" });
		d.apply({ type: "text_delta", text: "Adding" });
		d.apply({ type: "text_delta", text: " it" });
		d.apply({ type: "tool_call_complete", id: "c1", name: "add_thing", input: { name: "DB" } });
		const state = d.get();
		const assistant = state.messages[state.messages.length - 1];
		expect(assistant.role).toBe("assistant");
		expect(assistant.content).toEqual([
			{ type: "text", text: "Adding it" },
			{ type: "tool_call", id: "c1", name: "add_thing", input: { name: "DB" } },
		]);
		expect(state.calls).toHaveLength(1);
		expect(state.calls[0].status).toBe("pending");
	});

	it("keeps a completed tool call pending until the user approves", () => {
		const d = driver();
		d.apply(submit());
		d.apply({ type: "message_start", model: "m" });
		d.apply({ type: "tool_call_complete", id: "c1", name: "add_thing", input: { name: "DB" } });
		expect(d.apply({ type: "message_stop", stopReason: "tool_use" }).phase).toBe(
			"awaiting_approval",
		);
		expect(d.get().calls[0].status).toBe("pending");
		expect(d.get().grants).toHaveLength(0);
	});

	it("auto-approves a read-only tool without prompting", () => {
		const d = driver();
		d.apply(submit());
		d.apply({ type: "message_start", model: "m" });
		d.apply({ type: "tool_call_complete", id: "r1", name: "read_thing", input: { q: "x" } });
		expect(d.apply({ type: "message_stop", stopReason: "tool_use" }).phase).toBe("executing");
		expect(d.get().calls[0].status).toBe("approved");
		expect(d.get().grants[0].scope).toBe("auto");
	});

	it("records an unknown tool as a failed call and a violation without preparing", () => {
		const d = driver();
		d.apply(submit());
		d.apply({ type: "message_start", model: "m" });
		d.apply({ type: "tool_call_complete", id: "c1", name: "run_shell", input: {} });
		const state = d.get();
		expect(state.calls[0].status).toBe("failed");
		expect(state.calls[0].result).toContain("Unknown tool");
		expect(state.violations.map((v) => v.violation)).toContain("unknown_tool");
	});

	it("records a prepare failure with the field-level issue text", () => {
		const d = driver();
		d.apply(submit());
		d.apply({ type: "message_start", model: "m" });
		d.apply({ type: "tool_call_complete", id: "c1", name: "add_thing", input: { name: 42 } });
		expect(d.get().calls[0].status).toBe("failed");
		expect(d.get().calls[0].result).toContain("name");
	});

	it("rejects a reused call id and adds no second block", () => {
		const d = driver();
		d.apply(submit());
		d.apply({ type: "message_start", model: "m" });
		d.apply({ type: "tool_call_complete", id: "c1", name: "add_thing", input: { name: "A" } });
		d.apply({ type: "tool_call_complete", id: "c1", name: "add_thing", input: { name: "B" } });
		const state = d.get();
		expect(state.calls).toHaveLength(1);
		expect(state.violations.map((v) => v.violation)).toContain("duplicate_call_id");
	});
});

describe("message_stop", () => {
	it("settles as completed for an end_turn stop", () => {
		const d = driver();
		d.apply(submit());
		d.apply({ type: "message_start", model: "m" });
		d.apply({ type: "text_delta", text: "done" });
		const state = d.apply({ type: "message_stop", stopReason: "end_turn" });
		expect(state.phase).toBe("settled");
		expect(state.outcome).toBe("completed");
	});

	it("settles as completed for a tool_use stop that opened zero calls", () => {
		// A provider quirk must not become an infinite loop.
		const d = driver();
		d.apply(submit());
		d.apply({ type: "message_start", model: "m" });
		const state = d.apply({ type: "message_stop", stopReason: "tool_use" });
		expect(state.phase).toBe("settled");
		expect(state.outcome).toBe("completed");
		expect(state.iteration).toBe(1);
	});
});

describe("the iteration ceiling", () => {
	it("settles as bounded after exactly maxIterations requests", () => {
		const d = started({ limits: resolveTurnLimits({ maxIterations: 3 }) });
		let step = 0;
		while (d.get().phase !== "settled" && step < 50) {
			autoIteration(d, `r${step}`, 1_000);
			step += 1;
		}
		expect(d.get().outcome).toBe("bounded");
		// The counting assertion: exactly three requests were made, no more.
		expect(d.requestingCount()).toBe(3);
		expect(d.get().notice).toContain("step limit");
	});

	it("raising maxIterations by one produces exactly one more request (control)", () => {
		const d = started({ limits: resolveTurnLimits({ maxIterations: 4 }) });
		let step = 0;
		while (d.get().phase !== "settled" && step < 50) {
			autoIteration(d, `r${step}`, 1_000);
			step += 1;
		}
		expect(d.get().outcome).toBe("bounded");
		expect(d.requestingCount()).toBe(4);
	});

	it("settles as bounded on the deadline even with iteration headroom", () => {
		const d = started({ limits: resolveTurnLimits({ maxIterations: 8, turnDeadlineMs: 10_000 }) });
		// The first advance is past the deadline: nowMs beyond startedAt + turnDeadlineMs.
		autoIteration(d, "r0", 10_001);
		expect(d.get().outcome).toBe("bounded");
		expect(d.get().notice).toContain("longer than allowed");
	});
});

describe("a full two-iteration turn", () => {
	it("produces two requests and a pairable message history", () => {
		const d = started();
		// Iteration 1: an auto-approved read call.
		autoIteration(d, "r0", 1_000);
		expect(d.get().phase).toBe("requesting");
		// Iteration 2: the model finishes with text.
		d.apply({ type: "message_start", model: "m" });
		d.apply({ type: "text_delta", text: "all set" });
		d.apply({ type: "message_stop", stopReason: "end_turn" });

		const state = d.get();
		expect(state.outcome).toBe("completed");
		expect(d.requestingCount()).toBe(2);
		expect(state.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
		expect(assertToolPairing(state.messages)).toEqual([]);
	});
});

describe("cancellation", () => {
	it("marks two approved calls not-run and leaves a pairable history", () => {
		const d = started();
		d.apply({ type: "message_start", model: "m" });
		d.apply({ type: "tool_call_complete", id: "c1", name: "add_thing", input: { name: "A" } });
		d.apply({ type: "tool_call_complete", id: "c2", name: "add_thing", input: { name: "B" } });
		d.apply({ type: "message_stop", stopReason: "tool_use" });
		d.apply({ type: "approveCall", callId: "c1" });
		d.apply({ type: "approveCall", callId: "c2" });
		expect(d.get().phase).toBe("executing");

		const state = d.apply({ type: "cancel" });
		expect(state.phase).toBe("settled");
		expect(state.outcome).toBe("cancelled");
		expect(state.calls.map((c) => c.status)).toEqual(["denied", "denied"]);
		expect(state.calls.every((c) => c.denialReason === "turn_cancelled")).toBe(true);
		expect(assertToolPairing(state.messages)).toEqual([]);
	});
});

describe("settled is terminal", () => {
	it("drops every late input and records one post_settlement_event violation each", () => {
		const d = driver();
		d.apply(submit());
		d.apply({ type: "message_start", model: "m" });
		d.apply({ type: "message_stop", stopReason: "end_turn" });
		const settledMessages = d.get().messages;

		d.apply({ type: "text_delta", text: "late" });
		d.apply({ type: "tool_call_complete", id: "late", name: "add_thing", input: { name: "X" } });
		d.apply({ type: "message_stop", stopReason: "tool_use" });

		const state = d.get();
		expect(state.messages).toEqual(settledMessages);
		expect(state.calls).toHaveLength(0);
		expect(state.violations.filter((v) => v.violation === "post_settlement_event")).toHaveLength(3);
	});
});

describe("denial", () => {
	it("marks a declined call denied(user_declined) and sticks the (tool, input)", () => {
		const d = started();
		d.apply({ type: "message_start", model: "m" });
		d.apply({ type: "tool_call_complete", id: "c1", name: "add_thing", input: { name: "A" } });
		d.apply({ type: "message_stop", stopReason: "tool_use" });
		const state = d.apply({ type: "denyCall", callId: "c1" });
		expect(state.calls[0].status).toBe("denied");
		expect(state.calls[0].denialReason).toBe("user_declined");
		expect(state.denials).toHaveLength(1);
	});

	it("auto-denies a later identical input but re-prompts a different one", () => {
		const d = started();
		d.apply({ type: "message_start", model: "m" });
		d.apply({ type: "tool_call_complete", id: "c1", name: "add_thing", input: { name: "A" } });
		d.apply({ type: "message_stop", stopReason: "tool_use" });
		d.apply({ type: "denyCall", callId: "c1" });
		d.apply({ type: "advance", nowMs: 1_000 });
		// Iteration 2 re-requests the same input, then a different input.
		d.apply({ type: "message_start", model: "m" });
		d.apply({ type: "tool_call_complete", id: "c2", name: "add_thing", input: { name: "A" } });
		d.apply({ type: "tool_call_complete", id: "c3", name: "add_thing", input: { name: "B" } });
		const state = d.get();
		const c2 = state.calls.find((c) => c.id === "c2");
		const c3 = state.calls.find((c) => c.id === "c3");
		expect(c2?.status).toBe("denied");
		expect(c2?.denialReason).toBe("user_declined");
		expect(c3?.status).toBe("pending");
	});
});

describe("batch approval", () => {
	it("grants only the explicit clicked ids and excludes destructive calls", () => {
		const d = started();
		d.apply({ type: "message_start", model: "m" });
		d.apply({ type: "tool_call_complete", id: "c1", name: "add_thing", input: { name: "A" } });
		d.apply({ type: "tool_call_complete", id: "c2", name: "add_thing", input: { name: "B" } });
		d.apply({ type: "tool_call_complete", id: "c3", name: "delete_thing", input: { id: "old" } });
		d.apply({ type: "tool_call_complete", id: "c4", name: "add_thing", input: { name: "D" } });
		d.apply({ type: "message_stop", stopReason: "tool_use" });
		// The user clicked "Approve all" while only c1, c2, c3 were rendered.
		d.apply({ type: "approveBatch", callIds: ["c1", "c2", "c3"] });

		const state = d.get();
		const status = (id: string) => state.calls.find((c) => c.id === id)?.status;
		expect(status("c1")).toBe("approved");
		expect(status("c2")).toBe("approved");
		// Destructive: excluded from the batch, still pending with its own button.
		expect(status("c3")).toBe("pending");
		// Arrived after the click: not in the list, still pending.
		expect(status("c4")).toBe("pending");
	});
});
