import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { getWorkspaceStorage } from "@/lib/persistence/get-workspace-storage";
import { IndexeddbWorkspaceStorage } from "@/lib/persistence/indexeddb-workspace-storage";
import {
	WORKSPACE_MANIFEST_VERSION,
	type WorkspaceManifestEntry,
	WorkspaceStorageError,
} from "@/lib/persistence/types";
import { serializeThreatModelYaml } from "@/lib/thf-yaml";
import { useDocumentRegistry } from "@/stores/document-registry";
import { createDocumentStores, setActiveStores } from "@/stores/document-stores";
import { useModelStore } from "@/stores/model-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { DocumentId } from "@/types/document";
import type { ThreatModel } from "@/types/threat-model";
import { hydrateDocumentById, useWorkspaceRestore } from "./use-workspace-restore";

// The platform seam is mocked, not the storage: every case below runs the real browser path
// except the one that asserts the desktop path does nothing.
const { isTauriMock } = vi.hoisted(() => ({ isTauriMock: vi.fn<() => boolean>(() => false) }));
vi.mock("@/lib/platform", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/platform")>()),
	isTauri: isTauriMock,
}));

/**
 * Boot restore (plan step 8 / D4). The discriminating property is *what is not done*: only the
 * active document's body is read, the rest stay manifest descriptors, and none of it happens
 * before the shell renders.
 */

let idCounter = 0;
function nextId(): DocumentId {
	idCounter += 1;
	return `doc-restore-${idCounter}-${Date.now()}` as DocumentId;
}

function createTestModel(title: string, x = 40): ThreatModel {
	return {
		version: "1.0",
		metadata: {
			title,
			author: "Test",
			created: "2026-01-01",
			modified: "2026-01-01",
			description: "",
		},
		elements: [
			{
				id: "comp-1",
				name: "Web",
				type: "web_server",
				trust_zone: "internal",
				description: "",
				technologies: [],
				position: { x, y: 80 },
			},
		],
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [{ id: "diagram-1", name: "Main", viewport: { x: 5, y: 6, zoom: 1.5 } }],
	};
}

function manifestEntry(id: DocumentId, title: string, order: number): WorkspaceManifestEntry {
	return {
		id,
		title,
		filePath: null,
		order,
		createdAt: "2026-07-01T00:00:00.000Z",
		updatedAt: "2026-07-02T00:00:00.000Z",
	};
}

/** Put a document in both projections: the durable body and the localStorage manifest. */
async function seedPersistedDocument(
	title: string,
	order: number,
	body?: string,
): Promise<DocumentId> {
	const id = nextId();
	const storage = await getWorkspaceStorage();
	await storage.writeDocumentBody(id, body ?? serializeThreatModelYaml(createTestModel(title)));
	useWorkspaceStore.getState().upsertManifestEntry(manifestEntry(id, title, order));
	return id;
}

beforeEach(() => {
	isTauriMock.mockReturnValue(false);
	localStorage.clear();
	useDocumentRegistry.setState({ documents: {}, openDocumentIds: [], activeDocumentId: null });
	setActiveStores(createDocumentStores());
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

afterEach(() => {
	vi.restoreAllMocks();
});

/** Mount the restore hook and wait for its post-paint work to settle. */
async function restore(until: () => void): Promise<void> {
	renderHook(() => useWorkspaceRestore());
	await act(async () => {
		await vi.waitFor(until);
	});
}

describe("boot restore", () => {
	it("hydrates the persisted active document with its content and layout", async () => {
		const id = await seedPersistedDocument("Payment flows", 0);
		useWorkspaceStore.getState().setActiveDocumentId(id);

		await restore(() => expect(useDocumentRegistry.getState().activeDocumentId).toBe(id));

		expect(useModelStore.getState().model?.metadata.title).toBe("Payment flows");
		// Restore is restore, not reset: the persisted identity, geometry, and viewport come back.
		expect(useDocumentRegistry.getState().documents[id].createdAt).toBe("2026-07-01T00:00:00.000Z");
		expect(useModelStore.getState().model?.elements[0].position).toEqual({ x: 40, y: 80 });
		const restoredCanvas = useDocumentRegistry.getState().documents[id].stores.canvas.getState();
		expect(restoredCanvas.pendingLayout).toMatchObject({ viewport: { x: 5, y: 6, zoom: 1.5 } });
	});

	it("reads only the active document's body and leaves siblings un-hydrated", async () => {
		const first = await seedPersistedDocument("First", 0);
		const active = await seedPersistedDocument("Second", 1);
		await seedPersistedDocument("Third", 2);
		useWorkspaceStore.getState().setActiveDocumentId(active);
		const read = vi.spyOn(IndexeddbWorkspaceStorage.prototype, "readDocumentBody");

		await restore(() => expect(useDocumentRegistry.getState().activeDocumentId).toBe(active));

		// One read, one hydrated bundle: a large workspace does not pay a startup cost per document.
		expect(read).toHaveBeenCalledTimes(1);
		expect(useDocumentRegistry.getState().openDocumentIds).toEqual([active]);
		expect(useDocumentRegistry.getState().documents[first]).toBeUndefined();
		// The others are still listed, so #54 can render them as un-hydrated tabs.
		expect(useWorkspaceStore.getState().documents).toHaveLength(3);
	});

	it("does not block the first render on storage reads", async () => {
		const id = await seedPersistedDocument("Slow to load", 0);
		useWorkspaceStore.getState().setActiveDocumentId(id);

		let releaseRead: (() => void) | null = null;
		const gate = new Promise<void>((resolve) => {
			releaseRead = resolve;
		});
		const original = IndexeddbWorkspaceStorage.prototype.readDocumentBody;
		vi.spyOn(IndexeddbWorkspaceStorage.prototype, "readDocumentBody").mockImplementation(
			async function (this: IndexeddbWorkspaceStorage, documentId: DocumentId) {
				await gate;
				return original.call(this, documentId);
			},
		);

		const rendered = renderHook(() => {
			useWorkspaceRestore();
			return "shell";
		});

		// The shell is on screen while the read is still outstanding.
		expect(rendered.result.current).toBe("shell");
		expect(useDocumentRegistry.getState().activeDocumentId).toBeNull();

		await act(async () => {
			releaseRead?.();
			await vi.waitFor(() => expect(useDocumentRegistry.getState().activeDocumentId).toBe(id));
		});
		expect(useModelStore.getState().model?.metadata.title).toBe("Slow to load");
	});

	it("drops manifest entries with no stored body and surfaces stored orphans", async () => {
		const stored = await seedPersistedDocument("Still there", 0);
		// A manifest entry whose body is gone (the user cleared site data for IndexedDB only).
		const ghost = nextId();
		useWorkspaceStore.getState().upsertManifestEntry(manifestEntry(ghost, "Cleared body", 1));
		// A stored body the manifest never listed (the user cleared localStorage only).
		const orphan = nextId();
		await (await getWorkspaceStorage()).writeDocumentBody(
			orphan,
			serializeThreatModelYaml(createTestModel("Orphan")),
		);
		useWorkspaceStore.getState().setActiveDocumentId(stored);

		await restore(() => expect(useDocumentRegistry.getState().activeDocumentId).toBe(stored));

		const state = useWorkspaceStore.getState();
		expect(state.documents.map((entry) => entry.id)).not.toContain(ghost);
		// The orphan is surfaced for #55 to recover, never silently dropped or deleted.
		expect(state.recoverableDocumentIds).toContain(orphan);
	});

	it("keeps autosave dormant until the active document is hydrated", async () => {
		// Autosave clears the persisted active pointer while no document is open. If restore
		// announced availability before hydrating, that would fire against the empty registry and
		// a reload during the gap would come back blank.
		const id = await seedPersistedDocument("Hydrating", 0);
		useWorkspaceStore.getState().setActiveDocumentId(id);

		let releaseRead: (() => void) | null = null;
		const gate = new Promise<void>((resolve) => {
			releaseRead = resolve;
		});
		const original = IndexeddbWorkspaceStorage.prototype.readDocumentBody;
		vi.spyOn(IndexeddbWorkspaceStorage.prototype, "readDocumentBody").mockImplementation(
			async function (this: IndexeddbWorkspaceStorage, documentId: DocumentId) {
				await gate;
				return original.call(this, documentId);
			},
		);

		renderHook(() => useWorkspaceRestore());
		await act(async () => {
			await vi.waitFor(() =>
				expect(useWorkspaceStore.getState().documents.map((entry) => entry.id)).toEqual([id]),
			);
		});

		// Mid-restore: the manifest is reconciled but persistence is not yet announced as usable.
		expect(useWorkspaceStore.getState().persistenceAvailable).toBe(false);
		expect(useWorkspaceStore.getState().activeDocumentId).toBe(id);

		await act(async () => {
			releaseRead?.();
			await vi.waitFor(() => expect(useWorkspaceStore.getState().persistenceAvailable).toBe(true));
		});
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(id);
	});

	it("starts empty when the manifest points nowhere", async () => {
		await restore(() => expect(useWorkspaceStore.getState().persistenceAvailable).toBe(true));

		expect(useDocumentRegistry.getState().activeDocumentId).toBeNull();
		expect(useModelStore.getState().model).toBeNull();
	});
});

describe("degraded boot paths", () => {
	it("does nothing on the desktop, where the filesystem is the source of truth", async () => {
		isTauriMock.mockReturnValue(true);
		const id = await seedPersistedDocument("Should not be restored on desktop", 0);
		useWorkspaceStore.getState().setActiveDocumentId(id);
		const list = vi.spyOn(IndexeddbWorkspaceStorage.prototype, "listDocuments");

		renderHook(() => useWorkspaceRestore());
		await act(async () => {
			await Promise.resolve();
		});

		expect(list).not.toHaveBeenCalled();
		expect(useDocumentRegistry.getState().activeDocumentId).toBeNull();
		// Unavailable with no reason: desktop is "not applicable", not a failure to warn about,
		// so the status bar shows no ephemeral notice there.
		expect(useWorkspaceStore.getState().persistenceAvailable).toBe(false);
		expect(useWorkspaceStore.getState().unavailableReason).toBeNull();
	});

	it("enters ephemeral mode with a reason and no reads when storage is blocked", async () => {
		vi.spyOn(IndexeddbWorkspaceStorage.prototype, "listDocuments").mockRejectedValue(
			new WorkspaceStorageError("private-mode", "Local storage is blocked in this browser mode."),
		);
		const read = vi.spyOn(IndexeddbWorkspaceStorage.prototype, "readDocumentBody");

		await restore(() =>
			expect(useWorkspaceStore.getState().unavailableReason).toBe("private-mode"),
		);

		const state = useWorkspaceStore.getState();
		expect(state.persistenceAvailable).toBe(false);
		expect(read).not.toHaveBeenCalled();
		// Ephemeral mode is a degraded mode, not a crash: the app is still usable.
		expect(useDocumentRegistry.getState().activeDocumentId).toBeNull();
	});

	it("reports a failed migration as needing recovery without deleting anything", async () => {
		const id = await seedPersistedDocument("Kept through the failure", 0);
		useWorkspaceStore.getState().setActiveDocumentId(id);
		vi.spyOn(IndexeddbWorkspaceStorage.prototype, "listDocuments").mockRejectedValue(
			new WorkspaceStorageError(
				"migration-failed",
				"The workspace database could not be upgraded.",
			),
		);
		const remove = vi.spyOn(IndexeddbWorkspaceStorage.prototype, "deleteDocument");

		await restore(() =>
			expect(useWorkspaceStore.getState().unavailableReason).toBe("migration-failed"),
		);

		expect(remove).not.toHaveBeenCalled();
		// The manifest entry survives so the recovery screen (#55) still knows the document exists.
		expect(useWorkspaceStore.getState().documents.map((entry) => entry.id)).toEqual([id]);
	});

	it("marks an unparseable active document corrupt, keeps it, and falls back to a sibling", async () => {
		const corrupt = await seedPersistedDocument("Corrupt", 0, "this: is: not: a threat model");
		const sibling = await seedPersistedDocument("Readable sibling", 1);
		useWorkspaceStore.getState().setActiveDocumentId(corrupt);
		const remove = vi.spyOn(IndexeddbWorkspaceStorage.prototype, "deleteDocument");

		await restore(() => expect(useDocumentRegistry.getState().activeDocumentId).toBe(sibling));

		const state = useWorkspaceStore.getState();
		expect(state.persistence[corrupt].status).toBe("corrupt");
		// Never auto-wiped: the corrupt record and its manifest entry are both still there.
		expect(remove).not.toHaveBeenCalled();
		expect(state.documents.map((entry) => entry.id)).toContain(corrupt);
		expect(useDocumentRegistry.getState().documents[corrupt]).toBeUndefined();
		expect(useModelStore.getState().model?.metadata.title).toBe("Readable sibling");
	});

	it("marks a pointer with a missing revision corrupt rather than opening an empty document", async () => {
		const id = await seedPersistedDocument("Missing revision", 0);
		useWorkspaceStore.getState().setActiveDocumentId(id);
		vi.spyOn(IndexeddbWorkspaceStorage.prototype, "readDocumentBody").mockRejectedValue(
			new WorkspaceStorageError("corrupt", "A stored document is missing its current revision."),
		);

		await restore(() =>
			expect(useWorkspaceStore.getState().persistence[id]?.status).toBe("corrupt"),
		);

		expect(useDocumentRegistry.getState().activeDocumentId).toBeNull();
		expect(useModelStore.getState().model).toBeNull();
	});
});

describe("hydrateDocumentById (on-demand activation seam for #54)", () => {
	it("hydrates and activates one stored document on request", async () => {
		const id = await seedPersistedDocument("Activated later", 0);

		await act(async () => {
			expect(await hydrateDocumentById(id)).toBe(true);
		});

		expect(useDocumentRegistry.getState().activeDocumentId).toBe(id);
		expect(useModelStore.getState().model?.metadata.title).toBe("Activated later");
	});

	it("activates an already-live document without re-reading storage over in-memory work", async () => {
		const id = await seedPersistedDocument("Live", 0);
		await act(async () => {
			await hydrateDocumentById(id);
		});
		act(() => {
			useModelStore.getState().updateMetadata({ title: "Edited since hydration" });
		});
		const read = vi.spyOn(IndexeddbWorkspaceStorage.prototype, "readDocumentBody");

		await act(async () => {
			expect(await hydrateDocumentById(id)).toBe(true);
		});

		expect(read).not.toHaveBeenCalled();
		expect(useModelStore.getState().model?.metadata.title).toBe("Edited since hydration");
	});

	it("reports failure instead of opening a blank document for an unknown id", async () => {
		await act(async () => {
			expect(await hydrateDocumentById(nextId())).toBe(false);
		});

		expect(useDocumentRegistry.getState().activeDocumentId).toBeNull();
	});
});
