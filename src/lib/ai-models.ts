/**
 * AI model definitions and helpers for the model selector.
 */

import type { AiProvider } from "@/stores/chat-store";

/**
 * What a curated model can do, read by request preflight and context budgeting.
 *
 * Capabilities live on the curated model list rather than in a parallel table so
 * a capability and the model it describes cannot drift apart. `maxInputTokens`
 * is the documented context window; the budgeter (issue #61 step 4) pairs it with
 * a conservative estimator, so it is an upper bound rather than an exact figure.
 */
export interface ModelCapabilities {
	/** The model accepts tool/function definitions and will call them. */
	toolCalling: boolean;
	/** The model can emit more than one tool call in a single turn. */
	parallelToolCalls: boolean;
	/** The model streams its response over SSE. */
	streaming: boolean;
	/** Documented input context window in tokens. */
	maxInputTokens: number;
}

export interface AiModelOption {
	/** Model ID sent to the provider API (e.g., "claude-sonnet-5") */
	id: string;
	/** Human-readable label for the dropdown */
	label: string;
	/** Which provider this model belongs to */
	provider: AiProvider;
	/** Short description */
	description: string;
	/** What this model can do, checked before a request leaves the client. */
	capabilities: ModelCapabilities;
}

/**
 * Every curated model streams, calls tools, and supports parallel tool calls
 * today, so only the context window differs between them.
 *
 * Anthropic's Messages API documents the context window as the whole
 * conversation budget — input plus the model's own response — matching how
 * `maxInputTokens` is spent in `budgetMessages` (input is budgeted against it,
 * then `reserveOutputTokens` is held back from the same figure). Opus 4.8 and
 * Sonnet 5 publish a 1M-token window; Haiku 4.5 publishes 200k. Tool use
 * (including `tool_choice` and parallel tool calls) and streaming are
 * undifferentiated Messages API features with no per-model carve-out for any
 * of the three.
 *
 * Evidence, retrieved 2026-07-24 while implementing issue #195:
 * - Models overview (IDs, context windows, descriptions):
 *   https://platform.claude.com/docs/en/about-claude/models/overview
 * - Context-window behavior (1M is the default and needs no beta header):
 *   https://platform.claude.com/docs/en/build-with-claude/context-windows
 * - Tool use / parallel tool calls (`tool_choice` modes and
 *   `disable_parallel_tool_use` apply the same way across Opus 4.8, Sonnet 5,
 *   and Haiku 4.5, with no exclusion for any of them):
 *   https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
 *   https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use
 */
const ANTHROPIC_OPUS_SONNET_CONTEXT_WINDOW = 1_000_000;
const ANTHROPIC_HAIKU_CONTEXT_WINDOW = 200_000;

/**
 * GPT-5.6 Sol, Terra, and Luna each publish the same 1,050,000-token context
 * window and 128,000-token max output, and each model page lists "Streaming:
 * Supported" and "Function calling: Supported" with no per-model exception.
 * OpenAI's function-calling guide documents parallel tool calls as the default
 * for any function-calling model (`parallel_tool_calls` defaults to true and
 * disables the behavior when set to false); the one documented exception is an
 * older `gpt-4.1-nano` snapshot, not any GPT-5.6 model.
 *
 * Evidence, retrieved 2026-07-24 while implementing issue #195:
 * https://developers.openai.com/api/docs/models/gpt-5.6-sol
 * https://developers.openai.com/api/docs/models/gpt-5.6-terra
 * https://developers.openai.com/api/docs/models/gpt-5.6-luna
 * https://developers.openai.com/api/docs/guides/function-calling
 */
const OPENAI_CONTEXT_WINDOW = 1_050_000;

export const AI_MODELS: AiModelOption[] = [
	{
		id: "claude-opus-4-8",
		label: "Claude Opus 4.8",
		provider: "anthropic",
		description: "Most capable, best for complex agentic work",
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: ANTHROPIC_OPUS_SONNET_CONTEXT_WINDOW,
		},
	},
	{
		id: "claude-sonnet-5",
		label: "Claude Sonnet 5",
		provider: "anthropic",
		description: "Balanced speed and capability",
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: ANTHROPIC_OPUS_SONNET_CONTEXT_WINDOW,
		},
	},
	{
		id: "claude-haiku-4-5-20251001",
		label: "Claude Haiku 4.5",
		provider: "anthropic",
		description: "Fastest, near-frontier intelligence for quick tasks",
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: ANTHROPIC_HAIKU_CONTEXT_WINDOW,
		},
	},
	{
		id: "gpt-5.6-sol",
		label: "GPT-5.6 Sol",
		provider: "openai",
		description: "Frontier model for complex professional work",
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: OPENAI_CONTEXT_WINDOW,
		},
	},
	{
		id: "gpt-5.6-terra",
		label: "GPT-5.6 Terra",
		provider: "openai",
		description: "Balances intelligence and cost",
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: OPENAI_CONTEXT_WINDOW,
		},
	},
	{
		id: "gpt-5.6-luna",
		label: "GPT-5.6 Luna",
		provider: "openai",
		description: "Optimized for cost-sensitive, high-volume workloads",
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: OPENAI_CONTEXT_WINDOW,
		},
	},
];

/**
 * Defaults for new and reset settings (owner-selected, issue #195). Defined
 * once here and reused by `DEFAULT_USER_SETTINGS` so the two never drift.
 */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
export const DEFAULT_OPENAI_MODEL = "gpt-5.6-sol";

/** Get models available for a specific provider. */
export function getModelsForProvider(provider: AiProvider): AiModelOption[] {
	return AI_MODELS.filter((m) => m.provider === provider);
}

/** Get the default model ID for a provider. */
export function getDefaultModelId(provider: AiProvider): string {
	return provider === "anthropic" ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL;
}

/** Look up a model by ID, or return undefined. */
export function getModelById(id: string): AiModelOption | undefined {
	return AI_MODELS.find((m) => m.id === id);
}

/**
 * The outcome of looking a model's capabilities up in the curated table.
 *
 * `known: false` is a first-class result rather than an error: a stale settings
 * value can name a model that is no longer curated, and the caller decides what
 * that means (issue #61 step 3 allows plain chat but refuses tools).
 */
export type CapabilityResolution =
	| { known: true; capabilities: ModelCapabilities }
	| { known: false };

/**
 * Resolve a model's capabilities, matching on both provider and id.
 *
 * The provider is part of the match so a model id selected under the wrong
 * provider resolves as unknown rather than borrowing another provider's
 * capabilities.
 */
export function resolveCapabilities(provider: AiProvider, modelId: string): CapabilityResolution {
	const model = AI_MODELS.find((m) => m.provider === provider && m.id === modelId);
	if (!model) return { known: false };
	return { known: true, capabilities: model.capabilities };
}
