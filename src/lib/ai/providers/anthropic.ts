/**
 * Anthropic Messages API mapper: request building and stream-event decoding.
 *
 * This module and `./openai.ts` are the only places Anthropic's wire shapes may
 * appear; everything downstream speaks the protocol types in
 * `src/lib/ai/protocol/`. Provider-neutral visible events stay equivalent; native continuation receipts
 * retain provider-specific signed content.
 *
 * Tool results serialize as `tool_result` blocks inside a `user` message;
 * OpenAI function-call output items live wholly
 * in `./openai.ts`.
 */

import { z } from "zod";
import {
	type ProtocolError,
	ProtocolException,
	redactProviderDetail,
} from "@/lib/ai/protocol/errors";
import type { StopReason, StreamEvent } from "@/lib/ai/protocol/events";
import { type ContentBlock, flattenText, type ProtocolMessage } from "@/lib/ai/protocol/messages";
import type { ProviderChatRequest } from "@/lib/ai/protocol/request";
import type { ToolInputJsonSchema } from "@/lib/ai/protocol/tools";
import { finishPendingToolCall, malformedStreamError, type PendingToolCall } from "./mapper-events";
import type { SseFrame } from "./sse";

// ---------------------------------------------------------------------------
// Request building
// ---------------------------------------------------------------------------

interface AnthropicTextBlock {
	type: "text";
	text: string;
}

interface AnthropicToolUseBlock {
	type: "tool_use";
	id: string;
	name: string;
	input: unknown;
}

interface AnthropicToolResultBlock {
	type: "tool_result";
	tool_use_id: string;
	content: string;
	is_error?: boolean;
}

type AnthropicAssistantBlock =
	| AnthropicTextBlock
	| AnthropicToolUseBlock
	| { type: "thinking"; thinking: string; signature: string }
	| { type: "redacted_thinking"; data: string };
type AnthropicContentBlock = AnthropicAssistantBlock | AnthropicToolResultBlock;

const assistantContentSchema = z.array(
	z.discriminatedUnion("type", [
		z.object({ type: z.literal("text"), text: z.string() }),
		z.object({
			type: z.literal("tool_use"),
			id: z.string().min(1),
			name: z.string().min(1),
			input: z.unknown(),
		}),
		z.object({ type: z.literal("thinking"), thinking: z.string(), signature: z.string().min(1) }),
		z.object({ type: z.literal("redacted_thinking"), data: z.string().min(1) }),
	]),
);

function replayContent(message: ProtocolMessage): AnthropicAssistantBlock[] {
	const receipt = message.continuation;
	const parsed = assistantContentSchema.safeParse(receipt?.output.payload);
	if (!parsed.success || receipt?.output.provider !== "anthropic" || message.role !== "assistant") {
		throw new ProtocolException({
			code: "malformed_stream",
			message: "The AI continuation could not be validated. Start a new chat.",
		});
	}
	const text = parsed.data
		.filter((b) => b.type === "text")
		.map((b) => b.text)
		.join("");
	const nativeCalls = parsed.data
		.filter((b) => b.type === "tool_use")
		.map((b) => ({ id: b.id, name: b.name, input: b.input }));
	const calls = message.content
		.filter((b) => b.type === "tool_call")
		.map((b) => ({ id: b.id, name: b.name, input: b.input }));
	if (
		text !== flattenText(message) ||
		JSON.stringify(nativeCalls.sort((a, b) => a.id.localeCompare(b.id))) !==
			JSON.stringify(calls.sort((a, b) => a.id.localeCompare(b.id)))
	) {
		throw new ProtocolException({
			code: "malformed_stream",
			message: "The AI continuation does not match the reviewed response. Start a new chat.",
		});
	}
	return parsed.data;
}

interface AnthropicRequestMessage {
	role: "user" | "assistant";
	content: AnthropicContentBlock[];
}

interface AnthropicToolPayload {
	name: string;
	description: string;
	input_schema: ToolInputJsonSchema;
}

/** The body posted to `POST /v1/messages`. */
export interface AnthropicRequestBody {
	model: string;
	max_tokens: number;
	system: string;
	messages: AnthropicRequestMessage[];
	stream: true;
	tools?: AnthropicToolPayload[];
}

/**
 * Protocol blocks map one-to-one onto Anthropic blocks regardless of role:
 * tool results already live inside `user` messages in the protocol model.
 */
function toAnthropicBlock(block: ContentBlock): AnthropicContentBlock {
	switch (block.type) {
		case "text":
			return { type: "text", text: block.text };
		case "tool_call":
			return { type: "tool_use", id: block.id, name: block.name, input: block.input };
		case "tool_result":
			return {
				type: "tool_result",
				tool_use_id: block.toolCallId,
				content: block.content,
				...(block.isError === undefined ? {} : { is_error: block.isError }),
			};
	}
}

/**
 * Build the streaming request body for the Anthropic Messages API.
 *
 * Tool-call/result pairing and block placement are the caller's contract,
 * enforced upstream by `assertToolPairing` and the budgeter; a history that
 * violates them serializes to whatever the provider makes of it. Only
 * contract-conforming histories are guaranteed to serialize equivalently
 * across the two builders.
 */
export function buildAnthropicRequestBody(request: ProviderChatRequest): AnthropicRequestBody {
	const body: AnthropicRequestBody = {
		model: request.modelId,
		max_tokens: request.maxOutputTokens,
		system: request.system,
		messages: request.messages.map((message) => ({
			role: message.role,
			content: message.continuation
				? replayContent(message)
				: message.content.map(toAnthropicBlock),
		})),
		stream: true,
	};
	if (request.tools.length > 0) {
		body.tools = request.tools.map((tool) => ({
			name: tool.name,
			description: tool.description,
			input_schema: tool.jsonSchema(),
		}));
	}
	return body;
}

/**
 * Headers for a direct browser call to the Messages API.
 *
 * Browser-only. On desktop the equivalent set is built by `auth_headers` in
 * `src-tauri/src/ai/providers.rs` so that the key never enters the webview.
 *
 * `anthropic-dangerous-direct-browser-access` is required for a keyed request
 * made from a page context: without it Anthropic refuses to serve the
 * cross-origin call at all. It is safe here only because ThreatForge is BYOK —
 * the key belongs to the person typing in the browser, and no other origin can
 * read it out of `localStorage`.
 */
export function buildAnthropicBrowserHeaders(apiKey: string): Record<string, string> {
	return {
		"Content-Type": "application/json",
		"x-api-key": apiKey,
		"anthropic-version": "2023-06-01",
		"anthropic-dangerous-direct-browser-access": "true",
	};
}

// ---------------------------------------------------------------------------
// Stream mapping
// ---------------------------------------------------------------------------

/**
 * Frame payload schemas. Deliberately lenient: only the fields this mapper
 * reads are declared, unknown keys are stripped, and unknown progress delta
 * types fall through to "ignore". Unknown executable blocks fail closed — Anthropic documents that clients must
 * tolerate event shapes added after a client was written.
 */
const usageSchema = z.object({
	input_tokens: z.number().nullish(),
	output_tokens: z.number().nullish(),
});

const messageStartSchema = z.object({
	message: z.object({
		model: z.string(),
		usage: usageSchema.nullish(),
	}),
});

const contentBlockStartSchema = z.object({
	index: z.number().int(),
	content_block: z.object({
		type: z.string(),
		id: z.string().optional(),
		name: z.string().optional(),
		text: z.string().optional(),
		thinking: z.string().optional(),
		signature: z.string().optional(),
		data: z.string().optional(),
		input: z.unknown().optional(),
	}),
});

const contentBlockDeltaSchema = z.object({
	index: z.number().int(),
	delta: z.object({
		type: z.string(),
		text: z.string().optional(),
		partial_json: z.string().optional(),
		thinking: z.string().optional(),
		signature: z.string().optional(),
	}),
});

const contentBlockStopSchema = z.object({
	index: z.number().int(),
});

const messageDeltaSchema = z.object({
	delta: z.object({ stop_reason: z.string().nullish() }).nullish(),
	usage: usageSchema.nullish(),
});

const errorEventSchema = z.object({
	error: z
		.object({
			type: z.string().nullish(),
			message: z.string().nullish(),
		})
		.nullish(),
});

const STOP_REASONS = new Map<string, StopReason>([
	["end_turn", "end_turn"],
	["tool_use", "tool_use"],
	["max_tokens", "max_tokens"],
	["stop_sequence", "stop_sequence"],
]);

function mapStopReason(raw: string): StopReason {
	return STOP_REASONS.get(raw) ?? "unknown";
}

/**
 * JSON-parse a frame payload and validate the fields this mapper reads.
 * `undefined` means the frame could not be decoded as its event type claims.
 */
function decodePayload<Schema extends z.ZodType>(
	schema: Schema,
	data: string,
): z.infer<Schema> | undefined {
	let payload: unknown;
	try {
		payload = JSON.parse(data);
	} catch {
		return undefined;
	}
	const parsed = schema.safeParse(payload);
	return parsed.success ? parsed.data : undefined;
}

export interface AnthropicStreamMapper {
	/** Map one decoded frame onto zero or more protocol events. */
	mapFrame(frame: SseFrame): StreamEvent[];
}

/** Create a mapper holding the per-turn state of one Anthropic stream. */
export function createAnthropicStreamMapper(): AnthropicStreamMapper {
	/** `tool_use` blocks in flight, keyed by their content-block index. */
	const pendingToolCalls = new Map<number, PendingToolCall>();
	/** Input tokens arrive on `message_start`; the usage event fires later. */
	let reportedInputTokens = 0;
	let stopReason: StopReason | undefined;
	const blocks = new Map<number, AnthropicAssistantBlock>();
	const closed = new Set<number>();
	let invalid = false;
	let terminal = false;
	let started = false;
	function badBlock(): StreamEvent[] {
		invalid = true;
		terminal = true;
		return malformedStreamError("The Anthropic response contained an invalid content block.").map(
			(event) => (event.type === "error" ? { ...event, terminal: true } : event),
		);
	}

	function undecodableFrame(event: string, data: string): StreamEvent[] {
		terminal = true;
		return malformedStreamError(
			`The Anthropic stream sent a "${event}" event that could not be decoded.`,
			data,
		).map((e) => (e.type === "error" ? { ...e, terminal: true } : e));
	}

	return {
		mapFrame(frame: SseFrame): StreamEvent[] {
			if (terminal) return [];
			if (
				!started &&
				[
					"content_block_start",
					"content_block_delta",
					"content_block_stop",
					"message_delta",
					"message_stop",
				].includes(frame.event)
			)
				return badBlock();
			switch (frame.event) {
				case "message_start": {
					const payload = decodePayload(messageStartSchema, frame.data);
					if (payload === undefined) return undecodableFrame(frame.event, frame.data);
					if (started) return badBlock();
					started = true;
					reportedInputTokens = payload.message.usage?.input_tokens ?? 0;
					return [{ type: "message_start", model: payload.message.model }];
				}

				case "content_block_start": {
					const payload = decodePayload(contentBlockStartSchema, frame.data);
					if (payload === undefined) return undecodableFrame(frame.event, frame.data);
					const { index, content_block: block } = payload;
					if (index < 0 || blocks.has(index)) return badBlock();
					if (block.type === "thinking") {
						blocks.set(index, {
							type: "thinking",
							thinking: block.thinking ?? "",
							signature: block.signature ?? "",
						});
						return [];
					}
					if (block.type === "redacted_thinking" && block.data) {
						blocks.set(index, { type: "redacted_thinking", data: block.data });
						return [];
					}
					if (block.type === "text") blocks.set(index, { type: "text", text: block.text ?? "" });
					else if (block.type !== "tool_use") return badBlock();
					if (block.type === "tool_use") {
						if (
							!block.id ||
							!block.name ||
							[...blocks.values()].some((b) => b.type === "tool_use" && b.id === block.id)
						) {
							return undecodableFrame(frame.event, frame.data);
						}
						blocks.set(index, {
							type: "tool_use",
							id: block.id,
							name: block.name,
							input: block.input ?? {},
						});
						pendingToolCalls.set(index, { id: block.id, name: block.name, fragments: [] });
						return [{ type: "tool_call_start", id: block.id, name: block.name }];
					}
					if (block.type === "text" && block.text !== undefined && block.text !== "") {
						// The opening text is empty in every documented stream, but a
						// non-empty one is answer text and dropping it would lose it.
						return [{ type: "text_delta", text: block.text }];
					}
					return [];
				}

				case "content_block_delta": {
					const payload = decodePayload(contentBlockDeltaSchema, frame.data);
					if (payload === undefined) return undecodableFrame(frame.event, frame.data);
					const { index, delta } = payload;
					const block = blocks.get(index);
					if (!block || closed.has(index)) return badBlock();
					if (delta.type === "thinking_delta") {
						if (block.type !== "thinking" || delta.thinking === undefined) return badBlock();
						blocks.set(index, { ...block, thinking: block.thinking + delta.thinking });
						return [];
					}
					if (delta.type === "signature_delta") {
						if (block.type !== "thinking" || delta.signature === undefined) return badBlock();
						blocks.set(index, { ...block, signature: block.signature + delta.signature });
						return [];
					}
					if (delta.type === "text_delta") {
						if (block.type !== "text" || delta.text === undefined) return badBlock();
						blocks.set(index, { ...block, text: block.text + delta.text });
						if (delta.text === "") return [];
						return [{ type: "text_delta", text: delta.text }];
					}
					if (delta.type === "input_json_delta") {
						if (delta.partial_json === undefined || delta.partial_json === "") return [];
						const pending = pendingToolCalls.get(index);
						if (pending === undefined) {
							// A fragment with no open call means an argument was lost; saying
							// so beats silently completing a truncated tool call later.
							return badBlock();
						}
						pending.fragments.push(delta.partial_json);
						return [
							{ type: "tool_call_input_delta", id: pending.id, partialJson: delta.partial_json },
						];
					}
					// Future delta types carry no executable content.
					return [];
				}

				case "content_block_stop": {
					const payload = decodePayload(contentBlockStopSchema, frame.data);
					if (payload === undefined) return undecodableFrame(frame.event, frame.data);
					if (!blocks.has(payload.index) || closed.has(payload.index)) return badBlock();
					closed.add(payload.index);
					const pending = pendingToolCalls.get(payload.index);
					// Only tool blocks produce a completed call.
					if (pending === undefined) return [];
					pendingToolCalls.delete(payload.index);
					const initial = blocks.get(payload.index);
					if (pending.fragments.length === 0 && initial?.type === "tool_use")
						pending.fragments.push(JSON.stringify(initial.input));
					const events = finishPendingToolCall(pending);
					const completed = events.find((e) => e.type === "tool_call_complete");
					if (completed?.type !== "tool_call_complete") {
						invalid = true;
						terminal = true;
						return events.map((e) => (e.type === "error" ? { ...e, terminal: true } : e));
					}
					blocks.set(payload.index, {
						type: "tool_use",
						id: completed.id,
						name: completed.name,
						input: completed.input,
					});
					return events;
				}

				case "message_delta": {
					const payload = decodePayload(messageDeltaSchema, frame.data);
					if (payload === undefined) return undecodableFrame(frame.event, frame.data);
					const rawStopReason = payload.delta?.stop_reason;
					if (typeof rawStopReason === "string") {
						stopReason = mapStopReason(rawStopReason);
					}
					const usage = payload.usage;
					if (!usage) return [];
					return [
						{
							type: "usage",
							usage: {
								// `message_delta` usage carries output tokens only; input tokens
								// were reported on `message_start`.
								inputTokens: usage.input_tokens ?? reportedInputTokens,
								outputTokens: usage.output_tokens ?? 0,
							},
						},
					];
				}

				case "message_stop": {
					terminal = true;
					const content = [...blocks.entries()].sort(([a], [b]) => a - b).map(([, block]) => block);
					if (
						invalid ||
						blocks.size !== closed.size ||
						!assistantContentSchema.safeParse(content).success ||
						pendingToolCalls.size
					)
						return badBlock();
					return [
						{ type: "continuation", output: { provider: "anthropic", payload: content } },
						{ type: "message_stop", stopReason: stopReason ?? "unknown" },
					];
				}

				case "error": {
					terminal = true;
					const payload = decodePayload(errorEventSchema, frame.data);
					if (payload === undefined) return undecodableFrame(frame.event, frame.data);
					const providerType = payload.error?.type ?? "";
					const providerMessage = payload.error?.message ?? "";
					const detailParts = [providerType, providerMessage].filter((part) => part !== "");
					const error: ProtocolError =
						providerType === "rate_limit_error"
							? {
									code: "rate_limited",
									message: "Anthropic rate limit or quota exceeded — wait and try again.",
								}
							: {
									code: "http_status",
									message: "Anthropic reported an error while streaming the response.",
								};
					if (detailParts.length > 0) {
						error.providerDetail = redactProviderDetail(detailParts.join(": "));
					}
					return [{ type: "error", error }];
				}

				default:
					// `ping` and any event type added after this mapper was written.
					return [];
			}
		},
	};
}
