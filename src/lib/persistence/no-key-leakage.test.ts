import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { BrowserKeychainAdapter } from "@/lib/adapters/browser-keychain-adapter";
import { serializeThreatModelYaml } from "@/lib/thf-yaml";
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

/** A distinctive secret that does not appear anywhere in the model text below. */
const SECRET = "sk-ant-SECRET-do-not-leak-9f8e7d6c5b4a";
const DOC = "doc-boundary-check" as DocumentId;

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
	useWorkspaceStore.setState({ documents: [], activeDocumentId: null, persistence: {} });
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("no key material reaches the workspace stores (D6)", () => {
	it("keeps a stored key out of both IndexedDB and the workspace manifest", async () => {
		// A real key is stored via the keychain adapter's own namespace.
		await new BrowserKeychainAdapter().setKey("anthropic", SECRET);

		// A full persist cycle: durable body plus the manifest projection.
		const storage = new IndexeddbWorkspaceStorage();
		const model = modelWithoutSecret();
		await storage.writeDocumentBody(DOC, serializeThreatModelYaml(model));
		useWorkspaceStore.getState().upsertManifestEntry({
			id: DOC,
			title: model.metadata.title,
			filePath: null,
			order: 0,
			updatedAt: "2026-07-21T00:00:00.000Z",
		});

		// The secret is in neither durable store.
		expect(await dumpIndexedDb()).not.toContain(SECRET);
		expect(localStorage.getItem(WORKSPACE_STORAGE_NAMESPACE) ?? "").not.toContain(SECRET);

		// The only localStorage key carrying the secret is the keychain's own key.
		const keysCarryingSecret = Object.keys(localStorage).filter((key) =>
			(localStorage.getItem(key) ?? "").includes(SECRET),
		);
		expect(keysCarryingSecret).toEqual(["tf-api-key-anthropic"]);
	});

	it("never reads or writes a keychain key during a persist cycle", async () => {
		// Store the key before spying so only the persistence cycle is observed.
		await new BrowserKeychainAdapter().setKey("anthropic", SECRET);

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
