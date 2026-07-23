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

	test("generates threats and copies one as YAML", async ({ page }) => {
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

		const threatCard = page.getByTestId("threat-card").first();
		await expect(threatCard).toBeVisible();
		await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
			origin: "http://localhost:3000",
		});
		await threatCard.click({ button: "right" });
		await page.getByRole("button", { name: "Copy as YAML" }).click();

		const copied = await page.evaluate(() => navigator.clipboard.readText());
		expect(copied).toMatch(/^- id: .+\n/);
		expect(copied).toContain("\n  title: ");
		expect(copied).toContain("\n  category: ");
		expect(copied).not.toContain("\nthreats:");
	});
});
