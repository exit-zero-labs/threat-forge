import { createModel, expect, test } from "./fixtures";

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

	test("keeps top-menu controls visible with a long document title at minimum width", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 900, height: 700 });
		await createModel(page);

		await page.getByTitle("Untitled Threat Model - Double-click to rename").dblclick();
		const titleInput = page.getByTestId("top-menu-bar").locator("input");
		await titleInput.fill("Customer Identity Access Model Customer Identity Access Model");
		const download = page.waitForEvent("download");
		await titleInput.press("Enter");
		await download;

		await expect(
			page.getByRole("region", {
				name: "Canvas summary: 0 components, 0 data flows, 0 identified threats, 0 mitigated threats",
			}),
		).toBeVisible();
		await expect(page.getByTestId("btn-settings-dialog")).toBeInViewport({ ratio: 1 });
	});
});
