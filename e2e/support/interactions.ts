import type { Download, Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { waitForCanvasReady } from "../fixtures";

/**
 * Typed cross-spec interaction helpers (issue #65, D2/D7).
 *
 * Every helper takes a `Page` (and, where relevant, a `Locator` or plain scenario data) — never a
 * raw CSS/testid selector string — so calling code in a spec reads as behavior, not selectors.
 * Each helper wraps its own body in `test.step` so its name is stable and greppable in the
 * Playwright HTML report and `results.json` (the naming seam `#66` keys off).
 *
 * `test.step` is imported from the raw `@playwright/test` module rather than any extended
 * fixture: Playwright tracks the active step against the currently running test regardless of
 * which extended `test` object started it, so this module works unmodified from any spec — one
 * built on `fixtures.ts`'s `test`, on `support/base.ts`'s `failureAwareTest`, or (in
 * `workspace-fixtures.spec.ts`) either.
 */

/** Open a new, empty document via the always-present tab-strip "+" control. */
export async function createDocument(page: Page): Promise<void> {
	await test.step("createDocument: open a new tab via the tab-strip control", async () => {
		await page.getByTestId("btn-new-document").click();
		await waitForCanvasReady(page);
	});
}

/**
 * Open `fixturePath` through the real Open-file dialog. Resolves once the file has been handed to
 * the browser; the caller asserts the resulting state (or the resulting `window.alert` for a
 * malformed file) itself.
 */
export async function openDocument(page: Page, fixturePath: string): Promise<void> {
	await test.step(`openDocument: open ${fixturePath} via the Open dialog`, async () => {
		const chooserPromise = page.waitForEvent("filechooser");
		await page.getByTestId("btn-open").click();
		const chooser = await chooserPromise;
		await chooser.setFiles(fixturePath);
	});
}

/** Activate a tab by its order-based role index or its stable document-id-based test id. */
export async function switchToTab(
	page: Page,
	locate: { index: number } | { documentId: string },
): Promise<void> {
	const label = "index" in locate ? `index ${locate.index}` : `document ${locate.documentId}`;
	await test.step(`switchToTab: activate tab (${label})`, async () => {
		const tab =
			"index" in locate
				? page.getByRole("tab").nth(locate.index)
				: page.getByTestId(`document-tab-${locate.documentId}`).getByRole("tab");
		await tab.click();
		await expect(tab).toHaveAttribute("aria-selected", "true");
	});
}

/** Locate a canvas node by its visible name, click it, and return the Locator for chaining. */
export async function clickElementByName(page: Page, name: string): Promise<Locator> {
	return test.step(`clickElementByName: select node "${name}"`, async () => {
		const node = page.locator("[data-testid^='node-']").filter({ hasText: name });
		await node.click();
		const testId = await node.getAttribute("data-testid");
		if (!testId) throw new Error(`clickElementByName: "${name}" has no data-testid`);
		return page.getByTestId(testId);
	});
}

/**
 * Drag `element` by `(dx, dy)` from its bounding-box center via a raw mouse down/move/up gesture —
 * the exact mechanic already proven in `canvas-handles.spec.ts`.
 */
export async function dragElementBy(
	page: Page,
	element: Locator,
	dx: number,
	dy: number,
): Promise<void> {
	await test.step(`dragElementBy: drag element by (${dx}, ${dy})`, async () => {
		const box = await element.boundingBox();
		if (!box) throw new Error("dragElementBy: element has no bounding box");
		const startX = box.x + box.width / 2;
		const startY = box.y + box.height / 2;
		await page.mouse.move(startX, startY);
		await page.mouse.down();
		await page.mouse.move(startX + dx, startY + dy, { steps: 10 });
		await page.mouse.up();
	});
}

/**
 * Drag a connection from `source`'s handle to `target`'s handle, defaulting to the confirmed
 * `right-source` -> `left-target` pair, and assert exactly one new `.react-flow__edge` appears.
 */
export async function connectElements(
	page: Page,
	source: Locator,
	target: Locator,
	opts?: { sourceHandle?: string; targetHandle?: string },
): Promise<void> {
	const sourceHandleId = opts?.sourceHandle ?? "right-source";
	const targetHandleId = opts?.targetHandle ?? "left-target";
	await test.step(`connectElements: connect ${sourceHandleId} -> ${targetHandleId}`, async () => {
		const sourceHandle = source.locator(`[data-handleid='${sourceHandleId}']`);
		const targetHandle = target.locator(`[data-handleid='${targetHandleId}']`);
		const edgesBefore = await page.locator(".react-flow__edge").count();

		const sourceBox = await sourceHandle.boundingBox();
		const targetBox = await targetHandle.boundingBox();
		if (!sourceBox || !targetBox) {
			throw new Error("connectElements: source or target handle has no bounding box");
		}

		await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
		await page.mouse.down();
		await page.mouse.move(
			sourceBox.x + sourceBox.width / 2 + 60,
			sourceBox.y + sourceBox.height / 2 + 40,
			{
				steps: 5,
			},
		);
		await expect(targetHandle).toHaveCSS("opacity", "1");
		await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
			steps: 10,
		});
		await page.mouse.up();

		await expect(page.locator(".react-flow__edge")).toHaveCount(edgesBefore + 1);
	});
}

/**
 * Click `element`, fill the right-panel "Name" input, and assert the canvas node reflects the new
 * name. Re-locates the node by its stable `data-testid` (read before the rename) rather than by
 * name, so the assertion is not defeated by the very rename it is proving.
 */
export async function editElementName(
	page: Page,
	element: Locator,
	newName: string,
): Promise<void> {
	await test.step(`editElementName: rename element to "${newName}"`, async () => {
		await element.click();
		const testId = await element.getAttribute("data-testid");
		if (!testId) throw new Error("editElementName: element has no data-testid");

		const nameInput = page
			.getByTestId("right-panel")
			.locator("label")
			.filter({ hasText: "Name" })
			.locator("input");
		await nameInput.fill(newName);

		await expect(page.getByTestId(testId)).toContainText(newName);
	});
}

/**
 * Click the toolbar Save button and return the real browser download it produces. Distinct from
 * and must not be confused with the automatic, no-user-action IndexedDB workspace autosave
 * (`useWorkspacePersistence`) — this is the explicit `.thf` file download.
 */
export async function saveDocument(page: Page): Promise<Download> {
	return test.step("saveDocument: save via the toolbar Save button", async () => {
		const [download] = await Promise.all([
			page.waitForEvent("download"),
			page.getByTestId("btn-save").click(),
		]);
		return download;
	});
}

/** Click the toolbar Export button and return the real browser download it produces. */
export async function exportHtmlReport(page: Page): Promise<Download> {
	return test.step("exportHtmlReport: export via the toolbar Export button", async () => {
		const [download] = await Promise.all([
			page.waitForEvent("download"),
			page.getByTestId("btn-export").click(),
		]);
		return download;
	});
}

/**
 * Reload the page and wait for the stable post-reload shell anchors (status bar, new-document
 * control) to be visible. Does not wait for every tab's hydration; spec-specific assertions do
 * that.
 */
export async function restoreWorkspace(page: Page): Promise<void> {
	await test.step("restoreWorkspace: reload and wait for the interactive shell", async () => {
		await page.reload();
		await expect(page.getByTestId("status-bar")).toBeVisible();
		await expect(page.getByTestId("btn-new-document")).toBeVisible();
	});
}

/**
 * Wait for the observable local-save state to settle on the just-made edit: "Saving locally..."
 * then "Saved locally", in that order. Promoted verbatim from `browser-restore.spec.ts`.
 *
 * Every content change synchronously flips the indicator to "Saving locally..." (the hook calls
 * `markInFlight(..., "pending")` inside the store subscription, before the 1s debounce fires), so
 * asserting that state first guarantees the caller is tracking *this* edit's write rather than a
 * stale "Saved locally" left by an earlier one. Only then does it wait for the commit. No sleeps.
 *
 * Gating a reload on this commit also makes the persisted active-document pointer deterministic
 * for a real reason, not a dev artifact: the active document records itself as the persisted
 * active tab only once *its own* write commits while it is still active, so waiting for that
 * edit to save settles the pointer before the reload. (A bare tab switch records the incoming
 * document's pointer synchronously; an in-flight write for the document the user switched away
 * from is deliberately prevented from clobbering that pointer, so it cannot reopen the wrong tab
 * on reload.)
 */
export async function waitForLocalSave(page: Page): Promise<void> {
	await test.step("waitForLocalSave: wait for this edit's local save to commit", async () => {
		const status = page.getByTestId("local-persistence-status");
		await expect(status).toHaveText("Saving locally...");
		await expect(status).toHaveText("Saved locally", { timeout: 15000 });
	});
}

/**
 * Open `count` documents via the always-present new-document button, in the strip. Promoted
 * verbatim from `document-tabs.spec.ts`.
 */
export async function openDocuments(page: Page, count: number): Promise<void> {
	await test.step(`openDocuments: open ${count} documents via the tab-strip control`, async () => {
		for (let i = 1; i <= count; i++) {
			await page.getByTestId("btn-new-document").click();
			await expect(page.getByRole("tab")).toHaveCount(i);
		}
	});
}
