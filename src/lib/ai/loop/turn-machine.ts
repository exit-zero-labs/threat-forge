/**
 * The turn as a pure reducer over stream events and user commands.
 *
 * `reduceTurn(state, input)` is total, pure, and the only writer of call status
 * and phase. It performs no I/O, holds no timers, and touches no store, so every
 * security property — no self-authorization, no scope widening, a real iteration
 * ceiling, one undo entry per turn — is provable with synchronous array inputs
 * and no mocks. The runner (`./turn-runner.ts`) performs effects by reading the
 * state this reducer produced; it can never execute a call the reducer refused to
 * move to `running`.
 *
 * Authorization state (grants, denials) lives *inside* `TurnState`, not beside
 * it. No code path outside a user command can produce a grant.
 */

import type { ProtocolError } from "@/lib/ai/protocol/errors";
import type { StreamEvent } from "@/lib/ai/protocol/events";
import type { ContentBlock, ProtocolMessage, ToolResultBlock } from "@/lib/ai/protocol/messages";
import {
	type ApprovalGrant,
	authorizeStart,
	autoGrantReadOnly,
	type DenialReason,
	type DenialRecord,
	grantForBatch,
	grantForCall,
	isDenied,
	type TurnViolation,
} from "./authorization";
import {
	type BudgetExhaustion,
	budgetExhaustion,
	createTurnBudget,
	DEFAULT_TURN_LIMITS,
	type TurnBudget,
	type TurnLimits,
} from "./limits";
import {
	createToolRegistry,
	type PreparedCall,
	type ToolEffect,
	type ToolOutcome,
	type ToolRegistry,
} from "./tool-runtime";

/** Where a turn is in its lifecycle. */
export type TurnPhase =
	| "idle"
	| "requesting"
	| "streaming"
	| "awaiting_approval"
	| "executing"
	| "settled";

/** How a settled turn ended. */
export type TurnOutcome = "completed" | "cancelled" | "bounded" | "failed";

/**
 * The seven call statuses. `denied` is the seventh the issue body does not list:
 * a user refusal needs a terminal state that is not `failed`, because folding it
 * into `failed` would tell the user their deliberate refusal was an execution
 * error and invite the model to retry it.
 */
export type CallStatus =
	| "pending"
	| "approved"
	| "running"
	| "succeeded"
	| "failed"
	| "undone"
	| "denied";

/** One model-requested tool call, tracked from arrival through its terminal state. */
export interface CallRecord {
	readonly id: string;
	readonly toolName: string;
	/** Canonical digest of the validated input; `""` for a call never prepared. */
	readonly inputDigest: string;
	/** Plain-text summary for the approval card, or the failure text for a bad call. */
	readonly summary: string;
	/** Static effect from the resolved tool; `mutate` for unknown/failed records. */
	readonly effect: ToolEffect;
	/** Whether the resolved tool destroys information; `false` for unknown records. */
	readonly destructive: boolean;
	/** The iteration whose assistant message opened this call. */
	readonly iteration: number;
	readonly status: CallStatus;
	/** The runnable call, present only when preparation succeeded. */
	readonly prepared: PreparedCall | null;
	/** Result text once the call settled; the `tool_result` content. */
	readonly result: string | null;
	/** True when the `tool_result` must carry `isError`. */
	readonly isError: boolean;
	/** Why a `denied` call did not run. */
	readonly denialReason: DenialReason | null;
}

/** A refusal the reducer recorded, with the call it concerned when there was one. */
export interface TurnViolationRecord {
	readonly violation: TurnViolation;
	readonly callId: string | null;
	readonly detail: string;
}

/**
 * The whole turn state.
 *
 * `toolSet` and `limits` are frozen at `submit` and never re-read from a live
 * registry, so a registry or settings change mid-turn cannot widen a running
 * turn. `error` and `notice` are mutually exclusive: a `failed` turn carries the
 * user-safe `error`, a `bounded` turn carries the informational `notice`.
 */
export interface TurnState {
	readonly phase: TurnPhase;
	readonly iteration: number;
	readonly budget: TurnBudget;
	/** Frozen at submit; the single source of the turn's bounds. */
	readonly limits: TurnLimits;
	/** Frozen at submit; the tools this turn may call. */
	readonly toolSet: ToolRegistry;
	/** The full conversation for this turn: prior history, the user turn, and every iteration since. */
	readonly messages: readonly ProtocolMessage[];
	readonly calls: readonly CallRecord[];
	readonly grants: readonly ApprovalGrant[];
	readonly denials: readonly DenialRecord[];
	readonly violations: readonly TurnViolationRecord[];
	readonly outcome: TurnOutcome | null;
	/** Informational bounded-turn notice; never an error banner. */
	readonly notice: string | null;
	/** User-safe failure, set only for a `failed` turn. */
	readonly error: ProtocolError | null;
}

/** A user or runner command, distinct from a stream event by its `type` literal. */
export type TurnCommand =
	| {
			type: "submit";
			text: string;
			baseMessages: readonly ProtocolMessage[];
			toolSet: ToolRegistry;
			limits: TurnLimits;
			nowMs: number;
	  }
	| { type: "approveCall"; callId: string }
	| { type: "approveBatch"; callIds: readonly string[] }
	| { type: "denyCall"; callId: string }
	| { type: "startCall"; callId: string }
	| { type: "callSettled"; callId: string; outcome: ToolOutcome }
	/** The runner's per-iteration progression signal; carries the clock the reducer must not read itself. */
	| { type: "advance"; nowMs: number }
	/** The runner re-issued a failed request; count it against the turn's retry budget. */
	| { type: "retry" }
	| { type: "cancel" }
	| { type: "undoTurn" };

/** Everything the reducer accepts: a protocol event or a command. */
export type TurnInput = StreamEvent | TurnCommand;

const EMPTY_TOOL_REGISTRY = createToolRegistry([]);

/** The resting state before any turn begins. */
export function createIdleTurnState(): TurnState {
	return {
		phase: "idle",
		iteration: 0,
		budget: createTurnBudget(0),
		limits: DEFAULT_TURN_LIMITS,
		toolSet: EMPTY_TOOL_REGISTRY,
		messages: [],
		calls: [],
		grants: [],
		denials: [],
		violations: [],
		outcome: null,
		notice: null,
		error: null,
	};
}

/** The total, pure transition function. */
export function reduceTurn(state: TurnState, input: TurnInput): TurnState {
	if (state.phase === "settled") {
		// A settled turn is terminal. The one exception is `undoTurn`, which flips
		// this turn's applied calls to `undone`; every other late input is dropped
		// and recorded so a provider quirk or an injected late frame cannot revive it.
		if (input.type === "undoTurn") return markTurnUndone(state);
		return recordViolation(state, "post_settlement_event", null, `Dropped "${input.type}".`);
	}

	switch (input.type) {
		case "submit":
			return onSubmit(state, input);
		case "message_start":
			return onMessageStart(state);
		case "text_delta":
			return onTextDelta(state, input.text);
		case "tool_call_start":
		case "tool_call_input_delta":
			// Progress only: no call record is created and no JSON is parsed here.
			return state;
		case "tool_call_complete":
			return onToolCallComplete(state, input);
		case "usage":
			// Token usage is not surfaced (token display is a non-goal); accept and ignore it.
			return state;
		case "message_stop":
			return onMessageStop(state, input.stopReason);
		case "error":
			return onError(state, input.error);
		case "aborted":
		case "cancel":
			return onCancelled(state);
		case "approveCall":
			return onApproveCall(state, input.callId);
		case "approveBatch":
			return onApproveBatch(state, input.callIds);
		case "denyCall":
			return onDenyCall(state, input.callId);
		case "startCall":
			return onStartCall(state, input.callId);
		case "callSettled":
			return onCallSettled(state, input.callId, input.outcome);
		case "advance":
			return onAdvance(state, input.nowMs);
		case "retry":
			return onRetry(state);
		case "undoTurn":
			// A turn that has not settled has nothing applied to undo.
			return state;
	}
}

function onRetry(state: TurnState): TurnState {
	// A retry only makes sense before the request produced its first event, so the
	// turn is still `requesting`. The runner enforces the ceiling with `budgetExhaustion`.
	if (state.phase !== "requesting") return state;
	return { ...state, budget: { ...state.budget, retriesUsed: state.budget.retriesUsed + 1 } };
}

// --- Command and event handlers ---------------------------------------------

function onSubmit(state: TurnState, input: Extract<TurnCommand, { type: "submit" }>): TurnState {
	if (state.phase !== "idle") return state;

	const budget = createTurnBudget(input.nowMs);
	budget.iterationsStarted = 1;
	const userMessage: ProtocolMessage = {
		role: "user",
		content: [{ type: "text", text: input.text }],
	};
	return {
		...createIdleTurnState(),
		phase: "requesting",
		iteration: 1,
		budget,
		limits: input.limits,
		toolSet: input.toolSet,
		messages: [...input.baseMessages, userMessage],
	};
}

function onMessageStart(state: TurnState): TurnState {
	if (state.phase !== "requesting") return state;
	// Open a fresh assistant message for this iteration's output.
	return {
		...state,
		phase: "streaming",
		messages: [...state.messages, { role: "assistant", content: [] }],
	};
}

function onTextDelta(state: TurnState, text: string): TurnState {
	if (state.phase !== "streaming") return state;
	return { ...state, messages: appendAssistantText(state.messages, text) };
}

function onToolCallComplete(
	state: TurnState,
	event: Extract<StreamEvent, { type: "tool_call_complete" }>,
): TurnState {
	if (state.phase !== "streaming") return state;

	// A reused call id is a malformed stream from the model. Record it and add
	// nothing, so pairing stays valid (one block per id) and the injected replay
	// of an earlier id never yields a second execution.
	if (state.calls.some((c) => c.id === event.id)) {
		return recordViolation(
			state,
			"duplicate_call_id",
			event.id,
			`Reused tool call id "${event.id}".`,
		);
	}

	// The provider opened this call, so the assistant message must carry the block
	// and the turn must answer it — even when the tool is unknown or the input is
	// invalid. The block is added first, then the record is classified.
	const messages = appendAssistantBlock(state.messages, {
		type: "tool_call",
		id: event.id,
		name: event.name,
		input: event.input,
	});
	const withBlock: TurnState = { ...state, messages };

	const tool = state.toolSet.get(event.name);
	if (tool === undefined) {
		const text = `Unknown tool "${event.name}".`;
		const record = failedRecord(event.id, event.name, text, state.iteration);
		return recordViolation(addCall(withBlock, record), "unknown_tool", event.id, text);
	}

	// Enforce the per-iteration and per-turn caps before preparing: an excess call
	// is denied and never prepared, so a flood cannot run.
	const iterationCount = withBlock.calls.filter((c) => c.iteration === state.iteration).length;
	const overLimit =
		iterationCount >= state.limits.maxToolCallsPerIteration ||
		state.budget.toolCallsAccepted >= state.limits.maxToolCallsPerTurn;
	if (overLimit) {
		const record: CallRecord = {
			...blankRecord(event.id, event.name, state.iteration),
			effect: tool.effect,
			destructive: tool.destructive,
			status: "denied",
			denialReason: "limit_exceeded",
			result: "This turn reached its tool-call limit, so this call was not run.",
			isError: true,
			summary: `Not run (limit reached): ${event.name}`,
		};
		return recordViolation(
			addCall(withBlock, record),
			"limit_exceeded",
			event.id,
			"Tool-call limit reached.",
		);
	}

	const prepared = tool.prepare(event.input);
	if (!prepared.ok) {
		const text = prepared.issues.join("; ");
		const record: CallRecord = {
			...failedRecord(event.id, event.name, text, state.iteration),
			effect: tool.effect,
			destructive: tool.destructive,
		};
		return addCall(withBlock, record);
	}

	const digest = prepared.call.inputDigest;
	const accepted = { ...state.budget, toolCallsAccepted: state.budget.toolCallsAccepted + 1 };
	const base: CallRecord = {
		...blankRecord(event.id, event.name, state.iteration),
		inputDigest: digest,
		summary: prepared.call.summary,
		effect: tool.effect,
		destructive: tool.destructive,
		prepared: prepared.call,
	};

	// An identical input the user already refused this turn is auto-denied without
	// re-prompting — the sticky-denial anti-nagging rule.
	if (isDenied(state.denials, event.name, digest)) {
		const record: CallRecord = {
			...base,
			status: "denied",
			denialReason: "user_declined",
			result: "You declined an identical action earlier in this turn.",
			isError: true,
		};
		return { ...addCall(withBlock, record), budget: accepted };
	}

	// A read-only, non-destructive tool is auto-granted by the static local policy.
	if (tool.effect === "read" && !tool.destructive) {
		const record: CallRecord = { ...base, status: "approved" };
		const grant = autoGrantReadOnly(
			tool,
			{ callId: event.id, inputDigest: digest },
			state.iteration,
		);
		return {
			...addCall(withBlock, record),
			budget: accepted,
			grants: [...state.grants, grant],
		};
	}

	// Every mutating tool waits for explicit review.
	const record: CallRecord = { ...base, status: "pending" };
	return { ...addCall(withBlock, record), budget: accepted };
}

function onMessageStop(state: TurnState, stopReason: string): TurnState {
	if (state.phase !== "streaming") return state;

	const iterationCalls = state.calls.filter((c) => c.iteration === state.iteration);
	// A `tool_use` stop with zero completed calls settles as completed rather than
	// looping: a provider quirk must not become an infinite turn.
	if (stopReason !== "tool_use" || iterationCalls.length === 0) {
		return settle(state, "completed");
	}

	if (iterationCalls.some((c) => c.status === "pending")) {
		return { ...state, phase: "awaiting_approval" };
	}
	// No pending calls: some were auto-approved, or every call was refused at
	// creation. Either way execution proceeds; the runner advances when there is
	// nothing runnable left.
	return { ...state, phase: "executing" };
}

function onError(state: TurnState, error: ProtocolError): TurnState {
	if (state.phase !== "requesting" && state.phase !== "streaming") return state;
	// Keep partial text, answer every opened call, and fail closed.
	return { ...settle(state, "failed"), error };
}

function onCancelled(state: TurnState): TurnState {
	if (state.phase === "idle") return state;
	return settle(state, "cancelled");
}

function onApproveCall(state: TurnState, callId: string): TurnState {
	if (state.phase !== "awaiting_approval") return state;
	const call = state.calls.find((c) => c.id === callId);
	if (call === undefined || call.status !== "pending") return state;

	const grant = grantForCall(call, state.iteration);
	return maybeExecuting({
		...state,
		calls: updateCall(state.calls, callId, { status: "approved" }),
		grants: [...state.grants, grant],
	});
}

function onApproveBatch(state: TurnState, callIds: readonly string[]): TurnState {
	if (state.phase !== "awaiting_approval") return state;

	const clicked = new Set(callIds);
	// Eligible = in the explicit clicked list, still pending, tool known, and NOT
	// destructive. Destructive calls are never covered by a batch approval, and a
	// call that arrived after the click is not in the list.
	const eligible = state.calls.filter(
		(c) =>
			clicked.has(c.id) &&
			c.status === "pending" &&
			!c.destructive &&
			state.toolSet.get(c.toolName) !== undefined,
	);
	if (eligible.length === 0) return state;

	const grants = grantForBatch(eligible, state.iteration);
	const eligibleIds = new Set(eligible.map((c) => c.id));
	const calls = state.calls.map((c) =>
		eligibleIds.has(c.id) ? { ...c, status: "approved" as const } : c,
	);
	return maybeExecuting({ ...state, calls, grants: [...state.grants, ...grants] });
}

function onDenyCall(state: TurnState, callId: string): TurnState {
	if (state.phase !== "awaiting_approval") return state;
	const call = state.calls.find((c) => c.id === callId);
	if (call === undefined || call.status !== "pending") return state;

	const denial: DenialRecord = {
		toolName: call.toolName,
		inputDigest: call.inputDigest,
		reason: "user_declined",
	};
	const calls = updateCall(state.calls, callId, {
		status: "denied",
		denialReason: "user_declined",
		result: "You declined this action.",
		isError: true,
	});
	return maybeExecuting({ ...state, calls, denials: [...state.denials, denial] });
}

function onStartCall(state: TurnState, callId: string): TurnState {
	if (state.phase !== "executing") return state;

	const auth = authorizeStart(state, callId);
	if (!auth.ok) {
		// A refusal records a violation and leaves the call exactly as it was.
		return recordViolation(state, auth.violation, callId, `startCall refused: ${auth.violation}`);
	}
	return { ...state, calls: updateCall(state.calls, callId, { status: "running" }) };
}

function onCallSettled(state: TurnState, callId: string, outcome: ToolOutcome): TurnState {
	if (state.phase !== "executing") return state;
	const call = state.calls.find((c) => c.id === callId);
	if (call === undefined || call.status !== "running") return state;

	const succeeded = outcome.status === "ok";
	return {
		...state,
		calls: updateCall(state.calls, callId, {
			status: succeeded ? "succeeded" : "failed",
			result: outcome.result,
			isError: !succeeded,
		}),
	};
}

function onAdvance(state: TurnState, nowMs: number): TurnState {
	if (state.phase !== "executing") return state;
	const iterationCalls = state.calls.filter((c) => c.iteration === state.iteration);
	if (!iterationCalls.every((c) => isTerminalStatus(c.status))) return state;

	// Answer this iteration's calls, then decide whether the turn may continue.
	const answered = closeOutIteration(state);
	const withResults: TurnState = { ...state, calls: answered.calls, messages: answered.messages };

	const exhausted = budgetExhaustion(withResults.budget, withResults.limits, nowMs);
	if (exhausted !== null) {
		return {
			...withResults,
			phase: "settled",
			outcome: "bounded",
			notice: boundedNotice(exhausted),
		};
	}
	return {
		...withResults,
		phase: "requesting",
		iteration: withResults.iteration + 1,
		budget: { ...withResults.budget, iterationsStarted: withResults.budget.iterationsStarted + 1 },
	};
}

// --- Settlement and undo -----------------------------------------------------

function settle(state: TurnState, outcome: TurnOutcome): TurnState {
	const answered = closeOutIteration(state);
	return {
		...state,
		phase: "settled",
		outcome,
		calls: answered.calls,
		messages: answered.messages,
	};
}

/**
 * Flip every `succeeded` call of the turn to `undone`.
 *
 * One undo entry per turn means the calls flip together, so this is a single map
 * rather than a per-call operation.
 */
function markTurnUndone(state: TurnState): TurnState {
	if (!state.calls.some((c) => c.status === "succeeded")) return state;
	return {
		...state,
		calls: state.calls.map((c) => (c.status === "succeeded" ? { ...c, status: "undone" } : c)),
	};
}

/**
 * Answer every opened call of the turn not yet answered, marking any unfinished
 * call not-run first.
 *
 * This is what keeps the turn's message history pairable: without a `tool_result`
 * for every `tool_call`, both providers reject the next request. Calls already
 * answered in a prior iteration are skipped by their presence in the message
 * history, so this never double-answers.
 */
function closeOutIteration(state: TurnState): {
	calls: CallRecord[];
	messages: ProtocolMessage[];
} {
	const answered = new Set<string>();
	for (const message of state.messages) {
		for (const block of message.content) {
			if (block.type === "tool_result") answered.add(block.toolCallId);
		}
	}

	// Mark any still-unfinished call not-run. At a normal iteration boundary there
	// are none; at cancellation or failure this is what turns pending/approved/
	// running calls into a terminal, pairable result.
	const calls = state.calls.map((c) =>
		c.status === "pending" || c.status === "approved" || c.status === "running" ? notRun(c) : c,
	);

	const results: ToolResultBlock[] = [];
	for (const call of calls) {
		if (answered.has(call.id)) continue;
		results.push({
			type: "tool_result",
			toolCallId: call.id,
			content: call.result ?? call.summary,
			isError: call.isError,
		});
	}
	const messages =
		results.length > 0
			? [...state.messages, { role: "user" as const, content: results }]
			: [...state.messages];
	return { calls, messages };
}

function notRun(call: CallRecord): CallRecord {
	return {
		...call,
		status: "denied",
		denialReason: "turn_cancelled",
		result: "Not run: the turn ended before this tool call could run.",
		isError: true,
	};
}

// --- Small pure helpers ------------------------------------------------------

/** Move to `executing` once the current iteration has no pending call left. */
function maybeExecuting(state: TurnState): TurnState {
	const hasPending = state.calls.some(
		(c) => c.iteration === state.iteration && c.status === "pending",
	);
	return hasPending ? state : { ...state, phase: "executing" };
}

function recordViolation(
	state: TurnState,
	violation: TurnViolation,
	callId: string | null,
	detail: string,
): TurnState {
	return { ...state, violations: [...state.violations, { violation, callId, detail }] };
}

function addCall(state: TurnState, record: CallRecord): TurnState {
	return { ...state, calls: [...state.calls, record] };
}

function updateCall(
	calls: readonly CallRecord[],
	id: string,
	patch: Partial<CallRecord>,
): CallRecord[] {
	return calls.map((c) => (c.id === id ? { ...c, ...patch } : c));
}

function blankRecord(id: string, toolName: string, iteration: number): CallRecord {
	return {
		id,
		toolName,
		inputDigest: "",
		summary: "",
		effect: "mutate",
		destructive: false,
		iteration,
		status: "pending",
		prepared: null,
		result: null,
		isError: false,
		denialReason: null,
	};
}

function failedRecord(id: string, toolName: string, text: string, iteration: number): CallRecord {
	return {
		...blankRecord(id, toolName, iteration),
		status: "failed",
		summary: text,
		result: text,
		isError: true,
	};
}

function appendAssistantText(
	messages: readonly ProtocolMessage[],
	text: string,
): ProtocolMessage[] {
	const next = [...messages];
	const last = next[next.length - 1];
	if (last?.role !== "assistant") return next;

	const content = [...last.content];
	const trailing = content[content.length - 1];
	if (trailing && trailing.type === "text") {
		content[content.length - 1] = { ...trailing, text: trailing.text + text };
	} else {
		content.push({ type: "text", text });
	}
	next[next.length - 1] = { ...last, content };
	return next;
}

function appendAssistantBlock(
	messages: readonly ProtocolMessage[],
	block: ContentBlock,
): ProtocolMessage[] {
	const next = [...messages];
	const last = next[next.length - 1];
	if (last?.role !== "assistant") return next;
	next[next.length - 1] = { ...last, content: [...last.content, block] };
	return next;
}

function boundedNotice(reason: BudgetExhaustion): string {
	const tail = " Any changes you approved have been applied and can be undone.";
	switch (reason) {
		case "iterations":
			return `This turn reached its step limit and was stopped.${tail}`;
		case "tool_calls":
			return `This turn reached its tool-call limit and was stopped.${tail}`;
		case "retries":
			return `This turn was stopped after too many retries.${tail}`;
		case "deadline":
			return `This turn ran longer than allowed and was stopped.${tail}`;
	}
}

// --- Exported predicates the runner and UI read ------------------------------

/** A call that can no longer change state. */
export function isTerminalStatus(status: CallStatus): boolean {
	return (
		status === "succeeded" || status === "failed" || status === "denied" || status === "undone"
	);
}

/** Approved calls the runner has not started yet. */
export function runnableCalls(state: TurnState): CallRecord[] {
	return state.calls.filter((c) => c.status === "approved");
}
