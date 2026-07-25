import type { Page } from "@playwright/test";
import { THEME_PRESETS } from "@/lib/themes/presets";
import { TIPS } from "@/lib/tips";
import { expect, test } from "./fixtures";
import { assertNoSeriousAccessibilityViolations, scanAccessibility } from "./support/accessibility";
import { installDeterministicClock } from "./support/base";
import {
	seedEmptyWorkspace,
	seedEphemeralWorkspace,
	seedRealisticWorkspace,
} from "./support/workspace-fixtures";

async function setReduceMotion(page: Page, enabled: boolean): Promise<void> {
	await page.getByTestId("btn-settings-dialog").click();
	const settings = page.getByTestId("settings-dialog");
	await settings.getByRole("button", { name: "Appearance", exact: true }).click();
	const toggle = settings.getByTestId("toggle-reduce-motion");
	if ((await toggle.getAttribute("aria-checked")) !== String(enabled)) {
		await toggle.click();
	}
	await expect(toggle).toHaveAttribute("aria-checked", String(enabled));
	await page.keyboard.press("Escape");
	await expect(settings).toBeHidden();
}

/**
 * Tier-2, explicit accessibility gate (issue #66, D4/step 4). State audits call
 * `assertNoSeriousAccessibilityViolations` against the default `KNOWN_ACCESSIBILITY_EXCEPTIONS`
 * allowlist; focused regressions use the same scanner and require complete axe passes for their
 * exact targets. Exact-match unit coverage prevents rule-wide exceptions; tracked issues and owner
 * review retire stale exceptions when their underlying live violation is fixed.
 *
 * `seedMalformedWorkspace` is intentionally not covered: its failure surfaces through a native
 * `window.alert` dialog that this suite's dialog listener dismisses before axe can inspect any
 * resulting page state (see `workspace-fixtures.ts`'s own doc comment on that fixture).
 */
test.describe("Accessibility audit", () => {
	test("issue #218's four empty-canvas targets and the rotating tip pass contrast in every built-in theme", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await installDeterministicClock(page);
		await page.goto("/app");
		await expect(page.getByTestId("empty-canvas")).toBeVisible();

		const targetSelector = '[data-testid="empty-canvas-contrast-target"]';
		const targets = page.locator(targetSelector);
		await expect(targets).toHaveCount(4);
		const tipSelector = '[data-testid="rotating-tip-contrast-target"]';
		const tip = page.locator(tipSelector);
		await expect(tip).toBeVisible();

		await setReduceMotion(page, true);
		const settings = page.getByTestId("settings-dialog");

		const reducedMotionTip = await tip.innerText();
		await page.clock.runFor(7400);
		await expect(tip).toHaveText(reducedMotionTip);
		await expect
			.poll(() =>
				tip.evaluate((element) => ({
					opacity: getComputedStyle(element).opacity,
					transition: element.style.transition,
				})),
			)
			.toEqual({ opacity: "1", transition: "none" });

		for (const preset of Object.values(THEME_PRESETS)) {
			await test.step(preset.name, async () => {
				await page.getByTestId("btn-settings-dialog").click();
				await settings.getByRole("button", { name: "Appearance", exact: true }).click();
				await settings
					.getByRole("button", {
						name: preset.mode === "dark" ? "Dark" : "Light",
						exact: true,
					})
					.click();
				await settings.getByRole("button", { name: preset.name, exact: true }).click();
				await page.keyboard.press("Escape");
				await expect(settings).toBeHidden();
				await page.mouse.move(0, 0);

				await expect
					.poll(
						() =>
							page.evaluate(() => ({
								background: document.documentElement.style
									.getPropertyValue("--color-background")
									.trim(),
								foreground: document.documentElement.style
									.getPropertyValue("--color-foreground")
									.trim(),
							})),
						{ message: `${preset.name} should be the active theme before its contrast scan` },
					)
					.toEqual({
						background: preset.tokens.background,
						foreground: preset.tokens.foreground,
					});

				await expect
					.poll(
						() =>
							targets.evaluateAll(
								(elements) =>
									new Set(
										elements.map((element) => {
											const style = getComputedStyle(element);
											return `${style.color}|${style.opacity}`;
										}),
									).size,
							),
						{ message: `${preset.name} should apply one settled treatment to all four nodes` },
					)
					.toBe(1);

				await expect(tip).toBeVisible();
				const tipHierarchy = await tip.evaluate((element) => {
					const heading = document.querySelector('[data-testid="empty-canvas"] h2');
					const style = getComputedStyle(element);
					const headingStyle = heading ? getComputedStyle(heading) : null;
					return {
						fontSize: Number.parseFloat(style.fontSize),
						headingFontSize: headingStyle ? Number.parseFloat(headingStyle.fontSize) : null,
					};
				});
				expect(tipHierarchy.headingFontSize).not.toBeNull();
				expect(
					tipHierarchy.fontSize,
					`${preset.name} tip should remain subordinate to the primary heading`,
				).toBeLessThan(tipHierarchy.headingFontSize ?? 0);

				const result = await scanAccessibility(page, {
					include: [`${targetSelector}, ${tipSelector}`],
				});
				const contrastFailures = [...result.violations, ...result.incomplete]
					.filter((violation) => violation.id === "color-contrast")
					.flatMap((violation) => violation.nodes.map((node) => node.target.join(" > ")));
				expect(
					contrastFailures,
					`${preset.name} should have no failed or incomplete color-contrast results`,
				).toEqual([]);

				const contrastPass = result.passes.find((entry) => entry.id === "color-contrast");
				expect(
					contrastPass?.nodes,
					`${preset.name} should produce five measured color-contrast passes`,
				).toHaveLength(5);

				const restingOpacities = await targets.evaluateAll((elements) =>
					elements.map((element) => Number.parseFloat(getComputedStyle(element).opacity)),
				);
				expect(
					restingOpacities.every((opacity) => opacity > 0 && opacity < 1),
					`${preset.name} secondary text should remain de-emphasized`,
				).toBe(true);
			});
		}

		const githubButton = page.locator('button[data-testid="empty-canvas-contrast-target"]');
		const restingOpacity = Number.parseFloat(
			await githubButton.evaluate((element) => getComputedStyle(element).opacity),
		);
		await githubButton.hover();
		await expect
			.poll(() =>
				githubButton.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity)),
			)
			.toBe(1);
		expect(restingOpacity).toBeLessThan(1);
	});

	test("rotating tip keeps its seven-second interval and 400ms fade", async ({ page }) => {
		await installDeterministicClock(page);
		await page.goto("/app");

		const tip = page.getByTestId("rotating-tip-contrast-target");
		await expect(tip).toBeVisible();
		await setReduceMotion(page, true);
		const initialTip = await tip.innerText();
		await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
		await setReduceMotion(page, false);
		await expect
			.poll(() =>
				tip.evaluate((element) => {
					const style = getComputedStyle(element);
					return {
						opacity: style.opacity,
						transitionDuration: style.transitionDuration,
						transitionProperty: style.transitionProperty,
					};
				}),
			)
			.toEqual({
				opacity: "1",
				transitionDuration: "0.4s",
				transitionProperty: "opacity",
			});

		await page.clock.runFor(6999);
		await expect(tip).toHaveText(initialTip);
		expect(await tip.evaluate((element) => element.style.opacity)).toBe("1");

		await page.clock.runFor(1);
		await expect.poll(() => tip.evaluate((element) => element.style.opacity)).toBe("0");
		await expect(tip).toHaveText(initialTip);
		await page.clock.runFor(399);
		await expect(tip).toHaveText(initialTip);

		await page.clock.runFor(1);
		await expect(tip).not.toHaveText(initialTip);
		await expect.poll(() => tip.evaluate((element) => element.style.opacity)).toBe("1");
		await page.clock.runFor(400);
		await expect.poll(() => tip.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
	});

	test("every canonical rotating tip stays above the usable footer at 1280x720", async ({
		page,
	}) => {
		test.slow();
		await page.setViewportSize({ width: 1280, height: 720 });
		await installDeterministicClock(page);
		await page.goto("/app");
		await expect(page.getByTestId("empty-canvas")).toBeVisible();
		await setReduceMotion(page, true);
		await page.addInitScript((tipCount) => {
			const nativeRandom = Math.random;
			Math.random = () => {
				const rawIndex = new URL(window.location.href).searchParams.get("e2eTipIndex");
				const requestedIndex = rawIndex === null ? -1 : Number(rawIndex);
				if (!Number.isInteger(requestedIndex) || requestedIndex < 0 || requestedIndex >= tipCount) {
					return nativeRandom();
				}
				return (requestedIndex + 0.5) / tipCount;
			};
		}, TIPS.length);

		const tipSelector = '[data-testid="rotating-tip-contrast-target"]';
		const footerTargetSelector =
			'[data-testid="empty-canvas"] > footer [data-testid="empty-canvas-contrast-target"]';

		for (const [index, expectedTip] of TIPS.entries()) {
			await test.step(`tip ${index + 1} of ${TIPS.length}`, async () => {
				await page.goto(`/app?e2eTipIndex=${index}`);
				const emptyCanvas = page.getByTestId("empty-canvas");
				const tip = page.locator(tipSelector);
				const footer = emptyCanvas.locator("footer");
				await expect(emptyCanvas).toBeVisible();
				await expect(tip).toHaveText(expectedTip);
				await expect.poll(() => tip.evaluate((element) => element.style.transition)).toBe("none");

				const emptyCanvasBox = await emptyCanvas.boundingBox();
				const tipBox = await tip.boundingBox();
				const footerBox = await footer.boundingBox();
				expect(
					emptyCanvasBox,
					`${expectedTip}: empty canvas should have rendered geometry`,
				).not.toBeNull();
				expect(tipBox, `${expectedTip}: tip should have rendered geometry`).not.toBeNull();
				expect(footerBox, `${expectedTip}: footer should have rendered geometry`).not.toBeNull();
				if (!emptyCanvasBox || !tipBox || !footerBox) return;
				expect(
					footerBox.y + footerBox.height,
					`${expectedTip}: footer should remain inside the empty canvas`,
				).toBeLessThanOrEqual(emptyCanvasBox.y + emptyCanvasBox.height);
				expect(
					tipBox.y + tipBox.height,
					`${expectedTip}: tip bottom should not cross footer top`,
				).toBeLessThanOrEqual(footerBox.y);

				const result = await scanAccessibility(page, {
					include: [`${tipSelector}, ${footerTargetSelector}`],
				});
				expect(
					result.incomplete.map((entry) => entry.id),
					`${expectedTip}: tip/footer axe results should be complete`,
				).toEqual([]);
				expect(
					result.violations
						.filter((entry) => entry.id === "color-contrast")
						.flatMap((entry) => entry.nodes.map((node) => node.target.join(" > "))),
					`${expectedTip}: tip/footer targets should pass color contrast`,
				).toEqual([]);
				expect(
					result.passes.find((entry) => entry.id === "color-contrast")?.nodes,
					`${expectedTip}: axe should measure all four tip/footer contrast targets`,
				).toHaveLength(4);
			});
		}

		const longestTip = TIPS.reduce((longest, tip) => (tip.length > longest.length ? tip : longest));
		const longestTipIndex = TIPS.indexOf(longestTip);
		for (const height of [800, 851]) {
			await test.step(`longest tip stays contained at 1280x${height}`, async () => {
				await page.setViewportSize({ width: 1280, height });
				await page.goto(`/app?e2eTipIndex=${longestTipIndex}`);

				const emptyCanvas = page.getByTestId("empty-canvas");
				const tip = page.locator(tipSelector);
				const footer = emptyCanvas.locator("footer");
				await expect(tip).toHaveText(longestTip);

				const emptyCanvasBox = await emptyCanvas.boundingBox();
				const tipBox = await tip.boundingBox();
				const footerBox = await footer.boundingBox();
				expect(emptyCanvasBox).not.toBeNull();
				expect(tipBox).not.toBeNull();
				expect(footerBox).not.toBeNull();
				if (!emptyCanvasBox || !tipBox || !footerBox) return;
				expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(
					emptyCanvasBox.y + emptyCanvasBox.height,
				);
				expect(tipBox.y + tipBox.height).toBeLessThanOrEqual(footerBox.y);
			});
		}

		const emptyCanvas = page.getByTestId("empty-canvas");
		const footer = emptyCanvas.locator("footer");
		const githubButton = footer.getByRole("button", { name: /GitHub/ });
		await expect(githubButton).toBeEnabled();
		// Exercise the real window.open path without making the regression depend on GitHub uptime.
		await page
			.context()
			.route(/^https:\/\/github\.com\/exit-zero-labs\/threat-forge\/?$/, (route) =>
				route.fulfill({ status: 200, contentType: "text/html", body: "" }),
			);
		const popupPromise = page.waitForEvent("popup");
		await githubButton.click();
		const popup = await popupPromise;
		await expect(popup).toHaveURL(/^https:\/\/github\.com\/exit-zero-labs\/threat-forge\/?$/);
		await popup.close();

		const templateButton = emptyCanvas.getByRole("button", { name: /E-Commerce Platform/ });
		await expect(templateButton).toBeEnabled();
		await templateButton.click();
		await expect(emptyCanvas).toBeHidden();
		await expect(page.getByTestId("canvas-area")).toBeVisible();
		await expect(page.locator(".react-flow__node").first()).toBeVisible();
	});

	test("pre-model component library is keyboard-scrollable with no unexcepted serious/critical violations", async ({
		page,
	}) => {
		await installDeterministicClock(page);
		await page.goto("/app");
		await expect(page.getByTestId("empty-canvas")).toBeVisible();

		const palette = page.getByTestId("component-palette");
		const componentList = palette.getByRole("region", {
			name: "Library components",
			exact: true,
		});
		const categoryTabCount = await palette.getByRole("button").count();

		await page.getByTestId("library-search").click();
		for (let tab = 0; tab <= categoryTabCount; tab++) {
			await page.keyboard.press("Tab");
		}
		await expect(componentList).toBeFocused();

		const initialScroll = await componentList.evaluate((element) => ({
			top: element.scrollTop,
			height: element.scrollHeight,
			viewportHeight: element.clientHeight,
		}));
		expect(initialScroll.height).toBeGreaterThan(initialScroll.viewportHeight);

		await page.keyboard.press("ArrowDown");
		await expect
			.poll(() => componentList.evaluate((element) => element.scrollTop))
			.toBeGreaterThan(initialScroll.top);

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
