import { expect, type Page, test } from "@playwright/test";
import { createModel, dismissWhatsNew } from "./fixtures";

// The shared fixture suppresses both guides for deterministic workflow specs. These tests use
// plain Playwright contexts and seed only what each first-run contract requires.
const CURRENT_VERSION = "1.0.0";

async function readOnboardingState(page: Page): Promise<unknown> {
	return page.evaluate<unknown>(() => {
		const raw = localStorage.getItem("threatforge-onboarding");
		return raw === null ? null : JSON.parse(raw);
	});
}

test.describe("Onboarding guide auto-start (real browser, #141)", () => {
	test("welcome guide auto-starts when eligible under StrictMode and can be dismissed", async ({
		page,
	}) => {
		// Suppressing What's New makes welcome eligible; onboarding itself stays unseeded.
		await page.addInitScript((version: string) => {
			localStorage.setItem("threatforge-last-seen-version", version);
		}, CURRENT_VERSION);

		await page.goto("/app");

		expect(await page.evaluate(() => localStorage.getItem("threatforge-onboarding"))).toBeNull();

		// This fails against the pre-#142 ref guard, whose timer never survived StrictMode replay.
		const tooltip = page.getByTestId("guide-tooltip");
		await expect(tooltip).toBeVisible();
		await expect(tooltip).toHaveAttribute("aria-label", "The Canvas");

		await tooltip.getByRole("button", { name: "Skip" }).click();

		await expect(tooltip).toBeHidden();
		expect(await readOnboardingState(page)).toEqual(
			expect.objectContaining({
				dismissedGuideIds: expect.arrayContaining(["welcome"]),
			}),
		);
	});

	test("dfd-basics guide auto-starts after the first model is created and can be dismissed through its UI", async ({
		page,
	}) => {
		await page.goto("/app");
		await dismissWhatsNew(page);
		await createModel(page);

		const tooltip = page.getByTestId("guide-tooltip");
		await expect(tooltip).toBeVisible();
		await expect(tooltip).toHaveAttribute("aria-label", "Add a Component");
		await expect(page.getByTestId("guide-overlay")).toBeVisible();

		await tooltip.getByRole("button", { name: "Skip" }).click();

		await expect(tooltip).toBeHidden();
		await expect(page.getByTestId("guide-overlay")).toBeHidden();
		expect(await readOnboardingState(page)).toEqual(
			expect.objectContaining({
				dismissedGuideIds: expect.arrayContaining(["dfd-basics"]),
			}),
		);
	});
});
