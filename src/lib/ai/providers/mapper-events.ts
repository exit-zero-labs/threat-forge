/**
 * Provider-neutral `StreamEvent` construction shared by the two mappers.
 *
 * Tool-call arguments stream as JSON fragments on both providers — Anthropic's
 * `input_json_delta` and OpenAI's `tool_calls[].function.arguments` — and the
 * protocol contract for finishing them is identical: parse the concatenation
 * exactly once, and emit `malformed_stream` for a fragment set that never
 * parses without aborting the turn. Keeping that logic here guarantees the two
 * mappers cannot drift into provider-specific failure shapes, which the
 * cross-provider equality test in `./openai.test.ts` depends on.
 */

import { type ProtocolError, redactProviderDetail } from "@/lib/ai/protocol/errors";
import type { StreamEvent } from "@/lib/ai/protocol/events";

/** A tool call whose JSON arguments are still streaming in. */
export interface PendingToolCall {
	id: string;
	name: string;
	fragments: string[];
}

/**
 * Build the non-terminal `malformed_stream` error for one undecodable piece of
 * a stream. `providerDetail`, when given, is provider-controlled text and is
 * redacted here so no caller can forget to.
 */
export function malformedStreamError(message: string, providerDetail?: string): StreamEvent[] {
	const error: ProtocolError = { code: "malformed_stream", message };
	if (providerDetail !== undefined && providerDetail !== "") {
		error.providerDetail = redactProviderDetail(providerDetail);
	}
	return [{ type: "error", error }];
}

/**
 * Parse a finished tool call's accumulated fragments.
 *
 * Fragments are JSON-parsed exactly once, here. A fragment set that never
 * parses emits `malformed_stream` for that call and the turn continues; a call
 * that streamed no fragments has the empty input `{}`, which is how both
 * providers represent a no-argument call.
 *
 * The failed call's name identifies which call was dropped, but it is
 * stream-supplied text — a steered model can put arbitrary copy in a tool
 * name — so it travels as redacted `providerDetail`, never inside the authored
 * `message`.
 */
export function finishPendingToolCall(call: PendingToolCall): StreamEvent[] {
	const raw = call.fragments.join("");
	let input: unknown;
	try {
		input = JSON.parse(raw === "" ? "{}" : raw);
	} catch {
		return malformedStreamError(
			"A tool call sent arguments that were not valid JSON, so the call was dropped.",
			call.name,
		);
	}
	return [{ type: "tool_call_complete", id: call.id, name: call.name, input }];
}
