import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ProtocolMessage } from "@/lib/ai/protocol/messages";
import type { ProviderChatRequest } from "@/lib/ai/protocol/request";
import { defineTool } from "@/lib/ai/protocol/tools";
import { buildOpenAiRequestBody, createOpenAiStreamMapper } from "./openai";
import type { SseFrame } from "./sse";

const request: ProviderChatRequest = {
	modelId: "gpt-6.1-sol",
	system: "Review threats.",
	messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
	tools: [],
	maxOutputTokens: 4096,
};
const tool = defineTool({
	name: "lookup",
	description: "Look up a component",
	input: { name: z.string().optional() },
});
const frame = (type: string, data: object = {}): SseFrame => ({
	event: type,
	data: JSON.stringify({ type, ...data }),
});
const message = (text: string, phase: "commentary" | "final_answer" = "final_answer") => ({
	type: "message",
	id: "msg_1",
	role: "assistant",
	status: "completed",
	phase,
	content: [{ type: "output_text", text, annotations: [] }],
});
const call = (callId = "call_1", args = "{}", id = "fc_1") => ({
	type: "function_call",
	id,
	call_id: callId,
	name: "lookup",
	arguments: args,
	status: "completed",
});
const reasoning = {
	type: "reasoning",
	id: "rs_1",
	summary: [],
	encrypted_content: "encrypted-reasoning",
};
const complete = (output: unknown[], overrides: object = {}) =>
	frame("response.completed", {
		response: {
			model: "gpt-6.1-sol",
			status: "completed",
			output,
			usage: { input_tokens: 20, output_tokens: 8 },
			...overrides,
		},
	});
const begin = () => frame("response.created", { response: { model: "gpt-6.1-sol" } });

describe("Responses serialization", () => {
	it("keeps the full history local and omits all Chat Completions fields", () => {
		const body = buildOpenAiRequestBody(request);
		expect(body).toEqual({
			model: request.modelId,
			instructions: request.system,
			input: [{ role: "user", content: "hi" }],
			stream: true,
			store: false,
			include: ["reasoning.encrypted_content"],
			reasoning: { effort: "medium" },
			max_output_tokens: 4096,
		});
	});
	it("preserves block order and uses call_id rather than an output item id", () => {
		const messages: ProtocolMessage[] = [
			{
				role: "assistant",
				content: [
					{ type: "text", text: "Checking." },
					{ type: "tool_call", id: "call_a", name: "lookup", input: { name: "Cache" } },
				],
			},
			{
				role: "user",
				content: [
					{ type: "tool_result", toolCallId: "call_a", content: "Found", isError: false },
					{ type: "text", text: "Thanks" },
				],
			},
		];
		expect(buildOpenAiRequestBody({ ...request, messages }).input).toEqual([
			{ role: "assistant", content: "Checking." },
			{ type: "function_call", call_id: "call_a", name: "lookup", arguments: '{"name":"Cache"}' },
			{ type: "function_call_output", call_id: "call_a", output: "Found" },
			{ role: "user", content: "Thanks" },
		]);
	});
	it("uses flat tools and explicit strict:false so optional arguments stay optional", () => {
		expect(buildOpenAiRequestBody({ ...request, tools: [tool] }).tools).toEqual([
			{
				type: "function",
				name: "lookup",
				description: tool.description,
				parameters: tool.jsonSchema(),
				strict: false,
			},
		]);
		expect(tool.jsonSchema()).not.toHaveProperty("required");
	});
	it("allows an unknown text model without inventing its reasoning capability", () => {
		expect(buildOpenAiRequestBody({ ...request, modelId: "custom-text-model" })).not.toHaveProperty(
			"reasoning",
		);
	});
	it("replays encrypted reasoning, phase and function items unchanged without duplicate blocks", () => {
		const items = [reasoning, message("Checking.", "commentary"), call()];
		const assistant: ProtocolMessage = {
			role: "assistant",
			content: [
				{ type: "text", text: "Checking." },
				{ type: "tool_call", id: "call_1", name: "lookup", input: {} },
			],
			continuation: {
				output: { provider: "openai", payload: items },
				binding: { modelId: request.modelId, prefixDigest: "bound" },
			},
		};
		const body = buildOpenAiRequestBody({
			...request,
			messages: [
				assistant,
				{
					role: "user",
					content: [{ type: "tool_result", toolCallId: "call_1", content: "Result" }],
				},
			],
		});
		expect(body.input).toEqual([
			...items,
			{ type: "function_call_output", call_id: "call_1", output: "Result" },
		]);
	});
	it.each([
		null,
		[{ type: "computer_call" }],
		[call("unreviewed")],
		[message("changed")],
		[call("call_1", "invalid")],
	])("refuses an invalid or unreviewed continuation %j", (payload) => {
		expect(() =>
			buildOpenAiRequestBody({
				...request,
				messages: [
					{
						role: "assistant",
						content: [{ type: "tool_call", id: "call_1", name: "lookup", input: {} }],
						continuation: {
							output: { provider: "openai", payload },
							binding: { modelId: request.modelId, prefixDigest: "x" },
						},
					},
				],
			}),
		).toThrow();
	});
});

describe("Responses streaming", () => {
	it("starts once, streams text, and preserves the final message without duplicate text", () => {
		const mapper = createOpenAiStreamMapper();
		expect(mapper.mapFrame(begin())).toEqual([{ type: "message_start", model: request.modelId }]);
		expect(mapper.mapFrame(begin())).toEqual([]);
		mapper.mapFrame(
			frame("response.output_item.added", {
				output_index: 0,
				item: { ...message(""), status: "in_progress", content: [] },
			}),
		);
		expect(
			mapper.mapFrame(frame("response.output_text.delta", { output_index: 0, delta: "Hi 🌐" })),
		).toEqual([{ type: "text_delta", text: "Hi 🌐" }]);
		const events = mapper.mapFrame(complete([message("Hi 🌐")]));
		expect(events).toEqual([
			{ type: "continuation", output: { provider: "openai", payload: [message("Hi 🌐")] } },
			{ type: "usage", usage: { inputTokens: 20, outputTokens: 8 } },
			{ type: "message_stop", stopReason: "end_turn" },
		]);
		expect(mapper.mapFrame(complete([message("late")]))).toEqual([]);
	});
	it("finishes tools only after validating the complete response, with separate item/call IDs", () => {
		const mapper = createOpenAiStreamMapper();
		mapper.mapFrame(begin());
		expect(
			mapper.mapFrame(
				frame("response.output_item.added", {
					output_index: 0,
					item: call("call_a", "", "fc_distinct"),
				}),
			),
		).toEqual([{ type: "tool_call_start", id: "call_a", name: "lookup" }]);
		expect(
			mapper.mapFrame(
				frame("response.function_call_arguments.delta", {
					output_index: 0,
					item_id: "fc_distinct",
					delta: '{"name":',
				}),
			),
		).toEqual([{ type: "tool_call_input_delta", id: "call_a", partialJson: '{"name":' }]);
		mapper.mapFrame(
			frame("response.function_call_arguments.delta", {
				output_index: 0,
				item_id: "fc_distinct",
				delta: '"Cache"}',
			}),
		);
		expect(
			mapper.mapFrame(
				frame("response.output_item.done", {
					output_index: 0,
					item: call("call_a", '{"name":"Cache"}', "fc_distinct"),
				}),
			),
		).toEqual([]);
		const events = mapper.mapFrame(complete([call("call_a", '{"name":"Cache"}', "fc_distinct")]));
		expect(events.filter((e) => e.type === "tool_call_complete")).toEqual([
			{ type: "tool_call_complete", id: "call_a", name: "lookup", input: { name: "Cache" } },
		]);
		expect(events[events.length - 1]).toEqual({ type: "message_stop", stopReason: "tool_use" });
	});
	it("keeps interleaved parallel call arguments separate", () => {
		const mapper = createOpenAiStreamMapper();
		mapper.mapFrame(begin());
		for (let i = 0; i < 2; i++)
			mapper.mapFrame(
				frame("response.output_item.added", {
					output_index: i,
					item: call(`call_${i}`, "", `fc_${i}`),
				}),
			);
		for (const i of [1, 0])
			mapper.mapFrame(
				frame("response.function_call_arguments.delta", {
					output_index: i,
					delta: `{"name":"${i}"}`,
				}),
			);
		expect(
			mapper
				.mapFrame(
					complete([
						call("call_0", '{"name":"0"}', "fc_0"),
						call("call_1", '{"name":"1"}', "fc_1"),
					]),
				)
				.filter((e) => e.type === "tool_call_complete"),
		).toEqual([
			{ type: "tool_call_complete", id: "call_0", name: "lookup", input: { name: "0" } },
			{ type: "tool_call_complete", id: "call_1", name: "lookup", input: { name: "1" } },
		]);
	});
	it("uses completed output when no text deltas arrived", () => {
		expect(
			createOpenAiStreamMapper()
				.mapFrame(complete([message("Final.")]))
				.filter((e) => e.type === "text_delta"),
		).toEqual([{ type: "text_delta", text: "Final." }]);
	});
	it.each([
		["invalid JSON arguments", [call("call_1", "{")]],
		["duplicate call IDs", [call(), call("call_1", "{}", "fc_2")]],
		["unsupported tool output", [{ type: "computer_call", id: "pc_1" }]],
		["incomplete function", [{ ...call(), status: "incomplete" }]],
		["refusal", [{ ...message(""), content: [{ type: "refusal", refusal: "No" }] }]],
		["wrong role", [{ ...message("x"), role: "user" }]],
	] as const)("fails closed for %s without completing or authorizing tools", (_name, output) => {
		const events = createOpenAiStreamMapper().mapFrame(complete([...output]));
		expect(events).toEqual([
			{
				type: "error",
				terminal: true,
				error: { code: "malformed_stream", message: expect.any(String) },
			},
		]);
	});
	it.each(["response.failed", "response.incomplete"])(
		"never reports a %s as a completed turn",
		(type) => {
			const events = createOpenAiStreamMapper().mapFrame(
				frame(type, {
					response: { model: request.modelId, status: type.split(".")[1], output: [call()] },
				}),
			);
			expect(events).toEqual([
				{ type: "error", error: { code: "http_status", message: expect.any(String) } },
			]);
		},
	);
	it("redacts a provider error and drops events after it", () => {
		const mapper = createOpenAiStreamMapper();
		expect(
			mapper.mapFrame(
				frame("error", { code: "rate_limit_exceeded", message: "key sk-proj-fake-secret" }),
			),
		).toEqual([
			{
				type: "error",
				error: {
					code: "rate_limited",
					message: expect.any(String),
					providerDetail: "key [redacted-key]",
				},
			},
		]);
		expect(mapper.mapFrame(complete([call()]))).toEqual([]);
	});
	it.each([
		frame("response.function_call_arguments.delta", { output_index: 1, delta: "{}" }),
		frame("response.output_text.delta", { output_index: 2, delta: "Hi" }),
		{ event: "message", data: "[DONE]" },
		{ event: "response.completed", data: "not json" },
	])("rejects orphan or malformed data instead of turning it into a short success", (invalid) => {
		expect(createOpenAiStreamMapper().mapFrame(invalid)).toMatchObject([
			{ type: "error", terminal: true, error: { code: "malformed_stream" } },
		]);
	});
	it("rejects mismatched final arguments after valid streamed fragments", () => {
		const mapper = createOpenAiStreamMapper();
		mapper.mapFrame(frame("response.output_item.added", { output_index: 0, item: call() }));
		mapper.mapFrame(
			frame("response.function_call_arguments.delta", { output_index: 0, delta: "{}" }),
		);
		expect(mapper.mapFrame(complete([call("call_1", '{"name":"changed"}')]))).toMatchObject([
			{ type: "error", terminal: true },
		]);
	});
	it("ignores future non-executable notifications", () => {
		expect(
			createOpenAiStreamMapper().mapFrame(frame("response.future_usage_hint", { data: 1 })),
		).toEqual([]);
	});
});

// OpenAI's output message phase is explicitly nullable in the official schema.
it("preserves a nullable assistant phase through stateless replay", () => {
	const output = { ...message("Hello"), phase: null };
	const events = createOpenAiStreamMapper().mapFrame(complete([output]));
	expect(events).toContainEqual({
		type: "continuation",
		output: { provider: "openai", payload: [output] },
	});
	const msg: ProtocolMessage = {
		role: "assistant",
		content: [{ type: "text", text: "Hello" }],
		continuation: {
			output: { provider: "openai", payload: [output] },
			binding: { modelId: request.modelId, prefixDigest: "fixture" },
		},
	};
	expect(buildOpenAiRequestBody({ ...request, messages: [msg] }).input).toEqual([output]);
});

it.each([undefined, null, ""])(
	"refuses unusable stateless reasoning encryption %s",
	(encrypted_content) => {
		expect(
			createOpenAiStreamMapper().mapFrame(complete([{ ...reasoning, encrypted_content }, call()])),
		).toMatchObject([{ type: "error", terminal: true, error: { code: "malformed_stream" } }]);
	},
);
