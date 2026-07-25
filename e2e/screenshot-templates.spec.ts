/**
 * Playwright script to screenshot all templates for visual validation.
 * Usage: npx playwright test e2e/screenshot-templates.spec.ts
 *
 * This spec is a local, manual visual-validation aid, not a CI-gated check — it asserts nothing
 * about pixel content. Every screenshot is captured to Playwright's per-test output directory and
 * attached to the HTML report by path (issue #66, D9), rather than written to the gitignored
 * `screenshots/` directory, so it shows up alongside every other artifact instead of needing a
 * separate manual look in a working-tree folder. It is skipped in CI entirely: it wastes runner
 * cycles capturing images nobody reviews there.
 */
import { test } from "./fixtures";

test.skip(
	!!process.env.CI,
	"Template screenshots are a manual visual-validation aid, not a CI-gated check",
);

const TEMPLATES = [
	"ecommerce-platform",
	"cloud-microservices",
	"mobile-banking",
	"saas-platform",
	"iot-smart-building",
	"healthcare-system",
];

test("screenshot empty state", async ({ page }, testInfo) => {
	await page.goto("/app");
	await page.waitForSelector('[data-testid="empty-canvas"]', { timeout: 10000 });
	await page.waitForTimeout(500);

	const screenshotPath = testInfo.outputPath("empty-state.png");
	await page.screenshot({ path: screenshotPath, fullPage: false });
	await testInfo.attach("empty-state", { path: screenshotPath, contentType: "image/png" });
});

for (const templateId of TEMPLATES) {
	test(`screenshot template: ${templateId}`, async ({ page }, testInfo) => {
		await page.goto("/app");
		await page.waitForSelector('[data-testid="empty-canvas"]', { timeout: 10000 });

		// Click the template card
		await page.click(`[data-testid="template-${templateId}"]`);

		// Wait for canvas to render with nodes
		await page.waitForSelector('[data-testid="canvas-area"]', { timeout: 10000 });
		await page.waitForSelector(".react-flow__node", { timeout: 10000 });

		// Give ReactFlow a moment to settle layout
		await page.waitForTimeout(1000);

		const screenshotPath = testInfo.outputPath(`template-${templateId}.png`);
		await page.screenshot({ path: screenshotPath, fullPage: false });
		await testInfo.attach(`template-${templateId}`, {
			path: screenshotPath,
			contentType: "image/png",
		});
	});
}
