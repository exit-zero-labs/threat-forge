import { type Page, expect, test as base } from "@playwright/test";

/** Platform-aware modifier key: Meta on macOS, Control elsewhere */
export const modKey = process.platform === "darwin" ? "Meta" : "Control";

/** Dismiss the "What's New" overlay if it is visible (blocks interactions on first launch) */
export async function dismissWhatsNew(page: Page) {
	const overlay = page.getByTestId("whats-new-overlay");
	const isVisible = await overlay.isVisible().catch(() => false);
	if (isVisible) {
		await overlay.locator("button", { hasText: "Got it" }).click();
		await overlay.waitFor({ state: "hidden" });
	}
}

/**
 * Wait until the ReactFlow surface is mounted and interactive.
 *
 * The canvas is lazy-loaded behind a Suspense boundary, so the palette (which lives in the
 * sidebar) paints well before the canvas chunk mounts. Any interaction that adds an element
 * needs the canvas itself, not just the palette. `.react-flow__pane` is rendered by
 * @xyflow/react as soon as ReactFlow initializes and before any node exists, which makes it
 * the correct pre-first-add readiness anchor. Idempotent: a no-op once the pane is visible.
 */
export async function waitForCanvasReady(page: Page) {
	await page.locator(".react-flow__pane").waitFor({ state: "visible" });
}

/** Click the "New Model" button from the empty canvas state and wait for the canvas to load */
export async function createModel(page: Page) {
	await page.getByTestId("btn-empty-new").click();
	await page.getByTestId("component-palette").waitFor({ state: "visible" });
	await waitForCanvasReady(page);
}

/** Double-click a palette item to add it to the canvas and wait for the node count to increase */
export async function addPaletteItem(page: Page, testId: string) {
	// Defense in depth: any caller reaching here without going through createModel is still safe.
	await waitForCanvasReady(page);
	const nodesBefore = await page.locator("[data-testid^='node-']").count();
	const item = page.getByTestId(testId);
	await item.waitFor({ state: "visible" });
	await item.dblclick();
	// Wait until ReactFlow renders the new node. The readiness gate above removes the mount
	// race; this bounded per-assertion timeout (#111) only absorbs residual React-commit
	// latency on a CPU-saturated runner. Deliberately local — the issue forbids raising the
	// global expect timeout, and a node that is never added still fails here.
	await expect(page.locator("[data-testid^='node-']")).toHaveCount(nodesBefore + 1, {
		timeout: 15000,
	});
}

/** Every guide id in src/lib/onboarding/guides.ts; auto-start is suppressed for all of them. */
const ALL_GUIDE_IDS = ["welcome", "dfd-basics", "stride-analysis", "ai-assistant"];

/**
 * Custom test fixture that seeds localStorage to suppress both first-run interstitials
 * before the page loads.
 *
 * Two distinct overlays block interaction, and both must be suppressed (#111):
 *
 * 1. The What's New overlay, keyed on `threatforge-last-seen-version`.
 * 2. The onboarding guides, which render a full-viewport `guide-overlay` that intercepts
 *    pointer events. `welcome` auto-starts 500ms after mount and `dfd-basics` 800ms after
 *    the first model is created (`use-onboarding-triggers.ts`). Seeding only the What's New
 *    key actually *enables* the welcome guide, because `isWhatsNewVisible()` treats that key
 *    as proof no other modal is up. Specs previously passed only by racing ahead of the
 *    800ms timer, which made every add-element spec timing-dependent — the exact
 *    non-determinism #111 exists to remove.
 *
 * Guide behavior itself is covered by unit tests in
 * src/components/onboarding/guide-overlay.test.tsx, so suppressing auto-start here removes a
 * timing dependency without dropping coverage of the feature.
 */
export const test = base.extend({
	page: async ({ page }, use) => {
		await page.addInitScript((guideIds: string[]) => {
			localStorage.setItem("threatforge-last-seen-version", "1.0.0");
			localStorage.setItem(
				"threatforge-onboarding",
				JSON.stringify({ completedGuideIds: [], dismissedGuideIds: guideIds }),
			);
		}, ALL_GUIDE_IDS);
		await use(page);
	},
});

export { expect } from "@playwright/test";
