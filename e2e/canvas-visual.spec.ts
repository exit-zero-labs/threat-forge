import { type Page } from "@playwright/test";
import { addPaletteItem, createModel, expect, test } from "./fixtures";

/** Add a trust boundary from the palette (doesn't use node-* testid like elements) */
async function addTrustBoundary(page: Page) {
	const item = page.getByTestId("palette-item-trust-boundary");
	await item.waitFor({ state: "visible" });
	await item.dblclick();
	// Trust boundaries render as ReactFlow nodes but without node-* testid
	// Wait for the boundary to appear in the ReactFlow container
	await page.locator(".react-flow__node-trustBoundary").first().waitFor({ state: "visible" });
}

/**
 * Visual regression tests for the ThreatForge canvas.
 *
 * Uses Playwright's built-in `toHaveScreenshot()` for pixel-level comparison.
 * First run generates baseline images in `e2e/canvas-visual.spec.ts-snapshots/`.
 * Subsequent runs compare against the baseline — failures produce a diff image.
 *
 * Run with `--update-snapshots` to regenerate baselines:
 *   npx playwright test e2e/canvas-visual.spec.ts --update-snapshots
 *
 * NOTE on tests NOT included here:
 *
 * 1. Drag ghost preview: The palette's `setDragGhost()` creates a transient DOM
 *    element at `left:-9999px`, passes it to the native `dataTransfer.setDragImage()`,
 *    then removes it in `requestAnimationFrame`. The browser renders the drag image
 *    outside the DOM as a native overlay — it is not capturable via DOM queries or
 *    Playwright screenshots. Testing this would be inherently flaky/impossible.
 *
 * 2. Trust boundary highlight during drag-over: The boundary wrapper has
 *    `pointer-events: none`, so `dragEnter` events only fire on the 8px-wide
 *    border strip buttons. Coordinating an HTML5 drag from the palette to land
 *    precisely on an 8px strip is extremely fragile across viewport sizes, zoom
 *    levels, and CI environments. The highlight is also conditional on the Zustand
 *    store's `draggedType` being non-null AND non-trust-boundary, which adds
 *    another layer of timing sensitivity. This is better covered by a unit test
 *    on the component's CSS class logic.
 */

test.describe("Canvas Visual Regression", () => {
	// Visual regression snapshots are platform-specific (font rendering, anti-aliasing).
	// Only macOS baselines are committed — skip in CI (Linux) to avoid missing-snapshot failures.
	test.skip(!!process.env.CI, "Visual regression tests require platform-specific baselines");

	test.beforeEach(async ({ page }) => {
		await page.goto("/app");
		await createModel(page);
	});

	test("canvas with single element matches baseline", async ({ page }) => {
		await addPaletteItem(page, "palette-item-web-server");

		// Wait for ReactFlow to settle (animation frames, layout)
		await page.waitForTimeout(500);

		const canvas = page.locator(".react-flow");
		await expect(canvas).toHaveScreenshot("canvas-single-element.png", {
			maxDiffPixelRatio: 0.01,
		});
	});

	test("canvas with multiple element types matches baseline", async ({ page }) => {
		await addPaletteItem(page, "palette-item-web-server");
		await addPaletteItem(page, "palette-item-sql-database");
		await addPaletteItem(page, "palette-item-generic");

		// Wait for ReactFlow to settle
		await page.waitForTimeout(500);

		const canvas = page.locator(".react-flow");
		await expect(canvas).toHaveScreenshot("canvas-multiple-elements.png", {
			maxDiffPixelRatio: 0.01,
		});
	});

	test("canvas with trust boundary matches baseline", async ({ page }) => {
		await addTrustBoundary(page);

		// Wait for ReactFlow to settle
		await page.waitForTimeout(500);

		const canvas = page.locator(".react-flow");
		await expect(canvas).toHaveScreenshot("canvas-trust-boundary.png", {
			maxDiffPixelRatio: 0.01,
		});
	});

	test("canvas with elements and trust boundary matches baseline", async ({ page }) => {
		await addTrustBoundary(page);
		await addPaletteItem(page, "palette-item-web-server");
		await addPaletteItem(page, "palette-item-sql-database");

		// Wait for ReactFlow to settle
		await page.waitForTimeout(500);

		const canvas = page.locator(".react-flow");
		await expect(canvas).toHaveScreenshot("canvas-elements-with-boundary.png", {
			maxDiffPixelRatio: 0.01,
		});
	});

	test("selected element visual state matches baseline", async ({ page }) => {
		await addPaletteItem(page, "palette-item-web-server");
		await addPaletteItem(page, "palette-item-sql-database");

		// Select the first node
		const firstNode = page.locator("[data-testid^='node-']").first();
		await firstNode.click();

		// Wait for selection styling to apply
		await page.waitForTimeout(300);

		const canvas = page.locator(".react-flow");
		await expect(canvas).toHaveScreenshot("canvas-selected-element.png", {
			maxDiffPixelRatio: 0.01,
		});
	});
});
