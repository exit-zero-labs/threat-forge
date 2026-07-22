import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { getWorkspaceStorage } from "@/lib/persistence/get-workspace-storage";
import { IndexeddbWorkspaceStorage } from "@/lib/persistence/indexeddb-workspace-storage";
import { WORKSPACE_MANIFEST_VERSION, WorkspaceStorageError } from "@/lib/persistence/types";
import { useCanvasStore } from "@/stores/canvas-store";
import { useDocumentRegistry } from "@/stores/document-registry";
import { createDocumentStores, setActiveStores } from "@/stores/document-stores";
import { useModelStore } from "@/stores/model-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { DocumentId } from "@/types/document";
import type { ThreatModel } from "@/types/threat-model";
import {
	useWorkspacePersistence,
	WORKSPACE_AUTOSAVE_DEBOUNCE_MS,
} from "./use-workspace-persistence";

/**
 * Browser workspace autosave (plan step 7). These cases run against the real IndexedDB storage
 * (via `fake-indexeddb`) so a passing debounce assertion also proves a real durable write; only
 * the failure cases replace the write, and each of those asserts observable store state rather
 * than the rejection itself.
 */

function createTestModel(title: string): ThreatModel {
	return {
		version: "1.0",
		metadata: {
			title,
			author: "Test",
			created: "2026-01-01",
			modified: "2026-01-01",
			description: "",
		},
		elements: [],
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [{ id: "diagram-1", name: "Main" }],
	};
}

/** Open a document, mark local persistence usable, and mount the autosave hook. */
function mountWithDocument(title = "Doc"): { id: DocumentId; unmount: () => void } {
	const id = useDocumentRegistry.getState().createDocument({
		model: createTestModel(title),
		filePath: null,
		pendingLayout: null,
	});
	useWorkspaceStore.getState().setPersistenceAvailability(true);
	const { unmount } = renderHook(() => useWorkspacePersistence());
	return { id, unmount };
}

/**
 * Let the debounce elapse and the write's promise chain settle. `until` overrides the default
 * "no document is mid-write" condition for cases where the status stays put across a write.
 */
async function runDebounce(until?: () => void): Promise<void> {
	const settled = () => {
		const statuses = Object.values(useWorkspaceStore.getState().persistence).map(
			(entry) => entry.status,
		);
		if (statuses.some((status) => status === "pending" || status === "writing")) {
			throw new Error("write still in flight");
		}
	};
	await act(async () => {
		vi.advanceTimersByTime(WORKSPACE_AUTOSAVE_DEBOUNCE_MS);
		await vi.waitFor(until ?? settled);
	});
}

async function readStoredBody(id: DocumentId): Promise<string | null> {
	const storage = await getWorkspaceStorage();
	return storage.readDocumentBody(id);
}

// One IndexedDB factory serves the whole file: the storage factory caches its instance and that
// instance caches its connection, so swapping the factory per test would strand it. Each test
// works with its own freshly minted document id, so stored records never collide.
beforeEach(() => {
	// Only the debounce timer is faked. fake-indexeddb drives its request callbacks off the
	// microtask/immediate queues, which must keep running for a real write to complete.
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
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
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("debounced autosave", () => {
	it("coalesces an edit burst into one write carrying the latest content", async () => {
		const write = vi.spyOn(IndexeddbWorkspaceStorage.prototype, "writeDocumentBody");
		const { id } = mountWithDocument("Burst");

		act(() => {
			useModelStore.getState().updateMetadata({ title: "Edit one" });
			vi.advanceTimersByTime(300);
			useModelStore.getState().updateMetadata({ title: "Edit two" });
			vi.advanceTimersByTime(300);
			useModelStore.getState().updateMetadata({ title: "Edit three" });
		});
		expect(write).not.toHaveBeenCalled();

		await runDebounce();

		expect(write).toHaveBeenCalledTimes(1);
		expect(await readStoredBody(id)).toContain("Edit three");
	});

	it("persists canvas geometry, not just the model as last edited in the panels", async () => {
		const { id } = mountWithDocument("Geometry");
		act(() => {
			useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 });
		});
		await runDebounce();

		act(() => {
			// A drag moves the node on the canvas without touching the model store.
			useCanvasStore
				.getState()
				.onNodesChange([
					{ id: "comp-1", type: "position", position: { x: 321, y: 654 }, dragging: false },
				]);
		});
		await runDebounce();

		const body = await readStoredBody(id);
		expect(body).toContain("321");
		expect(body).toContain("654");
	});

	it("records a saved state and the manifest entry only after the body commits", async () => {
		const { id } = mountWithDocument("Manifest");
		await runDebounce();

		const state = useWorkspaceStore.getState();
		expect(state.persistence[id].status).toBe("saved");
		expect(state.persistence[id].lastPersistedAt).not.toBeNull();
		expect(state.documents).toEqual([
			expect.objectContaining({ id, title: "Manifest", filePath: null, order: 0 }),
		]);
		expect(state.activeDocumentId).toBe(id);
	});

	it("does not touch the file-save dirty flag", async () => {
		mountWithDocument("Dirty");
		act(() => {
			useModelStore.getState().updateMetadata({ title: "Edited" });
		});
		expect(useModelStore.getState().isDirty).toBe(true);

		await runDebounce();

		// The local copy is saved; the on-disk file still has unsaved changes.
		expect(useModelStore.getState().isDirty).toBe(true);
	});

	it("flushes a pending write when the page becomes hidden", async () => {
		const write = vi.spyOn(IndexeddbWorkspaceStorage.prototype, "writeDocumentBody");
		const { id } = mountWithDocument("Backgrounded");
		act(() => {
			useModelStore.getState().updateMetadata({ title: "Typed just before switching tabs" });
		});

		await act(async () => {
			vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
			document.dispatchEvent(new Event("visibilitychange"));
			await vi.waitFor(() => {
				if (useWorkspaceStore.getState().persistence[id]?.status !== "saved") {
					throw new Error("flush not finished");
				}
			});
		});

		expect(write).toHaveBeenCalledTimes(1);
		expect(await readStoredBody(id)).toContain("Typed just before switching tabs");
	});

	it("flushes a pending write when the page is being unloaded", async () => {
		const write = vi.spyOn(IndexeddbWorkspaceStorage.prototype, "writeDocumentBody");
		const { id } = mountWithDocument("Hidden");
		act(() => {
			useModelStore.getState().updateMetadata({ title: "Last second edit" });
		});
		expect(write).not.toHaveBeenCalled();

		// No debounce time passes: the flush is what makes this write happen.
		await act(async () => {
			window.dispatchEvent(new Event("pagehide"));
			await vi.waitFor(() => {
				if (useWorkspaceStore.getState().persistence[id]?.status !== "saved") {
					throw new Error("flush not finished");
				}
			});
		});

		expect(write).toHaveBeenCalledTimes(1);
		expect(await readStoredBody(id)).toContain("Last second edit");
	});
});

describe("seeding and rebinding", () => {
	it("seeds a document that storage has never seen, without waiting for an edit", async () => {
		const { id } = mountWithDocument("Never edited");
		await runDebounce();

		expect(await readStoredBody(id)).toContain("Never edited");
	});

	it("does not rewrite a restored document that is already in the manifest", async () => {
		const id = useDocumentRegistry.getState().createDocument({
			model: createTestModel("Restored"),
			filePath: null,
			pendingLayout: null,
		});
		useWorkspaceStore.getState().upsertManifestEntry({
			id,
			title: "Restored",
			filePath: null,
			order: 0,
			createdAt: "2026-07-01T00:00:00.000Z",
			updatedAt: "2026-07-01T00:00:00.000Z",
		});
		const write = vi.spyOn(IndexeddbWorkspaceStorage.prototype, "writeDocumentBody");

		useWorkspaceStore.getState().setPersistenceAvailability(true);
		renderHook(() => useWorkspacePersistence());
		await act(async () => {
			vi.advanceTimersByTime(WORKSPACE_AUTOSAVE_DEBOUNCE_MS * 2);
		});

		// Booting into a document must not cost a revision when nothing changed.
		expect(write).not.toHaveBeenCalled();
		// The active tab pointer is still refreshed so a reload returns to this document.
		expect(useWorkspaceStore.getState().activeDocumentId).toBe(id);
	});

	it("clears the persisted active pointer when the last document is closed", async () => {
		const { id } = mountWithDocument("Closing");
		await runDebounce();
		expect(useWorkspaceStore.getState().activeDocumentId).toBe(id);

		await act(async () => {
			useDocumentRegistry.getState().closeDocument(id);
		});

		// A reload must not reopen a document the user closed; its stored body is kept for #55.
		expect(useWorkspaceStore.getState().activeDocumentId).toBeNull();
		expect(useWorkspaceStore.getState().documents.map((entry) => entry.id)).toEqual([id]);
	});

	it("writes nothing while local persistence is unavailable", async () => {
		const write = vi.spyOn(IndexeddbWorkspaceStorage.prototype, "writeDocumentBody");
		useDocumentRegistry.getState().createDocument({
			model: createTestModel("Ephemeral"),
			filePath: null,
			pendingLayout: null,
		});
		useWorkspaceStore.getState().setPersistenceAvailability(false, "private-mode");
		renderHook(() => useWorkspacePersistence());

		await act(async () => {
			useModelStore.getState().updateMetadata({ title: "Edited in ephemeral mode" });
			vi.advanceTimersByTime(WORKSPACE_AUTOSAVE_DEBOUNCE_MS * 3);
		});

		expect(write).not.toHaveBeenCalled();
		expect(useWorkspaceStore.getState().documents).toEqual([]);
	});
});

describe("write failures fail visibly without a storm", () => {
	it("surfaces a full quota once across repeated failures and keeps the document editable", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const write = vi
			.spyOn(IndexeddbWorkspaceStorage.prototype, "writeDocumentBody")
			.mockRejectedValue(new WorkspaceStorageError("quota-exceeded", "Local storage is full."));
		const { id } = mountWithDocument("Quota");
		// The seeding write plus one per edit: the error state is sticky, so each pass waits on
		// the write itself rather than on a status transition.
		const titles = ["First", "Second", "Third"];
		await runDebounce(() => expect(write).toHaveBeenCalledTimes(1));
		for (const [index, title] of titles.entries()) {
			act(() => {
				useModelStore.getState().updateMetadata({ title });
			});
			await runDebounce(() => expect(write).toHaveBeenCalledTimes(index + 2));
		}

		const state = useWorkspaceStore.getState().persistence[id];
		expect(state.status).toBe("error");
		expect(state.errorKind).toBe("quota-exceeded");
		// One coalesced report, not one per failed write.
		expect(warn).toHaveBeenCalledTimes(1);
		// The in-memory document is untouched, so the user can keep working and exporting.
		expect(useModelStore.getState().model?.metadata.title).toBe("Third");
		// A failed local write never advertises a manifest entry for a body that is not there.
		expect(useWorkspaceStore.getState().documents).toEqual([]);
	});

	it("reports an unclassified failure as an error without leaking its message", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(IndexeddbWorkspaceStorage.prototype, "writeDocumentBody").mockRejectedValue(
			new Error("internal: /Users/someone/secret-path exploded"),
		);
		const { id } = mountWithDocument("Opaque");

		await runDebounce();

		expect(useWorkspaceStore.getState().persistence[id].errorKind).toBe("unknown");
		expect(warn.mock.calls.flat().join(" ")).not.toContain("secret-path");
	});

	it("returns to a saved state once a later write succeeds", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const write = vi
			.spyOn(IndexeddbWorkspaceStorage.prototype, "writeDocumentBody")
			.mockRejectedValueOnce(new WorkspaceStorageError("quota-exceeded", "Local storage is full."));
		const { id } = mountWithDocument("Recovers");

		await runDebounce();
		expect(useWorkspaceStore.getState().persistence[id].status).toBe("error");

		act(() => {
			useModelStore.getState().updateMetadata({ title: "After freeing space" });
		});
		// The sticky error only clears on a real success, so wait for that transition.
		await runDebounce(() =>
			expect(useWorkspaceStore.getState().persistence[id].status).toBe("saved"),
		);

		expect(useWorkspaceStore.getState().persistence[id].lastPersistedAt).not.toBeNull();
		expect(write).toHaveBeenCalledTimes(2);
	});
});
