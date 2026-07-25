import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { createDocumentId } from "@/lib/document-id";
import {
	STORE_DOCUMENTS,
	STORE_REVISIONS,
	WORKSPACE_DB_VERSION,
} from "@/lib/persistence/migrations";
import type { WorkspaceManifestEntry } from "@/lib/persistence/types";
import { WORKSPACE_STORAGE_NAMESPACE } from "@/lib/persistence/types";
import { addPaletteItem, createModel } from "../fixtures";
import { DETERMINISTIC_FIXTURE_TIME, installDeterministicClock } from "./base";
import { openDocument, openDocuments, waitForLocalSave } from "./interactions";

/**
 * Versioned browser workspace fixtures (issue #65, D1).
 *
 * Nine named states, each seeded and returned once fully settled. Fixtures 1-5 seed exclusively
 * through the app's own public storage/file interfaces (click, template card, Open dialog) —
 * zero raw IndexedDB/localStorage writes. Fixtures 6-9 are the one place a test-adapter is
 * unavoidable: there is no public UI action that disables IndexedDB, forces a write to fail, or
 * hand-corrupts a stored revision. Every `test.step` name below includes
 * {@link WORKSPACE_FIXTURE_VERSION} so a future shape change is visible in the trace/report
 * history rather than silently overwritten; bump the constant, this file's affected function, and
 * the plan's Replan log together.
 */
export const WORKSPACE_FIXTURE_VERSION = 1 as const;

/** The subset of Zustand's wrapper this fixture reads and mutates; all other fields stay opaque. */
interface PersistedWorkspaceWrapper {
	state: {
		documents: unknown[];
		activeDocumentId: string | null;
		[key: string]: unknown;
	};
	version: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isPersistedWorkspaceWrapper(value: unknown): value is PersistedWorkspaceWrapper {
	if (!isRecord(value) || typeof value.version !== "number" || !isRecord(value.state)) return false;
	const state = value.state;
	return (
		Array.isArray(state.documents) &&
		(state.activeDocumentId === null || typeof state.activeDocumentId === "string")
	);
}

/** Read and parse the workspace manifest wrapper from localStorage, or throw if absent. */
async function readManifestWrapper(page: Page): Promise<PersistedWorkspaceWrapper> {
	const raw = await page.evaluate(
		(namespace) => localStorage.getItem(namespace),
		WORKSPACE_STORAGE_NAMESPACE,
	);
	if (!raw) throw new Error(`No "${WORKSPACE_STORAGE_NAMESPACE}" localStorage entry was found.`);
	const parsed: unknown = JSON.parse(raw);
	if (!isPersistedWorkspaceWrapper(parsed)) {
		throw new Error(
			`The "${WORKSPACE_STORAGE_NAMESPACE}" localStorage entry has an invalid wrapper shape.`,
		);
	}
	return parsed;
}

/** Write the full wrapper back to localStorage, replacing it wholesale. */
async function writeManifestWrapper(page: Page, wrapper: PersistedWorkspaceWrapper): Promise<void> {
	await page.evaluate(
		({ namespace, wrapper }) => {
			localStorage.setItem(namespace, JSON.stringify(wrapper));
		},
		{ namespace: WORKSPACE_STORAGE_NAMESPACE, wrapper },
	);
}

/** Establish the app origin with every page-side timestamp fixed to the fixture instant. */
async function openDeterministicApp(page: Page): Promise<void> {
	await installDeterministicClock(page);
	await page.goto("/app");
}

/**
 * 1. Empty workspace: a fresh document with no elements or flows, seeded through the public
 *    "New Model" action.
 */
export async function seedEmptyWorkspace(page: Page): Promise<void> {
	await test.step(`seed:empty@v${WORKSPACE_FIXTURE_VERSION}`, async () => {
		await openDeterministicApp(page);
		await createModel(page);
	});
}

/**
 * 2. Realistic workspace: the public "E-Commerce Platform" starter template (13 elements, 13
 *    flows, 3 trust boundaries, 5 threats), loaded with the clock anchored first since
 *    `loadTemplate` stamps `metadata.created`/`metadata.modified` with `new Date()`.
 */
export async function seedRealisticWorkspace(page: Page): Promise<void> {
	await test.step(`seed:realistic@v${WORKSPACE_FIXTURE_VERSION}`, async () => {
		await openDeterministicApp(page);
		await page.getByTestId("empty-canvas").waitFor({ state: "visible" });
		await page.getByTestId("template-ecommerce-platform").click();
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(13);
		await expect(page.locator("[data-testid^='edge-']")).toHaveCount(13);
		await expect(page.locator(".react-flow__node-trustBoundary")).toHaveCount(3);
		await expect(page.getByTestId("canvas-count-badge")).toHaveAttribute(
			"aria-label",
			"Canvas summary: 13 components, 13 data flows, 5 identified threats, 4 mitigated threats",
		);
	});
}

/**
 * 3. Large workspace: the committed 150-element/100-flow `.thf` fixture (D8), opened through the
 *    real Open-file dialog. The 5000ms bound is generous but not unbounded, mirroring this repo's
 *    existing bounded-timeout convention (`addPaletteItem`, `waitForLocalSave`).
 */
export async function seedLargeWorkspace(page: Page): Promise<void> {
	await test.step(`seed:large@v${WORKSPACE_FIXTURE_VERSION}`, async () => {
		await openDeterministicApp(page);
		const startedAt = performance.now();
		await openDocument(page, "e2e/fixtures/large-model.thf");
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(150, { timeout: 5000 });
		await expect(page.locator("[data-testid^='edge-']")).toHaveCount(100, { timeout: 5000 });
		const elapsed = performance.now() - startedAt;
		expect(elapsed, `large workspace rendered in ${elapsed.toFixed(1)}ms`).toBeLessThan(5000);
	});
}

/**
 * 4. Malformed workspace: opening the shared, reused corpus fixture
 *    `tests/fixtures/thf/invalid/truncated.thf` (never duplicated) produces the complete,
 *    user-visible `Open failed:`-prefixed alert and leaves the canvas unchanged. The dialog
 *    listener is registered before the open is triggered, per Playwright's dialog-handling
 *    contract, and returns the captured message so the caller asserts the exact string.
 */
export async function seedMalformedWorkspace(page: Page): Promise<string> {
	return test.step(`seed:malformed@v${WORKSPACE_FIXTURE_VERSION}`, async () => {
		await openDeterministicApp(page);
		const alertMessage = new Promise<string>((resolve, reject) => {
			page.once("dialog", (dialog) => {
				const message = dialog.message();
				dialog.dismiss().then(
					() => resolve(message),
					(error: unknown) => reject(error),
				);
			});
		});
		await openDocument(page, "tests/fixtures/thf/invalid/truncated.thf");
		return alertMessage;
	});
}

/**
 * 5. Multi-tab workspace: ten open documents via the promoted `openDocuments` helper, reusing
 *    `#54`'s "at least ten" bound rather than increasing it.
 */
export async function seedMultiTabWorkspace(page: Page): Promise<void> {
	await test.step(`seed:multi-tab@v${WORKSPACE_FIXTURE_VERSION}`, async () => {
		await openDeterministicApp(page);
		await openDocuments(page, 10);
	});
}

/**
 * 6. Ephemeral workspace (recovery): `window.indexedDB` is removed before navigation, the one
 *    test-adapter technique with no public-UI equivalent for forcing storage unavailability. The
 *    app boots into degraded mode and the status bar announces "This session won't be saved".
 */
export async function seedEphemeralWorkspace(page: Page): Promise<void> {
	await test.step(`seed:ephemeral@v${WORKSPACE_FIXTURE_VERSION}`, async () => {
		await page.addInitScript(() => {
			Object.defineProperty(window, "indexedDB", { value: undefined });
		});
		await openDeterministicApp(page);
		await expect(page.getByTestId("local-persistence-status")).toHaveText(
			"This session won't be saved",
		);
	});
}

/**
 * 7. Write-failure workspace (recovery): a document is created and its first write commits
 *    normally through the public path, then `IDBObjectStore.prototype.put` is monkeypatched to
 *    throw before one more edit is made. That edit's write fails, flipping the status to "Not
 *    saved locally" and emitting exactly one `console.warn` — the only production `console.warn`
 *    reachable from ordinary browser flows. The calling test, not this helper, scopes the single
 *    channel-scoped, fully anchored `allowedBrowserEvents` exception for that warning. The helper
 *    returns only after the visible failure state settles; the caller separately asserts the
 *    warning count.
 */
export async function seedWriteFailureWorkspace(page: Page): Promise<void> {
	await test.step(`seed:write-failure@v${WORKSPACE_FIXTURE_VERSION}`, async () => {
		await openDeterministicApp(page);
		await createModel(page);
		await expect(page.getByTestId("local-persistence-status")).toContainText("Saved locally");

		await page.evaluate(() => {
			IDBObjectStore.prototype.put = () => {
				throw new DOMException("forced failure", "UnknownError");
			};
		});

		await addPaletteItem(page, "palette-item-generic");
		await expect(page.getByTestId("local-persistence-status")).toHaveText("Not saved locally", {
			timeout: 15000,
		});
	});
}

/**
 * 8. Stale-manifest workspace (recovery): production creates one real, fully-persisted document
 *    (the complete IndexedDB schema and exact Zustand localStorage wrapper), then exactly one
 *    manifest-only orphan entry — no backing IndexedDB record — is appended to the existing
 *    wrapper, preserving every other field, before a reload. No IndexedDB store is created or
 *    rewritten by this fixture. The orphan id uses the canonical `createDocumentId` contract
 *    against Node's cryptographic random source, including its fail-closed behavior.
 */
export async function seedStaleManifestWorkspace(
	page: Page,
): Promise<{ manifestCountBeforeReload: number; orphanPresentBeforeReload: boolean }> {
	return test.step(`seed:stale-manifest@v${WORKSPACE_FIXTURE_VERSION}`, async () => {
		await openDeterministicApp(page);
		await createModel(page);
		await waitForLocalSave(page);

		const wrapper = await readManifestWrapper(page);
		const orphan: WorkspaceManifestEntry = {
			id: createDocumentId(),
			title: "Orphaned Tab",
			filePath: null,
			order: wrapper.state.documents.length,
			createdAt: DETERMINISTIC_FIXTURE_TIME,
			updatedAt: DETERMINISTIC_FIXTURE_TIME,
		};
		wrapper.state.documents.push(orphan);
		await writeManifestWrapper(page, wrapper);
		const seededWrapper = await readManifestWrapper(page);
		const result = {
			manifestCountBeforeReload: seededWrapper.state.documents.length,
			orphanPresentBeforeReload: seededWrapper.state.documents.some(
				(entry) => isRecord(entry) && entry.id === orphan.id,
			),
		};

		await page.reload();
		await expect(page.getByRole("tab")).toHaveCount(1);
		await expect(page.getByRole("tab").first()).toHaveAttribute("aria-selected", "true");
		return result;
	});
}

/**
 * 9. Corrupt-sole-document workspace (recovery): production creates one real, fully-persisted
 *    document, then only its current IndexedDB revision body is replaced with invalid YAML — the
 *    document pointer, index, meta store/markers, manifest wrapper, and every other revision field
 *    are untouched. Per `use-workspace-restore.ts`'s own doc comment and this plan's direct
 *    empirical confirmation, a corrupt sole document today renders a selected-but-unhydrated tab
 *    and an empty canvas with **no** error text — the "Recovery needed" text this store state
 *    could in principle drive is `#55`'s unbuilt UI, not a regression this fixture is silently
 *    covering up (D9).
 */
export async function seedCorruptSoleDocumentWorkspace(page: Page): Promise<void> {
	await test.step(`seed:corrupt-sole-document@v${WORKSPACE_FIXTURE_VERSION}`, async () => {
		await openDeterministicApp(page);
		await createModel(page);
		await waitForLocalSave(page);

		const wrapper = await readManifestWrapper(page);
		const documentId = wrapper.state.activeDocumentId;
		if (!documentId) throw new Error("seedCorruptSoleDocumentWorkspace: no active document id.");

		await page.evaluate(
			({ dbName, dbVersion, documentsStore, revisionsStore, documentId: id }) => {
				return new Promise<void>((resolve, reject) => {
					const openRequest = indexedDB.open(dbName, dbVersion);
					openRequest.onerror = () => reject(openRequest.error);
					openRequest.onsuccess = () => {
						const db = openRequest.result;
						const tx = db.transaction([documentsStore, revisionsStore], "readwrite");
						tx.oncomplete = () => {
							db.close();
							resolve();
						};
						tx.onerror = () => {
							db.close();
							reject(tx.error);
						};
						tx.onabort = () => {
							db.close();
							reject(tx.error);
						};

						const pointerRequest = tx.objectStore(documentsStore).get(id);
						pointerRequest.onerror = () => reject(pointerRequest.error);
						pointerRequest.onsuccess = () => {
							const pointer: unknown = pointerRequest.result;
							if (
								typeof pointer !== "object" ||
								pointer === null ||
								!("currentRevisionId" in pointer) ||
								typeof pointer.currentRevisionId !== "string"
							) {
								reject(new Error(`No stored document pointer for ${id}.`));
								return;
							}
							const revisions = tx.objectStore(revisionsStore);
							const revisionRequest = revisions.get(pointer.currentRevisionId);
							revisionRequest.onerror = () => reject(revisionRequest.error);
							revisionRequest.onsuccess = () => {
								const revision: unknown = revisionRequest.result;
								if (typeof revision !== "object" || revision === null) {
									reject(new Error(`No stored revision ${pointer.currentRevisionId}.`));
									return;
								}
								revisions.put({ ...revision, thf: "not: valid: yaml: [" });
							};
						};
					};
				});
			},
			{
				dbName: WORKSPACE_STORAGE_NAMESPACE,
				dbVersion: WORKSPACE_DB_VERSION,
				documentsStore: STORE_DOCUMENTS,
				revisionsStore: STORE_REVISIONS,
				documentId,
			},
		);

		await page.reload();
		await expect(page.getByRole("tab")).toHaveCount(1);
		await expect(page.getByRole("tab").first()).toHaveAttribute("aria-selected", "true");
		await expect(page.getByTestId("empty-canvas")).toBeVisible();
	});
}
