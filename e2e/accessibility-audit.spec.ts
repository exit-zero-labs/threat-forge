import { expect, test } from "./fixtures";
import { assertNoSeriousAccessibilityViolations } from "./support/accessibility";
import { installDeterministicClock } from "./support/base";
import {
	seedEmptyWorkspace,
	seedEphemeralWorkspace,
	seedRealisticWorkspace,
} from "./support/workspace-fixtures";

/**
 * Tier-2, explicit accessibility gate (issue #66, D4/step 4). Every test here calls
 * `assertNoSeriousAccessibilityViolations` against the default `KNOWN_ACCESSIBILITY_EXCEPTIONS`
 * allowlist, so a passing run proves no unexcepted serious/critical violation exists. Exact-match
 * unit coverage prevents rule-wide exceptions; tracked issues and owner review retire stale
 * exceptions when their underlying live violation is fixed.
 *
 * `seedMalformedWorkspace` is intentionally not covered: its failure surfaces through a native
 * `window.alert` dialog that this suite's dialog listener dismisses before axe can inspect any
 * resulting page state (see `workspace-fixtures.ts`'s own doc comment on that fixture).
 */
test.describe("Accessibility audit", () => {
	test("pre-model welcome screen has no unexcepted serious/critical violations", async ({
		page,
	}) => {
		await installDeterministicClock(page);
		await page.goto("/app");
		await expect(page.getByTestId("empty-canvas")).toBeVisible();
		await assertNoSeriousAccessibilityViolations(page);
	});

	test("empty seeded document has no unexcepted serious/critical violations", async ({ page }) => {
		await seedEmptyWorkspace(page);
		await assertNoSeriousAccessibilityViolations(page);
	});

	test("realistic e-commerce template has no unexcepted serious/critical violations", async ({
		page,
	}) => {
		await seedRealisticWorkspace(page);
		await assertNoSeriousAccessibilityViolations(page);
	});

	test("degraded-storage (ephemeral) state has no unexcepted serious/critical violations", async ({
		page,
	}) => {
		await seedEphemeralWorkspace(page);
		await assertNoSeriousAccessibilityViolations(page);
	});

	test("key interactive surfaces stay visible with no body overflow at 900x700", async ({
		page,
	}) => {
		await seedRealisticWorkspace(page);
		await page.setViewportSize({ width: 900, height: 700 });

		await expect(page.getByTestId("component-palette")).toBeVisible();
		await expect(page.getByTestId("canvas-area")).toBeVisible();
		await expect(page.getByRole("tablist", { name: "Open documents" })).toBeVisible();
		await expect(page.getByTestId("component-palette")).toBeInViewport({ ratio: 1 });
		await expect(page.getByTestId("canvas-area")).toBeInViewport({ ratio: 1 });
		await expect(page.getByRole("tablist", { name: "Open documents" })).toBeInViewport({
			ratio: 1,
		});

		const overflow = await page.evaluate(() => ({
			scrollWidth: document.body.scrollWidth,
			clientWidth: document.body.clientWidth,
		}));
		expect(
			overflow.scrollWidth,
			`document.body.scrollWidth (${overflow.scrollWidth}) must not exceed clientWidth (${overflow.clientWidth}) at 900x700`,
		).toBeLessThanOrEqual(overflow.clientWidth);
	});
});
