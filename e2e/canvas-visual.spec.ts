import type { Page } from "@playwright/test";
import {
	addPaletteItem,
	createModel,
	expect,
	test,
	waitForCanvasReady,
	waitForCanvasSettled,
} from "./fixtures";

/** Add a trust boundary from the palette (doesn't use node-* testid like elements) */
async function addTrustBoundary(page: Page) {
	// Same readiness gate as addPaletteItem: this helper also double-clicks the palette, so it
	// must not run against a mid-mount canvas (#111).
	await waitForCanvasReady(page);
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
 * Baseline ownership, update, and review (issue #66, D8): only macOS-generated baselines are
 * committed (font rendering/anti-aliasing differ on Linux, so CI skips this spec entirely — see
 * the `test.skip(!!process.env.CI, ...)` below). The contributor/agent authoring a canvas-layout
 * change owns regenerating baselines locally on macOS before requesting review, using the
 * `--update-snapshots` command above. A PR that changes any file under
 * `e2e/canvas-visual.spec.ts-snapshots/` must have its before/after PNGs reviewed as images — CI
 * cannot see what changed, since it never runs this spec — using GitHub's native "Files changed"
 * PNG diff view, so a reviewer without macOS access can review without checking out the branch.
 * Record the reason for a baseline change in the PR description (mirroring the existing `#136`
 * precedent noted in `docs/runbooks/diagnosing-ci-failures.md`).
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
		await waitForCanvasSettled(page, 1);

		const canvas = page.locator(".react-flow");
		await expect(canvas).toHaveScreenshot("canvas-single-element.png", {
			maxDiffPixelRatio: 0.01,
		});
	});

	test("canvas with multiple element types matches baseline", async ({ page }) => {
		await addPaletteItem(page, "palette-item-web-server");
		await addPaletteItem(page, "palette-item-sql-database");
		await addPaletteItem(page, "palette-item-generic");
		await waitForCanvasSettled(page, 3);

		const canvas = page.locator(".react-flow");
		await expect(canvas).toHaveScreenshot("canvas-multiple-elements.png", {
			maxDiffPixelRatio: 0.01,
		});
	});

	test("canvas with trust boundary matches baseline", async ({ page }) => {
		await addTrustBoundary(page);
		await waitForCanvasSettled(page, 1);

		const canvas = page.locator(".react-flow");
		await expect(canvas).toHaveScreenshot("canvas-trust-boundary.png", {
			maxDiffPixelRatio: 0.01,
		});
	});

	test("canvas with elements and trust boundary matches baseline", async ({ page }) => {
		await addTrustBoundary(page);
		await addPaletteItem(page, "palette-item-web-server");
		await addPaletteItem(page, "palette-item-sql-database");
		await waitForCanvasSettled(page, 3);

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
		// ReactFlow puts the `selected` class on the node *wrapper*, not on the app's inner
		// `node-*` element, so the state this spec photographs is observable there.
		await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);
		await waitForCanvasSettled(page, 2);

		const canvas = page.locator(".react-flow");
		await expect(canvas).toHaveScreenshot("canvas-selected-element.png", {
			maxDiffPixelRatio: 0.01,
		});
	});
});
