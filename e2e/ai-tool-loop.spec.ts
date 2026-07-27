import type { Page } from "@playwright/test";
import {
	addElementResponse,
	openAiPanelWithModel,
	routeAnthropic,
	send,
	textResponse,
} from "./anthropic-sse";
import { expect, test } from "./fixtures";

/**
 * A deterministic, browser-only proof of the bounded tool loop (issue #62).
 *
 * No key and no network: `seedAnthropicApiKey` unlocks the panel and every
 * request to the Anthropic endpoint is fulfilled with a canned SSE body scripted
 * per request. The discriminating case is Stop-while-pending — the node count
 * before and after must be identical, which fails for any implementation that
 * commits a mutation the user never approved.
 */

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
		// The turn continues after the denial: the model's follow-up renders.
		await expect(page.getByText("Understood.")).toBeVisible();
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
