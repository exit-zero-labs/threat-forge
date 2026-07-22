import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { StreamEvent } from "@/lib/ai/protocol/events";
import type { ProtocolMessage } from "@/lib/ai/protocol/messages";
import type { ProviderChatRequest } from "@/lib/ai/protocol/request";
import { defineTool } from "@/lib/ai/protocol/tools";
import { createAnthropicStreamMapper } from "./anthropic";
import { buildOpenAiRequestBody, createOpenAiStreamMapper } from "./openai";
import { createSseDecoder, type SseFrame } from "./sse";

const addNoteTool = defineTool({
	name: "add_note",
	description: "Attach a note to the model.",
	input: { text: z.string() },
});

const baseRequest: ProviderChatRequest = {
	modelId: "gpt-4o",
	system: "You are a threat modeling assistant.",
	messages: [{ role: "user", content: [{ type: "text", text: "Review the gateway." }] }],
	tools: [],
	maxOutputTokens: 4096,
};

/** Author one frame the way the decoder would deliver an OpenAI data line. */
function frame(payload: unknown): SseFrame {
	return { event: "message", data: JSON.stringify(payload) };
}

describe("buildOpenAiRequestBody", () => {
	it("places the system prompt as the first message and requests streamed usage", () => {
		const body = buildOpenAiRequestBody(baseRequest);
		expect(body.model).toBe("gpt-4o");
		expect(body.max_completion_tokens).toBe(4096);
		expect(body.stream).toBe(true);
		expect(body.stream_options).toEqual({ include_usage: true });
		expect(body.messages).toEqual([
			{ role: "system", content: "You are a threat modeling assistant." },
			{ role: "user", content: "Review the gateway." },
		]);
	});

	it("serializes tool results as role tool messages keyed by tool_call_id", () => {
		const messages: ProtocolMessage[] = [
			{
				role: "assistant",
				content: [
					{ type: "text", text: "Adding it." },
					{ type: "tool_call", id: "call_1", name: "add_note", input: { text: "hi" } },
				],
			},
			{
				role: "user",
				content: [
					{ type: "tool_result", toolCallId: "call_1", content: "ok" },
					{ type: "text", text: "Thanks." },
				],
			},
		];
		const body = buildOpenAiRequestBody({ ...baseRequest, messages });
		expect(body.messages).toEqual([
			{ role: "system", content: "You are a threat modeling assistant." },
			{
				role: "assistant",
				content: "Adding it.",
				tool_calls: [
					{
						id: "call_1",
						type: "function",
						function: { name: "add_note", arguments: '{"text":"hi"}' },
					},
				],
			},
			// The tool message precedes the user's text: OpenAI requires results to
			// directly follow the assistant message that made the calls.
			{ role: "tool", tool_call_id: "call_1", content: "ok" },
			{ role: "user", content: "Thanks." },
		]);
	});

	it("serializes a text-less tool-call turn with null content", () => {
		const body = buildOpenAiRequestBody({
			...baseRequest,
			messages: [
				{
					role: "assistant",
					content: [{ type: "tool_call", id: "call_1", name: "add_note", input: {} }],
				},
			],
		});
		expect(body.messages[1]).toEqual({
			role: "assistant",
			content: null,
			tool_calls: [
				{ id: "call_1", type: "function", function: { name: "add_note", arguments: "{}" } },
			],
		});
	});

	it("advertises tools as function definitions with generated parameters and no strict flag", () => {
		const withTools = buildOpenAiRequestBody({ ...baseRequest, tools: [addNoteTool] });
		expect(withTools.tools).toEqual([
			{
				type: "function",
				function: {
					name: "add_note",
					description: "Attach a note to the model.",
					parameters: addNoteTool.jsonSchema(),
				},
			},
		]);
		// strict mode is deferred to #64; the flag must be absent, not false.
		expect(withTools.tools?.[0]?.function).not.toHaveProperty("strict");

		const withoutTools = buildOpenAiRequestBody(baseRequest);
		expect(withoutTools).not.toHaveProperty("tools");
	});
});

describe("createOpenAiStreamMapper", () => {
	it("emits message_start once, from the first chunk that names the model", () => {
		const mapper = createOpenAiStreamMapper();
		const first = mapper.mapFrame(
			frame({
				model: "gpt-4o",
				choices: [{ delta: { role: "assistant", content: "" }, finish_reason: null }],
			}),
		);
		expect(first).toEqual([{ type: "message_start", model: "gpt-4o" }]);
		const second = mapper.mapFrame(
			frame({ model: "gpt-4o", choices: [{ delta: { content: "Hi" }, finish_reason: null }] }),
		);
		expect(second).toEqual([{ type: "text_delta", text: "Hi" }]);
	});

	it("skips empty and null content deltas", () => {
		const mapper = createOpenAiStreamMapper();
		mapper.mapFrame(frame({ model: "gpt-4o", choices: [] }));
		expect(
			mapper.mapFrame(frame({ choices: [{ delta: { content: "" }, finish_reason: null }] })),
		).toEqual([]);
		expect(
			mapper.mapFrame(frame({ choices: [{ delta: { content: null }, finish_reason: null }] })),
		).toEqual([]);
	});

	it("accumulates tool calls by index when id and name arrive on the first fragment only", () => {
		const mapper = createOpenAiStreamMapper();
		mapper.mapFrame(frame({ model: "gpt-4o", choices: [] }));
		expect(
			mapper.mapFrame(
				frame({
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "call_1",
										type: "function",
										function: { name: "add_note", arguments: "" },
									},
								],
							},
							finish_reason: null,
						},
					],
				}),
			),
		).toEqual([{ type: "tool_call_start", id: "call_1", name: "add_note" }]);
		// Later fragments carry neither id nor name; the index resolves them.
		expect(
			mapper.mapFrame(
				frame({
					choices: [
						{
							delta: { tool_calls: [{ index: 0, function: { arguments: '{"text":"h' } }] },
							finish_reason: null,
						},
					],
				}),
			),
		).toEqual([{ type: "tool_call_input_delta", id: "call_1", partialJson: '{"text":"h' }]);
		expect(
			mapper.mapFrame(
				frame({
					choices: [
						{
							delta: { tool_calls: [{ index: 0, function: { arguments: 'i"}' } }] },
							finish_reason: null,
						},
					],
				}),
			),
		).toEqual([{ type: "tool_call_input_delta", id: "call_1", partialJson: 'i"}' }]);
		// finish_reason closes the choice: arguments are parsed exactly once here.
		expect(
			mapper.mapFrame(frame({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })),
		).toEqual([
			{ type: "tool_call_complete", id: "call_1", name: "add_note", input: { text: "hi" } },
		]);
		expect(mapper.mapFrame({ event: "message", data: "[DONE]" })).toEqual([
			{ type: "message_stop", stopReason: "tool_use" },
		]);
	});

	it("keeps two parallel tool calls separate by index", () => {
		const mapper = createOpenAiStreamMapper();
		mapper.mapFrame(frame({ model: "gpt-4o", choices: [] }));
		mapper.mapFrame(
			frame({
				choices: [
					{
						delta: {
							tool_calls: [
								{ index: 0, id: "call_a", function: { name: "add_note", arguments: "" } },
								{ index: 1, id: "call_b", function: { name: "add_note", arguments: "" } },
							],
						},
						finish_reason: null,
					},
				],
			}),
		);
		mapper.mapFrame(
			frame({
				choices: [
					{
						delta: {
							tool_calls: [
								{ index: 1, function: { arguments: '{"text":"b"}' } },
								{ index: 0, function: { arguments: '{"text":"a"}' } },
							],
						},
						finish_reason: null,
					},
				],
			}),
		);
		const completed = mapper.mapFrame(
			frame({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
		);
		expect(completed).toEqual([
			{ type: "tool_call_complete", id: "call_a", name: "add_note", input: { text: "a" } },
			{ type: "tool_call_complete", id: "call_b", name: "add_note", input: { text: "b" } },
		]);
	});

	it("emits malformed_stream for one unparseable tool call while completing the others", () => {
		const mapper = createOpenAiStreamMapper();
		mapper.mapFrame(frame({ model: "gpt-4o", choices: [] }));
		mapper.mapFrame(
			frame({
				choices: [
					{
						delta: {
							tool_calls: [
								{
									index: 0,
									id: "call_bad",
									function: { name: "add_note", arguments: '{"text": ' },
								},
								{
									index: 1,
									id: "call_good",
									function: { name: "add_note", arguments: '{"text":"ok"}' },
								},
							],
						},
						finish_reason: null,
					},
				],
			}),
		);
		const events = mapper.mapFrame(
			frame({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
		);
		expect(events).toHaveLength(2);
		expect(events[0]).toMatchObject({ type: "error", error: { code: "malformed_stream" } });
		if (events[0].type !== "error") throw new Error("expected an error event");
		expect(events[0].error.message).toBe(
			"A tool call sent arguments that were not valid JSON, so the call was dropped.",
		);
		expect(events[0].error.providerDetail).toBe("add_note");
		expect(events[1]).toEqual({
			type: "tool_call_complete",
			id: "call_good",
			name: "add_note",
			input: { text: "ok" },
		});
		// The turn still terminates normally.
		expect(mapper.mapFrame({ event: "message", data: "[DONE]" })).toEqual([
			{ type: "message_stop", stopReason: "tool_use" },
		]);
	});

	it("emits malformed_stream for a first fragment that never names its call", () => {
		const mapper = createOpenAiStreamMapper();
		const events = mapper.mapFrame(
			frame({
				choices: [
					{
						delta: { tool_calls: [{ index: 0, function: { arguments: '{"a":1}' } }] },
						finish_reason: null,
					},
				],
			}),
		);
		expect(events).toMatchObject([{ type: "error", error: { code: "malformed_stream" } }]);
	});

	it.each([
		["stop", "end_turn"],
		["tool_calls", "tool_use"],
		["length", "max_tokens"],
		["content_filter", "unknown"],
	] as const)("maps finish_reason %s to stop reason %s at [DONE]", (raw, mapped) => {
		const mapper = createOpenAiStreamMapper();
		mapper.mapFrame(frame({ choices: [{ delta: {}, finish_reason: raw }] }));
		expect(mapper.mapFrame({ event: "message", data: "[DONE]" })).toEqual([
			{ type: "message_stop", stopReason: mapped },
		]);
	});

	it("reports unknown when [DONE] arrives without any finish_reason", () => {
		const mapper = createOpenAiStreamMapper();
		expect(mapper.mapFrame({ event: "message", data: "[DONE]" })).toEqual([
			{ type: "message_stop", stopReason: "unknown" },
		]);
	});

	it("maps the requested usage chunk to a usage event", () => {
		const mapper = createOpenAiStreamMapper();
		mapper.mapFrame(frame({ model: "gpt-4o", choices: [] }));
		const events = mapper.mapFrame(
			frame({ choices: [], usage: { prompt_tokens: 42, completion_tokens: 17 } }),
		);
		expect(events).toEqual([{ type: "usage", usage: { inputTokens: 42, outputTokens: 17 } }]);
	});

	it("emits malformed_stream for a data line that is not valid JSON", () => {
		const mapper = createOpenAiStreamMapper();
		const events = mapper.mapFrame({ event: "message", data: '{"choices":[{"del' });
		expect(events).toMatchObject([{ type: "error", error: { code: "malformed_stream" } }]);
	});

	it("maps an in-stream rate limit error to rate_limited with redacted detail", () => {
		const mapper = createOpenAiStreamMapper();
		const events = mapper.mapFrame(
			frame({
				error: {
					message: "Incorrect API key provided: sk-abc123DEF. Rate limit reached.",
					type: "requests",
					code: "rate_limit_exceeded",
				},
			}),
		);
		expect(events).toHaveLength(1);
		if (events[0].type !== "error") throw new Error("expected an error event");
		expect(events[0].error.code).toBe("rate_limited");
		expect(events[0].error.message).toBe(
			"OpenAI rate limit or quota exceeded — wait and try again.",
		);
		expect(events[0].error.providerDetail).toContain("[redacted-key]");
		expect(events[0].error.providerDetail).not.toContain("sk-abc");
	});

	it("maps other in-stream errors to http_status with an authored message", () => {
		const mapper = createOpenAiStreamMapper();
		const events = mapper.mapFrame(
			frame({ error: { message: "The server had an error.", type: "server_error", code: null } }),
		);
		expect(events).toMatchObject([
			{
				type: "error",
				error: {
					code: "http_status",
					message: "OpenAI reported an error while streaming the response.",
					providerDetail: "server_error: The server had an error.",
				},
			},
		]);
	});
});

/**
 * The provider-neutrality proof: the same logical response, authored in each
 * provider's documented streaming shape, must map to an identical StreamEvent
 * sequence. Provider-assigned identifiers (the echoed model id and the tool
 * call id) are deliberately authored equal across the two transcripts so the
 * sequences can be compared exactly; everything else follows each provider's
 * wire format. Both transcripts are hand-authored from the documented event
 * shapes, not recorded from a live account.
 */
describe("cross-provider event equality", () => {
	const ANTHROPIC_TRANSCRIPT =
		"event: message_start\n" +
		'data: {"type":"message_start","message":{"id":"msg_1","model":"test-model-1","usage":{"input_tokens":42,"output_tokens":1}}}\n\n' +
		"event: content_block_start\n" +
		'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n' +
		"event: content_block_delta\n" +
		'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"I will add "}}\n\n' +
		"event: content_block_delta\n" +
		'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"a note."}}\n\n' +
		"event: content_block_stop\n" +
		'data: {"type":"content_block_stop","index":0}\n\n' +
		"event: content_block_start\n" +
		'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"call_1","name":"add_note","input":{}}}\n\n' +
		"event: content_block_delta\n" +
		'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"text\\":\\"Spoofed"}}\n\n' +
		"event: content_block_delta\n" +
		'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":" client\\"}"}}\n\n' +
		"event: content_block_stop\n" +
		'data: {"type":"content_block_stop","index":1}\n\n' +
		"event: message_delta\n" +
		'data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":17}}\n\n' +
		"event: message_stop\n" +
		'data: {"type":"message_stop"}\n\n';

	const OPENAI_TRANSCRIPT =
		'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"test-model-1","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n' +
		'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"test-model-1","choices":[{"index":0,"delta":{"content":"I will add "},"finish_reason":null}]}\n\n' +
		'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"test-model-1","choices":[{"index":0,"delta":{"content":"a note."},"finish_reason":null}]}\n\n' +
		'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"test-model-1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"add_note","arguments":""}}]},"finish_reason":null}]}\n\n' +
		'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"test-model-1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"text\\":\\"Spoofed"}}]},"finish_reason":null}]}\n\n' +
		'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"test-model-1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" client\\"}"}}]},"finish_reason":null}]}\n\n' +
		'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"test-model-1","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n' +
		'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"test-model-1","choices":[],"usage":{"prompt_tokens":42,"completion_tokens":17}}\n\n' +
		"data: [DONE]\n\n";

	const EXPECTED_SEQUENCE: StreamEvent[] = [
		{ type: "message_start", model: "test-model-1" },
		{ type: "text_delta", text: "I will add " },
		{ type: "text_delta", text: "a note." },
		{ type: "tool_call_start", id: "call_1", name: "add_note" },
		{ type: "tool_call_input_delta", id: "call_1", partialJson: '{"text":"Spoofed' },
		{ type: "tool_call_input_delta", id: "call_1", partialJson: ' client"}' },
		{
			type: "tool_call_complete",
			id: "call_1",
			name: "add_note",
			input: { text: "Spoofed client" },
		},
		{ type: "usage", usage: { inputTokens: 42, outputTokens: 17 } },
		{ type: "message_stop", stopReason: "tool_use" },
	];

	function decodeAndMap(
		transcript: string,
		mapper: { mapFrame(frame: SseFrame): StreamEvent[] },
	): StreamEvent[] {
		const decoder = createSseDecoder();
		const events: StreamEvent[] = [];
		for (const f of decoder.decode(new TextEncoder().encode(transcript))) {
			events.push(...mapper.mapFrame(f));
		}
		return events;
	}

	it("maps the same logical response to an identical event sequence on both providers", () => {
		const anthropicEvents = decodeAndMap(ANTHROPIC_TRANSCRIPT, createAnthropicStreamMapper());
		const openAiEvents = decodeAndMap(OPENAI_TRANSCRIPT, createOpenAiStreamMapper());

		// Guard against a vacuous pass: both sequences must be the expected one,
		// not merely equal to each other (two empty sequences are also equal).
		expect(anthropicEvents).toEqual(EXPECTED_SEQUENCE);
		expect(openAiEvents).toEqual(EXPECTED_SEQUENCE);
		expect(openAiEvents).toEqual(anthropicEvents);
	});
});
