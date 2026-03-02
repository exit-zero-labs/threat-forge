import { type Page, expect, test as base } from "@playwright/test";

/** Platform-aware modifier key: Meta on macOS, Control elsewhere */
export const modKey = process.platform === "darwin" ? "Meta" : "Control";

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

export const test = base;
export { expect } from "@playwright/test";
