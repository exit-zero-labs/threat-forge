import type { Page } from "@playwright/test";
import { addPaletteItem, expect, test, waitForCanvasReady } from "./fixtures";

/**
 * Browser workspace restore across a real page reload (issue #56, plan step 8 / D4).
 *
 * These are the real-browser assertions the unit suites cannot make: the `fake-indexeddb`
 * hook tests prove the read/write/reconcile logic, but only a live reload exercises the whole
 * boundary end to end — a user-visible edit, the debounced IndexedDB write, the localStorage
 * manifest, a genuine navigation, and the after-paint hydration that rebuilds the workspace.
 *
 * Storage isolation: every Playwright test runs in its own browser context, so each test starts
 * with empty IndexedDB and localStorage and cannot see another test's persisted workspace. The
 * only shared init is {@link suppressFirstRunOverlays} (via the `test` fixture), which seeds the
 * onboarding/What's-New keys — it writes nothing under the workspace or IndexedDB namespaces.
 */

/** The right-panel "Name" input for the currently selected element. */
function elementNameInput(page: Page) {
	return page
		.getByTestId("right-panel")
		.locator("label")
		.filter({ hasText: "Name" })
		.locator("input");
}

/**
 * Wait for the observable local-save state to settle on the just-made edit.
 *
 * Every content change synchronously flips the indicator to "Saving locally..." (the hook calls
 * `markInFlight(..., "pending")` inside the store subscription, before the 1s debounce fires), so
 * asserting that state first guarantees we are tracking *this* edit's write rather than reading a
 * stale "Saved locally" left by an earlier one. Only then do we wait for the commit. No sleeps.
 *
 * Gating a reload on this commit also makes the persisted active-document pointer deterministic for
 * a real reason, not a dev artifact: the active document records itself as the persisted active tab
 * only once *its own* write commits while it is still active, so waiting for that edit to save
 * settles the pointer before the reload. (A bare tab switch records the incoming document's pointer
 * synchronously; an in-flight write for the document the user switched away from is deliberately
 * prevented from clobbering that pointer, so it cannot reopen the wrong tab on reload.)
 */
async function waitForLocalSave(page: Page) {
	const status = page.getByTestId("local-persistence-status");
	await expect(status).toHaveText("Saving locally...");
	await expect(status).toHaveText("Saved locally", { timeout: 15000 });
}

/** Rename the currently selected element and wait for that edit to save locally. */
async function renameSelectedElement(page: Page, elementName: string) {
	await elementNameInput(page).fill(elementName);
	await expect(page.locator("[data-testid^='node-']").first()).toContainText(elementName);
	await waitForLocalSave(page);
}

/**
 * Open a fresh browser document, drop one generic element, and give it a distinct, user-visible
 * name so the same content can be recognised after a reload. Returns once the named edit is
 * durably saved to local storage.
 */
async function createNamedDocument(page: Page, elementName: string) {
	await page.getByTestId("btn-new-document").click();
	await waitForCanvasReady(page);
	await addPaletteItem(page, "palette-item-generic");

	const node = page.locator("[data-testid^='node-']").first();
	await node.click();
	await renameSelectedElement(page, elementName);
}

test.describe("Browser workspace restore across reload", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/app");
	});

	test("a document's edit survives a page reload and returns as content, not a reset", async ({
		page,
	}) => {
		await createNamedDocument(page, "Restore Marker Alpha");

		await page.reload();

		// First paint is the interactive workspace shell: the status bar and the always-present
		// new-document control are both visible immediately after the reload. These are stable
		// session-long anchors, so asserting them proves the shell is present and interactive without
		// timing guesses. It does NOT claim a transient blocking spinner never appeared — a
		// post-reload check cannot observe a spinner that has already gone; the deterministic
		// no-blocking-first-paint proof is the delayed-read unit test in
		// `document-tab-strip.restore.test.tsx`, which renders the strip while hydration is still
		// pending and asserts the tablist is already interactive.
		await expect(page.getByTestId("status-bar")).toBeVisible();
		await expect(page.getByTestId("btn-new-document")).toBeVisible();

		// The edit came back: the restored canvas holds exactly the one named element, hydrated from
		// IndexedDB, rather than a blank/reset model.
		const nodes = page.locator("[data-testid^='node-']");
		await expect(nodes).toHaveCount(1);
		await expect(nodes.first()).toContainText("Restore Marker Alpha");
	});

	test("reload restores every open tab in persisted order and hydrates an inactive one on demand", async ({
		page,
	}) => {
		// Two documents with distinct content; the second is the last-created and stays active. No
		// tab switch, so the persisted active pointer is unambiguously the newest document.
		await createNamedDocument(page, "Alpha Service");
		await createNamedDocument(page, "Bravo Service");
		await expect(page.getByRole("tab")).toHaveCount(2);

		await page.reload();

		// The whole workspace comes back, not just the active document: both tabs render even though
		// boot restore hydrated only the active Bravo. Before the #54/#56 rendering seam was closed,
		// the inactive tab was missing entirely here because the strip rendered only the registry's
		// hydrated documents — so this count is the assertion that fails on the bug.
		const tabs = page.getByRole("tab");
		await expect(tabs).toHaveCount(2);

		// Persisted order is creation order [Alpha, Bravo], and the persisted active pointer is the
		// last-created Bravo. So exactly the second tab is selected, and it hydrates to Bravo's own
		// body — one element carrying "Bravo Service". That discriminates against the two
		// plausible-but-wrong restores: a blank document (empty-model hydration) and the sibling's
		// content (Alpha), the other document that also exists in IndexedDB. (Both tabs share the
		// label "Untitled Threat Model" — the edit renamed an element, not the document — so the
		// distinguishing evidence is the selected tab's rendered content, not its accessible name.)
		await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "false");
		await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
		const nodes = page.locator("[data-testid^='node-']");
		await expect(nodes).toHaveCount(1);
		await expect(nodes.first()).toContainText("Bravo Service");
		await expect(nodes.first()).not.toContainText("Alpha Service");

		// Activating the inactive, still-un-hydrated first tab reads its own body from IndexedDB on
		// demand and shows Alpha's distinct content — proving the tab at index 0 is Alpha (persisted
		// order holds), that lazy hydration works per-tab, and that it resurrects neither the
		// sibling's model nor a blank one.
		await tabs.nth(0).click();
		await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
		await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "false");
		await expect(nodes).toHaveCount(1);
		await expect(nodes.first()).toContainText("Alpha Service");
		await expect(nodes.first()).not.toContainText("Bravo Service");
	});

	test("reload honors the active-document choice over creation order", async ({ page }) => {
		// Bravo is created last, but the user then switches to Alpha and keeps editing it. Gating on
		// Alpha's edit save durably records Alpha as the active document (see waitForLocalSave).
		await createNamedDocument(page, "Alpha Service");
		await createNamedDocument(page, "Bravo Service");

		const tabs = page.getByRole("tab");
		await tabs.nth(0).click();
		await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
		const alphaNode = page.locator("[data-testid^='node-']").first();
		await expect(alphaNode).toContainText("Alpha Service");
		await alphaNode.click();
		await renameSelectedElement(page, "Alpha Service Edited");

		await page.reload();

		// Restore follows the persisted active document (Alpha with its latest edit), not the
		// last-created document (Bravo). Proving Alpha's edited, non-empty body returns rules out
		// both an "always reopen the newest" bug and an empty-model hydration.
		const nodes = page.locator("[data-testid^='node-']");
		await expect(nodes).toHaveCount(1);
		await expect(nodes.first()).toContainText("Alpha Service Edited");
		await expect(nodes.first()).not.toContainText("Bravo Service");
	});
});
