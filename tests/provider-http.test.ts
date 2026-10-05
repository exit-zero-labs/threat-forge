// @vitest-environment node
/** Local HTTP proof: real fetch/SSE/runner; provider access is not claimed. */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BrowserChatTransport } from "@/lib/adapters/browser-chat-adapter";
import { resolveTurnLimits } from "@/lib/ai/loop/limits";
import { createToolRegistry, defineExecutableTool } from "@/lib/ai/loop/tool-runtime";
import { createTurnRunner } from "@/lib/ai/loop/turn-runner";
import { type ConversationRequest, streamConversation } from "@/lib/ai/protocol/client";
import type { StreamEvent } from "@/lib/ai/protocol/events";
import type { AiProvider, ContentBlock, ProtocolMessage } from "@/lib/ai/protocol/messages";
import { createRetryingTransport } from "@/lib/ai/protocol/retry";
import * as modelCatalog from "@/lib/ai-models";
import { getModelsForProvider } from "@/lib/ai-models";
import type { ThreatModel } from "@/types/threat-model";

const FAKE_KEY = "sk-provider-http-not-a-real-key";
vi.mock("@/lib/adapters/browser-keychain-adapter", () => ({
	BrowserKeychainAdapter: class {
		async getKey() {
			return FAKE_KEY;
		}
	},
}));

const realFetch = globalThis.fetch;
const doc: ThreatModel = {
	version: "1.0",
	metadata: {
		title: "Synthetic",
		author: "",
		created: "2026-10-03",
		modified: "2026-10-03",
		description: "",
	},
	elements: [],
	data_flows: [],
	trust_boundaries: [],
	threats: [],
	diagrams: [],
};
const read = defineExecutableTool({
	name: "lookup",
	description: "Read a component",
	input: { name: z.string().optional() },
	effect: "read",
	destructive: false,
	summarize: () => "Read Cache",
	execute: async () => ({ status: "ok", result: "Cache exists" }),
});
const nativeCall = {
	type: "function_call",
	id: "fc_item",
	call_id: "call_1",
	name: "lookup",
	arguments: "{}",
	status: "completed",
};
const encrypted = {
	type: "reasoning",
	id: "rs_item",
	summary: [],
	encrypted_content: "encrypted-complete",
};
const signed = { type: "thinking", thinking: "", signature: "signature-complete" };
const anthropicCall = { type: "tool_use", id: "call_1", name: "lookup", input: {} };
const wire = (event: string, data: object) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
function toolStream(provider: AiProvider, model: string): string {
	if (provider === "openai")
		return (
			wire("response.created", { type: "response.created", response: { model } }) +
			wire("response.output_item.added", {
				type: "response.output_item.added",
				output_index: 0,
				item: { ...encrypted, encrypted_content: "" },
			}) +
			wire("response.output_item.done", {
				type: "response.output_item.done",
				output_index: 0,
				item: encrypted,
			}) +
			wire("response.output_item.added", {
				type: "response.output_item.added",
				output_index: 1,
				item: { ...nativeCall, arguments: "" },
			}) +
			wire("response.function_call_arguments.delta", {
				type: "response.function_call_arguments.delta",
				output_index: 1,
				item_id: "fc_item",
				delta: "{}",
			}) +
			wire("response.completed", {
				type: "response.completed",
				response: {
					model,
					status: "completed",
					output: [encrypted, nativeCall],
					usage: { input_tokens: 12, output_tokens: 8 },
				},
			})
		);
	return (
		wire("message_start", { message: { model } }) +
		wire("content_block_start", { index: 0, content_block: { type: "thinking", thinking: "" } }) +
		wire("content_block_delta", {
			index: 0,
			delta: { type: "signature_delta", signature: "signature-" },
		}) +
		wire("content_block_delta", {
			index: 0,
			delta: { type: "signature_delta", signature: "complete" },
		}) +
		wire("content_block_stop", { index: 0 }) +
		wire("content_block_start", { index: 1, content_block: { ...anthropicCall, input: {} } }) +
		wire("content_block_delta", {
			index: 1,
			delta: { type: "input_json_delta", partial_json: "{}" },
		}) +
		wire("content_block_stop", { index: 1 }) +
		wire("message_delta", { delta: { stop_reason: "tool_use" }, usage: { output_tokens: 8 } }) +
		wire("message_stop", {})
	);
}
function textStream(provider: AiProvider, model: string): string {
	if (provider === "openai")
		return (
			wire("response.created", { type: "response.created", response: { model } }) +
			wire("response.output_item.added", {
				type: "response.output_item.added",
				output_index: 0,
				item: {
					id: "msg_text",
					type: "message",
					role: "assistant",
					status: "in_progress",
					content: [],
				},
			}) +
			wire("response.output_text.delta", {
				type: "response.output_text.delta",
				output_index: 0,
				delta: "Cache exists 🌐",
			}) +
			wire("response.completed", {
				type: "response.completed",
				response: {
					model,
					status: "completed",
					output: [
						{
							id: "msg_text",
							type: "message",
							role: "assistant",
							status: "completed",
							phase: "final_answer",
							content: [{ type: "output_text", text: "Cache exists 🌐", annotations: [] }],
						},
					],
					usage: { input_tokens: 20, output_tokens: 6 },
				},
			})
		);
	return (
		wire("message_start", { message: { model } }) +
		wire("content_block_start", { index: 0, content_block: { type: "text", text: "" } }) +
		wire("content_block_delta", {
			index: 0,
			delta: { type: "text_delta", text: "Cache exists 🌐" },
		}) +
		wire("content_block_stop", { index: 0 }) +
		wire("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 6 } }) +
		wire("message_stop", {})
	);
}

const requestSchema = z.object({ model: z.string(), stream: z.literal(true) }).passthrough();
/** Independent wire assertions: a permissive canned server would miss the original bug. */
function validateRequest(path: string, body: unknown): void {
	const b = requestSchema.parse(body);
	if (path === "/v1/chat/completions") {
		if (b.tools && b.reasoning_effort !== "none")
			throw new Error("Function tools with reasoning_effort are not supported");
		throw new Error("Latest tool models require Responses");
	}
	if (path === "/v1/responses") {
		expect(b.store).toBe(false);
		expect(b.reasoning).toEqual({ effort: "medium" });
		expect(b.include).toEqual(["reasoning.encrypted_content"]);
		expect(b.input).toBeInstanceOf(Array);
		expect(b.max_output_tokens).toBe(512);
		for (const key of [
			"messages",
			"max_completion_tokens",
			"stream_options",
			"reasoning_effort",
			"previous_response_id",
		])
			expect(b).not.toHaveProperty(key);
		expect(b.tools).toEqual([
			{
				type: "function",
				name: "lookup",
				description: read.description,
				strict: false,
				parameters: {
					type: "object",
					properties: { name: { type: "string" } },
					additionalProperties: false,
				},
			},
		]);
	} else {
		expect(path).toBe("/v1/messages");
		expect(b.messages).toBeInstanceOf(Array);
		expect(b.max_tokens).toBe(512);
		expect(b.tools).toEqual([
			{
				name: "lookup",
				description: read.description,
				input_schema: {
					type: "object",
					properties: { name: { type: "string" } },
					additionalProperties: false,
				},
			},
		]);
		for (const key of ["thinking", "tool_choice", "input", "store"])
			expect(b).not.toHaveProperty(key);
	}
}

type Responder = (
	request: IncomingMessage,
	response: ServerResponse,
	body: unknown,
	index: number,
) => void | Promise<void>;
let respond: Responder;
let bodies: unknown[];
let server: ReturnType<typeof createServer>;
let baseUrl: string;
let serverErrors: unknown[];
beforeEach(async () => {
	bodies = [];
	serverErrors = [];
	server = createServer(async (req, res) => {
		const chunks: Buffer[] = [];
		for await (const chunk of req) chunks.push(Buffer.from(chunk));
		let body: unknown;
		try {
			body = JSON.parse(Buffer.concat(chunks).toString());
		} catch {
			body = null;
		}
		bodies.push(body);
		try {
			await respond(req, res, body, bodies.length - 1);
		} catch (error) {
			serverErrors.push(error);
			res.writeHead(400, { "content-type": "application/json" });
			res.end(
				JSON.stringify({
					error: {
						type: "invalid_request_error",
						param: "reasoning_effort",
						message: "Rejected incompatible provider request",
					},
				}),
			);
		}
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("expected local port");
	baseUrl = `http://127.0.0.1:${address.port}`;
	// Forward only asserted official endpoints. Production URLs remain fixed.
	vi.stubGlobal(
		"fetch",
		vi.fn((url: string | URL | Request, init?: RequestInit) => {
			const official = new URL(String(url));
			if (
				!["https://api.openai.com/v1/responses", "https://api.anthropic.com/v1/messages"].includes(
					official.href,
				)
			)
				throw new Error("Unexpected provider endpoint");
			return realFetch(baseUrl + official.pathname, init);
		}),
	);
});
afterEach(async () => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	server.closeAllConnections();
	if (!server.listening) return;
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
});
function request(
	provider: AiProvider,
	modelId: string,
	extra: Partial<ConversationRequest> = {},
): ConversationRequest {
	return {
		provider,
		modelId,
		system: "Synthetic threat model",
		messages: [{ role: "user", content: [{ type: "text", text: "Lookup Cache" }] }],
		tools: [read],
		maxOutputTokens: 512,
		turnId: "turn-1",
		turnStartIndex: 0,
		...extra,
	};
}
async function send(req: ConversationRequest, signal?: AbortSignal): Promise<StreamEvent[]> {
	const events: StreamEvent[] = [];
	await streamConversation(
		req,
		new BrowserChatTransport(),
		{ onEvent: (event) => events.push(event) },
		signal,
	);
	return events;
}

function assistant(events: StreamEvent[]): ProtocolMessage {
	const continuation = events.find((e) => e.type === "continuation");
	if (continuation?.type !== "continuation" || !continuation.binding)
		throw new Error("expected bound output");
	return {
		role: "assistant",
		content: events.flatMap<ContentBlock>((e) =>
			e.type === "text_delta"
				? [{ type: "text" as const, text: e.text }]
				: e.type === "tool_call_complete"
					? [{ type: "tool_call" as const, id: e.id, name: e.name, input: e.input }]
					: [],
		),
		continuation: { output: continuation.output, binding: continuation.binding },
	};
}
function answered(req: ConversationRequest, events: StreamEvent[]): ProtocolMessage[] {
	return [
		...req.messages,
		assistant(events),
		{
			role: "user",
			content: [{ type: "tool_result", toolCallId: "call_1", content: "Cache exists" }],
		},
	];
}

const current = [...getModelsForProvider("anthropic"), ...getModelsForProvider("openai")];

describe("real HTTP model/tool conversations", () => {
	it("rejects the original Chat Completions request over HTTP", async () => {
		respond = (req, res, body) => {
			validateRequest(req.url ?? "", body);
			res.end();
		};
		const response = await realFetch(`${baseUrl}/v1/chat/completions`, {
			method: "POST",
			body: JSON.stringify({
				model: "gpt-5.6-luna",
				stream: true,
				tools: [{ type: "function", function: { name: "lookup" } }],
			}),
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: { param: "reasoning_effort" } });
		expect(serverErrors).toHaveLength(1);
	});
	it.each(current)("completes a signed/encrypted tool roundtrip for $id", async (model) => {
		respond = (req, res, body, index) => {
			validateRequest(req.url ?? "", body);
			expect(
				model.provider === "openai" ? req.headers.authorization : req.headers["x-api-key"],
			).toBe(model.provider === "openai" ? `Bearer ${FAKE_KEY}` : FAKE_KEY);
			if (model.provider === "anthropic")
				expect(req.headers["anthropic-version"]).toBe("2023-06-01");
			const parsed = requestSchema.parse(body);
			expect(parsed.model).toBe(model.id);
			if (index === 1) {
				if (model.provider === "openai")
					expect(parsed.input).toEqual([
						{ role: "user", content: "Lookup Cache" },
						encrypted,
						nativeCall,
						{ type: "function_call_output", call_id: "call_1", output: "Cache exists" },
					]);
				else
					expect(parsed.messages).toEqual([
						{ role: "user", content: [{ type: "text", text: "Lookup Cache" }] },
						{ role: "assistant", content: [signed, anthropicCall] },
						{
							role: "user",
							content: [
								{
									type: "tool_result",
									tool_use_id: "call_1",
									content: "Cache exists",
									is_error: false,
								},
							],
						},
					]);
			}
			res.writeHead(200, { "content-type": "text/event-stream" });
			const payload =
				index === 0 ? toolStream(model.provider, model.id) : textStream(model.provider, model.id);
			const bytes = Buffer.from(payload);
			const split = Math.min(37, bytes.length);
			res.write(bytes.subarray(0, split));
			res.end(bytes.subarray(split));
		};
		const runner = createTurnRunner({
			getDocument: () => doc,
			stream: (req, onEvent, signal) =>
				streamConversation(req, new BrowserChatTransport(), { onEvent }, signal),
		});
		await runner.submit({
			text: "Lookup Cache",
			baseMessages: [],
			provider: model.provider,
			modelId: model.id,
			system: "Synthetic threat model",
			toolSet: createToolRegistry([read]),
			limits: resolveTurnLimits(),
			maxOutputTokens: 512,
		});
		expect(serverErrors).toEqual([]);
		expect(bodies).toHaveLength(2);
		expect(runner.getState().outcome).toBe("completed");
		expect(runner.getState().calls.map((c) => c.status)).toEqual(["succeeded"]);
		expect(
			runner
				.getState()
				.messages.filter((m) => m.role === "assistant")
				.flatMap((m) => m.content)
				.filter((b) => b.type === "text"),
		).toEqual([{ type: "text", text: "Cache exists 🌐" }]);
	});
	it.each([400, 401, 403, 404, 413, 429, 500, 503])(
		"surfaces HTTP %i once with redacted bounded detail",
		async (status) => {
			respond = (_req, res) => {
				res.writeHead(status, { "content-type": "application/json" });
				res.end(JSON.stringify({ error: { message: `key ${FAKE_KEY} ${"x".repeat(20_000)}` } }));
			};
			const events = await send(request("openai", "gpt-6.1-sol"));
			expect(bodies).toHaveLength(1);
			expect(events).toHaveLength(1);
			expect(events[0]).toMatchObject({
				type: "error",
				error: { code: status === 429 ? "rate_limited" : "http_status" },
			});
			expect(JSON.stringify(events)).not.toContain(FAKE_KEY);
			expect(JSON.stringify(events)).toContain("[redacted-key]");
			if (events[0]?.type === "error")
				expect(events[0].error.providerDetail?.length).toBeLessThanOrEqual(201);
		},
	);
	it("refuses a redirect before forwarding any credentials to the trap", async () => {
		let trap = 0;
		respond = (req, res) => {
			if (req.url === "/trap") {
				trap++;
				res.end();
				return;
			}
			res.writeHead(307, { location: `${baseUrl}/trap` });
			res.end();
		};
		expect(await send(request("openai", "gpt-6.1-sol"))).toMatchObject([
			{ type: "error", error: { code: "transport" } },
		]);
		expect(trap).toBe(0);
		expect(bodies).toHaveLength(1);
	});
	it.each(["openai", "anthropic"] as const)(
		"fails a truncated %s stream without a normal completion",
		async (provider) => {
			respond = (_req, res) => {
				res.writeHead(200, { "content-type": "text/event-stream" });
				res.end(
					toolStream(provider, provider === "openai" ? "gpt-6.1-sol" : "claude-sonnet-5-5").split(
						provider === "openai" ? "event: response.completed" : "event: message_stop",
					)[0],
				);
			};
			const events = await send(
				request(provider, provider === "openai" ? "gpt-6.1-sol" : "claude-sonnet-5-5"),
			);
			expect(events[events.length - 1]).toMatchObject({
				type: "error",
				error: { code: "malformed_stream" },
			});
			expect(events.some((e) => e.type === "message_stop" || e.type === "continuation")).toBe(
				false,
			);
		},
	);
	it("cancels an open real HTTP stream locally after its first text", async () => {
		const controller = new AbortController();
		respond = (_req, res) => {
			res.writeHead(200, { "content-type": "text/event-stream" });
			res.write(
				wire("message_start", { message: { model: "claude-sonnet-5-5" } }) +
					wire("content_block_start", { index: 0, content_block: { type: "text", text: "" } }) +
					wire("content_block_delta", { index: 0, delta: { type: "text_delta", text: "partial" } }),
			);
		};
		const events: StreamEvent[] = [];
		await streamConversation(
			request("anthropic", "claude-sonnet-5-5"),
			new BrowserChatTransport(),
			{
				onEvent: (event) => {
					events.push(event);
					if (event.type === "text_delta") controller.abort();
				},
			},
			controller.signal,
		);
		expect(events).toEqual([
			{ type: "message_start", model: "claude-sonnet-5-5" },
			{ type: "text_delta", text: "partial" },
			{ type: "aborted" },
		]);
		expect(bodies).toHaveLength(1);
	});
	it("does not send an already-aborted request", async () => {
		respond = () => {
			throw new Error("must not send");
		};
		expect(await send(request("openai", "gpt-6.1-sol"), AbortSignal.abort())).toEqual([
			{ type: "aborted" },
		]);
		expect(bodies).toHaveLength(0);
	});
	it("retries only an HTTP failure before output and sends the same validated body", async () => {
		respond = (req, res, body, index) => {
			validateRequest(req.url ?? "", body);
			if (index === 0) {
				res.writeHead(503);
				res.end("Busy");
			} else {
				res.writeHead(200, { "content-type": "text/event-stream" });
				res.end(textStream("openai", "gpt-6.1-sol"));
			}
		};
		const events: StreamEvent[] = [];
		const waits: number[] = [];
		await streamConversation(
			request("openai", "gpt-6.1-sol"),
			createRetryingTransport(
				new BrowserChatTransport(),
				{ maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 },
				{
					delay: async (ms) => {
						waits.push(ms);
					},
				},
			),
			{ onEvent: (event) => events.push(event) },
		);
		expect(bodies).toHaveLength(2);
		expect(bodies[0]).toEqual(bodies[1]);
		expect(waits).toEqual([1]);
		expect(serverErrors).toEqual([]);
		expect(events[events.length - 1]).toEqual({ type: "message_stop", stopReason: "end_turn" });
	});
	it.each(["openai", "anthropic"] as const)(
		"refuses changed current-turn %s context before sending a follow-up",
		async (provider) => {
			const id = provider === "openai" ? "gpt-6.1-sol" : "claude-sonnet-5-5";
			respond = (_req, res) => {
				res.writeHead(200, { "content-type": "text/event-stream" });
				res.end(toolStream(provider, id));
			};
			const initial = request(provider, id);
			const events = await send(initial);
			const failure = await send({
				...initial,
				system: "Changed document",
				messages: answered(initial, events),
			});
			expect(failure).toMatchObject([{ type: "error", error: { code: "context_overflow" } }]);
			expect(bodies).toHaveLength(1);
		},
	);
	it.each(["openai", "anthropic"] as const)(
		"drops stale prior-turn %s reasoning when the document changes",
		async (provider) => {
			const id = provider === "openai" ? "gpt-6.1-sol" : "claude-sonnet-5-5";
			respond = (req, res, body, index) => {
				validateRequest(req.url ?? "", body);
				if (index === 1) {
					expect(JSON.stringify(body)).not.toMatch(/encrypted-complete|signature-complete/);
					expect(JSON.stringify(body)).toContain("call_1");
					expect(JSON.stringify(body)).toContain("Cache exists");
				}
				res.writeHead(200, { "content-type": "text/event-stream" });
				res.end(index === 0 ? toolStream(provider, id) : textStream(provider, id));
			};
			const initial = request(provider, id);
			const events = await send(initial);
			const history = answered(initial, events);
			const original = JSON.stringify(history);
			const result = await send({
				...initial,
				system: "Edited document",
				turnId: "turn-2",
				turnStartIndex: history.length,
				messages: [...history, { role: "user", content: [{ type: "text", text: "Follow up" }] }],
			});
			expect(result[result.length - 1]).toEqual({ type: "message_stop", stopReason: "end_turn" });
			expect(JSON.stringify(history)).toBe(original);
			expect(serverErrors).toEqual([]);
			expect(bodies).toHaveLength(2);
		},
	);
	it("removes incompatible continuation when switching providers", async () => {
		respond = (req, res, body, index) => {
			validateRequest(req.url ?? "", body);
			if (index === 1) expect(JSON.stringify(body)).not.toContain("encrypted-complete");
			res.writeHead(200, { "content-type": "text/event-stream" });
			res.end(
				index === 0
					? toolStream("openai", "gpt-6.1-sol")
					: textStream("anthropic", "claude-sonnet-5-5"),
			);
		};
		const initial = request("openai", "gpt-6.1-sol");
		const events = await send(initial);
		const history = answered(initial, events);
		const result = await send(
			request("anthropic", "claude-sonnet-5-5", {
				turnId: "turn-2",
				turnStartIndex: history.length,
				messages: [...history, { role: "user", content: [{ type: "text", text: "Continue" }] }],
			}),
		);
		expect(result[result.length - 1]).toEqual({ type: "message_stop", stopReason: "end_turn" });
		expect(serverErrors).toEqual([]);
	});
	it("refuses budget truncation of a current tool turn before network", async () => {
		respond = (_req, res) => {
			res.writeHead(200, { "content-type": "text/event-stream" });
			res.end(toolStream("openai", "gpt-6.1-sol"));
		};
		const initial = request("openai", "gpt-6.1-sol", {
			messages: [{ role: "user", content: [{ type: "text", text: "x".repeat(400) }] }],
		});
		const events = await send(initial);
		vi.spyOn(modelCatalog, "resolveCapabilities").mockReturnValue({
			known: true,
			capabilities: {
				toolCalling: true,
				parallelToolCalls: true,
				streaming: true,
				maxInputTokens: 650,
			},
		});
		expect(await send({ ...initial, messages: answered(initial, events) })).toMatchObject([
			{ type: "error", error: { code: "context_overflow" } },
		]);
		expect(bodies).toHaveLength(1);
	});
	it.each([
		{
			messages: [
				{
					role: "user",
					content: [{ type: "tool_result", toolCallId: "orphan", content: "result" }],
				},
			],
		},
		{
			messages: [
				{
					role: "assistant",
					content: [{ type: "tool_call", id: "unanswered", name: "lookup", input: {} }],
				},
			],
		},
	] satisfies { messages: ProtocolMessage[] }[])(
		"refuses unpaired tool history before network",
		async ({ messages }) => {
			respond = () => {
				throw new Error("must not send");
			};
			expect(await send(request("openai", "gpt-6.1-sol", { messages }))).toMatchObject([
				{ type: "error", error: { code: "malformed_stream" } },
			]);
			expect(bodies).toHaveLength(0);
		},
	);
});

describe("chained native receipts and malformed openers", () => {
	it.each(["openai", "anthropic"] as const)(
		"retains both %s receipts through two tool iterations",
		async (provider) => {
			const model = provider === "openai" ? "gpt-6.1-sol" : "claude-sonnet-5-5";
			respond = (req, res, body, index) => {
				validateRequest(req.url ?? "", body);
				const parsed = requestSchema.parse(body);
				if (index === 2) {
					if (provider === "openai") {
						const input = z.array(z.record(z.string(), z.unknown())).parse(parsed.input);
						expect(input).toContainEqual(encrypted);
						expect(input).toContainEqual({
							...encrypted,
							id: "rs_item_2",
							encrypted_content: "encrypted-two",
						});
						expect(input.filter((i) => i.type === "function_call").map((i) => i.call_id)).toEqual([
							"call_1",
							"call_2",
						]);
						expect(
							input.filter((i) => i.type === "function_call_output").map((i) => i.call_id),
						).toEqual(["call_1", "call_2"]);
					} else {
						const blocks = z
							.array(z.object({ content: z.array(z.record(z.string(), z.unknown())) }))
							.parse(parsed.messages)
							.flatMap((m) => m.content);
						expect(blocks).toContainEqual(signed);
						expect(blocks).toContainEqual({ ...signed, signature: "signature-two-complete" });
						expect(blocks.filter((b) => b.type === "tool_use").map((b) => b.id)).toEqual([
							"call_1",
							"call_2",
						]);
						expect(
							blocks.filter((b) => b.type === "tool_result").map((b) => b.tool_use_id),
						).toEqual(["call_1", "call_2"]);
					}
				}
				res.writeHead(200, { "content-type": "text/event-stream" });
				const second = toolStream(provider, model)
					.replaceAll("call_1", "call_2")
					.replaceAll("fc_item", "fc_item_2")
					.replaceAll("rs_item", "rs_item_2")
					.replaceAll("encrypted-complete", "encrypted-two")
					.replaceAll("signature-", "signature-two-");
				res.end(
					index === 0
						? toolStream(provider, model)
						: index === 1
							? second
							: textStream(provider, model),
				);
			};
			const runner = createTurnRunner({
				getDocument: () => doc,
				stream: (req, onEvent, signal) =>
					streamConversation(req, new BrowserChatTransport(), { onEvent }, signal),
			});
			await runner.submit({
				text: "Lookup twice",
				baseMessages: [],
				provider,
				modelId: model,
				system: "Synthetic",
				toolSet: createToolRegistry([read]),
				limits: resolveTurnLimits(),
				maxOutputTokens: 512,
			});
			expect(serverErrors).toEqual([]);
			expect(bodies).toHaveLength(3);
			expect(runner.getState().outcome).toBe("completed");
			expect(runner.getState().calls.map((c) => c.status)).toEqual(["succeeded", "succeeded"]);
		},
	);
	it("fails once instead of resending a response without message_start", async () => {
		respond = (_req, res) => {
			res.writeHead(200, { "content-type": "text/event-stream" });
			res.end(
				wire("message_delta", { delta: { stop_reason: "end_turn" } }) + wire("message_stop", {}),
			);
		};
		const runner = createTurnRunner({
			getDocument: () => doc,
			stream: (req, onEvent, signal) =>
				streamConversation(req, new BrowserChatTransport(), { onEvent }, signal),
		});
		await runner.submit({
			text: "hi",
			baseMessages: [],
			provider: "anthropic",
			modelId: "claude-sonnet-5-5",
			system: "Synthetic",
			toolSet: createToolRegistry([read]),
			limits: resolveTurnLimits(),
			maxOutputTokens: 512,
		});
		expect(bodies).toHaveLength(1);
		expect(runner.getState().outcome).toBe("failed");
		expect(runner.getState().error?.code).toBe("malformed_stream");
	});
});

it("invalidates old encrypted reasoning without losing assistant phase", async () => {
	const commentary = {
		type: "message",
		id: "msg_preamble",
		role: "assistant",
		status: "completed",
		phase: "commentary",
		content: [{ type: "output_text", text: "Checking.", annotations: [] }],
	};
	respond = (req, res, body, index) => {
		validateRequest(req.url ?? "", body);
		if (index === 1) {
			const input = z
				.array(z.record(z.string(), z.unknown()))
				.parse(requestSchema.parse(body).input);
			expect(input).toContainEqual(commentary);
			expect(input).toContainEqual(nativeCall);
			expect(input.some((i) => i.type === "reasoning")).toBe(false);
		}
		res.writeHead(200, { "content-type": "text/event-stream" });
		res.end(
			index === 0
				? wire("response.completed", {
						type: "response.completed",
						response: {
							model: "gpt-6.1-sol",
							status: "completed",
							output: [encrypted, commentary, nativeCall],
						},
					})
				: textStream("openai", "gpt-6.1-sol"),
		);
	};
	const initial = request("openai", "gpt-6.1-sol");
	const first = await send(initial);
	const history = answered(initial, first);
	const result = await send({
		...initial,
		system: "Updated architecture",
		turnId: "turn-2",
		turnStartIndex: history.length,
		messages: [...history, { role: "user", content: [{ type: "text", text: "Continue" }] }],
	});
	expect(serverErrors).toEqual([]);
	expect(result[result.length - 1]).toEqual({ type: "message_stop", stopReason: "end_turn" });
	expect(bodies).toHaveLength(2);
});
