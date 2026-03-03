import { createModel, expect, test } from "./fixtures";

test.describe("Empty States", () => {
	test("canvas shows empty state before creating model", async ({ page }) => {
		await page.goto("/app");
		await expect(page.getByTestId("empty-canvas")).toBeVisible();
		await expect(page.getByTestId("btn-empty-new")).toBeVisible();
		await expect(page.getByTestId("btn-empty-open")).toBeVisible();
	});

	test("properties tab shows placeholder when nothing selected", async ({ page }) => {
		await page.goto("/app");
		await createModel(page);
		const rightPanel = page.getByTestId("right-panel");
		await expect(rightPanel).toContainText("Select an element");
	});

	test("threats tab shows empty state with no threats", async ({ page }) => {
		await page.goto("/app");
		await createModel(page);
		await page.getByTestId("tab-threats").click();
		const rightPanel = page.getByTestId("right-panel");
		await expect(rightPanel).toContainText("run STRIDE analysis");
	});

	test("AI tab shows no API key message before configuring", async ({ page }) => {
		await page.goto("/app");
		await createModel(page);
		await page.getByTestId("tab-ai").click();
		const rightPanel = page.getByTestId("right-panel");
		await expect(rightPanel).toContainText("No API key configured");
	});
});
