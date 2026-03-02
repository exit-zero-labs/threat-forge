import { addPaletteItem, createModel, expect, modKey, test } from "./fixtures";

test.describe("Canvas Elements", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await createModel(page);
	});

	test("adds element via double-click on palette item", async ({ page }) => {
		await addPaletteItem(page, "palette-item-generic");
		// Node should appear on canvas
		const node = page.locator("[data-testid^='node-']").first();
		await expect(node).toBeVisible();
	});

	test("adds a typed component from the library", async ({ page }) => {
		await addPaletteItem(page, "palette-item-web-server");
		const node = page.locator("[data-testid^='node-']").first();
		await expect(node).toBeVisible();
		await expect(node).toContainText("Web Server");
	});

	test("adds multiple elements", async ({ page }) => {
		await addPaletteItem(page, "palette-item-generic");
		await addPaletteItem(page, "palette-item-web-server");
		const nodes = page.locator("[data-testid^='node-']");
		await expect(nodes).toHaveCount(2);
	});

	test("deletes element with Delete key", async ({ page }) => {
		await addPaletteItem(page, "palette-item-generic");
		// Click on the node to select it
		const node = page.locator("[data-testid^='node-']").first();
		await node.click();
		// Press Delete
		await page.keyboard.press("Delete");
		// Node should be gone
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(0);
	});

	test("clicking element shows properties panel", async ({ page }) => {
		await addPaletteItem(page, "palette-item-web-server");
		const node = page.locator("[data-testid^='node-']").first();
		await node.click();
		// Properties tab should be active and show element info
		await expect(page.getByTestId("tab-properties")).toBeVisible();
		// The right panel should contain the element name
		await expect(page.getByTestId("right-panel")).toContainText("Web Server");
	});
});
