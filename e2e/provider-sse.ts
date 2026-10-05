import type { Page } from "@playwright/test";
import { z } from "zod";
import { addElementResponse, openAiPanelWithModel, sse, textResponse } from "./anthropic-sse";
import { expect } from "./fixtures";

/** Scripted Responses and signed Messages frames for browser integration, with fake keys only. */
export type TestProvider = "anthropic" | "openai";
const args = { action: "add_element", element: { type: "process", name: "Cache" } };
export const nativeFunction = {
	type: "function_call",
	id: "fc_item",
	call_id: "call_1",
	name: "add_element",
	arguments: JSON.stringify(args),
	status: "completed",
};
export const encryptedReasoning = {
	type: "reasoning",
	id: "rs_item",
	summary: [],
	encrypted_content: "e2e-encrypted-reasoning",
};
export const signedThinking = { type: "thinking", thinking: "", signature: "e2e-signed-thinking" };
const envelope = z.object({ model: z.string(), stream: z.literal(true) }).passthrough();

/** Reject obsolete request fields before fulfilling the intercepted provider endpoint. */
export function assertProviderRequest(provider: TestProvider, raw: unknown, model: string) {
	const body = envelope.parse(raw);
	expect(body.model).toBe(model);
	if (provider === "openai") {
		expect(body.input).toBeInstanceOf(Array);
		expect(body.store).toBe(false);
		expect(body.reasoning).toEqual({ effort: "medium" });
		expect(body.include).toEqual(["reasoning.encrypted_content"]);
		for (const field of [
			"messages",
			"reasoning_effort",
			"max_completion_tokens",
			"previous_response_id",
			"stream_options",
		])
			expect(body).not.toHaveProperty(field);
		const tools = z
			.array(
				z.object({
					type: z.literal("function"),
					strict: z.literal(false),
					name: z.string(),
					parameters: z.object({ type: z.literal("object") }).passthrough(),
				}),
			)
			.parse(body.tools);
		expect(tools.map((t) => t.name)).toContain("add_element");
	} else {
		expect(body.messages).toBeInstanceOf(Array);
		expect(body.tools).toBeInstanceOf(Array);
		expect(body).not.toHaveProperty("thinking");
		expect(body).not.toHaveProperty("input");
	}
	return body;
}
/** Produce one complete native response; the second POST must replay its opaque output. */
export function response(
	provider: TestProvider,
	model: string,
	kind: "tool" | "text",
	text = "Done.",
): string {
	if (provider === "anthropic") {
		if (kind === "text") return textResponse(text);
		// Existing tool fixture occupies indexes 0/1. Inject signed thinking at index 2.
		const thinking = sse([
			{
				event: "content_block_start",
				data: { index: 2, content_block: { type: "thinking", thinking: "" } },
			},
			{
				event: "content_block_delta",
				data: { index: 2, delta: { type: "signature_delta", signature: "e2e-signed-" } },
			},
			{
				event: "content_block_delta",
				data: { index: 2, delta: { type: "signature_delta", signature: "thinking" } },
			},
			{ event: "content_block_stop", data: { index: 2 } },
		]);
		return addElementResponse().replace(
			"event: message_delta\n",
			`${thinking}event: message_delta\n`,
		);
	}
	const output =
		kind === "tool"
			? [encryptedReasoning, nativeFunction]
			: [
					{
						type: "message",
						id: "msg_text",
						role: "assistant",
						status: "completed",
						phase: "final_answer",
						content: [{ type: "output_text", text, annotations: [] }],
					},
				];
	return sse([
		{ event: "response.created", data: { type: "response.created", response: { model } } },
		{
			event: "response.completed",
			data: {
				type: "response.completed",
				response: {
					model,
					status: "completed",
					output,
					usage: { input_tokens: 20, output_tokens: 10 },
				},
			},
		},
	]);
}
/** Enter the selected model through the actual settings UI, preserving the browser key path. */
export async function openProvider(
	page: Page,
	provider: TestProvider,
	model: string,
): Promise<void> {
	await page.addInitScript(() =>
		localStorage.setItem("tf-api-key-openai", "sk-openai-e2e-not-a-real-key"),
	);
	await openAiPanelWithModel(page);
	await page.getByTitle("AI Settings", { exact: true }).click();
	await page.getByRole("combobox", { name: "Provider", exact: true }).selectOption(provider);
	await page.getByRole("combobox", { name: "Model", exact: true }).selectOption(model);
	await page.keyboard.press("Escape");
}
