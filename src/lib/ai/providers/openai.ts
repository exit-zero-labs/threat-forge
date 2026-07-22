/**
 * OpenAI Chat Completions mapper: request building and stream-chunk decoding.
 *
 * This module and `./anthropic.ts` are the only places OpenAI's wire shapes may
 * appear; everything downstream speaks the protocol types in
 * `src/lib/ai/protocol/`. Two logically identical responses from the two
 * providers must map to identical `StreamEvent` sequences — the cross-provider
 * equality test in `./openai.test.ts` is the proof.
 *
 * Tool results serialize as `role: "tool"` messages keyed by `tool_call_id`,
 * which is OpenAI's shape; Anthropic's `tool_result`-block divergence lives
 * wholly in `./anthropic.ts`.
 *
 * Tool definitions are emitted without `strict`. Strict mode additionally
 * constrains optional fields (every property must be listed in `required`), so
 * enabling it is a schema-shape decision deferred to issue #64 alongside the
 * native graph tools.
 */

import { z } from "zod";
import type { ProtocolError } from "@/lib/ai/protocol/errors";
import { redactProviderDetail } from "@/lib/ai/protocol/errors";
import type { StopReason, StreamEvent } from "@/lib/ai/protocol/events";
import type { ProtocolMessage } from "@/lib/ai/protocol/messages";
import type { ProviderChatRequest } from "@/lib/ai/protocol/request";
import type { ToolInputJsonSchema } from "@/lib/ai/protocol/tools";
import { finishPendingToolCall, malformedStreamError, type PendingToolCall } from "./mapper-events";
import type { SseFrame } from "./sse";

// ---------------------------------------------------------------------------
// Request building
// ---------------------------------------------------------------------------

interface OpenAiSystemMessage {
	role: "system";
	content: string;
}

interface OpenAiUserMessage {
	role: "user";
	content: string;
}

interface OpenAiToolMessage {
	role: "tool";
	tool_call_id: string;
	content: string;
}

interface OpenAiAssistantToolCall {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
}

interface OpenAiAssistantMessage {
	role: "assistant";
	content: string | null;
	tool_calls?: OpenAiAssistantToolCall[];
}

type OpenAiRequestMessage =
	| OpenAiSystemMessage
	| OpenAiUserMessage
	| OpenAiToolMessage
	| OpenAiAssistantMessage;

interface OpenAiToolPayload {
	type: "function";
	function: { name: string; description: string; parameters: ToolInputJsonSchema };
}

/** The body posted to `POST /v1/chat/completions`. */
export interface OpenAiRequestBody {
	model: string;
	max_completion_tokens: number;
	messages: OpenAiRequestMessage[];
	stream: true;
	stream_options: { include_usage: true };
	tools?: OpenAiToolPayload[];
}

/**
 * A protocol user message becomes up to several OpenAI messages: one
 * `role: "tool"` message per `tool_result` block, then the user's text.
 *
 * Tool messages come first because OpenAI requires them to directly follow the
 * assistant message that made the calls. OpenAI has no `is_error` flag on tool
 * messages, so a failed result relies on its `content` describing the failure —
 * which `ToolResultBlock.content` is documented to do.
 */
function serializeUserMessage(message: ProtocolMessage): OpenAiRequestMessage[] {
	const serialized: OpenAiRequestMessage[] = [];
	let text = "";
	for (const block of message.content) {
		if (block.type === "text") {
			text += block.text;
		} else if (block.type === "tool_result") {
			serialized.push({ role: "tool", tool_call_id: block.toolCallId, content: block.content });
		}
		// A `tool_call` block in a user message violates the protocol contract
		// (calls are assistant-authored); serializing it would fabricate a turn
		// the model never took, so it is dropped.
	}
	if (text !== "" || serialized.length === 0) {
		serialized.push({ role: "user", content: text });
	}
	return serialized;
}

function serializeAssistantMessage(message: ProtocolMessage): OpenAiAssistantMessage {
	let text = "";
	const toolCalls: OpenAiAssistantToolCall[] = [];
	for (const block of message.content) {
		if (block.type === "text") {
			text += block.text;
		} else if (block.type === "tool_call") {
			toolCalls.push({
				id: block.id,
				type: "function",
				// `input` came from JSON, so this only yields `undefined` for a
				// hand-built non-JSON value; `{}` keeps the history serializable.
				function: { name: block.name, arguments: JSON.stringify(block.input) ?? "{}" },
			});
		}
		// A `tool_result` block in an assistant message violates the protocol
		// contract (results answer the assistant) and is dropped.
	}
	const serialized: OpenAiAssistantMessage = {
		role: "assistant",
		// OpenAI rejects a null-content assistant message unless it carries tool
		// calls, and a text-less tool-call turn is exactly the null-content case.
		content: text === "" && toolCalls.length > 0 ? null : text,
	};
	if (toolCalls.length > 0) {
		serialized.tool_calls = toolCalls;
	}
	return serialized;
}

/**
 * Build the streaming request body for the OpenAI Chat Completions API.
 *
 * Tool-call/result pairing and block placement are the caller's contract,
 * enforced upstream by `assertToolPairing` and the budgeter; a history that
 * violates them serializes to whatever the provider makes of it (here,
 * misplaced blocks are dropped — see the serializers). Only
 * contract-conforming histories are guaranteed to serialize equivalently
 * across the two builders.
 */
export function buildOpenAiRequestBody(request: ProviderChatRequest): OpenAiRequestBody {
	const messages: OpenAiRequestMessage[] = [{ role: "system", content: request.system }];
	for (const message of request.messages) {
		if (message.role === "assistant") {
			messages.push(serializeAssistantMessage(message));
		} else {
			messages.push(...serializeUserMessage(message));
		}
	}

	const body: OpenAiRequestBody = {
		model: request.modelId,
		max_completion_tokens: request.maxOutputTokens,
		messages,
		stream: true,
		// Without this opt-in the stream never reports usage: the final usage
		// chunk (empty `choices`) is only sent when the request asks for it.
		stream_options: { include_usage: true },
	};
	if (request.tools.length > 0) {
		// `strict` is deliberately unset; see the module doc.
		body.tools = request.tools.map((tool) => ({
			type: "function",
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.jsonSchema(),
			},
		}));
	}
	return body;
}

// ---------------------------------------------------------------------------
// Stream mapping
// ---------------------------------------------------------------------------

/** OpenAI's terminal sentinel; it is not JSON and marks the end of the stream. */
const DONE_SENTINEL = "[DONE]";

/**
 * Chunk schema, deliberately lenient: only the fields this mapper reads are
 * declared and unknown keys are stripped, so fields OpenAI adds later cannot
 * break decoding. An in-stream failure arrives as an `error` object instead of
 * a chunk, which the same schema admits because every field is optional.
 */
const chunkSchema = z.object({
	model: z.string().nullish(),
	choices: z
		.array(
			z.object({
				delta: z
					.object({
						content: z.string().nullish(),
						tool_calls: z
							.array(
								z.object({
									index: z.number().int(),
									id: z.string().nullish(),
									function: z
										.object({
											name: z.string().nullish(),
											arguments: z.string().nullish(),
										})
										.nullish(),
								}),
							)
							.nullish(),
					})
					.nullish(),
				finish_reason: z.string().nullish(),
			}),
		)
		.nullish(),
	usage: z
		.object({
			prompt_tokens: z.number().nullish(),
			completion_tokens: z.number().nullish(),
		})
		.nullish(),
	error: z
		.object({
			message: z.string().nullish(),
			type: z.string().nullish(),
			code: z.string().nullish(),
		})
		.nullish(),
});

type OpenAiStreamError = NonNullable<z.infer<typeof chunkSchema>["error"]>;

const FINISH_REASONS = new Map<string, StopReason>([
	["stop", "end_turn"],
	["tool_calls", "tool_use"],
	["length", "max_tokens"],
]);

function mapFinishReason(raw: string): StopReason {
	return FINISH_REASONS.get(raw) ?? "unknown";
}

function providerStreamError(error: OpenAiStreamError): StreamEvent[] {
	const providerType = error.type ?? "";
	const providerCode = error.code ?? "";
	const providerMessage = error.message ?? "";
	const rateLimited =
		`${providerType} ${providerCode}`.includes("rate_limit") ||
		`${providerType} ${providerCode}`.includes("insufficient_quota");
	const mapped: ProtocolError = rateLimited
		? {
				code: "rate_limited",
				message: "OpenAI rate limit or quota exceeded — wait and try again.",
			}
		: {
				code: "http_status",
				message: "OpenAI reported an error while streaming the response.",
			};
	const detailParts = [providerType, providerCode, providerMessage].filter((part) => part !== "");
	if (detailParts.length > 0) {
		mapped.providerDetail = redactProviderDetail(detailParts.join(": "));
	}
	return [{ type: "error", error: mapped }];
}

export interface OpenAiStreamMapper {
	/** Map one decoded frame onto zero or more protocol events. */
	mapFrame(frame: SseFrame): StreamEvent[];
}

/** Create a mapper holding the per-turn state of one OpenAI stream. */
export function createOpenAiStreamMapper(): OpenAiStreamMapper {
	/**
	 * Calls in flight, keyed by `tool_calls[].index` — the id and name arrive on
	 * the first fragment only, so later fragments resolve through this map.
	 * Insertion order is arrival order, which completion preserves.
	 */
	const pendingToolCalls = new Map<number, PendingToolCall>();
	let started = false;
	let stopReason: StopReason | undefined;

	return {
		// OpenAI streams never name their events — every frame arrives as the SSE
		// default "message" — so the frame's event field is not consulted.
		mapFrame(frame: SseFrame): StreamEvent[] {
			if (frame.data === DONE_SENTINEL) {
				return [{ type: "message_stop", stopReason: stopReason ?? "unknown" }];
			}

			let payload: unknown;
			try {
				payload = JSON.parse(frame.data);
			} catch {
				return malformedStreamError(
					"The OpenAI stream sent a chunk that could not be decoded.",
					frame.data,
				);
			}
			const parsed = chunkSchema.safeParse(payload);
			if (!parsed.success) {
				return malformedStreamError(
					"The OpenAI stream sent a chunk that could not be decoded.",
					frame.data,
				);
			}
			const chunk = parsed.data;

			if (chunk.error) {
				return providerStreamError(chunk.error);
			}

			const events: StreamEvent[] = [];

			if (!started && typeof chunk.model === "string" && chunk.model !== "") {
				started = true;
				events.push({ type: "message_start", model: chunk.model });
			}

			const choice = chunk.choices?.[0];
			const delta = choice?.delta;

			if (typeof delta?.content === "string" && delta.content !== "") {
				events.push({ type: "text_delta", text: delta.content });
			}

			for (const fragment of delta?.tool_calls ?? []) {
				const existing = pendingToolCalls.get(fragment.index);
				const args = fragment.function?.arguments;
				if (existing === undefined) {
					const id = fragment.id;
					const name = fragment.function?.name;
					if (typeof id !== "string" || id === "" || typeof name !== "string" || name === "") {
						// A first fragment must carry the id and name; without them the
						// call can never be attributed, so say so instead of guessing.
						events.push(
							...malformedStreamError(
								"The OpenAI stream sent a tool-call fragment before naming the call.",
							),
						);
						continue;
					}
					const call: PendingToolCall = { id, name, fragments: [] };
					pendingToolCalls.set(fragment.index, call);
					events.push({ type: "tool_call_start", id, name });
					if (typeof args === "string" && args !== "") {
						call.fragments.push(args);
						events.push({ type: "tool_call_input_delta", id, partialJson: args });
					}
					continue;
				}
				if (typeof args === "string" && args !== "") {
					existing.fragments.push(args);
					events.push({ type: "tool_call_input_delta", id: existing.id, partialJson: args });
				}
			}

			const finishReason = choice?.finish_reason;
			if (typeof finishReason === "string") {
				stopReason = mapFinishReason(finishReason);
				// The choice is finished, so every accumulated argument string is
				// complete; parse each call exactly once, in arrival order.
				for (const call of pendingToolCalls.values()) {
					events.push(...finishPendingToolCall(call));
				}
				pendingToolCalls.clear();
			}

			if (chunk.usage) {
				events.push({
					type: "usage",
					usage: {
						inputTokens: chunk.usage.prompt_tokens ?? 0,
						outputTokens: chunk.usage.completion_tokens ?? 0,
					},
				});
			}

			return events;
		},
	};
}
