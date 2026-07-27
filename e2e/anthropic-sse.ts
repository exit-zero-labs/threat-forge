import type { Page, Route } from "@playwright/test";
import { createModel, expect, seedAnthropicApiKey } from "./fixtures";

/**
 * Canned Anthropic streaming responses, and the panel helpers that drive them, for
 * browser-only AI tests.
 *
 * No key and no network: `seedAnthropicApiKey` unlocks the panel and every request to the
 * Anthropic endpoint is fulfilled with a scripted SSE body. Keeping the wire format in one
 * place means a change to Anthropic's streaming contract breaks in one file rather than
 * drifting between specs that each grew their own copy.
 */

interface SseFrame {
	event: string;
	data: unknown;
}

/** Serialize frames to Anthropic's SSE wire format. */
export function sse(frames: SseFrame[]): string {
	return frames.map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`).join("");
}

export const MODEL = "claude-sonnet-5";

/** One assistant turn that calls add_element for a "Cache" process. */
export function addElementResponse(): string {
	return sse([
		{
			event: "message_start",
			data: {
				message: { id: "msg_1", model: MODEL, usage: { input_tokens: 20, output_tokens: 1 } },
			},
		},
		{ event: "content_block_start", data: { index: 0, content_block: { type: "text", text: "" } } },
		{
			event: "content_block_delta",
			data: { index: 0, delta: { type: "text_delta", text: "Adding a cache." } },
		},
		{ event: "content_block_stop", data: { index: 0 } },
		{
			event: "content_block_start",
			data: {
				index: 1,
				content_block: { type: "tool_use", id: "call_1", name: "add_element", input: {} },
			},
		},
		{
			event: "content_block_delta",
			data: {
				index: 1,
				delta: {
					type: "input_json_delta",
					partial_json: JSON.stringify({
						action: "add_element",
						element: { type: "process", name: "Cache" },
					}),
				},
			},
		},
		{ event: "content_block_stop", data: { index: 1 } },
		{
			event: "message_delta",
			data: {
				delta: { stop_reason: "tool_use", stop_sequence: null },
				usage: { output_tokens: 15 },
			},
		},
		{ event: "message_stop", data: { type: "message_stop" } },
	]);
}

/** A plain text turn that ends the conversation. */
export function textResponse(text: string): string {
	return sse([
		{
			event: "message_start",
			data: {
				message: { id: "msg_2", model: MODEL, usage: { input_tokens: 25, output_tokens: 1 } },
			},
		},
		{ event: "content_block_start", data: { index: 0, content_block: { type: "text", text: "" } } },
		{ event: "content_block_delta", data: { index: 0, delta: { type: "text_delta", text } } },
		{ event: "content_block_stop", data: { index: 0 } },
		{
			event: "message_delta",
			data: { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } },
		},
		{ event: "message_stop", data: { type: "message_stop" } },
	]);
}

/** Route the Anthropic endpoint to return each scripted response in order. */
export async function routeAnthropic(page: Page, responses: string[]): Promise<void> {
	let index = 0;
	await page.route("https://api.anthropic.com/v1/messages", async (route: Route) => {
		const body = responses[Math.min(index, responses.length - 1)];
		index += 1;
		await route.fulfill({ status: 200, contentType: "text/event-stream", body });
	});
}

/** Open the AI panel on a model, with a key seeded and the endpoint already routed. */
export async function openAiPanelWithModel(page: Page): Promise<void> {
	await seedAnthropicApiKey(page);
	await page.goto("/app");
	await createModel(page);
	await page.getByTestId("tab-ai").click();
	await expect(page.getByPlaceholder("Ask about threats...")).toBeVisible();
}

/** Type a message into the chat input and submit it. */
export async function send(page: Page, message: string): Promise<void> {
	const input = page.getByPlaceholder("Ask about threats...");
	await input.fill(message);
	await input.press("Enter");
}
