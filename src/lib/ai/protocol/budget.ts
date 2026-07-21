/**
 * Context budgeting that drops history at turn-group granularity.
 *
 * Both providers reject a history where a `tool_result` has no matching
 * `tool_call` or a `tool_call` has no result (see `assertToolPairing` in
 * `./messages.ts`). A naive tail slice of a message list can cut through a tool
 * group and produce exactly that, so truncation here works on indivisible turn
 * groups rather than individual messages.
 *
 * ## Token estimate
 *
 * Tokens are estimated, not counted: characters divided by four plus a fixed
 * per-message overhead for role framing. This is deliberately dependency-free
 * and runs on both platforms. It is an estimate, so a request that fits locally
 * can still overflow at the provider; that surfaces as a typed `context_overflow`
 * error from the transport rather than being silently truncated here.
 */

import type { ProtocolError } from "./errors";
import type { ContentBlock, ProtocolMessage } from "./messages";

/** Estimated characters that make up one token. */
const CHARS_PER_TOKEN = 4;

/**
 * Tokens attributed to a message beyond its content: role markers and the
 * per-message framing every provider adds. A fixed conservative constant.
 */
const PER_MESSAGE_OVERHEAD_TOKENS = 4;

/** A run of messages that must be kept or dropped together. */
type TurnGroup = ProtocolMessage[];

export interface BudgetLimits {
	/** The model's documented input context window, in tokens. */
	maxInputTokens: number;
	/** Tokens to hold back for the model's answer, subtracted from the window. */
	reserveOutputTokens: number;
}

export type BudgetResult =
	| { ok: true; messages: ProtocolMessage[] }
	| { ok: false; error: ProtocolError };

/** Serialize tool-call input for estimation without throwing on odd values. */
function inputChars(input: unknown): number {
	try {
		const serialized = JSON.stringify(input);
		return serialized === undefined ? 0 : serialized.length;
	} catch {
		// Model output is JSON-derived and serializable; this only guards a caller
		// that hand-built a non-serializable value, which is undercounted rather
		// than allowed to throw mid-truncation.
		return 0;
	}
}

function blockChars(block: ContentBlock): number {
	switch (block.type) {
		case "text":
			return block.text.length;
		case "tool_call":
			return block.name.length + inputChars(block.input);
		case "tool_result":
			return block.content.length;
	}
}

/** Estimate the token cost of one message. */
function estimateMessageTokens(message: ProtocolMessage): number {
	let chars = 0;
	for (const block of message.content) {
		chars += blockChars(block);
	}
	return Math.ceil(chars / CHARS_PER_TOKEN) + PER_MESSAGE_OVERHEAD_TOKENS;
}

function estimateGroupTokens(group: TurnGroup): number {
	let total = 0;
	for (const message of group) {
		total += estimateMessageTokens(message);
	}
	return total;
}

/**
 * Partition messages into indivisible turn groups.
 *
 * A group is a maximal run of consecutive messages with no tool call left
 * unanswered at its end: a plain message is its own group, and an assistant
 * message that opens tool calls is grouped with the later message(s) whose
 * `tool_result` blocks answer them. A trailing group with an unanswered call
 * (a mid-turn history) is kept intact rather than split.
 */
function groupMessages(messages: readonly ProtocolMessage[]): TurnGroup[] {
	const groups: TurnGroup[] = [];
	let current: TurnGroup = [];
	const openCallIds = new Set<string>();

	for (const message of messages) {
		current.push(message);
		for (const block of message.content) {
			if (block.type === "tool_call") {
				openCallIds.add(block.id);
			} else if (block.type === "tool_result") {
				openCallIds.delete(block.toolCallId);
			}
		}
		if (openCallIds.size === 0) {
			groups.push(current);
			current = [];
		}
	}

	if (current.length > 0) {
		groups.push(current);
	}
	return groups;
}

/**
 * Keep the newest whole groups whose cumulative cost stays within `limit`.
 *
 * Returns the retained suffix of groups. When even the newest group alone
 * exceeds `limit`, the suffix is empty and the caller decides how to react —
 * budgeting fails, persistence keeps the group anyway.
 */
function keepNewestGroups(
	groups: readonly TurnGroup[],
	cost: (group: TurnGroup) => number,
	limit: number,
): TurnGroup[] {
	const kept: TurnGroup[] = [];
	let total = 0;
	for (let i = groups.length - 1; i >= 0; i--) {
		const groupCost = cost(groups[i]);
		if (total + groupCost > limit) break;
		total += groupCost;
		kept.unshift(groups[i]);
	}
	return kept;
}

/**
 * Drop history oldest-first, at group granularity, to fit the input window.
 *
 * Returns the retained messages, or a `context_overflow` error when the newest
 * group alone does not fit — never an unpaired history.
 */
export function budgetMessages(
	messages: readonly ProtocolMessage[],
	limits: BudgetLimits,
): BudgetResult {
	if (messages.length === 0) return { ok: true, messages: [] };

	const available = limits.maxInputTokens - limits.reserveOutputTokens;
	const groups = groupMessages(messages);
	const kept = keepNewestGroups(groups, estimateGroupTokens, available);

	if (kept.length === 0) {
		return {
			ok: false,
			error: {
				code: "context_overflow",
				message:
					"This conversation is too long for the selected model's context window. " +
					"Start a new chat or shorten the latest message.",
			},
		};
	}

	return { ok: true, messages: kept.flat() };
}

/**
 * Cap a stored session to at most `maxMessages`, at group granularity.
 *
 * This replaces the naive `slice(-n)` the chat store used to persist sessions,
 * which would split a tool group and save an unpairable history. Unlike
 * budgeting, persistence never drops everything: if the newest group alone
 * exceeds the cap it is kept whole, because saving a slightly oversized but
 * valid history beats saving a broken one.
 */
export function capMessageHistory(
	messages: readonly ProtocolMessage[],
	maxMessages: number,
): ProtocolMessage[] {
	if (messages.length <= maxMessages) return [...messages];

	const groups = groupMessages(messages);
	const kept = keepNewestGroups(groups, (group) => group.length, maxMessages);
	// Persistence never drops everything: if even the newest group exceeds the
	// cap, keep it whole rather than saving an empty or split history.
	const retained = kept.length > 0 ? kept : groups.slice(-1);
	return retained.flat();
}
