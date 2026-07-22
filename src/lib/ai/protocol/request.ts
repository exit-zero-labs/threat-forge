/**
 * Request preflight: refuse an impossible request before any network call.
 *
 * The client (issue #61 step 10) runs this before it touches a transport, so a
 * request the selected model cannot satisfy fails as a typed
 * `unsupported_capability` error rather than as a provider rejection paid for
 * with a round trip. Preflight is deliberately synchronous and network-free.
 */

import { type CapabilityResolution, resolveCapabilities } from "@/lib/ai-models";
import { ProtocolException } from "./errors";
import type { AiProvider, ProtocolMessage } from "./messages";
import type { AdvertisedTool, ToolDescriptor } from "./tools";

/**
 * Everything a provider mapper needs to build one streaming chat request.
 *
 * Provider-neutral by construction: the Anthropic and OpenAI request builders
 * (`src/lib/ai/providers/`) each translate this one shape into their wire
 * format, so nothing else in the stack assembles a provider-specific body. The
 * system prompt is a separate field because the providers place it differently
 * (a top-level `system` field versus a `system` message).
 */
export interface ProviderChatRequest {
	modelId: string;
	/** The composed system prompt for this turn. */
	system: string;
	messages: readonly ProtocolMessage[];
	/** Tools advertised this turn. Empty means no tool fields are sent at all. */
	tools: readonly AdvertisedTool[];
	/** Cap on the model's answer, the same tokens the budgeter reserves. */
	maxOutputTokens: number;
}

/** The parts of a chat request preflight needs to judge it. */
export interface PreflightRequest {
	provider: AiProvider;
	/** The model id from settings, which may be stale or unknown. */
	modelId: string;
	/**
	 * Tools the model is being asked to use this turn. Empty means the fenced or
	 * plain-text path, which every model can do; non-empty means native tool
	 * calling is required.
	 */
	tools: readonly ToolDescriptor[];
}

export interface PreflightOutcome {
	/**
	 * True when the model id is not in the curated table. A text-only request is
	 * still allowed, and the client surfaces this as a `capabilityUnknown` note on
	 * `message_start` so the user learns their model id is stale without the turn
	 * being blocked.
	 */
	capabilityUnknown: boolean;
}

/**
 * Resolves a model's capabilities from the curated table.
 *
 * Injectable so a test can drive the "known but tool-incapable" branch, which
 * the curated table cannot reach today because every listed model calls tools.
 * The default is the production resolver, so callers never pass it.
 */
export type CapabilityResolver = (provider: AiProvider, modelId: string) => CapabilityResolution;

/**
 * Validate a request against its model's capabilities.
 *
 * Throws `unsupported_capability` when tools are requested and either the model
 * is unknown or the known model cannot call tools. A text-only request against
 * an unknown model is allowed — that is today's behavior — and reported through
 * `capabilityUnknown`.
 */
export function preflightRequest(
	request: PreflightRequest,
	resolve: CapabilityResolver = resolveCapabilities,
): PreflightOutcome {
	const wantsTools = request.tools.length > 0;
	const resolution = resolve(request.provider, request.modelId);

	if (!resolution.known) {
		if (wantsTools) {
			throw new ProtocolException({
				code: "unsupported_capability",
				message:
					`Model "${request.modelId}" is not recognized, so tool use cannot be guaranteed. ` +
					"Pick a supported model in AI Settings to use tools.",
			});
		}
		return { capabilityUnknown: true };
	}

	if (wantsTools && !resolution.capabilities.toolCalling) {
		throw new ProtocolException({
			code: "unsupported_capability",
			message:
				`Model "${request.modelId}" does not support tool calling. ` +
				"Pick a model that does, or continue without tools.",
		});
	}

	return { capabilityUnknown: false };
}
