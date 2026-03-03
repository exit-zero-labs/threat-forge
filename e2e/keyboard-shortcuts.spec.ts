import { addPaletteItem, createModel, expect, modKey, test } from "./fixtures";

test.describe("Keyboard Shortcuts", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/app");
	});

	test("Cmd+Z undoes last action", async ({ page }) => {
		await createModel(page);
		await addPaletteItem(page, "palette-item-generic");
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(1);

		// Click an empty area of the canvas to ensure focus (far from default node position)
		const canvas = page.getByTestId("canvas-area");
		const box = await canvas.boundingBox();
		await canvas.click({
			position: { x: (box?.width ?? 800) - 20, y: (box?.height ?? 600) - 20 },
		});
		await page.keyboard.press(`${modKey}+z`);
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(0);
	});

	test("Cmd+Shift+Z redoes undone action", async ({ page }) => {
		await createModel(page);
		await addPaletteItem(page, "palette-item-generic");

		const canvas = page.getByTestId("canvas-area");
		const box = await canvas.boundingBox();
		await canvas.click({
			position: { x: (box?.width ?? 800) - 20, y: (box?.height ?? 600) - 20 },
		});
		await page.keyboard.press(`${modKey}+z`);
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(0);

		// Redo
		await page.keyboard.press(`${modKey}+Shift+z`);
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(1);
	});

	test("Cmd+, opens settings dialog", async ({ page }) => {
		// Create a model and click canvas to ensure proper keyboard focus
		// (matching the pattern used by Cmd+Z tests — body.click() alone
		// is insufficient in headless Chrome for Meta key combos)
		await createModel(page);
		const canvas = page.getByTestId("canvas-area");
		const box = await canvas.boundingBox();
		await canvas.click({
			position: { x: (box?.width ?? 800) - 20, y: (box?.height ?? 600) - 20 },
		});
		await page.keyboard.press(`${modKey}+,`);
		await expect(page.getByTestId("settings-dialog")).toBeVisible();
	});
});
