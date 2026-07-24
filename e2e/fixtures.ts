import { type Page, expect, test as base } from "@playwright/test";

/** Platform-aware modifier key: Meta on macOS, Control elsewhere */
export const modKey = process.platform === "darwin" ? "Meta" : "Control";

/** Wait for and dismiss the first-launch "What's New" overlay through its rendered UI. */
export async function dismissWhatsNew(page: Page) {
	const overlay = page.getByTestId("whats-new-overlay");
	await expect(overlay).toBeVisible();
	await overlay.getByRole("button", { name: "Got it" }).click();
	await expect(overlay).toBeHidden();
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

/**
 * The guides that have auto-start triggers, and can therefore block a test.
 *
 * `use-onboarding-triggers.ts` checks `completedGuideIds` and `dismissedGuideIds` before
 * scheduling and before starting a guide, so seeding an id here suppresses that guide regardless
 * of its `showOnce` value. (`showOnce` gates `startGuide`, which governs only *manual* starts from
 * the guide picker — it is not part of auto-start suppression.) Add any new auto-start guide id
 * here; nothing else is required.
 *
 * `stride-analysis` and `ai-assistant` have no auto-start trigger and are deliberately absent.
 */
const AUTO_START_GUIDE_IDS = ["welcome", "dfd-basics"];

/**
 * Suppress both first-run interstitials before the page loads.
 *
 * Two distinct overlays block interaction, and both must be suppressed (#111):
 *
 * 1. The What's New overlay, keyed on `threatforge-last-seen-version` (must equal
 *    CURRENT_VERSION exactly).
 * 2. The onboarding guides, which render a full-viewport `guide-overlay` that intercepts
 *    pointer events, plus a `guide-tooltip` that steals focus.
 *
 *    The blocker actually observed here is `dfd-basics`, which auto-starts 800ms after the
 *    first model is created. Specs previously passed only by racing ahead of that timer, which
 *    made every add-element spec timing-dependent — the exact non-determinism #111 exists to
 *    remove. Measured against the pre-fix seeding: after `New Model`, `guide-overlay` is
 *    present and `palette-item-generic.dblclick()` times out.
 *
 *    `welcome` (500ms after mount) is also active in this environment. Under StrictMode, effect
 *    cleanup cancels the first timer and effect replay schedules its replacement. Seeding the
 *    guide id prevents that replacement from blocking E2E interaction.
 *
 * This intentionally removes guide auto-start from every spec built on this fixture. Hook-level
 * tests cover the timers, StrictMode replay, live eligibility checks, and What's New suppression;
 * dedicated real-browser auto-start coverage lives in `e2e/onboarding-auto-start.spec.ts` (#141),
 * which imports the plain `@playwright/test` `test` instead of this fixture so it is not
 * suppressed away.
 */
export async function suppressFirstRunOverlays(page: Page) {
	await page.addInitScript((guideIds: string[]) => {
		localStorage.setItem("threatforge-last-seen-version", "1.0.0");
		localStorage.setItem(
			"threatforge-onboarding",
			JSON.stringify({ completedGuideIds: [], dismissedGuideIds: guideIds }),
		);
	}, AUTO_START_GUIDE_IDS);
}

/**
 * Seed a browser API key so the AI panel reaches the chat view without a real
 * provider account. The key is the value `BrowserKeychainAdapter` reads
 * (`tf-api-key-<provider>`); the AI-loop spec pairs it with a routed, canned SSE
 * response so no request ever leaves the machine.
 */
export async function seedAnthropicApiKey(page: Page) {
	await page.addInitScript(() => {
		localStorage.setItem("tf-api-key-anthropic", "sk-ant-e2e-not-a-real-key");
	});
}

/** Test fixture that applies {@link suppressFirstRunOverlays} to every page before it loads. */
export const test = base.extend({
	page: async ({ page }, use) => {
		await suppressFirstRunOverlays(page);
		await use(page);
	},
});

export { expect } from "@playwright/test";
