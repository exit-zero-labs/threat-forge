import { describe, expect, it } from "vitest";
import { z } from "zod";
import { providerEndpoint } from "@/lib/adapters/provider-endpoints";
import { defineTool } from "@/lib/ai/protocol/tools";
import { getModelsForProvider } from "@/lib/ai-models";
import { createAnthropicStreamMapper } from "./anthropic";
import { buildOpenAiRequestBody } from "./openai";

const optionalTool = defineTool({
	name: "lookup",
	description: "Read a component by optional name.",
	input: { name: z.string().optional() },
});

// The greeting that failed live still advertises tools. A responder which
// accepts any body cannot establish compatibility with the selected model.
describe("current provider request contracts", () => {
	it.each([
		"gpt-6-astra",
		"gpt-6.1-sol",
		"gpt-6-luna",
		"gpt-5.6-sol",
		"gpt-5.6-terra",
		"gpt-5.6-luna",
	])("uses stateless Responses with optional tool inputs for %s", (modelId) => {
		const body = buildOpenAiRequestBody({
			modelId,
			system: "Review threats.",
			messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
			tools: [optionalTool],
			maxOutputTokens: 512,
		});
		expect(providerEndpoint("openai").url).toBe("https://api.openai.com/v1/responses");
		expect(body).toMatchObject({
			model: modelId,
			stream: true,
			store: false,
			max_output_tokens: 512,
			tools: [{ type: "function", name: "lookup", strict: false }],
		});
		for (const field of [
			"messages",
			"max_completion_tokens",
			"stream_options",
			"reasoning_effort",
			"previous_response_id",
		])
			expect(body).not.toHaveProperty(field);
	});
	it("offers the current public models from both providers", () => {
		expect(getModelsForProvider("openai").map((m) => m.id)).toEqual([
			"gpt-6-astra",
			"gpt-6.1-sol",
			"gpt-6-luna",
		]);
		expect(getModelsForProvider("anthropic").map((m) => m.id)).toEqual([
			"claude-fable-5-1",
			"claude-opus-5-5",
			"claude-sonnet-5-5",
			"claude-haiku-4-5-20251001",
		]);
	});
	it("retains an empty thinking block and fragmented signature before a tool follow-up", () => {
		const mapper = createAnthropicStreamMapper();
		const frames = [
			["message_start", { message: { model: "claude-sonnet-5-5" } }],
			["content_block_start", { index: 0, content_block: { type: "thinking", thinking: "" } }],
			[
				"content_block_delta",
				{ index: 0, delta: { type: "signature_delta", signature: "signed-" } },
			],
			[
				"content_block_delta",
				{ index: 0, delta: { type: "signature_delta", signature: "reasoning" } },
			],
			["content_block_stop", { index: 0 }],
			["message_delta", { delta: { stop_reason: "end_turn" } }],
			["message_stop", {}],
		] as const;
		const events = frames.flatMap(([event, data]) =>
			mapper.mapFrame({ event, data: JSON.stringify(data) }),
		);
		expect(events).toContainEqual({
			type: "continuation",
			output: {
				provider: "anthropic",
				payload: [{ type: "thinking", thinking: "", signature: "signed-reasoning" }],
			},
		});
		expect(events.some((event) => event.type === "text_delta")).toBe(false);
	});
});
