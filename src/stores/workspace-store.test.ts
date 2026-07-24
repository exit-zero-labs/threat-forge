import { beforeEach, describe, expect, it } from "vitest";
import {
	WORKSPACE_MANIFEST_VERSION,
	WORKSPACE_STORAGE_NAMESPACE,
	type WorkspaceManifestEntry,
} from "@/lib/persistence/types";
import type { DocumentId } from "@/types/document";
import { reconcileManifest, useWorkspaceStore } from "./workspace-store";

function entry(id: string, order: number, title = id): WorkspaceManifestEntry {
	return {
		id: id as DocumentId,
		title,
		filePath: null,
		order,
		createdAt: "2026-07-21T00:00:00.000Z",
		updatedAt: "2026-07-21T00:00:00.000Z",
	};
}

const id = (value: string) => value as DocumentId;

beforeEach(() => {
	localStorage.clear();
	useWorkspaceStore.setState({
		schemaVersion: WORKSPACE_MANIFEST_VERSION,
		documents: [],
		activeDocumentId: null,
		preferences: {},
		persistence: {},
		persistenceAvailable: false,
		unavailableReason: null,
		recoverableDocumentIds: [],
	});
});

function readPersistedRaw(): string {
	const raw = localStorage.getItem(WORKSPACE_STORAGE_NAMESPACE);
	if (raw === null) throw new Error("manifest was not persisted");
	return raw;
}

describe("workspace manifest persistence", () => {
	it("persists the manifest under exactly the threatforge-workspace key", () => {
		const store = useWorkspaceStore.getState();
		store.upsertManifestEntry(entry("doc-a", 0));
		store.upsertManifestEntry(entry("doc-b", 1));
		store.setActiveDocumentId(id("doc-b"));

		expect(Object.keys(localStorage)).toEqual([WORKSPACE_STORAGE_NAMESPACE]);
		const persisted = JSON.parse(readPersistedRaw());
		expect(persisted.state.documents.map((e: WorkspaceManifestEntry) => e.id)).toEqual([
			"doc-a",
			"doc-b",
		]);
		expect(persisted.state.activeDocumentId).toBe("doc-b");
		expect(persisted.state.schemaVersion).toBe(WORKSPACE_MANIFEST_VERSION);
	});

	it("excludes runtime persistence state and availability from the persisted JSON", () => {
		const store = useWorkspaceStore.getState();
		store.upsertManifestEntry(entry("doc-a", 0));
		store.setPersistenceAvailability(false, "private-mode");
		store.setPersistenceState(id("doc-a"), { status: "error", lastPersistedAt: null });

		const raw = readPersistedRaw();
		expect(raw).not.toContain("persistence");
		expect(raw).not.toContain("persistenceAvailable");
		expect(raw).not.toContain("unavailableReason");
		expect(raw).not.toContain("recoverableDocumentIds");
	});

	it("leaves the persisted manifest unchanged when only persistence status changes", () => {
		const store = useWorkspaceStore.getState();
		store.upsertManifestEntry(entry("doc-a", 0));
		const before = readPersistedRaw();

		store.setPersistenceState(id("doc-a"), { status: "writing", lastPersistedAt: null });
		store.setPersistenceState(id("doc-a"), {
			status: "saved",
			lastPersistedAt: "2026-07-21T01:00:00.000Z",
		});

		expect(readPersistedRaw()).toBe(before);
	});
});

describe("manifest entry actions", () => {
	it("upserts by id without duplicating an existing entry", () => {
		const store = useWorkspaceStore.getState();
		store.upsertManifestEntry(entry("doc-a", 0, "First"));
		store.upsertManifestEntry(entry("doc-a", 0, "Renamed"));

		const { documents } = useWorkspaceStore.getState();
		expect(documents).toHaveLength(1);
		expect(documents[0].title).toBe("Renamed");
	});

	it("removes an entry and clears the active pointer if it pointed there", () => {
		const store = useWorkspaceStore.getState();
		store.upsertManifestEntry(entry("doc-a", 0));
		store.setActiveDocumentId(id("doc-a"));

		store.removeManifestEntry(id("doc-a"));

		const state = useWorkspaceStore.getState();
		expect(state.documents).toHaveLength(0);
		expect(state.activeDocumentId).toBeNull();
	});

	it("reorders entries to match the given id order", () => {
		const store = useWorkspaceStore.getState();
		store.upsertManifestEntry(entry("doc-a", 0));
		store.upsertManifestEntry(entry("doc-b", 1));
		store.upsertManifestEntry(entry("doc-c", 2));

		store.setManifestOrder([id("doc-c"), id("doc-a"), id("doc-b")]);

		expect(useWorkspaceStore.getState().documents.map((e) => e.id)).toEqual([
			"doc-c",
			"doc-a",
			"doc-b",
		]);
	});

	it("keeps the array position and the `order` field coherent after a reorder", () => {
		const store = useWorkspaceStore.getState();
		store.upsertManifestEntry(entry("doc-a", 0));
		store.upsertManifestEntry(entry("doc-b", 1));
		store.upsertManifestEntry(entry("doc-c", 2));

		store.setManifestOrder([id("doc-c"), id("doc-a"), id("doc-b")]);

		// The reorder previously left each `order` field stale; it must now match the new index so a
		// consumer that trusts `order` reads the same order as one that trusts array position.
		const documents = useWorkspaceStore.getState().documents;
		expect(documents.map((e) => [e.id, e.order])).toEqual([
			["doc-c", 0],
			["doc-a", 1],
			["doc-b", 2],
		]);
	});

	it("inserts a new entry at its requested order slot and renumbers, rather than always appending", () => {
		const store = useWorkspaceStore.getState();
		store.upsertManifestEntry(entry("doc-a", 0));
		store.upsertManifestEntry(entry("doc-b", 1));
		// A new document whose order resolves to slot 0 (e.g. reordered to the front before its first
		// write) is inserted there, not appended to the tail.
		store.upsertManifestEntry(entry("doc-front", 0));

		const documents = useWorkspaceStore.getState().documents;
		expect(documents.map((e) => e.id)).toEqual(["doc-front", "doc-a", "doc-b"]);
		expect(documents.map((e) => e.order)).toEqual([0, 1, 2]);
	});

	it("renumbers `order` after a removal so no gap is left behind", () => {
		const store = useWorkspaceStore.getState();
		store.upsertManifestEntry(entry("doc-a", 0));
		store.upsertManifestEntry(entry("doc-b", 1));
		store.upsertManifestEntry(entry("doc-c", 2));

		store.removeManifestEntry(id("doc-b"));

		expect(useWorkspaceStore.getState().documents.map((e) => [e.id, e.order])).toEqual([
			["doc-a", 0],
			["doc-c", 1],
		]);
	});
});

describe("reconcileManifest (D5 stale-metadata rule)", () => {
	it("drops manifest entries with no stored record and surfaces stored orphans as recoverable", () => {
		const entries = [entry("doc-a", 0), entry("doc-b", 1)];
		const result = reconcileManifest(entries, [id("doc-a"), id("doc-c")]);

		expect(result.kept.map((e) => e.id)).toEqual(["doc-a"]);
		expect(result.droppedIds).toEqual(["doc-b"]);
		expect(result.orphanIds).toEqual(["doc-c"]);
	});

	it("applies the rule to the store and clears an active pointer that was dropped", () => {
		const store = useWorkspaceStore.getState();
		store.upsertManifestEntry(entry("doc-a", 0));
		store.upsertManifestEntry(entry("doc-b", 1));
		store.setActiveDocumentId(id("doc-b"));

		// IndexedDB only has doc-a plus an orphan doc-z the manifest never listed.
		store.reconcile([id("doc-a"), id("doc-z")]);

		const state = useWorkspaceStore.getState();
		expect(state.documents.map((e) => e.id)).toEqual(["doc-a"]);
		expect(state.activeDocumentId).toBeNull();
		expect(state.recoverableDocumentIds).toEqual(["doc-z"]);
	});

	it("keeps a still-valid active pointer through reconciliation", () => {
		const store = useWorkspaceStore.getState();
		store.upsertManifestEntry(entry("doc-a", 0));
		store.setActiveDocumentId(id("doc-a"));

		store.reconcile([id("doc-a")]);

		expect(useWorkspaceStore.getState().activeDocumentId).toBe("doc-a");
	});
});
