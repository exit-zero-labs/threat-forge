import { act, renderHook } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { useWorkspacePersistence } from "@/hooks/use-workspace-persistence";
import { serializeThreatModelYaml } from "@/lib/thf-yaml";
import { useDocumentRegistry } from "@/stores/document-registry";
import { createDocumentStores, setActiveStores } from "@/stores/document-stores";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { DocumentId } from "@/types/document";
import type { ThreatModel } from "@/types/threat-model";
import { openWorkspaceDb } from "./indexeddb";
import { IndexeddbWorkspaceStorage } from "./indexeddb-workspace-storage";
import { STORE_DOCUMENTS, STORE_META, STORE_REVISIONS } from "./migrations";
import { WORKSPACE_STORAGE_NAMESPACE } from "./types";

/**
 * D6: the no-key-leakage boundary, proven at runtime rather than asserted. The workspace stores
 * hold only `.thf` text and the id/order/title/preferences manifest; a stored API key must never
 * appear in either, and the keychain's `tf-api-key-` namespace stays disjoint.
 */

/**
 * A distinctive marker standing in for whatever the keychain holds. This proof is about namespace
 * disjointness — that a value in the keychain slot never appears in the workspace stores — which is
 * a substring-presence check independent of the value's shape. A deliberately non-credential-shaped
 * canary is used rather than a realistic `sk-...` string, because the storage layers treat every
 * string identically and a key-shaped literal would only be a false credential in a test fixture.
 */
const KEYCHAIN_CANARY = "keychain-only-canary-9f8e7d6c5b4a";
const DOC = "doc-boundary-check" as DocumentId;

/**
 * The localStorage key the browser keychain adapter stores a BYOK key under. Seeded directly rather
 * than through `BrowserKeychainAdapter.setKey`, so this suite depends on nothing from the keychain
 * layer — exactly the disjointness the third case asserts.
 */
const KEYCHAIN_STORAGE_KEY = "tf-api-key-anthropic";

/** Simulate a BYOK user who has configured a key, without touching the keychain adapter. */
function seedConfiguredKey(): void {
	localStorage.setItem(KEYCHAIN_STORAGE_KEY, KEYCHAIN_CANARY);
}

function modelWithoutSecret(): ThreatModel {
	return {
		version: "1.0",
		metadata: {
			title: "Payment Service",
			author: "Tester",
			created: "2026-07-21",
			modified: "2026-07-21",
			description: "A model whose text contains no key material.",
		},
		elements: [],
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [],
	};
}

/** Enumerate every record in every IndexedDB store as one string for substring scanning. */
async function dumpIndexedDb(): Promise<string> {
	const db = await openWorkspaceDb();
	try {
		const stores = [STORE_DOCUMENTS, STORE_REVISIONS, STORE_META];
		const dumps = await Promise.all(
			stores.map(
				(store) =>
					new Promise<unknown[]>((resolve, reject) => {
						const request = db.transaction(store, "readonly").objectStore(store).getAll();
						request.onsuccess = () => resolve(request.result);
						request.onerror = () => reject(request.error);
					}),
			),
		);
		return JSON.stringify(dumps);
	} finally {
		db.close();
	}
}

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	localStorage.clear();
	useDocumentRegistry.setState({ documents: {}, openDocumentIds: [], activeDocumentId: null });
	setActiveStores(createDocumentStores());
	useWorkspaceStore.setState({
		documents: [],
		activeDocumentId: null,
		persistence: {},
		persistenceAvailable: false,
		unavailableReason: null,
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("no key material reaches the workspace stores (D6)", () => {
	it("keeps a stored key out of both IndexedDB and the workspace manifest", async () => {
		// A key is present in the keychain's own namespace, as a configured BYOK user would have.
		seedConfiguredKey();

		// A full persist cycle: durable body plus the manifest projection.
		const storage = new IndexeddbWorkspaceStorage();
		const model = modelWithoutSecret();
		await storage.writeDocumentBody(DOC, serializeThreatModelYaml(model));
		useWorkspaceStore.getState().upsertManifestEntry({
			id: DOC,
			title: model.metadata.title,
			filePath: null,
			order: 0,
			createdAt: "2026-07-21T00:00:00.000Z",
			updatedAt: "2026-07-21T00:00:00.000Z",
		});

		// The secret is in neither durable store.
		expect(await dumpIndexedDb()).not.toContain(KEYCHAIN_CANARY);
		expect(localStorage.getItem(WORKSPACE_STORAGE_NAMESPACE) ?? "").not.toContain(KEYCHAIN_CANARY);

		// The only localStorage key carrying the secret is the keychain's own key.
		const keysCarryingSecret = Object.keys(localStorage).filter((key) =>
			(localStorage.getItem(key) ?? "").includes(KEYCHAIN_CANARY),
		);
		expect(keysCarryingSecret).toEqual([KEYCHAIN_STORAGE_KEY]);
	});

	it("keeps a stored key out of both stores across a real autosave cycle", async () => {
		// The same proof against the production writer rather than a hand-rolled persist: the
		// autosave hook decides *what* is serialized, so it is what could leak a new field.
		seedConfiguredKey();
		const model = modelWithoutSecret();
		model.metadata.settings = { grid_size: 20, default_element_fill: "#anthracite" };

		const id = useDocumentRegistry
			.getState()
			.createDocument({ model, filePath: null, pendingLayout: null });
		useWorkspaceStore.getState().setPersistenceAvailability(true);
		renderHook(() => useWorkspacePersistence());

		await act(async () => {
			// Flush the pending write instead of waiting out the debounce.
			window.dispatchEvent(new Event("pagehide"));
			await vi.waitFor(() => {
				if (useWorkspaceStore.getState().persistence[id]?.status !== "saved") {
					throw new Error("write not committed");
				}
			});
		});

		// The document carries file settings, so the persisted body is a realistic one.
		const dump = await dumpIndexedDb();
		expect(dump).toContain("grid_size");
		expect(dump).not.toContain(KEYCHAIN_CANARY);
		expect(localStorage.getItem(WORKSPACE_STORAGE_NAMESPACE) ?? "").not.toContain(KEYCHAIN_CANARY);
	});

	it("never reads or writes a keychain key during a persist cycle", async () => {
		// Seed the key before spying so only the persistence cycle is observed.
		seedConfiguredKey();

		const getItem = vi.spyOn(Storage.prototype, "getItem");
		const setItem = vi.spyOn(Storage.prototype, "setItem");
		const removeItem = vi.spyOn(Storage.prototype, "removeItem");

		const storage = new IndexeddbWorkspaceStorage();
		await storage.writeDocumentBody(DOC, serializeThreatModelYaml(modelWithoutSecret()));
		useWorkspaceStore.getState().upsertManifestEntry({
			id: DOC,
			title: "Payment Service",
			filePath: null,
			order: 0,
			createdAt: "2026-07-21T00:00:00.000Z",
			updatedAt: "2026-07-21T00:00:00.000Z",
		});

		const touchedKeys = [
			...getItem.mock.calls,
			...setItem.mock.calls,
			...removeItem.mock.calls,
		].map((call) => String(call[0]));
		expect(touchedKeys.some((key) => /^tf-api-key-/.test(key))).toBe(false);
	});

	it("has no persistence module that imports a keychain adapter", () => {
		// Read every production source file in this directory as raw text at test time.
		const sources = import.meta.glob("./*.ts", {
			query: "?raw",
			import: "default",
			eager: true,
		}) as Record<string, string>;
		const productionFiles = Object.entries(sources).filter(([path]) => !path.endsWith(".test.ts"));
		expect(productionFiles.length).toBeGreaterThan(0);
		for (const [path, contents] of productionFiles) {
			// Every keychain adapter module path contains "keychain-adapter"; forbidding that
			// substring blocks importing one while still allowing prose that names the keychain.
			expect(contents.toLowerCase(), `${path} must not import a keychain adapter`).not.toContain(
				"keychain-adapter",
			);
		}
	});
});
