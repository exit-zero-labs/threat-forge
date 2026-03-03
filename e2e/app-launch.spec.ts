import { expect, test } from "./fixtures";

test.describe("App Launch", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/app");
	});

	test("shows empty canvas state on launch", async ({ page }) => {
		await expect(page.getByTestId("empty-canvas")).toBeVisible();
		await expect(page.getByTestId("btn-empty-new")).toBeVisible();
		await expect(page.getByTestId("btn-empty-open")).toBeVisible();
	});

	test("has top menu bar with controls", async ({ page }) => {
		await expect(page.getByTestId("top-menu-bar")).toBeVisible();
		await expect(page.getByTestId("btn-new")).toBeVisible();
		await expect(page.getByTestId("btn-save")).toBeVisible();
	});

	test("has status bar at bottom", async ({ page }) => {
		await expect(page.getByTestId("status-bar")).toBeVisible();
	});
});
