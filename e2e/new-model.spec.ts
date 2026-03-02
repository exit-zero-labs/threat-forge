import { createModel, expect, test } from "./fixtures";

test.describe("New Model", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
	});

	test("creates new model via empty state button", async ({ page }) => {
		await createModel(page);
		// Canvas area should still be visible but no longer showing empty state
		await expect(page.getByTestId("canvas-area")).toBeVisible();
		await expect(page.getByTestId("empty-canvas")).not.toBeVisible();
	});

	test("creates new model via toolbar button", async ({ page }) => {
		await page.getByTestId("btn-new").click();
		await expect(page.getByTestId("component-palette")).toBeVisible();
		await expect(page.getByTestId("empty-canvas")).not.toBeVisible();
	});

	test("shows palette and right panel after creation", async ({ page }) => {
		await createModel(page);
		await expect(page.getByTestId("component-palette")).toBeVisible();
		await expect(page.getByTestId("right-panel")).toBeVisible();
	});
});
