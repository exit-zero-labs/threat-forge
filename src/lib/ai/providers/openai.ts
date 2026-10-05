/** OpenAI Responses request shaping and decoding; all output remains untrusted. */
import { z } from "zod";
import { ProtocolException, redactProviderDetail } from "@/lib/ai/protocol/errors";
import type { StreamEvent } from "@/lib/ai/protocol/events";
import { flattenText, type ProtocolMessage } from "@/lib/ai/protocol/messages";
import type { ProviderChatRequest } from "@/lib/ai/protocol/request";
import type { ToolInputJsonSchema } from "@/lib/ai/protocol/tools";
import { resolveCapabilities } from "@/lib/ai-models";
import { malformedStreamError } from "./mapper-events";
import type { SseFrame } from "./sse";

const functionItemSchema = z.object({
	type: z.literal("function_call"),
	id: z.string().optional(),
	call_id: z.string().min(1),
	name: z.string().min(1),
	arguments: z.string(),
	status: z.enum(["in_progress", "completed", "incomplete"]).optional(),
});
const annotationSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("url_citation"),
		url: z.string(),
		title: z.string(),
		start_index: z.number(),
		end_index: z.number(),
	}),
	z.object({
		type: z.literal("file_citation"),
		file_id: z.string(),
		filename: z.string(),
		index: z.number(),
	}),
	z.object({ type: z.literal("file_path"), file_id: z.string(), index: z.number() }),
	z.object({
		type: z.literal("container_file_citation"),
		container_id: z.string(),
		file_id: z.string(),
		filename: z.string(),
		start_index: z.number(),
		end_index: z.number(),
	}),
]);
const outputTextSchema = z.object({
	type: z.literal("output_text"),
	text: z.string(),
	annotations: z.array(annotationSchema).optional(),
});
const messageItemSchema = z.object({
	type: z.literal("message"),
	id: z.string(),
	role: z.literal("assistant"),
	status: z.enum(["in_progress", "completed", "incomplete"]),
	phase: z.enum(["commentary", "final_answer"]).nullish(),
	content: z.array(
		z.discriminatedUnion("type", [
			outputTextSchema,
			z.object({ type: z.literal("refusal"), refusal: z.string() }),
		]),
	),
});
const reasoningItemSchema = z.object({
	type: z.literal("reasoning"),
	id: z.string(),
	summary: z.array(z.object({ type: z.literal("summary_text"), text: z.string() })),
	encrypted_content: z.string().nullish(),
	status: z.enum(["in_progress", "completed", "incomplete"]).optional(),
});
const outputItemSchema = z.discriminatedUnion("type", [
	functionItemSchema,
	messageItemSchema,
	reasoningItemSchema,
]);
const outputSchema = z.array(outputItemSchema);
type OutputItem = z.infer<typeof outputItemSchema>;
type InputItem =
	| OutputItem
	| { role: "user" | "assistant"; content: string }
	| { type: "function_call_output"; call_id: string; output: string };

/** Stateless Responses body. Optional tool parameters require explicit strict:false. */
export interface OpenAiRequestBody {
	model: string;
	instructions: string;
	input: InputItem[];
	max_output_tokens: number;
	stream: true;
	store: false;
	include: ["reasoning.encrypted_content"];
	reasoning?: { effort: "medium" };
	tools?: {
		type: "function";
		name: string;
		description: string;
		parameters: ToolInputJsonSchema;
		strict: false;
	}[];
}

function invalidContinuation(): never {
	throw new ProtocolException({
		code: "malformed_stream",
		message: "The AI continuation could not be validated. Start a new chat.",
	});
}

function validateOutput(payload: unknown): OutputItem[] {
	const parsed = outputSchema.safeParse(payload);
	if (!parsed.success) return invalidContinuation();
	const calls = new Set<string>();
	for (const item of parsed.data) {
		if (item.status !== undefined && item.status !== "completed") return invalidContinuation();
		if (item.type === "reasoning" && !item.encrypted_content) return invalidContinuation();
		if (item.type === "function_call") {
			if (calls.has(item.call_id)) return invalidContinuation();
			calls.add(item.call_id);
			try {
				JSON.parse(item.arguments);
			} catch {
				return invalidContinuation();
			}
		}
		if (item.type === "message" && item.content.some((c) => c.type === "refusal"))
			return invalidContinuation();
	}
	return parsed.data;
}

function outputText(items: readonly OutputItem[]): string {
	return items
		.flatMap((item) =>
			item.type === "message"
				? item.content.map((c) => (c.type === "output_text" ? c.text : ""))
				: [],
		)
		.join("");
}

function replayOutput(message: ProtocolMessage): OutputItem[] {
	const receipt = message.continuation;
	if (receipt?.output.provider !== "openai" || message.role !== "assistant")
		return invalidContinuation();
	const items = validateOutput(receipt.output.payload);
	const nativeCalls = items
		.filter((item) => item.type === "function_call")
		.map((item) => ({ id: item.call_id, name: item.name, input: JSON.parse(item.arguments) }));
	const calls = message.content
		.filter((b) => b.type === "tool_call")
		.map((b) => ({ id: b.id, name: b.name, input: b.input }));
	if (
		JSON.stringify(nativeCalls) !== JSON.stringify(calls) ||
		outputText(items) !== flattenText(message)
	)
		return invalidContinuation();
	return items;
}

/** Remove stale encrypted reasoning while retaining reviewed calls and assistant phase.
 * The caller uses an outgoing projection; saved history and approval data are unchanged. */
export function stripOpenAiReasoning(message: ProtocolMessage): ProtocolMessage {
	const receipt = message.continuation;
	if (!receipt) return message;
	const payload = replayOutput(message).filter((item) => item.type !== "reasoning");
	return { ...message, continuation: { ...receipt, output: { provider: "openai", payload } } };
}

/** Build one direct, locally retained conversation; no remote response ID is used. */
export function buildOpenAiRequestBody(request: ProviderChatRequest): OpenAiRequestBody {
	const input: InputItem[] = [];
	for (const message of request.messages) {
		if (message.continuation) {
			input.push(...replayOutput(message));
			continue;
		}
		for (const block of message.content) {
			switch (block.type) {
				case "text":
					if (block.text) input.push({ role: message.role, content: block.text });
					break;
				case "tool_call":
					input.push({
						type: "function_call",
						call_id: block.id,
						name: block.name,
						arguments: JSON.stringify(block.input),
					});
					break;
				case "tool_result":
					input.push({
						type: "function_call_output",
						call_id: block.toolCallId,
						output: block.content,
					});
					break;
			}
		}
	}
	const body: OpenAiRequestBody = {
		model: request.modelId,
		instructions: request.system,
		input,
		max_output_tokens: request.maxOutputTokens,
		stream: true,
		store: false,
		include: ["reasoning.encrypted_content"],
	};
	if (resolveCapabilities("openai", request.modelId).known) body.reasoning = { effort: "medium" };
	if (request.tools.length)
		body.tools = request.tools.map((tool) => ({
			type: "function",
			name: tool.name,
			description: tool.description,
			parameters: tool.jsonSchema(),
			strict: false,
		}));
	return body;
}

/** Browser-only auth; desktop builds its headers in Rust. */
export function buildOpenAiBrowserHeaders(apiKey: string): Record<string, string> {
	return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
}

const envelopeSchema = z.object({
	type: z.string(),
	output_index: z.number().int().nonnegative().optional(),
	item_id: z.string().optional(),
	item: z.unknown().optional(),
	delta: z.string().optional(),
	response: z.unknown().optional(),
	code: z.string().nullish(),
	message: z.string().optional(),
});
const responseSchema = z.object({
	model: z.string(),
	status: z.string(),
	output: z.array(z.unknown()),
	usage: z
		.object({ input_tokens: z.number().nonnegative(), output_tokens: z.number().nonnegative() })
		.nullish(),
	error: z.object({ code: z.string().nullish(), message: z.string().nullish() }).nullish(),
});
const addedSchema = z.object({
	type: z.string(),
	id: z.string(),
	call_id: z.string().optional(),
	name: z.string().optional(),
});

/** One mapper per HTTP response. Completed output is checked before any call can execute. */
export function createOpenAiStreamMapper(): { mapFrame(frame: SseFrame): StreamEvent[] } {
	let started = false;
	let terminal = false;
	let emittedText = "";
	const pending = new Map<
		number,
		{ id: string; type: string; callId?: string; name?: string; arguments: string }
	>();
	function malformed(): StreamEvent[] {
		terminal = true;
		return malformedStreamError("The OpenAI response could not be decoded safely.").map((event) =>
			event.type === "error" ? { ...event, terminal: true } : event,
		);
	}
	function begin(model: string): StreamEvent[] {
		if (started) return [];
		started = true;
		return [{ type: "message_start", model }];
	}
	function failure(code?: string | null, message?: string | null): StreamEvent[] {
		terminal = true;
		const limited = code === "rate_limit_exceeded" || code === "insufficient_quota";
		return [
			{
				type: "error",
				error: {
					code: limited ? "rate_limited" : "http_status",
					message: limited
						? "OpenAI rate limit or quota exceeded — wait and try again."
						: "OpenAI could not complete the response.",
					...(message ? { providerDetail: redactProviderDetail(message) } : {}),
				},
			},
		];
	}
	return {
		mapFrame(frame): StreamEvent[] {
			if (terminal) return [];
			let raw: unknown;
			try {
				raw = JSON.parse(frame.data);
			} catch {
				return malformed();
			}
			const parsed = envelopeSchema.safeParse(raw);
			if (!parsed.success) return malformed();
			const event = parsed.data;
			if (event.type === "response.created" || event.type === "response.in_progress") {
				const response = z.object({ model: z.string() }).safeParse(event.response);
				return response.success ? begin(response.data.model) : malformed();
			}
			if (event.type === "error") return failure(event.code, event.message);
			if (event.type === "response.output_item.added") {
				const item = addedSchema.safeParse(event.item);
				if (!item.success || event.output_index === undefined || pending.has(event.output_index))
					return malformed();
				const p = item.data;
				if (!["message", "reasoning", "function_call"].includes(p.type)) return malformed();
				if (p.type === "function_call" && (!p.call_id || !p.name)) return malformed();
				pending.set(event.output_index, {
					id: p.id,
					type: p.type,
					callId: p.call_id,
					name: p.name,
					arguments: "",
				});
				return p.type === "function_call" && p.call_id && p.name
					? [{ type: "tool_call_start", id: p.call_id, name: p.name }]
					: [];
			}
			if (event.type === "response.output_text.delta") {
				if (
					event.delta === undefined ||
					event.output_index === undefined ||
					pending.get(event.output_index)?.type !== "message"
				)
					return malformed();
				emittedText += event.delta;
				return event.delta ? [{ type: "text_delta", text: event.delta }] : [];
			}
			if (event.type === "response.function_call_arguments.delta") {
				const p = event.output_index === undefined ? undefined : pending.get(event.output_index);
				if (
					!p?.callId ||
					p.type !== "function_call" ||
					event.delta === undefined ||
					(event.item_id && event.item_id !== p.id)
				)
					return malformed();
				p.arguments += event.delta;
				return event.delta
					? [{ type: "tool_call_input_delta", id: p.callId, partialJson: event.delta }]
					: [];
			}
			if (
				event.type === "response.completed" ||
				event.type === "response.incomplete" ||
				event.type === "response.failed"
			) {
				const parsedResponse = responseSchema.safeParse(event.response);
				if (!parsedResponse.success) return malformed();
				const response = parsedResponse.data;
				if (event.type !== "response.completed" || response.status !== "completed")
					return failure(response.error?.code, response.error?.message);
				let items: OutputItem[];
				try {
					items = validateOutput(response.output);
				} catch {
					terminal = true;
					return malformed();
				}
				for (const [index, p] of pending) {
					const item = items[index];
					if (
						!item ||
						item.type !== p.type ||
						item.id !== p.id ||
						(item.type === "function_call" &&
							(item.call_id !== p.callId ||
								item.name !== p.name ||
								(p.arguments && p.arguments !== item.arguments)))
					) {
						terminal = true;
						return malformed();
					}
				}
				const finalText = outputText(items);
				if (!finalText.startsWith(emittedText)) {
					terminal = true;
					return malformed();
				}
				const events: StreamEvent[] = begin(response.model);
				if (finalText.length > emittedText.length)
					events.push({ type: "text_delta", text: finalText.slice(emittedText.length) });
				for (const item of items)
					if (item.type === "function_call")
						events.push({
							type: "tool_call_complete",
							id: item.call_id,
							name: item.name,
							input: JSON.parse(item.arguments),
						});
				events.push({ type: "continuation", output: { provider: "openai", payload: items } });
				if (response.usage)
					events.push({
						type: "usage",
						usage: {
							inputTokens: response.usage.input_tokens,
							outputTokens: response.usage.output_tokens,
						},
					});
				events.push({
					type: "message_stop",
					stopReason: items.some((i) => i.type === "function_call") ? "tool_use" : "end_turn",
				});
				terminal = true;
				return events;
			}
			// Reasoning summaries, item.done and argument.done are notifications.
			// Only the validated final output array authorizes completed tool calls.
			return [];
		},
	};
}
