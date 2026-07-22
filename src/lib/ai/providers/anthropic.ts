/**
 * Anthropic Messages API mapper: request building and stream-event decoding.
 *
 * This module and `./openai.ts` are the only places Anthropic's wire shapes may
 * appear; everything downstream speaks the protocol types in
 * `src/lib/ai/protocol/`. Two logically identical responses from the two
 * providers must map to identical `StreamEvent` sequences — the cross-provider
 * equality test in `./openai.test.ts` is the proof.
 *
 * Tool results serialize as `tool_result` blocks inside a `user` message,
 * which is Anthropic's shape; OpenAI's `role: "tool"` divergence lives wholly
 * in `./openai.ts`.
 */

import { z } from "zod";
import { type ProtocolError, redactProviderDetail } from "@/lib/ai/protocol/errors";
import type { StopReason, StreamEvent } from "@/lib/ai/protocol/events";
import type { ContentBlock } from "@/lib/ai/protocol/messages";
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

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock;

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
			content: message.content.map(toAnthropicBlock),
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

// ---------------------------------------------------------------------------
// Stream mapping
// ---------------------------------------------------------------------------

/**
 * Frame payload schemas. Deliberately lenient: only the fields this mapper
 * reads are declared, unknown keys are stripped, and unknown block or delta
 * types fall through to "ignore" — Anthropic documents that clients must
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
	}),
});

const contentBlockDeltaSchema = z.object({
	index: z.number().int(),
	delta: z.object({
		type: z.string(),
		text: z.string().optional(),
		partial_json: z.string().optional(),
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

	function undecodableFrame(event: string, data: string): StreamEvent[] {
		return malformedStreamError(
			`The Anthropic stream sent a "${event}" event that could not be decoded.`,
			data,
		);
	}

	return {
		mapFrame(frame: SseFrame): StreamEvent[] {
			switch (frame.event) {
				case "message_start": {
					const payload = decodePayload(messageStartSchema, frame.data);
					if (payload === undefined) return undecodableFrame(frame.event, frame.data);
					reportedInputTokens = payload.message.usage?.input_tokens ?? 0;
					return [{ type: "message_start", model: payload.message.model }];
				}

				case "content_block_start": {
					const payload = decodePayload(contentBlockStartSchema, frame.data);
					if (payload === undefined) return undecodableFrame(frame.event, frame.data);
					const { index, content_block: block } = payload;
					if (block.type === "tool_use") {
						if (block.id === undefined || block.name === undefined) {
							return undecodableFrame(frame.event, frame.data);
						}
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
					if (delta.type === "text_delta") {
						if (delta.text === undefined || delta.text === "") return [];
						return [{ type: "text_delta", text: delta.text }];
					}
					if (delta.type === "input_json_delta") {
						if (delta.partial_json === undefined || delta.partial_json === "") return [];
						const pending = pendingToolCalls.get(index);
						if (pending === undefined) {
							// A fragment with no open call means an argument was lost; saying
							// so beats silently completing a truncated tool call later.
							return malformedStreamError(
								"The Anthropic stream sent tool arguments for a tool call that never started.",
							);
						}
						pending.fragments.push(delta.partial_json);
						return [
							{ type: "tool_call_input_delta", id: pending.id, partialJson: delta.partial_json },
						];
					}
					// `thinking_delta`, `signature_delta`, and future delta types.
					return [];
				}

				case "content_block_stop": {
					const payload = decodePayload(contentBlockStopSchema, frame.data);
					if (payload === undefined) return undecodableFrame(frame.event, frame.data);
					const pending = pendingToolCalls.get(payload.index);
					// Text blocks are not tracked by index; only tool calls finish here.
					if (pending === undefined) return [];
					pendingToolCalls.delete(payload.index);
					return finishPendingToolCall(pending);
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

				case "message_stop":
					// Carries no payload this protocol reads. `message_delta` precedes it
					// in the documented protocol; "unknown" covers a stream that never
					// reported a stop reason.
					return [{ type: "message_stop", stopReason: stopReason ?? "unknown" }];

				case "error": {
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
