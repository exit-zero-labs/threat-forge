import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { StreamEvent } from "@/lib/ai/protocol/events";
import type { ProtocolMessage } from "@/lib/ai/protocol/messages";
import type { ProviderChatRequest } from "@/lib/ai/protocol/request";
import { defineTool } from "@/lib/ai/protocol/tools";
import {
	type AnthropicStreamMapper,
	buildAnthropicRequestBody,
	createAnthropicStreamMapper,
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
		const mapper = createAnthropicStreamMapper();
		const events = mapper.mapFrame(
			frame("message_start", {
				type: "message_start",
				message: { model: "claude-sonnet-4-20250514", usage: { input_tokens: 42 } },
			}),
		);
		expect(events).toEqual([{ type: "message_start", model: "claude-sonnet-4-20250514" }]);
	});

	it("maps text content blocks to text deltas and emits nothing for the empty opener", () => {
		const mapper = createAnthropicStreamMapper();
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
		const mapper = createAnthropicStreamMapper();
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
		const mapper = createAnthropicStreamMapper();
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

	it("emits malformed_stream for unparseable tool arguments without aborting the turn", () => {
		const mapper = createAnthropicStreamMapper();
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

		// The turn continues: later text and the terminal stop still map.
		expect(
			mapper.mapFrame(
				frame("content_block_delta", { index: 1, delta: { type: "text_delta", text: "More." } }),
			),
		).toEqual([{ type: "text_delta", text: "More." }]);
		mapper.mapFrame(
			frame("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } }),
		);
		expect(mapper.mapFrame(frame("message_stop", { type: "message_stop" }))).toEqual([
			{ type: "message_stop", stopReason: "end_turn" },
		]);
	});

	it("keeps a hostile stream-supplied tool name out of the authored error message", () => {
		const mapper = createAnthropicStreamMapper();
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
		const mapper = createAnthropicStreamMapper();
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
		const mapper = createAnthropicStreamMapper();
		mapper.mapFrame(frame("message_delta", { delta: { stop_reason: raw }, usage: null }));
		expect(mapper.mapFrame(frame("message_stop", { type: "message_stop" }))).toEqual([
			{ type: "message_stop", stopReason: mapped },
		]);
	});

	it("reports unknown when the stream never named a stop reason", () => {
		const mapper = createAnthropicStreamMapper();
		expect(mapper.mapFrame(frame("message_stop", { type: "message_stop" }))).toEqual([
			{ type: "message_stop", stopReason: "unknown" },
		]);
	});

	it("maps a rate_limit_error stream error to rate_limited with redacted detail", () => {
		const mapper = createAnthropicStreamMapper();
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
		const mapper = createAnthropicStreamMapper();
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
		const mapper = createAnthropicStreamMapper();
		const events = mapper.mapFrame({ event: "content_block_delta", data: '{"index": 0, "de' });
		expect(events).toMatchObject([{ type: "error", error: { code: "malformed_stream" } }]);
	});

	it("emits malformed_stream for an input fragment whose tool call never started", () => {
		const mapper = createAnthropicStreamMapper();
		const events = mapper.mapFrame(
			frame("content_block_delta", {
				index: 5,
				delta: { type: "input_json_delta", partial_json: '{"a":1}' },
			}),
		);
		expect(events).toMatchObject([{ type: "error", error: { code: "malformed_stream" } }]);
	});

	it("ignores ping and unknown event types", () => {
		const mapper = createAnthropicStreamMapper();
		expect(mapper.mapFrame(frame("ping", { type: "ping" }))).toEqual([]);
		expect(mapper.mapFrame(frame("content_block_flourish", { anything: true }))).toEqual([]);
	});

	it("ignores unknown delta types inside content_block_delta", () => {
		const mapper = createAnthropicStreamMapper();
		const events = mapper.mapFrame(
			frame("content_block_delta", {
				index: 0,
				delta: { type: "thinking_delta", thinking: "hmm" },
			}),
		);
		expect(events).toEqual([]);
	});

	it("keeps two interleaved tool_use blocks separate by content-block index", () => {
		const mapper = createAnthropicStreamMapper();
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
		const mapper = createAnthropicStreamMapper();
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
			{ type: "message_stop", stopReason: "end_turn" },
		]);
	});
});
