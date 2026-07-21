/**
 * Streaming vocabulary for one assistant turn.
 *
 * Every provider mapper produces this union and nothing else, so a consumer can
 * never branch on a provider-specific payload shape. Two logically identical
 * responses from Anthropic and OpenAI must produce the same event sequence.
 */

import type { ProtocolError } from "./errors";

/** Why the model stopped producing output. */
export type StopReason =
	/** The model finished its answer. */
	| "end_turn"
	/** The model is waiting for tool results before continuing. */
	| "tool_use"
	/** The output token limit truncated the answer. */
	| "max_tokens"
	/** A configured stop sequence ended the answer. */
	| "stop_sequence"
	/** The provider reported a reason this protocol does not model. */
	| "unknown";

export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
}

/** The turn has begun and the provider has named the model answering it. */
export interface MessageStartEvent {
	type: "message_start";
	/**
	 * Model id as echoed by the provider, which can differ from the requested id
	 * when an alias resolves to a dated snapshot.
	 */
	model: string;
}

/** A fragment of assistant text. Fragments are appended in arrival order. */
export interface TextDeltaEvent {
	type: "text_delta";
	text: string;
}

/** The model began a tool call. Its arguments have not arrived yet. */
export interface ToolCallStartEvent {
	type: "tool_call_start";
	id: string;
	name: string;
}

/**
 * A fragment of a tool call's JSON arguments.
 *
 * Fragments are not valid JSON on their own; only the concatenation is. This
 * event exists so a UI can show progress, not so a consumer can parse early.
 */
export interface ToolCallInputDeltaEvent {
	type: "tool_call_input_delta";
	id: string;
	partialJson: string;
}

/** A tool call's arguments finished arriving and parsed as JSON. */
export interface ToolCallCompleteEvent {
	type: "tool_call_complete";
	id: string;
	name: string;
	/** Untrusted model output. See `ToolCallBlock.input` in `./messages.ts`. */
	input: unknown;
}

/** Token accounting reported by the provider for this turn. */
export interface UsageEvent {
	type: "usage";
	usage: TokenUsage;
}

/** The turn ended normally. Always the last event when no failure occurred. */
export interface MessageStopEvent {
	type: "message_stop";
	stopReason: StopReason;
}

/** The turn failed. Terminal. */
export interface ErrorEvent {
	type: "error";
	error: ProtocolError;
}

/**
 * The user stopped the turn. Terminal, and deliberately not an `error`:
 * cancellation keeps whatever text already arrived and must not surface as a
 * failure banner.
 */
export interface AbortedEvent {
	type: "aborted";
}

export type StreamEvent =
	| MessageStartEvent
	| TextDeltaEvent
	| ToolCallStartEvent
	| ToolCallInputDeltaEvent
	| ToolCallCompleteEvent
	| UsageEvent
	| MessageStopEvent
	| ErrorEvent
	| AbortedEvent;
