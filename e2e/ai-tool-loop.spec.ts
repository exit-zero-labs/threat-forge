import type { Page, Route } from "@playwright/test";
import { createModel, expect, seedAnthropicApiKey, test } from "./fixtures";

/**
 * A deterministic, browser-only proof of the bounded tool loop (issue #62).
 *
 * No key and no network: `seedAnthropicApiKey` unlocks the panel and every
 * request to the Anthropic endpoint is fulfilled with a canned SSE body scripted
 * per request. The discriminating case is Stop-while-pending — the node count
 * before and after must be identical, which fails for any implementation that
 * commits a mutation the user never approved.
 */

interface SseFrame {
	event: string;
	data: unknown;
}

/** Serialize frames to Anthropic's SSE wire format. */
function sse(frames: SseFrame[]): string {
	return frames.map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`).join("");
}

const MODEL = "claude-sonnet-4-20250514";

/** One assistant turn that calls add_element for a "Cache" process. */
function addElementResponse(): string {
	return sse([
		{ event: "message_start", data: { message: { id: "msg_1", model: MODEL, usage: { input_tokens: 20, output_tokens: 1 } } } },
		{ event: "content_block_start", data: { index: 0, content_block: { type: "text", text: "" } } },
		{ event: "content_block_delta", data: { index: 0, delta: { type: "text_delta", text: "Adding a cache." } } },
		{ event: "content_block_stop", data: { index: 0 } },
		{ event: "content_block_start", data: { index: 1, content_block: { type: "tool_use", id: "call_1", name: "add_element", input: {} } } },
		{
			event: "content_block_delta",
			data: {
				index: 1,
				delta: {
					type: "input_json_delta",
					partial_json: JSON.stringify({ action: "add_element", element: { type: "process", name: "Cache" } }),
				},
			},
		},
		{ event: "content_block_stop", data: { index: 1 } },
		{ event: "message_delta", data: { delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 15 } } },
		{ event: "message_stop", data: { type: "message_stop" } },
	]);
}

/** A plain text turn that ends the conversation. */
function textResponse(text: string): string {
	return sse([
		{ event: "message_start", data: { message: { id: "msg_2", model: MODEL, usage: { input_tokens: 25, output_tokens: 1 } } } },
		{ event: "content_block_start", data: { index: 0, content_block: { type: "text", text: "" } } },
		{ event: "content_block_delta", data: { index: 0, delta: { type: "text_delta", text } } },
		{ event: "content_block_stop", data: { index: 0 } },
		{ event: "message_delta", data: { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } } },
		{ event: "message_stop", data: { type: "message_stop" } },
	]);
}

/** Route the Anthropic endpoint to return each scripted response in order. */
async function routeAnthropic(page: Page, responses: string[]): Promise<void> {
	let index = 0;
	await page.route("https://api.anthropic.com/v1/messages", async (route: Route) => {
		const body = responses[Math.min(index, responses.length - 1)];
		index += 1;
		await route.fulfill({ status: 200, contentType: "text/event-stream", body });
	});
}

async function openAiPanelWithModel(page: Page): Promise<void> {
	await seedAnthropicApiKey(page);
	await page.goto("/app");
	await createModel(page);
	await page.getByTestId("tab-ai").click();
	await expect(page.getByPlaceholder("Ask about threats...")).toBeVisible();
}

async function send(page: Page, message: string): Promise<void> {
	const input = page.getByPlaceholder("Ask about threats...");
	await input.fill(message);
	await input.press("Enter");
}

const nodes = (page: Page) => page.locator("[data-testid^='node-']");

test.describe("AI tool loop", () => {
	test("approving a tool call adds the element to the canvas", async ({ page }) => {
		await routeAnthropic(page, [addElementResponse(), textResponse("Done.")]);
		await openAiPanelWithModel(page);
		await expect(nodes(page)).toHaveCount(0);

		await send(page, "add a cache");

		// The mutation is presented for review, not applied automatically.
		const approve = page.getByRole("button", { name: "Approve" });
		await expect(approve).toBeVisible();
		await expect(nodes(page)).toHaveCount(0);

		await approve.click();
		// Once approved, the element appears on the canvas.
		await expect(nodes(page)).toHaveCount(1);
	});

	test("stopping while a call is pending leaves the canvas unchanged", async ({ page }) => {
		await routeAnthropic(page, [addElementResponse()]);
		await openAiPanelWithModel(page);
		await expect(nodes(page)).toHaveCount(0);

		await send(page, "add a cache");
		await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();

		// Stop before approving: the discriminating assertion is that no node was added.
		await page.getByTitle("Stop generating (Esc)").click();
		await expect(page.getByTestId("tool-call-call_1")).toHaveAttribute("data-status", "denied");
		await expect(page.getByText("Not run", { exact: true })).toBeVisible();
		await expect(nodes(page)).toHaveCount(0);
	});

	test("denying a call keeps the canvas unchanged and continues the turn", async ({ page }) => {
		await routeAnthropic(page, [addElementResponse(), textResponse("Understood.")]);
		await openAiPanelWithModel(page);

		await send(page, "add a cache");
		await page.getByRole("button", { name: "Deny" }).click();

		await expect(page.getByText("Declined", { exact: true })).toBeVisible();
		await expect(nodes(page)).toHaveCount(0);
	});

	test("undoing the turn removes the applied element in one step", async ({ page }) => {
		await routeAnthropic(page, [addElementResponse(), textResponse("Done.")]);
		await openAiPanelWithModel(page);

		await send(page, "add a cache");
		await page.getByRole("button", { name: "Approve" }).click();
		await expect(nodes(page)).toHaveCount(1);

		await page.getByRole("button", { name: /Undo this turn/ }).click();
		await expect(nodes(page)).toHaveCount(0);
	});
});
