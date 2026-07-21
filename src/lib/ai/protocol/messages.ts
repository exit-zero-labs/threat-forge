/**
 * Provider-neutral conversation message model.
 *
 * A turn is a list of content blocks rather than a string so that text, tool
 * calls, and tool results can occupy the same message without being encoded
 * into prose. The system prompt is deliberately *not* a message role here:
 * Anthropic carries it as a top-level `system` request field and OpenAI as a
 * `system`/`developer` message, so keeping it out of `ProtocolMessage` stops
 * that divergence from leaking into every consumer.
 */

/** Providers ThreatForge can talk to directly with a user-supplied key. */
export type AiProvider = "anthropic" | "openai";

/** Roles a stored conversation turn can carry. */
export type ProtocolRole = "user" | "assistant";

export interface TextBlock {
	type: "text";
	text: string;
}

export interface ToolCallBlock {
	type: "tool_call";
	/** Provider-assigned call id; the only key that ties a result back to a call. */
	id: string;
	name: string;
	/**
	 * Model-supplied arguments, deliberately `unknown`.
	 *
	 * Typing this as a tool's input type would let a caller read model output as
	 * if it had been validated. Callers must go through
	 * `ToolDefinition.parseInput` in `./tools.ts`, which is the only place raw
	 * model JSON becomes a typed value.
	 */
	input: unknown;
}

export interface ToolResultBlock {
	type: "tool_result";
	/** Matches `ToolCallBlock.id` of the call this answers. */
	toolCallId: string;
	/** Serialized result text. Both providers accept a string here. */
	content: string;
	/** True when the tool failed and `content` describes the failure to the model. */
	isError?: boolean;
}

export type ContentBlock = TextBlock | ToolCallBlock | ToolResultBlock;

export interface ProtocolMessage {
	role: ProtocolRole;
	content: ContentBlock[];
}

/**
 * The message shape persisted by chat sessions before this protocol existed.
 *
 * Sessions live in `localStorage` (see `src/stores/chat-store.ts`), so payloads
 * written by earlier builds are still on disk and must stay readable.
 */
export interface LegacyChatMessage {
	role: ProtocolRole;
	content: string;
}

/** Read a persisted pre-protocol message as a content-block message. */
export function upgradeLegacyMessage(message: LegacyChatMessage): ProtocolMessage {
	return { role: message.role, content: [{ type: "text", text: message.content }] };
}

/**
 * Concatenate a message's text for surfaces that still render a plain string.
 *
 * Blocks are joined without a separator because that is what the string-only
 * chat path did when it appended each streamed chunk, so an upgraded legacy
 * message renders byte-for-byte as before.
 */
export function flattenText(message: ProtocolMessage): string {
	let text = "";
	for (const block of message.content) {
		if (block.type === "text") text += block.text;
	}
	return text;
}

/** A way a message list breaks the tool-call/tool-result pairing contract. */
export type ToolPairingViolation =
	| {
			kind: "orphan_tool_result";
			toolCallId: string;
			/** Index of the message carrying the unmatched result. */
			messageIndex: number;
	  }
	| {
			kind: "unanswered_tool_call";
			toolCallId: string;
			/** Index of the message carrying the unanswered call. */
			messageIndex: number;
	  }
	| {
			kind: "duplicate_tool_call_id";
			toolCallId: string;
			/** Index of the message that reused an id already in flight. */
			messageIndex: number;
	  };

/**
 * Report every pairing violation in a *complete* conversation history.
 *
 * Both Anthropic and OpenAI reject a history where a result has no call or a
 * call has no result, so this is the invariant history truncation has to
 * preserve. It returns violations instead of throwing, and is not a guard on
 * the streaming path: mid-turn, an assistant message legitimately holds a call
 * that has not been answered yet. Truncation (issue #61 step 4) and tests are
 * the intended callers.
 *
 * A result must appear in a strictly later message than its call, because a
 * provider only accepts results in the turn that follows the tool use.
 */
export function assertToolPairing(messages: readonly ProtocolMessage[]): ToolPairingViolation[] {
	const violations: ToolPairingViolation[] = [];
	const callMessageIndexById = new Map<string, number>();
	const answeredCallIds = new Set<string>();

	messages.forEach((message, messageIndex) => {
		for (const block of message.content) {
			if (block.type === "tool_call") {
				if (callMessageIndexById.has(block.id)) {
					violations.push({
						kind: "duplicate_tool_call_id",
						toolCallId: block.id,
						messageIndex,
					});
					continue;
				}
				callMessageIndexById.set(block.id, messageIndex);
				continue;
			}
			if (block.type === "tool_result") {
				const callMessageIndex = callMessageIndexById.get(block.toolCallId);
				if (callMessageIndex === undefined || callMessageIndex >= messageIndex) {
					violations.push({
						kind: "orphan_tool_result",
						toolCallId: block.toolCallId,
						messageIndex,
					});
					continue;
				}
				answeredCallIds.add(block.toolCallId);
			}
		}
	});

	for (const [toolCallId, messageIndex] of callMessageIndexById) {
		if (!answeredCallIds.has(toolCallId)) {
			violations.push({ kind: "unanswered_tool_call", toolCallId, messageIndex });
		}
	}

	return violations;
}
