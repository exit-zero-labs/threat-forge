/**
 * AI model definitions and helpers for the model selector.
 */

import type { AiProvider } from "@/stores/chat-store";

export interface AiModelOption {
	/** Model ID sent to the provider API (e.g., "claude-sonnet-4-20250514") */
	id: string;
	/** Human-readable label for the dropdown */
	label: string;
	/** Which provider this model belongs to */
	provider: AiProvider;
	/** Short description */
	description: string;
}

export const AI_MODELS: AiModelOption[] = [
	{
		id: "claude-opus-4-20250514",
		label: "Claude Opus 4",
		provider: "anthropic",
		description: "Most capable, best for complex analysis",
	},
	{
		id: "claude-sonnet-4-20250514",
		label: "Claude Sonnet 4",
		provider: "anthropic",
		description: "Balanced speed and capability",
	},
	{
		id: "claude-haiku-3-5-20241022",
		label: "Claude 3.5 Haiku",
		provider: "anthropic",
		description: "Fastest, good for quick tasks",
	},
	{
		id: "gpt-4o",
		label: "GPT-4o",
		provider: "openai",
		description: "Most capable OpenAI model",
	},
	{
		id: "gpt-4o-mini",
		label: "GPT-4o Mini",
		provider: "openai",
		description: "Fast and affordable",
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
