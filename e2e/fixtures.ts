import type { Page } from "@playwright/test";
import { APP_VERSION } from "./support/app-version";
import { failureAwareTest as base, expect } from "./support/base";

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

/** How long the canvas geometry must hold still before this helper calls it settled. */
const CANVAS_QUIET_MS = 100;

/**
 * Wait until the canvas has finished laying itself out, for specs that compare pixels.
 *
 * `toHaveScreenshot` mostly covers itself: playwright-core compares the first shot against the
 * committed baseline, and only if that fails does it re-shoot until two consecutive shots agree
 * ("Failed to take two consecutive stable screenshots") before comparing again. So a sleep in
 * front of it buys nothing it does not already do. What it cannot do is tell a *settled* canvas
 * from one that is merely *holding still*, and those come apart here: @xyflow/react renders a
 * node it has not measured as `visibility: hasDimensions ? 'visible' : 'hidden'` and applies
 * `fitView` only once measurement lands. A screenshot taken in between is stable, wrong, and
 * indistinguishable from a good one to anything comparing consecutive frames.
 *
 * `addPaletteItem` deliberately does not cover this: it waits on node *count*, which increments
 * at the React commit, before measurement. That is the right gate for behavioural specs, which
 * only need the node to exist, and the wrong one for a spec that photographs it.
 *
 * The visibility clause is worth less than it looks, and that is worth knowing before trusting
 * it. `nodeHasDimensions` reads `node.measured?.width ?? node.width ?? node.initialWidth`, and
 * `canvas-store-factory.ts` sets `width`/`height` as top-level props on trust boundaries — so a
 * boundary is `visible` on its first render, one frame before `fitView` moves it. For the
 * trust-boundary specs the quiet-period check below is the only thing standing between the
 * screenshot and a pre-`fitView` canvas.
 *
 * Hence a duration and not just a frame pair. Requiring geometry to hold for `CANVAS_QUIET_MS`
 * is not the sleep this replaces: a sleep asserts "ready by now" and can pass early, whereas a
 * quiet period can only ever hold the gate *longer* than the frame comparison alone. The
 * pre-`fitView` window measured 1 frame, including under 20x and 50x browser CPU throttling, so
 * 100ms is margin over a measured window rather than a fitted constant — and if a future xyflow
 * defers `fitView` past it, the failure is a visibly wrong screenshot, not a silent pass.
 *
 * The comparison carries its previous reading on `window` rather than awaiting a
 * `requestAnimationFrame` chain inside the predicate, because `waitForFunction` does **not**
 * await a promise the predicate returns — measured on `@playwright/test` 1.61.1, a predicate
 * returning `new Promise((r) => setTimeout(() => r(false), 20))` resolves the wait in 50ms
 * instead of timing out. A predicate that returns a promise therefore always succeeds, whatever
 * it would have resolved to. `waitForFunction` polls on `raf` by default, so successive polls
 * already *are* successive frames; comparing across them is both synchronous and honest.
 *
 * Measured on an idle machine, 2026-07-27 (#255, PR #306): immediately after `addPaletteItem`
 * returns, the viewport transform is already final and the first screenshot of `.react-flow` is
 * byte-identical to the committed baseline (0 of 456,320 pixels differing). On an idle machine
 * the 500ms sleeps this replaces were therefore already unnecessary; under load they were a bet
 * on machine speed, which is the bet #255 reports losing under nine-worker load.
 */
export async function waitForCanvasSettled(
	page: Page,
	expectedNodes: number,
	options: { timeout?: number } = {},
) {
	const timeout = options.timeout ?? 15000;
	const deadline = Date.now() + timeout;
	await expect(page.locator(".react-flow__node")).toHaveCount(expectedNodes, { timeout });
	// Start from no prior reading. A previous call that timed out leaves its last reading behind,
	// and this call would otherwise match it on its first poll and return after a single frame.
	await page.evaluate(() => {
		(window as unknown as { __tfCanvasGeometry?: unknown }).__tfCanvasGeometry = undefined;
	});
	await page.waitForFunction(
		([count, quietMs]) => {
			const carrier = window as unknown as {
				__tfCanvasGeometry?: { geometry: string; since: number };
			};
			const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
			if (viewport === null) {
				carrier.__tfCanvasGeometry = undefined;
				return false;
			}
			const nodes = Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node"));
			// The count is re-checked here, not just in the assertion above, so that a node
			// unmounting after that assertion resolved restarts the quiet period instead of
			// being photographed mid-removal with stable geometry.
			const measured =
				nodes.length === count && nodes.every((node) => node.style.visibility === "visible");
			if (!measured) {
				carrier.__tfCanvasGeometry = undefined;
				return false;
			}
			const geometry = `${viewport.style.transform}|${nodes
				.map((node) => {
					const box = node.getBoundingClientRect();
					return `${box.x},${box.y},${box.width},${box.height}`;
				})
				.join(";")}`;
			const previous = carrier.__tfCanvasGeometry;
			if (previous === undefined || previous.geometry !== geometry) {
				carrier.__tfCanvasGeometry = { geometry, since: performance.now() };
				return false;
			}
			return performance.now() - previous.since >= quietMs;
		},
		[expectedNodes, CANVAS_QUIET_MS] as const,
		{ timeout: Math.max(0, deadline - Date.now()) },
	);
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
 * which imports `failureAwareTest` directly from `support/base.ts` instead of this fixture so it
 * is not suppressed away.
 */
export async function suppressFirstRunOverlays(page: Page) {
	await page.addInitScript(
		({ guideIds, version }: { guideIds: string[]; version: string }) => {
			localStorage.setItem("threatforge-last-seen-version", version);
			localStorage.setItem(
				"threatforge-onboarding",
				JSON.stringify({ completedGuideIds: [], dismissedGuideIds: guideIds }),
			);
		},
		{ guideIds: AUTO_START_GUIDE_IDS, version: APP_VERSION },
	);
}

/**
 * Seed a browser API key so the AI panel reaches the chat view without a real
 * provider account. The AI-loop spec pairs it with a routed, canned SSE response
 * so no request ever leaves the machine.
 *
 * The value is written to the pre-#133 `tf-api-key-<provider>` slot rather than
 * straight into the encrypted vault, because seeding the vault from an init
 * script would mean reimplementing the wrapping-key setup in test code. On first
 * read `BrowserKeychainAdapter` migrates this slot into the vault and erases it,
 * so the app under test still resolves the key through the real encrypted path —
 * and this fixture doubles as live coverage of the upgrade an existing user gets.
 */
export async function seedAnthropicApiKey(page: Page) {
	await page.addInitScript(() => {
		localStorage.setItem("tf-api-key-anthropic", "sk-ant-e2e-not-a-real-key");
	});
}

/**
 * Test fixture that applies {@link suppressFirstRunOverlays} to every page before it loads, on
 * top of the failure-aware base's console/pageerror/requestfailed policy (`support/base.ts`,
 * issue #65 D4). `base.ts` never imports this module, so no import cycle exists.
 */
export const test = base.extend({
	page: async ({ page }, use) => {
		await suppressFirstRunOverlays(page);
		await use(page);
	},
});

export { expect };
