import { addPaletteItem, createModel, expect, modKey, test } from "./fixtures";

test.describe("Dirty State — Unsaved Changes Prompt", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/app");
		await createModel(page);
		// Add an element to make the model dirty
		await addPaletteItem(page, "palette-item-generic");
		// Verify the status bar shows unsaved changes
		await expect(page.getByTestId("status-bar")).toContainText("Unsaved changes");
	});

	test("shows confirmation dialog when creating new model with unsaved changes", async ({
		page,
	}) => {
		let dialogAppeared = false;
		page.on("dialog", async (dialog) => {
			expect(dialog.type()).toBe("confirm");
			expect(dialog.message()).toContain("unsaved changes");
			dialogAppeared = true;
			await dialog.dismiss();
		});

		await page.keyboard.press(`${modKey}+n`);

		// Give the dialog a moment to appear and be handled
		await page.waitForTimeout(500);
		expect(dialogAppeared).toBe(true);
	});

	test("dismissing dialog keeps the current model", async ({ page }) => {
		page.on("dialog", async (dialog) => {
			await dialog.dismiss();
		});

		// Verify node exists before attempting new model
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(1);

		await page.keyboard.press(`${modKey}+n`);

		// Wait for the dialog to be handled
		await page.waitForTimeout(500);

		// Model should remain — element should still be on canvas
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(1);
		// Should still show unsaved changes
		await expect(page.getByTestId("status-bar")).toContainText("Unsaved changes");
	});

	test("accepting dialog discards changes and creates new model", async ({ page }) => {
		page.on("dialog", async (dialog) => {
			await dialog.accept();
		});

		// Verify node exists before attempting new model
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(1);

		await page.keyboard.press(`${modKey}+n`);

		// After accepting, a new empty model should be created — no elements
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(0);
		// Canvas should still be visible (new model is active)
		await expect(page.getByTestId("canvas-area")).toBeVisible();
		// Should not show unsaved changes for the fresh model
		await expect(page.getByTestId("status-bar")).not.toContainText("Unsaved changes");
	});

	test("toolbar new button also triggers confirmation dialog", async ({ page }) => {
		let dialogAppeared = false;
		page.on("dialog", async (dialog) => {
			dialogAppeared = true;
			await dialog.dismiss();
		});

		await page.getByTestId("btn-new").click();

		await page.waitForTimeout(500);
		expect(dialogAppeared).toBe(true);

		// Model should remain after dismissing
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(1);
	});

	test("no dialog appears when model has no unsaved changes", async ({ page }) => {
		// Start fresh — navigate to a clean state
		await page.goto("/app");
		await createModel(page);
		// Do NOT add any elements — model is clean

		let dialogAppeared = false;
		page.on("dialog", async () => {
			dialogAppeared = true;
		});

		await page.keyboard.press(`${modKey}+n`);

		// New model should be created directly without a dialog
		await page.waitForTimeout(500);
		expect(dialogAppeared).toBe(false);

		// Canvas should still be active (new model replaced old empty model)
		await expect(page.getByTestId("canvas-area")).toBeVisible();
	});
});
