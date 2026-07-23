/**
 * Hand-authored Anthropic Messages streaming fixtures.
 *
 * Every transcript is written from Anthropic's documented streaming event shapes,
 * not recorded from a live account, and stored as a frame array (`{ event, data }`
 * pairs, exactly what the SSE decoder emits). Each fixture ships with the exact
 * `StreamEvent` sequence the mapper must produce, so a test asserts the whole
 * sequence rather than merely that no exception was thrown.
 *
 * The model id and token counts are kept equal to the matching OpenAI fixtures in
 * `./openai-fixtures.ts` so the two providers' complete-response fixtures decode
 * to an identical `StreamEvent` sequence — the provider-neutrality contract.
 */

import type { StreamEvent } from "@/lib/ai/protocol/events";
import type { SseFrame } from "@/lib/ai/providers/sse";

/** The model id both providers' complete-response fixtures echo. */
export const FIXTURE_MODEL = "test-model-1";

/** Author one Anthropic frame the way the decoder delivers it. */
function frame(event: string, payload: unknown): SseFrame {
	return { event, data: JSON.stringify(payload) };
}

// ---------------------------------------------------------------------------
// Complete text response
// ---------------------------------------------------------------------------

export const ANTHROPIC_TEXT_STREAM: SseFrame[] = [
	frame("message_start", {
		type: "message_start",
		message: { id: "msg_1", model: FIXTURE_MODEL, usage: { input_tokens: 12, output_tokens: 1 } },
	}),
	frame("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
	frame("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Review " } }),
	frame("content_block_delta", { index: 0, delta: { type: "text_delta", text: "the gateway." } }),
	frame("content_block_stop", { index: 0 }),
	frame("message_delta", {
		delta: { stop_reason: "end_turn", stop_sequence: null },
		usage: { output_tokens: 9 },
	}),
	frame("message_stop", { type: "message_stop" }),
];

/** Shared with the OpenAI text fixture: the same logical response, same events. */
export const EXPECTED_TEXT_EVENTS: StreamEvent[] = [
	{ type: "message_start", model: FIXTURE_MODEL },
	{ type: "text_delta", text: "Review " },
	{ type: "text_delta", text: "the gateway." },
	{ type: "usage", usage: { inputTokens: 12, outputTokens: 9 } },
	{ type: "message_stop", stopReason: "end_turn" },
];

// ---------------------------------------------------------------------------
// Complete tool-call response
// ---------------------------------------------------------------------------

export const ANTHROPIC_TOOL_STREAM: SseFrame[] = [
	frame("message_start", {
		message: { id: "msg_2", model: FIXTURE_MODEL, usage: { input_tokens: 20, output_tokens: 1 } },
	}),
	frame("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
	frame("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Adding it." } }),
	frame("content_block_stop", { index: 0 }),
	frame("content_block_start", {
		index: 1,
		content_block: { type: "tool_use", id: "call_1", name: "add_element", input: {} },
	}),
	frame("content_block_delta", {
		index: 1,
		delta: { type: "input_json_delta", partial_json: '{"type":"process",' },
	}),
	frame("content_block_delta", {
		index: 1,
		delta: { type: "input_json_delta", partial_json: '"name":"Gateway"}' },
	}),
	frame("content_block_stop", { index: 1 }),
	frame("message_delta", {
		delta: { stop_reason: "tool_use", stop_sequence: null },
		usage: { output_tokens: 15 },
	}),
	frame("message_stop", { type: "message_stop" }),
];

export const EXPECTED_TOOL_EVENTS: StreamEvent[] = [
	{ type: "message_start", model: FIXTURE_MODEL },
	{ type: "text_delta", text: "Adding it." },
	{ type: "tool_call_start", id: "call_1", name: "add_element" },
	{ type: "tool_call_input_delta", id: "call_1", partialJson: '{"type":"process",' },
	{ type: "tool_call_input_delta", id: "call_1", partialJson: '"name":"Gateway"}' },
	{
		type: "tool_call_complete",
		id: "call_1",
		name: "add_element",
		input: { type: "process", name: "Gateway" },
	},
	{ type: "usage", usage: { inputTokens: 20, outputTokens: 15 } },
	{ type: "message_stop", stopReason: "tool_use" },
];

// ---------------------------------------------------------------------------
// Truncated stream — ends without message_stop
// ---------------------------------------------------------------------------

/**
 * A stream that delivers text and then simply stops: no `message_delta`, no
 * `message_stop`. The mapper emits no terminal event, so the client must report
 * `malformed_stream` rather than let a cut-off answer look finished.
 */
export const ANTHROPIC_TRUNCATED_STREAM: SseFrame[] = [
	frame("message_start", {
		message: { id: "msg_3", model: FIXTURE_MODEL, usage: { input_tokens: 8, output_tokens: 1 } },
	}),
	frame("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
	frame("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Half a thou" } }),
];

export const EXPECTED_TRUNCATED_EVENTS: StreamEvent[] = [
	{ type: "message_start", model: FIXTURE_MODEL },
	{ type: "text_delta", text: "Half a thou" },
	{
		type: "error",
		error: {
			code: "malformed_stream",
			message: "The AI response ended before it was complete. Please try again.",
		},
	},
];

// ---------------------------------------------------------------------------
// Malformed events
// ---------------------------------------------------------------------------

/**
 * A valid `message_start`, then a known event type whose `data:` is not valid
 * JSON. The mapper emits one non-terminal `malformed_stream` notice and keeps
 * going, so the terminal `message_stop` still arrives.
 */
export const ANTHROPIC_INVALID_JSON_STREAM: SseFrame[] = [
	frame("message_start", { message: { model: FIXTURE_MODEL } }),
	{ event: "content_block_delta", data: '{"index":0,"delta":{"type":"text_de' },
	frame("message_delta", { delta: { stop_reason: "end_turn" }, usage: null }),
	frame("message_stop", { type: "message_stop" }),
];

export const EXPECTED_INVALID_JSON_EVENTS: StreamEvent[] = [
	{ type: "message_start", model: FIXTURE_MODEL },
	{
		type: "error",
		error: {
			code: "malformed_stream",
			message: 'The Anthropic stream sent a "content_block_delta" event that could not be decoded.',
			// The undecodable frame's payload rides along as redacted providerDetail.
			providerDetail: '{"index":0,"delta":{"type":"text_de',
		},
	},
	{ type: "message_stop", stopReason: "end_turn" },
];

/**
 * A `malformed_stream` notice followed by a close with no `message_stop`. The
 * notice is non-terminal, so the truncation must still be reported: the client
 * emits a second, terminal `malformed_stream` for the cut-off turn. This is the
 * discriminator that a non-terminal notice does not suppress truncation.
 */
export const ANTHROPIC_NOTICE_THEN_TRUNCATED_STREAM: SseFrame[] = [
	frame("message_start", { message: { model: FIXTURE_MODEL } }),
	{ event: "content_block_delta", data: '{"index":0,"delta":{"type":"text_de' },
];

export const EXPECTED_NOTICE_THEN_TRUNCATED_EVENTS: StreamEvent[] = [
	{ type: "message_start", model: FIXTURE_MODEL },
	{
		type: "error",
		error: {
			code: "malformed_stream",
			message: 'The Anthropic stream sent a "content_block_delta" event that could not be decoded.',
			providerDetail: '{"index":0,"delta":{"type":"text_de',
		},
	},
	{
		type: "error",
		error: {
			code: "malformed_stream",
			message: "The AI response ended before it was complete. Please try again.",
		},
	},
];

/**
 * An unknown top-level event type (`content_block_flourish`) and a `ping`, both
 * of which Anthropic documents clients must tolerate: they map to nothing, and
 * the surrounding real events map normally.
 */
export const ANTHROPIC_UNKNOWN_EVENT_STREAM: SseFrame[] = [
	frame("message_start", { message: { model: FIXTURE_MODEL } }),
	frame("ping", { type: "ping" }),
	frame("content_block_flourish", { anything: true }),
	frame("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
	frame("content_block_delta", { index: 0, delta: { type: "text_delta", text: "ok" } }),
	frame("content_block_stop", { index: 0 }),
	frame("message_delta", { delta: { stop_reason: "end_turn" }, usage: null }),
	frame("message_stop", { type: "message_stop" }),
];

export const EXPECTED_UNKNOWN_EVENT_EVENTS: StreamEvent[] = [
	{ type: "message_start", model: FIXTURE_MODEL },
	{ type: "text_delta", text: "ok" },
	{ type: "message_stop", stopReason: "end_turn" },
];

/**
 * A `tool_use` block whose accumulated `input_json_delta` fragments never parse.
 * The mapper drops that one call with a `malformed_stream` notice — the failed
 * call's name travels only as redacted `providerDetail` — and the turn still ends
 * cleanly.
 */
export const ANTHROPIC_BAD_TOOL_ARGS_STREAM: SseFrame[] = [
	frame("message_start", { message: { model: FIXTURE_MODEL } }),
	frame("content_block_start", {
		index: 0,
		content_block: { type: "tool_use", id: "call_bad", name: "add_element", input: {} },
	}),
	frame("content_block_delta", {
		index: 0,
		delta: { type: "input_json_delta", partial_json: '{"type": "never closed' },
	}),
	frame("content_block_stop", { index: 0 }),
	frame("message_delta", { delta: { stop_reason: "tool_use" }, usage: null }),
	frame("message_stop", { type: "message_stop" }),
];

export const EXPECTED_BAD_TOOL_ARGS_EVENTS: StreamEvent[] = [
	{ type: "message_start", model: FIXTURE_MODEL },
	{ type: "tool_call_start", id: "call_bad", name: "add_element" },
	{ type: "tool_call_input_delta", id: "call_bad", partialJson: '{"type": "never closed' },
	{
		type: "error",
		error: {
			code: "malformed_stream",
			message: "A tool call sent arguments that were not valid JSON, so the call was dropped.",
			providerDetail: "add_element",
		},
	},
	{ type: "message_stop", stopReason: "tool_use" },
];

/**
 * An `input_json_delta` whose content-block index names a `tool_use` that never
 * started — the stream-level analog of a tool result with no matching call. The
 * mapper reports it as `malformed_stream` and continues.
 */
export const ANTHROPIC_ORPHAN_TOOL_INPUT_STREAM: SseFrame[] = [
	frame("message_start", { message: { model: FIXTURE_MODEL } }),
	frame("content_block_delta", {
		index: 7,
		delta: { type: "input_json_delta", partial_json: '{"orphan":true}' },
	}),
	frame("message_delta", { delta: { stop_reason: "end_turn" }, usage: null }),
	frame("message_stop", { type: "message_stop" }),
];

export const EXPECTED_ORPHAN_TOOL_INPUT_EVENTS: StreamEvent[] = [
	{ type: "message_start", model: FIXTURE_MODEL },
	{
		type: "error",
		error: {
			code: "malformed_stream",
			message: "The Anthropic stream sent tool arguments for a tool call that never started.",
		},
	},
	{ type: "message_stop", stopReason: "end_turn" },
];

// ---------------------------------------------------------------------------
// In-stream rate limit (an `error` event, distinct from an HTTP 429 response)
// ---------------------------------------------------------------------------

/**
 * A `rate_limit_error` delivered as an in-band `error` event after some text has
 * streamed. It maps to a terminal `rate_limited` protocol error whose detail is
 * redacted and key-masked; because it arrives mid-stream, it is surfaced, never
 * retried.
 */
export const ANTHROPIC_INSTREAM_RATE_LIMIT_STREAM: SseFrame[] = [
	frame("message_start", { message: { model: FIXTURE_MODEL } }),
	frame("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
	frame("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Start" } }),
	frame("error", {
		type: "error",
		error: { type: "rate_limit_error", message: "Rate limit for key sk-ant-abc123DEF456" },
	}),
];

export const EXPECTED_INSTREAM_RATE_LIMIT_EVENTS: StreamEvent[] = [
	{ type: "message_start", model: FIXTURE_MODEL },
	{ type: "text_delta", text: "Start" },
	{
		type: "error",
		error: {
			code: "rate_limited",
			message: "Anthropic rate limit or quota exceeded — wait and try again.",
			providerDetail: "rate_limit_error: Rate limit for key [redacted-key]",
		},
	},
];

/**
 * An Anthropic 429 error body: an HTTP response, not a stream. Provider bodies are
 * assumed to carry key material until proven otherwise (a hostile or misconfigured
 * proxy can inject one), so the embedded `sk-ant-…RL429SECRET` token exercises the
 * transport's unconditional redaction before the body becomes `providerDetail`.
 */
export const ANTHROPIC_429_BODY = JSON.stringify({
	type: "error",
	error: {
		type: "rate_limit_error",
		message: "Rate limit exceeded for key sk-ant-live-RL429SECRET; retry later",
	},
});
