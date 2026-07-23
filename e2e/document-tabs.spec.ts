import type { Page } from "@playwright/test";
import { addPaletteItem, expect, test, waitForCanvasReady } from "./fixtures";

/** Open `count` documents via the always-present new-document button, in the strip. */
async function openDocuments(page: Page, count: number) {
	for (let i = 1; i <= count; i++) {
		await page.getByTestId("btn-new-document").click();
		await expect(page.getByRole("tab")).toHaveCount(i);
	}
}

test.describe("Document tab workspace", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/app");
	});

	test("opens ten documents with the tenth selected", async ({ page }) => {
		await openDocuments(page, 10);
		await expect(page.getByRole("tab")).toHaveCount(10);
		await expect(page.getByRole("tab").nth(9)).toHaveAttribute("aria-selected", "true");
	});

	test("arrow keys move focus without activating, and Enter commits (D4 manual activation)", async ({
		page,
	}) => {
		await openDocuments(page, 3);
		const tabs = page.getByRole("tab");
		await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");

		// Focus the selected tab (which holds the roving tabindex), then jump to the first with Home.
		await tabs.nth(2).focus();
		await page.keyboard.press("Home");
		// Manual activation: focus moved but selection did not.
		await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
		// Enter activates the focused first tab.
		await page.keyboard.press("Enter");
		await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
	});

	test("switching tabs swaps the canvas content, which persists on return", async ({ page }) => {
		await openDocuments(page, 3);
		const tabs = page.getByRole("tab");

		// Activate the first tab and add an element to it.
		await tabs.nth(2).focus();
		await page.keyboard.press("Home");
		await page.keyboard.press("Enter");
		await waitForCanvasReady(page);
		await addPaletteItem(page, "palette-item-generic");
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(1);

		// Switch to the last (empty) tab: its canvas shows no node.
		await tabs.nth(0).focus();
		await page.keyboard.press("End");
		await page.keyboard.press("Enter");
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(0);

		// Return to the first tab: the element is still there.
		await tabs.nth(2).focus();
		await page.keyboard.press("Home");
		await page.keyboard.press("Enter");
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(1);
	});

	test("closing the active middle tab activates the right neighbour (D1)", async ({ page }) => {
		await openDocuments(page, 3);
		const tabs = page.getByRole("tab");

		// Activate the middle tab via the keyboard.
		await tabs.nth(2).focus();
		await page.keyboard.press("ArrowLeft");
		await page.keyboard.press("Enter");
		await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");

		// Delete closes the focused middle tab; D1 activates its right neighbour.
		await page.keyboard.press("Delete");
		await expect(page.getByRole("tab")).toHaveCount(2);
		await expect(page.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
	});

	test("scrolls the selected tab into view in a narrow window", async ({ page }) => {
		await page.setViewportSize({ width: 900, height: 700 });
		await openDocuments(page, 10);

		// The tenth tab is active and at the far right — it is on screen.
		await expect(page.getByRole("tab").nth(9)).toBeInViewport();

		// Activating the first tab scrolls the strip so it comes into view.
		const tabs = page.getByRole("tab");
		await tabs.nth(9).focus();
		await page.keyboard.press("Home");
		await page.keyboard.press("Enter");
		await expect(page.getByRole("tab").nth(0)).toBeInViewport();
	});
});
