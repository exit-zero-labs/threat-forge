/** Current picker choices and explicit saved-selection compatibility. */
import { describe, expect, it } from "vitest";
import {
	AI_MODELS,
	DEFAULT_ANTHROPIC_MODEL,
	DEFAULT_OPENAI_MODEL,
	getDefaultModelId,
	getModelById,
	getModelsForProvider,
	resolveCapabilities,
} from "./ai-models";

describe("provider model catalog", () => {
	it("offers only current public family choices", () => {
		expect(getModelsForProvider("anthropic").map((m) => [m.id, m.label])).toEqual([
			["claude-fable-5-1", "Claude Fable 5.1"],
			["claude-opus-5-5", "Claude Opus 5.5"],
			["claude-sonnet-5-5", "Claude Sonnet 5.5"],
			["claude-haiku-4-5-20251001", "Claude Haiku 4.5"],
		]);
		expect(getModelsForProvider("openai").map((m) => [m.id, m.label])).toEqual([
			["gpt-6-astra", "GPT-6 Astra"],
			["gpt-6.1-sol", "GPT-6.1 Sol"],
			["gpt-6-luna", "GPT-6 Luna"],
		]);
	});
	it("has unique provider IDs and documented context windows", () => {
		expect(new Set(AI_MODELS.map((m) => m.id)).size).toBe(AI_MODELS.length);
		for (const model of AI_MODELS)
			expect(model.capabilities).toEqual({
				toolCalling: true,
				parallelToolCalls: true,
				streaming: true,
				maxInputTokens:
					model.provider === "openai"
						? 1_050_000
						: model.id.includes("haiku")
							? 200_000
							: 1_000_000,
			});
	});
	it("defaults new/reset settings to the current balanced/workhorse models", () => {
		expect(DEFAULT_ANTHROPIC_MODEL).toBe("claude-sonnet-5-5");
		expect(DEFAULT_OPENAI_MODEL).toBe("gpt-6.1-sol");
		expect(getDefaultModelId("anthropic")).toBe(DEFAULT_ANTHROPIC_MODEL);
		expect(getDefaultModelId("openai")).toBe(DEFAULT_OPENAI_MODEL);
	});
	it.each([
		"gpt-5.6-sol",
		"gpt-5.6-terra",
		"gpt-5.6-luna",
		"gpt-6-sol",
		"claude-opus-4-8",
		"claude-sonnet-5",
	])("preserves known capabilities for saved %s without offering it as current", (id) => {
		const model = getModelById(id);
		expect(model?.legacy).toBe(true);
		if (!model) throw new Error("expected legacy metadata");
		expect(resolveCapabilities(model.provider, id)).toEqual({
			known: true,
			capabilities: model.capabilities,
		});
		expect(getModelsForProvider(model.provider).some((m) => m.id === id)).toBe(false);
	});
	it.each(["gpt-4o", "gpt-4o-mini", "claude-sonnet-4-20250514", "claude-mythos-5-1"])(
		"does not invent supported tools for uncatalogued %s",
		(id) => {
			expect(getModelById(id)).toBeUndefined();
			expect(resolveCapabilities("anthropic", id)).toEqual({ known: false });
			expect(resolveCapabilities("openai", id)).toEqual({ known: false });
		},
	);
	it("never borrows capabilities from another provider", () => {
		expect(resolveCapabilities("anthropic", DEFAULT_OPENAI_MODEL)).toEqual({ known: false });
		expect(resolveCapabilities("openai", DEFAULT_ANTHROPIC_MODEL)).toEqual({ known: false });
	});
});
