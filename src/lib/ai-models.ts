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
	/** Recognized saved selection, excluded from the current picker. */
	legacy?: boolean;
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
 * Current public models, checked 2026-10-03 against the provider catalogs:
 * https://developers.openai.com/api/docs/guides/latest-model
 * https://platform.claude.com/docs/en/models/overview
 * Legacy entries retain the previously verified capabilities of saved choices;
 * they do not promise current account access or continued provider availability.
 */
export const AI_MODELS: AiModelOption[] = [
	{
		id: "claude-fable-5-1",
		label: "Claude Fable 5.1",
		provider: "anthropic",
		description: "For demanding reasoning and long tool workflows",
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: 1_000_000,
		},
	},
	{
		id: "claude-opus-5-5",
		label: "Claude Opus 5.5",
		provider: "anthropic",
		description: "For complex coding and knowledge work",
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: 1_000_000,
		},
	},
	{
		id: "claude-sonnet-5-5",
		label: "Claude Sonnet 5.5",
		provider: "anthropic",
		description: "Balanced speed and capability",
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: 1_000_000,
		},
	},
	{
		id: "claude-haiku-4-5-20251001",
		label: "Claude Haiku 4.5",
		provider: "anthropic",
		description: "Fast responses for focused tasks",
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: 200_000,
		},
	},
	{
		id: "gpt-6-astra",
		label: "GPT-6 Astra",
		provider: "openai",
		description: "For demanding reasoning and professional work",
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: 1_050_000,
		},
	},
	{
		id: "gpt-6.1-sol",
		label: "GPT-6.1 Sol",
		provider: "openai",
		description: "Balances speed, cost and capability",
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: 1_050_000,
		},
	},
	{
		id: "gpt-6-luna",
		label: "GPT-6 Luna",
		provider: "openai",
		description: "For focused, high-volume tasks",
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: 1_050_000,
		},
	},
	{
		id: "claude-opus-4-8",
		label: "Claude Opus 4.8",
		provider: "anthropic",
		description: "Previously selected model",
		legacy: true,
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: 1_000_000,
		},
	},
	{
		id: "claude-sonnet-5",
		label: "Claude Sonnet 5",
		provider: "anthropic",
		description: "Previously selected model",
		legacy: true,
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: 1_000_000,
		},
	},
	{
		id: "gpt-5.6-sol",
		label: "GPT-5.6 Sol",
		provider: "openai",
		description: "Previously selected model",
		legacy: true,
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: 1_050_000,
		},
	},
	{
		id: "gpt-5.6-terra",
		label: "GPT-5.6 Terra",
		provider: "openai",
		description: "Previously selected model",
		legacy: true,
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: 1_050_000,
		},
	},
	{
		id: "gpt-5.6-luna",
		label: "GPT-5.6 Luna",
		provider: "openai",
		description: "Previously selected model",
		legacy: true,
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: 1_050_000,
		},
	},
	{
		id: "gpt-6-sol",
		label: "GPT-6 Sol",
		provider: "openai",
		description: "Previously selected model",
		legacy: true,
		capabilities: {
			toolCalling: true,
			parallelToolCalls: true,
			streaming: true,
			maxInputTokens: 1_050_000,
		},
	},
];

/**
 * Defaults for new and reset settings (current balanced/workhorse roles). Defined
 * once here and reused by `DEFAULT_USER_SETTINGS` so the two never drift.
 */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";
export const DEFAULT_OPENAI_MODEL = "gpt-6.1-sol";

/** Get models available for a specific provider. */
export function getModelsForProvider(provider: AiProvider): AiModelOption[] {
	return AI_MODELS.filter((m) => m.provider === provider && !m.legacy);
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
