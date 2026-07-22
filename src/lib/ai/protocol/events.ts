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

/**
 * A failure was detected. The terminality rule is exact: a `malformed_stream`
 * error emitted by a mapper is a non-terminal notice scoped to the one piece
 * of the stream it reports — an undecodable frame, an orphan argument
 * fragment, or a dropped tool call — and the mapper keeps mapping the frames
 * that follow. An error with any other code reports the turn itself and is
 * terminal; provider-reported failures (`http_status`, `rate_limited`) end
 * the turn because the provider closes the stream after sending them. A
 * client must not treat a `malformed_stream` notice as the end of the turn
 * (issue #61 step 6).
 *
 * A *thrown* `malformed_stream` `ProtocolException` — the SSE decoder's
 * buffer-cap breach is one — is terminal on that channel and must not be
 * re-emitted as a stream notice: the non-terminal reading above applies only
 * to events a mapper emitted.
 */
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
