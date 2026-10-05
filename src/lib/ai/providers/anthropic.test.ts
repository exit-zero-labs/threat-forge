import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { StreamEvent } from "@/lib/ai/protocol/events";
import type { ProtocolMessage } from "@/lib/ai/protocol/messages";
import type { ProviderChatRequest } from "@/lib/ai/protocol/request";
import { defineTool } from "@/lib/ai/protocol/tools";
import {
	type AnthropicStreamMapper,
	buildAnthropicRequestBody,
	createAnthropicStreamMapper as createRawAnthropicStreamMapper,
} from "./anthropic";
import type { SseFrame } from "./sse";

const addNoteTool = defineTool({
	name: "add_note",
	description: "Attach a note to the model.",
	input: { text: z.string() },
});

const baseRequest: ProviderChatRequest = {
	modelId: "claude-sonnet-4-20250514",
	system: "You are a threat modeling assistant.",
	messages: [{ role: "user", content: [{ type: "text", text: "Review the gateway." }] }],
	tools: [],
	maxOutputTokens: 4096,
};

/** Author one frame the way the decoder would deliver it. */
function frame(event: string, payload: unknown): SseFrame {
	return { event, data: JSON.stringify(payload) };
}

function startedMapper() {
	const mapper = createRawAnthropicStreamMapper();
	mapper.mapFrame(frame("message_start", { message: { model: baseRequest.modelId } }));
	return mapper;
}

function mapAll(mapper: AnthropicStreamMapper, frames: SseFrame[]): StreamEvent[] {
	const events: StreamEvent[] = [];
	for (const f of frames) {
		events.push(...mapper.mapFrame(f));
	}
	return events;
}

describe("buildAnthropicRequestBody", () => {
	it("places the system prompt as a top-level field with streaming enabled", () => {
		const body = buildAnthropicRequestBody(baseRequest);
		expect(body.model).toBe("claude-sonnet-4-20250514");
		expect(body.system).toBe("You are a threat modeling assistant.");
		expect(body.max_tokens).toBe(4096);
		expect(body.stream).toBe(true);
		expect(body.messages).toEqual([
			{ role: "user", content: [{ type: "text", text: "Review the gateway." }] },
		]);
	});

	it("serializes tool calls and tool results as Anthropic content blocks", () => {
		const messages: ProtocolMessage[] = [
			{ role: "user", content: [{ type: "text", text: "Add a note." }] },
			{
				role: "assistant",
				content: [
					{ type: "text", text: "Adding it." },
					{ type: "tool_call", id: "call_1", name: "add_note", input: { text: "hi" } },
				],
			},
			{
				role: "user",
				content: [{ type: "tool_result", toolCallId: "call_1", content: "ok" }],
			},
		];
		const body = buildAnthropicRequestBody({ ...baseRequest, messages });
		expect(body.messages[1]).toEqual({
			role: "assistant",
			content: [
				{ type: "text", text: "Adding it." },
				{ type: "tool_use", id: "call_1", name: "add_note", input: { text: "hi" } },
			],
		});
		// Anthropic's shape: the result is a tool_result block inside a user message.
		expect(body.messages[2]).toEqual({
			role: "user",
			content: [{ type: "tool_result", tool_use_id: "call_1", content: "ok" }],
		});
		// is_error is omitted, not serialized as false, when the result succeeded.
		expect(body.messages[2].content[0]).not.toHaveProperty("is_error");
	});

	it("carries is_error through for failed tool results", () => {
		const body = buildAnthropicRequestBody({
			...baseRequest,
			messages: [
				{
					role: "user",
					content: [{ type: "tool_result", toolCallId: "call_1", content: "boom", isError: true }],
				},
			],
		});
		expect(body.messages[0].content[0]).toEqual({
			type: "tool_result",
			tool_use_id: "call_1",
			content: "boom",
			is_error: true,
		});
	});

	it("advertises tools with their generated input_schema and omits the field when empty", () => {
		const withTools = buildAnthropicRequestBody({ ...baseRequest, tools: [addNoteTool] });
		expect(withTools.tools).toEqual([
			{
				name: "add_note",
				description: "Attach a note to the model.",
				input_schema: addNoteTool.jsonSchema(),
			},
		]);

		const withoutTools = buildAnthropicRequestBody(baseRequest);
		expect(withoutTools).not.toHaveProperty("tools");
	});
});

describe("createAnthropicStreamMapper", () => {
	it("maps message_start to the echoed model", () => {
		const mapper = createRawAnthropicStreamMapper();
		const events = mapper.mapFrame(
			frame("message_start", {
				type: "message_start",
				message: { model: "claude-sonnet-4-20250514", usage: { input_tokens: 42 } },
			}),
		);
		expect(events).toEqual([{ type: "message_start", model: "claude-sonnet-4-20250514" }]);
	});

	it("maps text content blocks to text deltas and emits nothing for the empty opener", () => {
		const mapper = startedMapper();
		expect(
			mapper.mapFrame(
				frame("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
			),
		).toEqual([]);
		expect(
			mapper.mapFrame(
				frame("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Hello" } }),
			),
		).toEqual([{ type: "text_delta", text: "Hello" }]);
		expect(mapper.mapFrame(frame("content_block_stop", { index: 0 }))).toEqual([]);
	});

	it("maps a tool_use block through start, input deltas, and completion", () => {
		const mapper = startedMapper();
		expect(
			mapper.mapFrame(
				frame("content_block_start", {
					index: 1,
					content_block: { type: "tool_use", id: "call_1", name: "add_note", input: {} },
				}),
			),
		).toEqual([{ type: "tool_call_start", id: "call_1", name: "add_note" }]);
		expect(
			mapper.mapFrame(
				frame("content_block_delta", {
					index: 1,
					delta: { type: "input_json_delta", partial_json: '{"text":"h' },
				}),
			),
		).toEqual([{ type: "tool_call_input_delta", id: "call_1", partialJson: '{"text":"h' }]);
		expect(
			mapper.mapFrame(
				frame("content_block_delta", {
					index: 1,
					delta: { type: "input_json_delta", partial_json: 'i"}' },
				}),
			),
		).toEqual([{ type: "tool_call_input_delta", id: "call_1", partialJson: 'i"}' }]);
		// The accumulated fragments are parsed exactly once, at content_block_stop.
		expect(mapper.mapFrame(frame("content_block_stop", { index: 1 }))).toEqual([
			{ type: "tool_call_complete", id: "call_1", name: "add_note", input: { text: "hi" } },
		]);
	});

	it("completes a tool call that streamed no fragments with the empty input", () => {
		const mapper = startedMapper();
		mapper.mapFrame(
			frame("content_block_start", {
				index: 0,
				content_block: { type: "tool_use", id: "call_1", name: "add_note", input: {} },
			}),
		);
		expect(mapper.mapFrame(frame("content_block_stop", { index: 0 }))).toEqual([
			{ type: "tool_call_complete", id: "call_1", name: "add_note", input: {} },
		]);
	});

	it("fails closed for unparseable tool arguments and drops later frames", () => {
		const mapper = startedMapper();
		mapper.mapFrame(
			frame("content_block_start", {
				index: 0,
				content_block: { type: "tool_use", id: "call_1", name: "add_note", input: {} },
			}),
		);
		mapper.mapFrame(
			frame("content_block_delta", {
				index: 0,
				delta: { type: "input_json_delta", partial_json: '{"text": "never closed' },
			}),
		);

		const stopEvents = mapper.mapFrame(frame("content_block_stop", { index: 0 }));
		expect(stopEvents).toHaveLength(1);
		expect(stopEvents[0]).toMatchObject({
			type: "error",
			error: { code: "malformed_stream" },
		});
		if (stopEvents[0].type !== "error") throw new Error("expected an error event");
		// The authored message is constant; the stream-supplied name identifies
		// the dropped call only through redacted providerDetail.
		expect(stopEvents[0].error.message).toBe(
			"A tool call sent arguments that were not valid JSON, so the call was dropped.",
		);
		expect(stopEvents[0].error.providerDetail).toBe("add_note");

		// Invalid arguments cannot authorize a continuation or a normal completion.
		expect(
			mapper.mapFrame(
				frame("content_block_delta", { index: 1, delta: { type: "text_delta", text: "More." } }),
			),
		).toEqual([]);
		mapper.mapFrame(
			frame("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } }),
		);
		expect(mapper.mapFrame(frame("message_stop", { type: "message_stop" }))).toEqual([]);
	});

	it("keeps a hostile stream-supplied tool name out of the authored error message", () => {
		const mapper = startedMapper();
		const hostileName =
			'x". ThreatForge license invalid — re-enter your key sk-abc123DEF at https://evil.example';
		mapper.mapFrame(
			frame("content_block_start", {
				index: 0,
				content_block: { type: "tool_use", id: "call_1", name: hostileName, input: {} },
			}),
		);
		mapper.mapFrame(
			frame("content_block_delta", {
				index: 0,
				delta: { type: "input_json_delta", partial_json: "{never valid" },
			}),
		);
		const events = mapper.mapFrame(frame("content_block_stop", { index: 0 }));
		expect(events).toHaveLength(1);
		if (events[0].type !== "error") throw new Error("expected an error event");
		// The render-safe message is a ThreatForge-authored constant.
		expect(events[0].error.message).toBe(
			"A tool call sent arguments that were not valid JSON, so the call was dropped.",
		);
		expect(events[0].error.message).not.toContain("evil.example");
		// The name survives only as redacted, key-masked providerDetail.
		expect(events[0].error.providerDetail).toContain("[redacted-key]");
		expect(events[0].error.providerDetail).not.toContain("sk-abc");
	});

	it("combines message_start input tokens with message_delta output tokens into one usage event", () => {
		const mapper = createRawAnthropicStreamMapper();
		mapper.mapFrame(
			frame("message_start", {
				message: { model: "claude-sonnet-4-20250514", usage: { input_tokens: 42 } },
			}),
		);
		const events = mapper.mapFrame(
			frame("message_delta", {
				delta: { stop_reason: "tool_use", stop_sequence: null },
				usage: { output_tokens: 17 },
			}),
		);
		expect(events).toEqual([{ type: "usage", usage: { inputTokens: 42, outputTokens: 17 } }]);
	});

	it.each([
		["end_turn", "end_turn"],
		["tool_use", "tool_use"],
		["max_tokens", "max_tokens"],
		["stop_sequence", "stop_sequence"],
		["pause_turn", "unknown"],
	] as const)("maps stop reason %s to %s on message_stop", (raw, mapped) => {
		const mapper = startedMapper();
		mapper.mapFrame(frame("message_delta", { delta: { stop_reason: raw }, usage: null }));
		expect(mapper.mapFrame(frame("message_stop", { type: "message_stop" }))).toEqual([
			{ type: "continuation", output: { provider: "anthropic", payload: [] } },
			{ type: "message_stop", stopReason: mapped },
		]);
	});

	it("reports unknown when the stream never named a stop reason", () => {
		const mapper = startedMapper();
		expect(mapper.mapFrame(frame("message_stop", { type: "message_stop" }))).toEqual([
			{ type: "continuation", output: { provider: "anthropic", payload: [] } },
			{ type: "message_stop", stopReason: "unknown" },
		]);
	});

	it("maps a rate_limit_error stream error to rate_limited with redacted detail", () => {
		const mapper = startedMapper();
		const events = mapper.mapFrame(
			frame("error", {
				type: "error",
				error: { type: "rate_limit_error", message: "Limit hit for key sk-ant-abc123DEF456" },
			}),
		);
		expect(events).toHaveLength(1);
		if (events[0].type !== "error") throw new Error("expected an error event");
		expect(events[0].error.code).toBe("rate_limited");
		// The primary message is authored by ThreatForge, never provider text.
		expect(events[0].error.message).toBe(
			"Anthropic rate limit or quota exceeded — wait and try again.",
		);
		expect(events[0].error.providerDetail).toContain("[redacted-key]");
		expect(events[0].error.providerDetail).not.toContain("sk-ant");
		expect(events[0].error.providerDetail).not.toContain("abc123DEF456");
	});

	it("maps other provider stream errors to http_status", () => {
		const mapper = startedMapper();
		const events = mapper.mapFrame(
			frame("error", { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }),
		);
		expect(events).toMatchObject([
			{
				type: "error",
				error: { code: "http_status", providerDetail: "overloaded_error: Overloaded" },
			},
		]);
	});

	it("emits malformed_stream for invalid JSON on a known event type", () => {
		const mapper = startedMapper();
		const events = mapper.mapFrame({ event: "content_block_delta", data: '{"index": 0, "de' });
		expect(events).toMatchObject([{ type: "error", error: { code: "malformed_stream" } }]);
	});

	it("emits malformed_stream for an input fragment whose tool call never started", () => {
		const mapper = startedMapper();
		const events = mapper.mapFrame(
			frame("content_block_delta", {
				index: 5,
				delta: { type: "input_json_delta", partial_json: '{"a":1}' },
			}),
		);
		expect(events).toMatchObject([{ type: "error", error: { code: "malformed_stream" } }]);
	});

	it("ignores ping and unknown event types", () => {
		const mapper = startedMapper();
		expect(mapper.mapFrame(frame("ping", { type: "ping" }))).toEqual([]);
		expect(mapper.mapFrame(frame("content_block_flourish", { anything: true }))).toEqual([]);
	});

	it("ignores unknown delta types inside an open content block", () => {
		const mapper = startedMapper();
		mapper.mapFrame(
			frame("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
		);
		const events = mapper.mapFrame(
			frame("content_block_delta", {
				index: 0,
				delta: { type: "future_progress", data: "hmm" },
			}),
		);
		expect(events).toEqual([]);
	});

	it("keeps two interleaved tool_use blocks separate by content-block index", () => {
		const mapper = startedMapper();
		mapper.mapFrame(
			frame("content_block_start", {
				index: 0,
				content_block: { type: "tool_use", id: "call_a", name: "add_note", input: {} },
			}),
		);
		mapper.mapFrame(
			frame("content_block_start", {
				index: 1,
				content_block: { type: "tool_use", id: "call_b", name: "add_note", input: {} },
			}),
		);
		mapper.mapFrame(
			frame("content_block_delta", {
				index: 1,
				delta: { type: "input_json_delta", partial_json: '{"text":"b"}' },
			}),
		);
		mapper.mapFrame(
			frame("content_block_delta", {
				index: 0,
				delta: { type: "input_json_delta", partial_json: '{"text":"a"}' },
			}),
		);
		expect(mapper.mapFrame(frame("content_block_stop", { index: 0 }))).toEqual([
			{ type: "tool_call_complete", id: "call_a", name: "add_note", input: { text: "a" } },
		]);
		expect(mapper.mapFrame(frame("content_block_stop", { index: 1 }))).toEqual([
			{ type: "tool_call_complete", id: "call_b", name: "add_note", input: { text: "b" } },
		]);
	});
});

describe("full transcript", () => {
	it("maps a complete documented event sequence in order", () => {
		const mapper = createRawAnthropicStreamMapper();
		const events = mapAll(mapper, [
			frame("message_start", {
				type: "message_start",
				message: { model: "claude-sonnet-4-20250514", usage: { input_tokens: 10 } },
			}),
			frame("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
			frame("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Done. " } }),
			frame("content_block_stop", { index: 0 }),
			frame("message_delta", {
				delta: { stop_reason: "end_turn", stop_sequence: null },
				usage: { output_tokens: 4 },
			}),
			frame("message_stop", { type: "message_stop" }),
		]);
		expect(events).toEqual([
			{ type: "message_start", model: "claude-sonnet-4-20250514" },
			{ type: "text_delta", text: "Done. " },
			{ type: "usage", usage: { inputTokens: 10, outputTokens: 4 } },
			{
				type: "continuation",
				output: { provider: "anthropic", payload: [{ type: "text", text: "Done. " }] },
			},
			{ type: "message_stop", stopReason: "end_turn" },
		]);
	});
});

/** Signed native output is private replay data, never visible assistant text. */
describe("Anthropic native continuation", () => {
	const signed = { type: "thinking", thinking: "", signature: "signed-fragments" };
	const redacted = { type: "redacted_thinking", data: "opaque-redacted" };
	const call = { type: "tool_use", id: "call_1", name: "add_note", input: { text: "hi" } };
	const binding = { modelId: "claude-sonnet-5-5", prefixDigest: "test-binding" };
	const receiptMessage = (payload: unknown): ProtocolMessage => ({
		role: "assistant",
		content: [{ type: "tool_call", id: call.id, name: call.name, input: call.input }],
		continuation: { output: { provider: "anthropic", payload }, binding },
	});
	it("replays signed and redacted blocks in exact provider order without exposing them as text", () => {
		const message = receiptMessage([signed, redacted, call]);
		expect(
			buildAnthropicRequestBody({ ...baseRequest, messages: [message] }).messages[0].content,
		).toEqual([signed, redacted, call]);
	});
	it("assembles thinking and signature fragments and waits for message_stop before publishing replay", () => {
		const mapper = startedMapper();
		const frames = [
			frame("content_block_start", { index: 0, content_block: { type: "thinking", thinking: "" } }),
			frame("content_block_delta", {
				index: 0,
				delta: { type: "thinking_delta", thinking: "private " },
			}),
			frame("content_block_delta", {
				index: 0,
				delta: { type: "thinking_delta", thinking: "reasoning" },
			}),
			frame("content_block_delta", {
				index: 0,
				delta: { type: "signature_delta", signature: "signed-" },
			}),
			frame("content_block_delta", {
				index: 0,
				delta: { type: "signature_delta", signature: "fragments" },
			}),
			frame("content_block_stop", { index: 0 }),
			frame("content_block_start", { index: 1, content_block: redacted }),
			frame("content_block_stop", { index: 1 }),
		];
		expect(mapAll(mapper, frames)).toEqual([]);
		expect(mapper.mapFrame(frame("message_stop", {}))[0]).toEqual({
			type: "continuation",
			output: {
				provider: "anthropic",
				payload: [{ ...signed, thinking: "private reasoning" }, redacted],
			},
		});
		expect(
			mapper.mapFrame(
				frame("content_block_delta", {
					index: 0,
					delta: { type: "thinking_delta", thinking: "late" },
				}),
			),
		).toEqual([]);
	});
	it.each([
		{ name: "missing signature", payload: [{ type: "thinking", thinking: "" }, call] },
		{ name: "empty signature", payload: [{ ...signed, signature: "" }, call] },
		{ name: "missing redacted data", payload: [{ type: "redacted_thinking" }, call] },
		{ name: "empty redacted data", payload: [{ ...redacted, data: "" }, call] },
		{ name: "unknown executable block", payload: [{ type: "server_tool_use", id: "x" }, call] },
		{
			name: "different call arguments",
			payload: [signed, { ...call, input: { text: "changed" } }],
		},
		{ name: "different call identity", payload: [signed, { ...call, id: "other" }] },
		{ name: "added unreviewed call", payload: [signed, call, { ...call, id: "other" }] },
		{ name: "added visible text", payload: [signed, call, { type: "text", text: "unreviewed" }] },
	])("refuses $name in a saved continuation", ({ payload }) => {
		expect(() =>
			buildAnthropicRequestBody({ ...baseRequest, messages: [receiptMessage(payload)] }),
		).toThrow(/continuation/);
	});
	it.each([
		{
			name: "unsigned thinking",
			frames: [
				frame("content_block_start", {
					index: 0,
					content_block: { type: "thinking", thinking: "" },
				}),
				frame("content_block_stop", { index: 0 }),
			],
		},
		{
			name: "unclosed thinking",
			frames: [frame("content_block_start", { index: 0, content_block: signed })],
		},
		{
			name: "empty redacted block",
			frames: [
				frame("content_block_start", {
					index: 0,
					content_block: { type: "redacted_thinking", data: "" },
				}),
			],
		},
		{
			name: "duplicate content index",
			frames: [
				frame("content_block_start", { index: 0, content_block: signed }),
				frame("content_block_start", { index: 0, content_block: signed }),
			],
		},
		{
			name: "duplicate call identity",
			frames: [
				frame("content_block_start", { index: 0, content_block: call }),
				frame("content_block_start", { index: 1, content_block: call }),
			],
		},
		{
			name: "empty tool identity",
			frames: [frame("content_block_start", { index: 0, content_block: { ...call, id: "" } })],
		},
		{
			name: "signature on text",
			frames: [
				frame("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
				frame("content_block_delta", {
					index: 0,
					delta: { type: "signature_delta", signature: "wrong" },
				}),
			],
		},
		{
			name: "text on thinking",
			frames: [
				frame("content_block_start", { index: 0, content_block: signed }),
				frame("content_block_delta", { index: 0, delta: { type: "text_delta", text: "wrong" } }),
			],
		},
		{
			name: "arguments on text",
			frames: [
				frame("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
				frame("content_block_delta", {
					index: 0,
					delta: { type: "input_json_delta", partial_json: "{}" },
				}),
			],
		},
		{
			name: "signature after close",
			frames: [
				frame("content_block_start", { index: 0, content_block: signed }),
				frame("content_block_stop", { index: 0 }),
				frame("content_block_delta", {
					index: 0,
					delta: { type: "signature_delta", signature: "late" },
				}),
			],
		},
		{
			name: "duplicate block stop",
			frames: [
				frame("content_block_start", { index: 0, content_block: signed }),
				frame("content_block_stop", { index: 0 }),
				frame("content_block_stop", { index: 0 }),
			],
		},
	])("fails closed for $name before an executable stop", ({ frames }) => {
		const mapper = startedMapper();
		const events = mapAll(mapper, [
			...frames,
			frame("message_delta", { delta: { stop_reason: "tool_use" } }),
			frame("message_stop", {}),
		]);
		expect(events.filter((e) => e.type === "error")).toHaveLength(1);
		expect(events).toContainEqual(expect.objectContaining({ type: "error", terminal: true }));
		expect(events.some((e) => e.type === "message_stop" || e.type === "continuation")).toBe(false);
	});
	it("retains a nonempty initial input when no argument deltas arrive", () => {
		const mapper = startedMapper();
		mapper.mapFrame(frame("content_block_start", { index: 0, content_block: call }));
		expect(mapper.mapFrame(frame("content_block_stop", { index: 0 }))).toEqual([
			{ type: "tool_call_complete", id: call.id, name: call.name, input: call.input },
		]);
	});
});

it.each([
	"content_block_start",
	"content_block_delta",
	"content_block_stop",
	"message_delta",
	"message_stop",
])("refuses %s without a response opener", (event) => {
	expect(createRawAnthropicStreamMapper().mapFrame(frame(event, {}))).toMatchObject([
		{ type: "error", terminal: true, error: { code: "malformed_stream" } },
	]);
});
