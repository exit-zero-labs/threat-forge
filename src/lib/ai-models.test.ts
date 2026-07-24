/** Curated picker and request-preflight model metadata (issue #195). */

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

describe("the curated catalog", () => {
	it("has exactly the six current models, in order, with nothing retired", () => {
		expect(AI_MODELS.map((m) => ({ id: m.id, provider: m.provider, label: m.label }))).toEqual([
			{ id: "claude-opus-4-8", provider: "anthropic", label: "Claude Opus 4.8" },
			{ id: "claude-sonnet-5", provider: "anthropic", label: "Claude Sonnet 5" },
			{ id: "claude-haiku-4-5-20251001", provider: "anthropic", label: "Claude Haiku 4.5" },
			{ id: "gpt-5.6-sol", provider: "openai", label: "GPT-5.6 Sol" },
			{ id: "gpt-5.6-terra", provider: "openai", label: "GPT-5.6 Terra" },
			{ id: "gpt-5.6-luna", provider: "openai", label: "GPT-5.6 Luna" },
		]);
	});

	it("orders Anthropic models most capable to fastest", () => {
		expect(getModelsForProvider("anthropic").map((m) => m.id)).toEqual([
			"claude-opus-4-8",
			"claude-sonnet-5",
			"claude-haiku-4-5-20251001",
		]);
	});

	it("orders OpenAI models flagship to cost-sensitive", () => {
		expect(getModelsForProvider("openai").map((m) => m.id)).toEqual([
			"gpt-5.6-sol",
			"gpt-5.6-terra",
			"gpt-5.6-luna",
		]);
	});

	it("pins each model's documented context window", () => {
		const windows = Object.fromEntries(AI_MODELS.map((m) => [m.id, m.capabilities.maxInputTokens]));
		expect(windows).toEqual({
			"claude-opus-4-8": 1_000_000,
			"claude-sonnet-5": 1_000_000,
			"claude-haiku-4-5-20251001": 200_000,
			"gpt-5.6-sol": 1_050_000,
			"gpt-5.6-terra": 1_050_000,
			"gpt-5.6-luna": 1_050_000,
		});
	});

	it("pins every model as tool-capable, parallel-tool-capable, and streaming", () => {
		for (const model of AI_MODELS) {
			expect(model.capabilities).toMatchObject({
				toolCalling: true,
				parallelToolCalls: true,
				streaming: true,
			});
		}
	});

	it("defaults new and reset settings to Sonnet 5 and GPT-5.6 Sol", () => {
		expect(DEFAULT_ANTHROPIC_MODEL).toBe("claude-sonnet-5");
		expect(DEFAULT_OPENAI_MODEL).toBe("gpt-5.6-sol");
		expect(getDefaultModelId("anthropic")).toBe(DEFAULT_ANTHROPIC_MODEL);
		expect(getDefaultModelId("openai")).toBe(DEFAULT_OPENAI_MODEL);
	});

	it("excludes every retired model this catalog replaced", () => {
		const ids = new Set(AI_MODELS.map((m) => m.id));
		for (const retired of [
			"claude-opus-4-20250514",
			"claude-sonnet-4-20250514",
			"claude-haiku-3-5-20241022",
			"gpt-4o",
			"gpt-4o-mini",
		]) {
			expect(ids.has(retired)).toBe(false);
		}
	});

	it("looks a current model up by id and resolves its capabilities as known", () => {
		const model = getModelById("claude-sonnet-5");
		expect(model?.provider).toBe("anthropic");

		const resolution = resolveCapabilities("anthropic", "claude-sonnet-5");
		expect(resolution).toEqual({ known: true, capabilities: model?.capabilities });
	});

	it("resolves a retired id as unknown rather than reusing a current model's capabilities", () => {
		expect(getModelById("claude-sonnet-4-20250514")).toBeUndefined();
		expect(resolveCapabilities("anthropic", "claude-sonnet-4-20250514")).toEqual({
			known: false,
		});
	});

	it("resolves a model id under the wrong provider as unknown", () => {
		// A GPT id submitted while the Anthropic provider is selected must not
		// borrow OpenAI's capabilities.
		expect(resolveCapabilities("anthropic", "gpt-5.6-sol")).toEqual({ known: false });
	});
});
