import { addPaletteItem, expect, test } from "./fixtures";
import {
	clickElementByName,
	connectElements,
	createDocument,
	dragElementBy,
	editElementName,
	exportHtmlReport,
	restoreWorkspace,
	saveDocument,
	switchToTab,
	waitForLocalSave,
} from "./support/interactions";
import {
	seedCorruptSoleDocumentWorkspace,
	seedEmptyWorkspace,
	seedEphemeralWorkspace,
	seedLargeWorkspace,
	seedMalformedWorkspace,
	seedMultiTabWorkspace,
	seedRealisticWorkspace,
	seedStaleManifestWorkspace,
	seedWriteFailureWorkspace,
} from "./support/workspace-fixtures";

const WRITE_FAILURE_WARNING =
	/^Workspace persistence failed for doc-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12} \(unknown\); changes are kept in memory\.$/;

/**
 * Discriminating proof for every workspace fixture (issue #65, step 6).
 *
 * One test per fixture in the plan's D1 table, each asserting exactly that fixture's
 * "renders/asserts" column — plus one test proving the failure-aware base's console/pageerror
 * policy is not a no-op. Like every other non-onboarding spec (D6), these tests run on
 * {@link test}/{@link expect} imported from `./fixtures`, which layers first-run overlay
 * suppression on top of `support/base.ts`'s failure-aware `page` fixture — none of these fixtures
 * is testing onboarding itself, so a stray "What's new"/welcome overlay must not block them. The
 * underlying `allowedBrowserEvents` option fixture and failure-teardown behavior are unchanged
 * because `fixtures.ts`'s `test` extends `support/base.ts`'s `failureAwareTest` rather than
 * replacing it.
 */

test("seedEmptyWorkspace renders a document with no elements or flows", async ({ page }) => {
	await seedEmptyWorkspace(page);
	await expect(page.locator("[data-testid^='node-']")).toHaveCount(0);
	await expect(page.locator("[data-testid^='edge-']")).toHaveCount(0);
	await expect(page.getByTestId("empty-canvas")).toHaveCount(0);
	await expect(page.locator(".react-flow__pane")).toBeVisible();
});

test("seedRealisticWorkspace renders the e-commerce template's full topology", async ({ page }) => {
	await seedRealisticWorkspace(page);
	await expect(page.locator("[data-testid^='node-']")).toHaveCount(13);
	await expect(page.locator("[data-testid^='edge-']")).toHaveCount(13);
	await expect(page.locator(".react-flow__node-trustBoundary")).toHaveCount(3);
	await expect(page.getByTestId("canvas-count-badge")).toHaveAttribute(
		"aria-label",
		"Canvas summary: 13 components, 13 data flows, 5 identified threats, 4 mitigated threats",
	);
});

test("seedLargeWorkspace renders 150 elements and 100 flows within 5000ms", async ({ page }) => {
	await seedLargeWorkspace(page);
	await expect(page.locator("[data-testid^='node-']")).toHaveCount(150, { timeout: 5000 });
	await expect(page.locator("[data-testid^='edge-']")).toHaveCount(100, { timeout: 5000 });
});

test("seedMalformedWorkspace surfaces the complete parse-failure alert and leaves the canvas unchanged", async ({
	page,
}) => {
	// `seedMalformedWorkspace` performs its own `page.goto("/app")`; a second navigation here
	// would abort the first one's in-flight module fetches and produce spurious `requestfailed`
	// noise under the failure-aware policy. The canvas starts (and, per the assertion below,
	// stays) empty on a fresh navigation, so there is nothing to snapshot beforehand.
	const alertMessage = await seedMalformedWorkspace(page);
	expect(alertMessage).toBe(
		"Open failed: This file is not a valid ThreatForge document: it could not be parsed.",
	);
	await expect(page.locator("[data-testid^='node-']")).toHaveCount(0);
});

test("seedMultiTabWorkspace opens ten tabs with the tenth selected", async ({ page }) => {
	await seedMultiTabWorkspace(page);
	await expect(page.getByRole("tab")).toHaveCount(10);
	await expect(page.getByRole("tab").nth(9)).toHaveAttribute("aria-selected", "true");
});

test("seedEphemeralWorkspace announces the session will not be saved", async ({ page }) => {
	await seedEphemeralWorkspace(page);
	await expect(page.getByTestId("local-persistence-status")).toHaveText(
		"This session won't be saved",
	);
});

test.describe("seedWriteFailureWorkspace", () => {
	// Playwright only accepts `test.use()` at file/describe scope, not inside a test body — scoped
	// here to this single describe block so no other test silently inherits this exception (D4).
	test.use({
		allowedBrowserEvents: [{ channel: "console.warning", pattern: WRITE_FAILURE_WARNING }],
	});

	test("flips to Not saved locally and logs exactly one anchored warning", async ({ page }) => {
		const warnings: string[] = [];
		page.on("console", (message) => {
			if (message.type() === "warning") warnings.push(message.text());
		});

		await seedWriteFailureWorkspace(page);
		await expect(page.getByTestId("local-persistence-status")).toHaveText("Not saved locally", {
			timeout: 15000,
		});
		await expect.poll(() => warnings.length).toBe(1);
		expect(warnings[0]).toMatch(WRITE_FAILURE_WARNING);
	});

	test("does not allow the warning text on the console.error channel", async ({ page }) => {
		test.fail();
		await page.goto("/app");
		await page.evaluate(() => {
			console.error(
				"Workspace persistence failed for doc-00000000-0000-0000-0000-000000000000 (unknown); changes are kept in memory.",
			);
		});
	});
});

test("seedStaleManifestWorkspace drops the orphan tab silently and keeps only the real document", async ({
	page,
}) => {
	const seeded = await seedStaleManifestWorkspace(page);
	expect(seeded.manifestCountBeforeReload).toBe(2);
	expect(seeded.orphanPresentBeforeReload).toBe(true);
	await expect(page.getByRole("tab")).toHaveCount(1);
	await expect(page.getByRole("tab").first()).toHaveAttribute("aria-selected", "true");
	// The app remains fully usable: no crash, and a fresh document can still be created.
	await page.getByTestId("btn-new-document").click();
	await expect(page.getByRole("tab")).toHaveCount(2);
});

test("seedCorruptSoleDocumentWorkspace selects an unhydrated tab, shows the empty canvas, and stays interactive", async ({
	page,
}) => {
	// Per D9 and the plan's direct empirical confirmation (`use-workspace-restore.ts`'s own doc
	// comment: "A corrupt record is never deleted and never auto-activated; #55 renders the
	// recovery affordance over this state"), a corrupt sole document today shows no error text at
	// all — not "Recovery needed", nothing. This test asserts exactly that safe-but-silent
	// behavior, not the unreachable #55 UI.
	await seedCorruptSoleDocumentWorkspace(page);
	await expect(page.getByRole("tab")).toHaveCount(1);
	await expect(page.getByRole("tab").first()).toHaveAttribute("aria-selected", "true");
	await expect(page.getByTestId("empty-canvas")).toBeVisible();
	await expect(page.getByText("Recovery needed", { exact: true })).toHaveCount(0);
	// The app stays interactive: a fresh document can still be created afterward.
	await page.getByTestId("btn-new-document").click();
	await expect(page.getByRole("tab")).toHaveCount(2);
	await expect(page.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
});

test("shared interaction helpers execute real create, switch, edit, drag, connect, save, export, and restore workflows", async ({
	page,
}) => {
	await seedEmptyWorkspace(page);
	await createDocument(page);
	const secondTabId = await page.getByRole("tab").nth(1).getAttribute("id");
	if (!secondTabId?.startsWith("tab-doc-")) {
		throw new Error("new document tab is missing its stable id");
	}
	const secondDocumentId = secondTabId.slice("tab-".length);

	await switchToTab(page, { index: 0 });
	await switchToTab(page, { documentId: secondDocumentId });
	await switchToTab(page, { index: 0 });

	await addPaletteItem(page, "palette-item-generic");
	const source = await clickElementByName(page, "Generic");
	await editElementName(page, source, "Source");
	const beforeDrag = await source.boundingBox();
	if (!beforeDrag) throw new Error("source element has no bounding box before drag");
	await dragElementBy(page, source, -250, 200);
	await expect.poll(async () => (await source.boundingBox())?.x).not.toBe(beforeDrag.x);

	await addPaletteItem(page, "palette-item-generic");
	const target = await clickElementByName(page, "Generic");
	await connectElements(page, source, target);
	await waitForLocalSave(page);

	const saved = await saveDocument(page);
	expect(saved.suggestedFilename()).toMatch(/\.thf$/);
	const exported = await exportHtmlReport(page);
	expect(exported.suggestedFilename()).toMatch(/\.html$/);

	await restoreWorkspace(page);
	await expect(page.locator("[data-testid^='node-']").filter({ hasText: "Source" })).toHaveCount(1);
	await expect(page.locator("[data-testid^='edge-']")).toHaveCount(1);
});

test.describe("failure policy is not a no-op", () => {
	test("an unallowed console.error fails the test", async ({ page }) => {
		test.fail();
		await page.goto("/app");
		await page.evaluate(() => {
			console.error("deliberate #65 failure-policy proof: this should fail the test");
		});
	});

	test("an unallowed console.warning fails the test", async ({ page }) => {
		test.fail();
		await page.goto("/app");
		await page.evaluate(() => {
			console.warn("deliberate #65 warning-policy proof: this should fail the test");
		});
	});

	test("an unhandled page error fails the test", async ({ page }) => {
		test.fail();
		await page.goto("/app");
		const pageError = page.waitForEvent("pageerror");
		await page.evaluate(() => {
			queueMicrotask(() => {
				throw new Error("deliberate #65 pageerror-policy proof: this should fail the test");
			});
		});
		await pageError;
	});

	test.describe("failed request channel", () => {
		test.use({
			allowedBrowserEvents: [
				{ channel: "console.error", pattern: /^Failed to load resource: net::ERR_FAILED$/ },
			],
		});

		test("a failed network request fails the test", async ({ page }) => {
			test.fail();
			await page.goto("/app");
			await page.route("**/deliberate-request-failure", (route) => route.abort("failed"));
			const requestFailed = page.waitForEvent("requestfailed");
			await page.evaluate(async () => {
				try {
					await fetch("/deliberate-request-failure");
				} catch {
					// The requestfailed event, not the expected fetch rejection, is the contract under test.
				}
			});
			expect((await requestFailed).url()).toContain("/deliberate-request-failure");
		});
	});
});
