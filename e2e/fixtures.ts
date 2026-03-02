import { type Page, expect, test as base } from "@playwright/test";

/** Platform-aware modifier key: Meta on macOS, Control elsewhere */
export const modKey = process.platform === "darwin" ? "Meta" : "Control";

/** Dismiss the "What's New" overlay if it is visible (blocks interactions on first launch) */
export async function dismissWhatsNew(page: Page) {
	const overlay = page.getByTestId("whats-new-overlay");
	const isVisible = await overlay.isVisible().catch(() => false);
	if (isVisible) {
		await overlay.locator("button", { hasText: "Got it" }).click();
		await overlay.waitFor({ state: "hidden" });
	}
}

/** Click the "New Model" button from the empty canvas state and wait for the canvas to load */
export async function createModel(page: Page) {
	await page.getByTestId("btn-empty-new").click();
	await page.getByTestId("component-palette").waitFor({ state: "visible" });
}

/** Double-click a palette item to add it to the canvas and wait for the node count to increase */
export async function addPaletteItem(page: Page, testId: string) {
	const nodesBefore = await page.locator("[data-testid^='node-']").count();
	const item = page.getByTestId(testId);
	await item.waitFor({ state: "visible" });
	await item.dblclick();
	// Wait until ReactFlow renders the new node
	await expect(page.locator("[data-testid^='node-']")).toHaveCount(nodesBefore + 1);
}

/**
 * Custom test fixture that automatically seeds localStorage to suppress
 * the What's New overlay on every test. This prevents the overlay from
 * blocking clicks in any test that navigates to "/".
 */
export const test = base.extend({
	page: async ({ page }, use) => {
		// Seed localStorage before the page loads so the What's New overlay doesn't appear
		await page.addInitScript(() => {
			localStorage.setItem("threatforge-last-seen-version", "1.0.0");
		});
		await use(page);
	},
});

export { expect } from "@playwright/test";
