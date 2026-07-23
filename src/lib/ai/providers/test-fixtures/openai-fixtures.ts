/**
 * Hand-authored OpenAI Chat Completions streaming fixtures.
 *
 * Each transcript is written from OpenAI's documented `chat.completion.chunk`
 * shape, not recorded from a live account, and stored as a frame array — OpenAI
 * streams bare `data:` lines, so every frame's event is the SSE default
 * `"message"` and the terminal frame is the `[DONE]` sentinel.
 *
 * The complete-response fixtures deliberately mirror the matching Anthropic
 * fixtures in `./anthropic-fixtures.ts` — same model id, same text, same token
 * counts — so both decode to the shared `EXPECTED_TEXT_EVENTS` /
 * `EXPECTED_TOOL_EVENTS` / `EXPECTED_TRUNCATED_EVENTS` exported there. That shared
 * expectation is the provider-neutrality contract. Fixtures whose failure detail
 * is provider-specific carry their own expected sequence here.
 */

import type { StreamEvent } from "@/lib/ai/protocol/events";
import type { SseFrame } from "@/lib/ai/providers/sse";
import { FIXTURE_MODEL } from "./anthropic-fixtures";

/** Author one OpenAI chunk frame; OpenAI never names its SSE events. */
function chunk(payload: unknown): SseFrame {
	return { event: "message", data: JSON.stringify(payload) };
}

/** OpenAI's terminal sentinel frame. */
const DONE: SseFrame = { event: "message", data: "[DONE]" };

// ---------------------------------------------------------------------------
// Complete text response — mirrors ANTHROPIC_TEXT_STREAM
// ---------------------------------------------------------------------------

export const OPENAI_TEXT_STREAM: SseFrame[] = [
	chunk({
		model: FIXTURE_MODEL,
		choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
	}),
	chunk({
		model: FIXTURE_MODEL,
		choices: [{ index: 0, delta: { content: "Review " }, finish_reason: null }],
	}),
	chunk({
		model: FIXTURE_MODEL,
		choices: [{ index: 0, delta: { content: "the gateway." }, finish_reason: null }],
	}),
	chunk({ model: FIXTURE_MODEL, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
	chunk({ model: FIXTURE_MODEL, choices: [], usage: { prompt_tokens: 12, completion_tokens: 9 } }),
	DONE,
];

// ---------------------------------------------------------------------------
// Complete tool-call response — mirrors ANTHROPIC_TOOL_STREAM
// ---------------------------------------------------------------------------

export const OPENAI_TOOL_STREAM: SseFrame[] = [
	chunk({
		model: FIXTURE_MODEL,
		choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
	}),
	chunk({
		model: FIXTURE_MODEL,
		choices: [{ index: 0, delta: { content: "Adding it." }, finish_reason: null }],
	}),
	chunk({
		model: FIXTURE_MODEL,
		choices: [
			{
				index: 0,
				delta: {
					tool_calls: [
						{
							index: 0,
							id: "call_1",
							type: "function",
							function: { name: "add_element", arguments: "" },
						},
					],
				},
				finish_reason: null,
			},
		],
	}),
	chunk({
		model: FIXTURE_MODEL,
		choices: [
			{
				index: 0,
				delta: { tool_calls: [{ index: 0, function: { arguments: '{"type":"process",' } }] },
				finish_reason: null,
			},
		],
	}),
	chunk({
		model: FIXTURE_MODEL,
		choices: [
			{
				index: 0,
				delta: { tool_calls: [{ index: 0, function: { arguments: '"name":"Gateway"}' } }] },
				finish_reason: null,
			},
		],
	}),
	chunk({ model: FIXTURE_MODEL, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] }),
	chunk({ model: FIXTURE_MODEL, choices: [], usage: { prompt_tokens: 20, completion_tokens: 15 } }),
	DONE,
];

// ---------------------------------------------------------------------------
// Truncated stream — no [DONE] — mirrors ANTHROPIC_TRUNCATED_STREAM
// ---------------------------------------------------------------------------

export const OPENAI_TRUNCATED_STREAM: SseFrame[] = [
	chunk({
		model: FIXTURE_MODEL,
		choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
	}),
	chunk({
		model: FIXTURE_MODEL,
		choices: [{ index: 0, delta: { content: "Half a thou" }, finish_reason: null }],
	}),
];

// ---------------------------------------------------------------------------
// Malformed events
// ---------------------------------------------------------------------------

/** A data line that is not valid JSON, between valid chunks. */
export const OPENAI_INVALID_JSON_STREAM: SseFrame[] = [
	chunk({
		model: FIXTURE_MODEL,
		choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
	}),
	{ event: "message", data: '{"choices":[{"del' },
	chunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
	DONE,
];

export const EXPECTED_OPENAI_INVALID_JSON_EVENTS: StreamEvent[] = [
	{ type: "message_start", model: FIXTURE_MODEL },
	{
		type: "error",
		error: {
			code: "malformed_stream",
			message: "The OpenAI stream sent a chunk that could not be decoded.",
			providerDetail: '{"choices":[{"del',
		},
	},
	{ type: "message_stop", stopReason: "end_turn" },
];

/** A `tool_calls` first fragment whose accumulated arguments never parse. */
export const OPENAI_BAD_TOOL_ARGS_STREAM: SseFrame[] = [
	chunk({
		model: FIXTURE_MODEL,
		choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
	}),
	chunk({
		model: FIXTURE_MODEL,
		choices: [
			{
				index: 0,
				delta: {
					tool_calls: [
						{
							index: 0,
							id: "call_bad",
							type: "function",
							function: { name: "add_element", arguments: '{"type": ' },
						},
					],
				},
				finish_reason: null,
			},
		],
	}),
	chunk({ model: FIXTURE_MODEL, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] }),
	DONE,
];

export const EXPECTED_OPENAI_BAD_TOOL_ARGS_EVENTS: StreamEvent[] = [
	{ type: "message_start", model: FIXTURE_MODEL },
	{ type: "tool_call_start", id: "call_bad", name: "add_element" },
	{ type: "tool_call_input_delta", id: "call_bad", partialJson: '{"type": ' },
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

/** A tool-call fragment that arrives before the call is named — no id, no name. */
export const OPENAI_ORPHAN_FRAGMENT_STREAM: SseFrame[] = [
	chunk({
		model: FIXTURE_MODEL,
		choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
	}),
	chunk({
		model: FIXTURE_MODEL,
		choices: [
			{
				index: 0,
				delta: { tool_calls: [{ index: 0, function: { arguments: '{"a":1}' } }] },
				finish_reason: null,
			},
		],
	}),
	chunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
	DONE,
];

export const EXPECTED_OPENAI_ORPHAN_FRAGMENT_EVENTS: StreamEvent[] = [
	{ type: "message_start", model: FIXTURE_MODEL },
	{
		type: "error",
		error: {
			code: "malformed_stream",
			message: "The OpenAI stream sent a tool-call fragment before naming the call.",
		},
	},
	{ type: "message_stop", stopReason: "end_turn" },
];

// ---------------------------------------------------------------------------
// In-stream rate limit (an `error` chunk, distinct from an HTTP 429 response)
// ---------------------------------------------------------------------------

export const OPENAI_INSTREAM_RATE_LIMIT_STREAM: SseFrame[] = [
	chunk({
		model: FIXTURE_MODEL,
		choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
	}),
	chunk({
		model: FIXTURE_MODEL,
		choices: [{ index: 0, delta: { content: "Start" }, finish_reason: null }],
	}),
	chunk({
		error: {
			message: "Rate limit reached for key sk-proj-abc123",
			type: "requests",
			code: "rate_limit_exceeded",
		},
	}),
];

export const EXPECTED_OPENAI_INSTREAM_RATE_LIMIT_EVENTS: StreamEvent[] = [
	{ type: "message_start", model: FIXTURE_MODEL },
	{ type: "text_delta", text: "Start" },
	{
		type: "error",
		error: {
			code: "rate_limited",
			message: "OpenAI rate limit or quota exceeded — wait and try again.",
			providerDetail: "requests: rate_limit_exceeded: Rate limit reached for key [redacted-key]",
		},
	},
];

/** A real OpenAI 429 error body: an HTTP response, not a stream. */
export const OPENAI_429_BODY = JSON.stringify({
	error: {
		message: "Rate limit reached for requests. Contact us if you keep hitting limits.",
		type: "requests",
		code: "rate_limit_exceeded",
	},
});
