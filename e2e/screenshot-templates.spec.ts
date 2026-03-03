/**
 * Playwright script to screenshot all templates for visual validation.
 * Usage: npx playwright test e2e/screenshot-templates.spec.ts
 */
import { test } from "@playwright/test";

const TEMPLATES = [
	"ecommerce-platform",
	"cloud-microservices",
	"mobile-banking",
	"saas-platform",
	"iot-smart-building",
	"healthcare-system",
];

/** Suppress all onboarding dialogs by pre-setting localStorage */
async function suppressOnboarding(page: import("@playwright/test").Page) {
	await page.addInitScript(() => {
		// Mark What's New as seen — must match CURRENT_VERSION exactly ("1.0.0")
		localStorage.setItem("threatforge-last-seen-version", "1.0.0");
		// Mark all onboarding guides as completed (flat format, not Zustand persist)
		localStorage.setItem(
			"threatforge-onboarding",
			JSON.stringify({
				completedGuideIds: [
					"welcome",
					"dfd-basics",
					"stride-analysis",
					"ai-assistant",
				],
				dismissedGuideIds: [],
			}),
		);
	});
}

test("screenshot empty state", async ({ page }) => {
	await suppressOnboarding(page);
	await page.goto("/app");
	await page.waitForSelector('[data-testid="empty-canvas"]', { timeout: 10000 });
	await page.waitForTimeout(500);
	await page.screenshot({
		path: "screenshots/empty-state.png",
		fullPage: false,
	});
});

for (const templateId of TEMPLATES) {
	test(`screenshot template: ${templateId}`, async ({ page }) => {
		await suppressOnboarding(page);
		await page.goto("/app");
		await page.waitForSelector('[data-testid="empty-canvas"]', { timeout: 10000 });

		// Click the template card
		await page.click(`[data-testid="template-${templateId}"]`);

		// Wait for canvas to render with nodes
		await page.waitForSelector('[data-testid="canvas-area"]', { timeout: 10000 });
		await page.waitForSelector(".react-flow__node", { timeout: 10000 });

		// Give ReactFlow a moment to settle layout
		await page.waitForTimeout(1000);

		await page.screenshot({
			path: `screenshots/template-${templateId}.png`,
			fullPage: false,
		});
	});
}
