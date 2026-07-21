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
	/** Model ID sent to the provider API (e.g., "claude-sonnet-4-20250514") */
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
 * Every curated model streams and calls tools today; the differences are the
 * context window and, for the smaller models, no published guarantee of parallel
 * tool calls. Windows follow each provider's documented input limits.
 */
const ANTHROPIC_CONTEXT_WINDOW = 200_000;
const OPENAI_CONTEXT_WINDOW = 128_000;

export const AI_MODELS: AiModelOption[] = [
	{
		id: "claude-opus-4-20250514",
		label: "Claude Opus 4",
		provider: "anthropic",
		description: "Most capable, best for complex analysis",
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: ANTHROPIC_CONTEXT_WINDOW,
		},
	},
	{
		id: "claude-sonnet-4-20250514",
		label: "Claude Sonnet 4",
		provider: "anthropic",
		description: "Balanced speed and capability",
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: ANTHROPIC_CONTEXT_WINDOW,
		},
	},
	{
		id: "claude-haiku-3-5-20241022",
		label: "Claude 3.5 Haiku",
		provider: "anthropic",
		description: "Fastest, good for quick tasks",
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: ANTHROPIC_CONTEXT_WINDOW,
		},
	},
	{
		id: "gpt-4o",
		label: "GPT-4o",
		provider: "openai",
		description: "Most capable OpenAI model",
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: OPENAI_CONTEXT_WINDOW,
		},
	},
	{
		id: "gpt-4o-mini",
		label: "GPT-4o Mini",
		provider: "openai",
		description: "Fast and affordable",
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: OPENAI_CONTEXT_WINDOW,
		},
	},
];

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
export const DEFAULT_OPENAI_MODEL = "gpt-4o";

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
