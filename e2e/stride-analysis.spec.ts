import { addPaletteItem, createModel, expect, test } from "./fixtures";

test.describe("STRIDE Analysis", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/app");
		await createModel(page);
	});

	test("STRIDE button is disabled with no elements", async ({ page }) => {
		// Switch to threats tab
		await page.getByTestId("tab-threats").click();
		const btn = page.getByTestId("btn-stride-analyze");
		await expect(btn).toBeVisible();
		await expect(btn).toBeDisabled();
	});

	test("generates threats after adding elements", async ({ page }) => {
		// Add two elements so STRIDE rules can fire
		await addPaletteItem(page, "palette-item-web-server");
		await addPaletteItem(page, "palette-item-sql-database");

		// Switch to threats tab and run analysis
		await page.getByTestId("tab-threats").click();
		const btn = page.getByTestId("btn-stride-analyze");
		await expect(btn).toBeEnabled();
		await btn.click();

		// Wait for threats to appear (analysis is fast for local STRIDE rules).
		// Assert at least 1 threat generated (match 1+ digit, not just "0").
		await expect(page.getByTestId("tab-threats")).toContainText(/[1-9]\d*/);
	});
});
