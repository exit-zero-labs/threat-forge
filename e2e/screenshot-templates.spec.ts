/**
 * Playwright script to screenshot all templates for visual validation.
 * Usage: npx playwright test e2e/screenshot-templates.spec.ts
 */
import { test } from "@playwright/test";
import { suppressFirstRunOverlays } from "./fixtures";

const TEMPLATES = [
	"ecommerce-platform",
	"cloud-microservices",
	"mobile-banking",
	"saas-platform",
	"iot-smart-building",
	"healthcare-system",
];

/**
 * Suppress all first-run overlays. Shared with the fixture in ./fixtures so the guide-id list
 * has a single home; this spec imports `test` from @playwright/test directly (it is a
 * screenshot utility, not a fixture-based spec), so it must call the helper explicitly.
 */
const suppressOnboarding = suppressFirstRunOverlays;

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
