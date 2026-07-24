import { useEffect } from "react";
import { captureCanvasIntoModel } from "@/lib/model-capture";
import { getWorkspaceStorage } from "@/lib/persistence/get-workspace-storage";
import { WorkspaceStorageError, type WorkspaceStorageErrorKind } from "@/lib/persistence/types";
import { serializeThreatModelYaml } from "@/lib/thf-yaml";
import { useDocumentRegistry } from "@/stores/document-registry";
import type { DocumentStores } from "@/stores/document-stores";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { DocumentId } from "@/types/document";

/**
 * Debounce for browser workspace autosave (issue #56, D2).
 *
 * Deliberately shorter than the file autosave interval: a local IndexedDB write is cheap, and
 * the window of edits a crash can lose should be about a second, not the multi-second interval
 * that a filesystem round trip justifies.
 */
export const WORKSPACE_AUTOSAVE_DEBOUNCE_MS = 1000;

/**
 * The manifest fields a write must carry forward rather than recompute: order and creation time.
 *
 * An existing entry keeps its persisted order. A document being written for the first time derives
 * its order from the **live registry order** — the count of documents that both precede it in
 * `openDocumentIds` and already have a manifest entry — so a new tab reordered before its first
 * write is inserted at its real position instead of always being appended to the tail. Creation
 * time is taken from the live session the first time.
 */
function manifestIdentityFor(id: DocumentId): { order: number; createdAt: string } {
	const { documents } = useWorkspaceStore.getState();
	const existing = documents.find((entry) => entry.id === id);
	if (existing) return { order: existing.order, createdAt: existing.createdAt };

	const manifestIds = new Set(documents.map((entry) => entry.id));
	const openDocumentIds = useDocumentRegistry.getState().openDocumentIds;
	let order = documents.length;
	const registryIndex = openDocumentIds.indexOf(id);
	if (registryIndex !== -1) {
		order = openDocumentIds
			.slice(0, registryIndex)
			.filter((docId) => manifestIds.has(docId)).length;
	}
	const session = useDocumentRegistry.getState().documents[id];
	return { order, createdAt: session?.createdAt ?? new Date().toISOString() };
}

/**
 * Move a document into a transient `'pending'`/`'writing'` status.
 *
 * A visible failure is deliberately left in place: retrying after a full quota would otherwise
 * blink the indicator back to "Saving..." on every keystroke burst and re-arm the one-shot
 * failure report. Only a write that actually succeeds clears an error.
 */
function markInFlight(id: DocumentId, status: "pending" | "writing"): void {
	const workspace = useWorkspaceStore.getState();
	const current = workspace.persistence[id];
	if (current?.status === "error") return;
	workspace.setPersistenceState(id, { status, lastPersistedAt: current?.lastPersistedAt ?? null });
}

/**
 * Record a failed write once per document (D2: fail visibly, without a toast storm).
 *
 * Repeated failures — a full quota keeps failing on every subsequent edit — leave the already
 * visible `'error'` state and its single log entry alone instead of emitting one per write. The
 * in-memory document is never touched, so the user keeps editing and exporting.
 */
function reportWriteFailure(id: DocumentId, error: unknown): void {
	const workspace = useWorkspaceStore.getState();
	const current = workspace.persistence[id];
	if (current?.status === "error") return;

	const kind: WorkspaceStorageErrorKind =
		error instanceof WorkspaceStorageError ? error.kind : "unknown";
	workspace.setPersistenceState(id, {
		status: "error",
		lastPersistedAt: current?.lastPersistedAt ?? null,
		errorKind: kind,
	});
	// Structured, user-safe, and free of document content: the kind and the workspace id only.
	console.warn(`Workspace persistence failed for ${id} (${kind}); changes are kept in memory.`);
}

/**
 * Persist one document's current content as a new revision.
 *
 * The write goes through `captureCanvasIntoModel` against *this document's own* canvas store, so
 * a write that was scheduled before a document switch still records the geometry of the document
 * it belongs to. `isDirty` is never touched: that flag tracks divergence from an on-disk `.thf`
 * file, which a browser document does not have.
 */
async function persistDocument(id: DocumentId, stores: DocumentStores): Promise<void> {
	const { model, filePath } = stores.model.getState();
	if (!model) return;

	markInFlight(id, "writing");

	try {
		const thf = serializeThreatModelYaml(captureCanvasIntoModel(model, stores.canvas.getState()));
		const storage = await getWorkspaceStorage();
		await storage.writeDocumentBody(id, thf);
	} catch (error) {
		reportWriteFailure(id, error);
		return;
	}

	const persistedAt = new Date().toISOString();
	const workspace = useWorkspaceStore.getState();
	workspace.setPersistenceState(id, { status: "saved", lastPersistedAt: persistedAt });
	// A close tears this effect down and flushes its pending write. The body may still finish
	// committing as a recoverable orphan for #55, but the closed session must not re-add itself to
	// the open-document manifest after closeDocumentById removed it. Comparing the exact store
	// bundle also rejects a stale write if the same persisted id was rebuilt concurrently.
	if (useDocumentRegistry.getState().getDocumentStores(id) !== stores) return;
	// The manifest entry is written only after the body commits, so the fast-render projection
	// never advertises a document IndexedDB does not have.
	workspace.upsertManifestEntry({
		id,
		title: model.metadata.title,
		filePath,
		...manifestIdentityFor(id),
		updatedAt: persistedAt,
	});
	// Record this document as the persisted active tab only when it is *still* the registry's
	// active document. A body write is async, so a flush of the outgoing document (A) can resolve
	// after the user has switched to B — and B has already recorded itself active synchronously in
	// the effect below. Writing the pointer back to A unconditionally here is a real production
	// race that would reopen the wrong tab on reload; it is not merely a StrictMode dev artifact.
	// Known-document activation still updates the pointer synchronously in the effect, so a plain
	// tab switch settles immediately without waiting for a write.
	if (useDocumentRegistry.getState().activeDocumentId === id) {
		workspace.setActiveDocumentId(id);
	}
}

/**
 * Browser workspace autosave (issue #56, step 7).
 *
 * Edits to the active document are written to IndexedDB on a debounce, with a per-document
 * persistence state the status bar renders. This is a separate concern from `useAutosave`, which
 * writes the `.thf` file and only runs once a document has a `filePath`; the two never write the
 * same target and neither clears the other's state.
 *
 * Desktop never reaches a write: `persistenceAvailable` stays false there (see
 * `useWorkspaceRestore`) and the platform factory resolves the no-op storage anyway.
 */
export function useWorkspacePersistence(): void {
	const activeDocumentId = useDocumentRegistry((state) => state.activeDocumentId);
	const persistenceAvailable = useWorkspaceStore((state) => state.persistenceAvailable);

	useEffect(() => {
		if (!persistenceAvailable) return;

		if (!activeDocumentId) {
			// No live document: drop the persisted active pointer so a reload does not reopen a
			// document the user closed. The manifest entry and its stored body are kept — #56
			// never deletes user data to reflect a UI state change.
			useWorkspaceStore.getState().setActiveDocumentId(null);
			return;
		}

		const stores = useDocumentRegistry.getState().getDocumentStores(activeDocumentId);
		if (!stores) return;

		let timer: ReturnType<typeof setTimeout> | null = null;

		const schedule = () => {
			if (!stores.model.getState().model) return;
			markInFlight(activeDocumentId, "pending");
			if (timer !== null) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = null;
				void persistDocument(activeDocumentId, stores);
			}, WORKSPACE_AUTOSAVE_DEBOUNCE_MS);
		};

		/** Run a pending write now — on tab hide, or when this binding is torn down. */
		const flush = () => {
			if (timer === null) return;
			clearTimeout(timer);
			timer = null;
			void persistDocument(activeDocumentId, stores);
		};

		const knownDocument = useWorkspaceStore
			.getState()
			.documents.some((entry) => entry.id === activeDocumentId);
		if (knownDocument) {
			// Already durable: record which tab is current without rewriting an unchanged body.
			useWorkspaceStore.getState().setActiveDocumentId(activeDocumentId);
		} else {
			// New, opened, imported, or template document: seed storage so the workspace survives
			// a reload even if the user never edits it.
			schedule();
		}

		// Only content changes schedule a write. Selection and analysis flags also live in the
		// model store, and rewriting the whole document because the user clicked a node would be
		// pure write amplification.
		let lastModel = stores.model.getState().model;
		const unsubscribeModel = stores.model.subscribe((state) => {
			if (state.model === lastModel) return;
			lastModel = state.model;
			schedule();
		});

		let { nodes: lastNodes, edges: lastEdges, viewport: lastViewport } = stores.canvas.getState();
		const unsubscribeCanvas = stores.canvas.subscribe((state) => {
			if (
				state.nodes === lastNodes &&
				state.edges === lastEdges &&
				state.viewport === lastViewport
			) {
				return;
			}
			lastNodes = state.nodes;
			lastEdges = state.edges;
			lastViewport = state.viewport;
			schedule();
		});

		// `beforeunload` is deliberately not used: it is unreliable and blocks bfcache.
		const handleVisibilityChange = () => {
			if (document.visibilityState === "hidden") flush();
		};
		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("pagehide", flush);

		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("pagehide", flush);
			unsubscribeModel();
			unsubscribeCanvas();
			// Switching documents must not silently drop the last second of edits.
			flush();
		};
	}, [activeDocumentId, persistenceAvailable]);
}
