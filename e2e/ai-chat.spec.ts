import { createModel, expect, test } from "./fixtures";

test.describe("AI Chat", () => {
	test("AI tab shows no API key message", async ({ page }) => {
		await page.goto("/");
		await createModel(page);
		await page.getByTestId("tab-ai").click();

		const rightPanel = page.getByTestId("right-panel");
		await expect(rightPanel).toContainText("No API key configured");
		await expect(rightPanel).toContainText("Configure API Key");
	});

	test("settings gear in AI tab opens settings dialog at AI section", async ({ page }) => {
		await page.goto("/");
		await createModel(page);
		await page.getByTestId("tab-ai").click();

		// Click the settings gear icon in the AI tab header
		const settingsButton = page.getByTestId("right-panel").locator("button[title='AI Settings']");
		await settingsButton.click();

		// Settings dialog should be visible with AI section active
		const settingsDialog = page.getByTestId("settings-dialog");
		await expect(settingsDialog).toBeVisible();
		// The AI tab content should be showing (provider selector, API key fields)
		await expect(settingsDialog).toContainText("Provider");
		await expect(settingsDialog).toContainText("API Key");
	});
});
