import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { assertNoSeriousAccessibilityViolations, scanAccessibility } from "./support/accessibility";

/**
 * Tier-2 accessibility gate for the marketing routes (issue #292).
 *
 * `accessibility-audit.spec.ts` covers `/app` states only, so every public page shipped
 * unscanned and every one of them was failing contrast.
 */

/** Every route `App.tsx` serves outside `/app`. `/terms` is included; #292's list omitted it. */
const MARKETING_ROUTES = ["/", "/downloads", "/about", "/privacy", "/terms", "/support"] as const;

/** The landing page reflows hardest at 320px, which is where #292 was originally measured. */
const VIEWPORTS = [
	{ name: "desktop", width: 1280, height: 900 },
	{ name: "narrow", width: 320, height: 720 },
] as const;

/**
 * Navigate, wait for paint, and scan — as one step that cannot be taken apart.
 *
 * Waiting is the whole defense. An unpainted page reports zero violations, which is
 * indistinguishable from a healthy one, so a scan that races the route's lazy chunk is a
 * confident false pass. #292's first probe reported exactly that.
 *
 * The wait therefore lives *inside* the scan rather than beside it. An earlier version of this
 * file exposed the two separately, and review showed that deleting the wait from the call sites,
 * while leaving the wait function and its own test intact, let a real contrast regression pass
 * 13 of 13. There is deliberately no unguarded scan here for a future edit to strand after a
 * `goto`.
 *
 * The footer anchor matters as much as the heading: the heading paints with the route shell, but
 * three of the original violations were in the footer, below the fold.
 */
async function scanMarketingRoute(page: Page, route: string): Promise<void> {
	await page.goto(route);
	await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
	await expect(page.getByRole("contentinfo")).toBeAttached();

	await assertNoSeriousAccessibilityViolations(page);
}

test.describe("Marketing route accessibility", () => {
	for (const viewport of VIEWPORTS) {
		for (const route of MARKETING_ROUTES) {
			test(`${route} has no serious violations at ${viewport.name}`, async ({ page }) => {
				await page.setViewportSize({ width: viewport.width, height: viewport.height });

				await scanMarketingRoute(page, route);
			});
		}
	}

	for (const route of MARKETING_ROUTES) {
		test(`${route} has no serious violations in dark theme`, async ({ browser }) => {
			// These pages share `documentElement` with the app, so a reader whose system is dark
			// sees them dark. The dark palette is expected to pass — the brand green is 10:1 on
			// the dark surface, which is what it was designed for — but "expected to pass" is the
			// state this suite exists to stop trusting. The class assertion matters: without it a
			// context that failed to flip would quietly scan light theme a third time.
			const context = await browser.newContext({ colorScheme: "dark" });
			const page = await context.newPage();
			try {
				await page.goto(route);
				await expect(page.locator("html")).toHaveClass(/dark/);

				await scanMarketingRoute(page, route);
			} finally {
				await context.close();
			}
		});
	}

	test("a route that never paints cannot pass the gate", async ({ page }) => {
		// Prove the guard fires, and prove what it guards against is real: axe scores the app
		// shell before React paints as perfectly clean. This is the served `index.html` — correct
		// `lang` and `<title>`, empty root — which is precisely the state a scan races when it
		// starts before the route's lazy chunk arrives.
		await page.route("**/*", async (route) => {
			if (route.request().resourceType() === "document") {
				await route.fulfill({
					contentType: "text/html",
					body: '<!doctype html><html lang="en"><head><title>Threat Forge</title></head><body><div id="root"></div></body></html>',
				});
				return;
			}
			await route.abort();
		});
		await page.goto("/");

		const unpainted = await scanAccessibility(page);
		expect(unpainted.violations).toHaveLength(0);

		await expect(scanMarketingRoute(page, "/")).rejects.toThrow();
	});
});
