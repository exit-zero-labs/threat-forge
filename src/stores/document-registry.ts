import { create } from "zustand";
import { createDocumentId } from "@/lib/document-id";
import type { DocumentId, DocumentSession } from "@/types/document";
import type { DiagramLayout, FileSettings, ThreatModel } from "@/types/threat-model";
import { useCanvasInstanceStore } from "./canvas-instance-store";
import { useChatStore } from "./chat-store";
import { createDocumentStores, type DocumentStores, setActiveStores } from "./document-stores";

/** Everything needed to seed a new document's bundle at creation time. */
export interface CreateDocumentInput {
	/** The loaded, imported, template, or newly created model. */
	model: ThreatModel;
	/** The file path the model was loaded from, or null for unsaved documents. */
	filePath: string | null;
	/**
	 * Layout to apply on the new document's first canvas sync. Passed here — rather than set
	 * on the canvas store by the caller — because the caller's `useCanvasStore` still resolves
	 * the outgoing document's bundle until this document is activated.
	 */
	pendingLayout: DiagramLayout | null;
}

/**
 * Everything needed to rebuild a session for a document that already has an identity — a
 * document restored from browser workspace storage (`#56`).
 */
export interface HydrateDocumentInput extends CreateDocumentInput {
	/** The persisted identity to rebuild under. No new id is minted. */
	id: DocumentId;
	/** The persisted creation timestamp, so ordering survives a persistence round trip. */
	createdAt: string;
	/** Whether to make this document active. Restore hydrates siblings without activating them. */
	activate: boolean;
}

/**
 * D1 close-activation policy — the sibling that becomes active when the active document closes.
 *
 * Activate the closed document's **right** neighbour in rendered order; when it was rightmost,
 * activate its **left** neighbour; when nothing remains, return `null`. Computed as a pure
 * function of the order *before* the close, so it is unit-testable without React and derives
 * entirely from `openDocumentIds` — no separate activation stack that could drift.
 */
export function nextActiveDocumentId(
	orderBeforeClose: readonly DocumentId[],
	closedId: DocumentId,
): DocumentId | null {
	const closedIndex = orderBeforeClose.indexOf(closedId);
	if (closedIndex === -1) return null;
	const remaining = orderBeforeClose.filter((id) => id !== closedId);
	// remaining[closedIndex] is the right neighbour (everything after the closed id shifted left);
	// clamping to the last index yields the left neighbour when the closed tab was rightmost.
	return remaining[Math.min(closedIndex, remaining.length - 1)] ?? null;
}

/**
 * Produce the pinned-first order (`#54` D5): pinned ids ahead of unpinned ids, each block keeping
 * its existing relative order, so `openDocumentIds` stays the one rendered order.
 */
export function applyPinnedOrder(
	order: readonly DocumentId[],
	pinnedIds: ReadonlySet<DocumentId>,
): DocumentId[] {
	const pinned = order.filter((id) => pinnedIds.has(id));
	const unpinned = order.filter((id) => !pinnedIds.has(id));
	return [...pinned, ...unpinned];
}

/**
 * Move `id` to `toIndex` within its own pinned/unpinned block, clamping so pinned and unpinned
 * tabs can never interleave. `toIndex` is the desired final index in the returned order;
 * `pinnedCount` is how many pinned tabs lead `order`. Returns a copy; a no-op returns a copy too.
 */
export function moveDocumentInOrder(
	order: readonly DocumentId[],
	id: DocumentId,
	toIndex: number,
	isPinned: boolean,
	pinnedCount: number,
): DocumentId[] {
	if (order.indexOf(id) === -1) return [...order];
	// The half-open block this id may occupy: pinned tabs lead, so unpinned tabs start at
	// `pinnedCount`. The last valid final index is one before the block's exclusive end.
	const blockStart = isPinned ? 0 : pinnedCount;
	const blockEnd = isPinned ? pinnedCount : order.length;
	const clamped = Math.max(blockStart, Math.min(toIndex, blockEnd - 1));
	const without = order.filter((docId) => docId !== id);
	without.splice(clamped, 0, id);
	return without;
}

interface DocumentRegistryState {
	/** All open documents, keyed by their stable identity. */
	documents: Record<DocumentId, DocumentSession>;
	/** Open document ids in the order they were created. */
	openDocumentIds: DocumentId[];
	/** The single active-document pointer, or null when no document is open. */
	activeDocumentId: DocumentId | null;

	/**
	 * Create a fresh document from a model, activate it, and return its id. The new bundle is
	 * seeded and wired in isolation; nothing is copied from any other document.
	 */
	createDocument: (input: CreateDocumentInput) => DocumentId;
	/**
	 * Rebuild a session under a document's *persisted* identity and creation time, activating it
	 * only when asked. Re-hydrating an already-open document does not rebuild its bundle: the
	 * live document is authoritative, so stored text never overwrites unsaved in-memory work.
	 */
	hydrateDocument: (input: HydrateDocumentInput) => void;
	/** Point the store facades at a document's own bundle and mark it active. No-op if unknown. */
	activateDocument: (id: DocumentId) => void;
	/**
	 * Dispose a document and its bundle. If it was active, activate the last remaining open
	 * document, or install a fresh scratch bundle when none remain so nothing written while no
	 * document is open can surface in a later document.
	 */
	closeDocument: (id: DocumentId) => void;
	/** Update a document's file-scoped settings. No-op if the id is unknown. */
	setDocumentFileSettings: (id: DocumentId, fileSettings: FileSettings | null) => void;
	/** Update a document's AI session reference. No-op if the id is unknown. */
	setDocumentChatSessionId: (id: DocumentId, sessionId: string | null) => void;
	/**
	 * Move a document to `toIndex` within its pinned/unpinned block (`#54` D5). Clamps so the two
	 * blocks cannot interleave and never changes which document is active. No-op if id is unknown.
	 */
	reorderDocument: (id: DocumentId, toIndex: number) => void;
	/**
	 * Pin or unpin a document, resorting `openDocumentIds` so pinned tabs lead (`#54` D5). Never
	 * changes which document is active. No-op if the id is unknown or already in that pin state.
	 */
	setDocumentPinned: (id: DocumentId, pinned: boolean) => void;
	/** Read a document's own store bundle without subscribing, or null if the id is unknown. */
	getDocumentStores: (id: DocumentId) => DocumentStores | null;
}

/**
 * The document registry. It owns document sessions, their open order, and the single active
 * pointer. The registry is the only global document-selection state; per-document state lives
 * entirely inside each session's `stores` bundle.
 *
 * No store facade module imports this file, keeping the module graph acyclic.
 */
export const useDocumentRegistry = create<DocumentRegistryState>((set, get) => ({
	documents: {},
	openDocumentIds: [],
	activeDocumentId: null,

	createDocument: ({ model, filePath, pendingLayout }) => {
		const id = createDocumentId();
		const stores = createDocumentStores();

		// Seed the new bundle in isolation before it becomes active. `setModel` resets the
		// document's selection and dirty flag; the pending layout is consumed on first sync.
		stores.model.getState().setModel(model, filePath);
		stores.canvas.setState({ pendingLayout });

		const session: DocumentSession = {
			id,
			createdAt: new Date().toISOString(),
			stores,
			fileSettings: model.metadata.settings ?? null,
			activeChatSessionId: null,
			pinned: false,
		};

		set((state) => ({
			documents: { ...state.documents, [id]: session },
			openDocumentIds: [...state.openDocumentIds, id],
		}));

		get().activateDocument(id);
		return id;
	},

	hydrateDocument: ({ id, model, filePath, pendingLayout, createdAt, activate }) => {
		if (get().documents[id]) {
			// Already hydrated. The live bundle wins over stored text, so nothing is re-seeded;
			// the caller's activation request is still honored because activating an existing
			// session is exactly what "make this restored document current" means.
			if (activate) get().activateDocument(id);
			return;
		}

		const stores = createDocumentStores();

		// Seeded identically to `createDocument`, so a restored document is indistinguishable
		// from a freshly opened one apart from keeping its persisted identity and creation time.
		stores.model.getState().setModel(model, filePath);
		stores.canvas.setState({ pendingLayout });

		const session: DocumentSession = {
			id,
			createdAt,
			stores,
			fileSettings: model.metadata.settings ?? null,
			activeChatSessionId: null,
			// Restored documents start unpinned: `#54` does not persist pin state, so a hydrate has
			// nothing to restore it from. A later issue that persists layout sets this from storage.
			pinned: false,
		};

		set((state) => ({
			documents: { ...state.documents, [id]: session },
			openDocumentIds: [...state.openDocumentIds, id],
		}));

		if (activate) get().activateDocument(id);
	},

	activateDocument: (id) => {
		const state = get();
		const session = state.documents[id];
		if (!session) return;

		const prevActiveId = state.activeDocumentId;
		// A switch moves away from a live document. Since `#54` opens New/Open/Import/template in a
		// new tab instead of closing the previous document first, creation flows now reach here with
		// a non-null `prevActiveId` too, so this branch flushes the outgoing document's viewport on
		// those paths as well. The *incoming* document's viewport is applied by the DfdCanvas effect,
		// the only place that runs after `syncFromModel` populates the incoming document's nodes.
		const isSwitch = prevActiveId !== null && prevActiveId !== id;
		const instance = useCanvasInstanceStore.getState();
		const chat = useChatStore.getState();

		// Leaving a document cancels any in-flight AI stream so a response started under the
		// outgoing document cannot append into the newly visible one. chat-store's abort clears
		// `isStreaming` and drops later chunks; #53 owns only this call, not the chat internals.
		chat.stopGenerating();

		if (isSwitch) {
			const outgoing = state.documents[prevActiveId];
			if (outgoing) {
				// Flush the live viewport into the outgoing document's own canvas store before the
				// swap. onMoveEnd only fires at the end of a user gesture, so a programmatic zoom
				// immediately before switching would otherwise be lost.
				if (instance.rfGetViewport) {
					outgoing.stores.canvas.setState({ viewport: instance.rfGetViewport() });
				}
				// Remember which AI session the outgoing document was on so returning restores it.
				set((s) => {
					const current = s.documents[prevActiveId];
					if (!current) return s;
					return {
						documents: {
							...s.documents,
							[prevActiveId]: { ...current, activeChatSessionId: chat.activeSessionId },
						},
					};
				});
			}
		}

		set({ activeDocumentId: id });
		setActiveStores(session.stores);

		// The incoming document's viewport is intentionally not applied here. At this point its nodes
		// are not synced yet — `syncFromModel` runs from the DfdCanvas effect after React commits — so
		// a fit-or-restore decided now would act on the outgoing document's stale geometry (the defect
		// that surfaced once creation stopped closing the previous document first). The DfdCanvas
		// effect owns the incoming viewport and runs the decision once per activation after the sync.

		// Restore the incoming document's last AI session when it still exists. switchSession
		// no-ops for an unknown id, so this fails safe when that session was deleted.
		if (session.activeChatSessionId) {
			chat.switchSession(session.activeChatSessionId);
		}
	},

	closeDocument: (id) => {
		const state = get();
		if (!state.documents[id]) return;

		const remainingIds = state.openDocumentIds.filter((docId) => docId !== id);
		const nextDocuments = { ...state.documents };
		// Dropping the session's reference releases its model, history snapshots, and canvas
		// state to garbage collection so closed-document content is not retained behind an
		// inactive pointer.
		delete nextDocuments[id];

		const wasActive = state.activeDocumentId === id;
		set({
			documents: nextDocuments,
			openDocumentIds: remainingIds,
			activeDocumentId: wasActive ? null : state.activeDocumentId,
		});

		if (!wasActive) return;

		// The active document closed. `#54` D1 activates the right neighbour in rendered order (the
		// left neighbour when the closed tab was rightmost), computed over the pre-close order.
		const nextActiveId = nextActiveDocumentId(state.openDocumentIds, id);
		if (nextActiveId !== null) {
			get().activateDocument(nextActiveId);
		} else {
			setActiveStores(createDocumentStores());
		}
	},

	setDocumentFileSettings: (id, fileSettings) =>
		set((state) => {
			const session = state.documents[id];
			if (!session) return state;
			return { documents: { ...state.documents, [id]: { ...session, fileSettings } } };
		}),

	setDocumentChatSessionId: (id, sessionId) =>
		set((state) => {
			const session = state.documents[id];
			if (!session) return state;
			return {
				documents: { ...state.documents, [id]: { ...session, activeChatSessionId: sessionId } },
			};
		}),

	reorderDocument: (id, toIndex) =>
		set((state) => {
			const session = state.documents[id];
			if (!session) return state;
			const pinnedCount = state.openDocumentIds.filter(
				(docId) => state.documents[docId]?.pinned,
			).length;
			return {
				openDocumentIds: moveDocumentInOrder(
					state.openDocumentIds,
					id,
					toIndex,
					session.pinned,
					pinnedCount,
				),
			};
		}),

	setDocumentPinned: (id, pinned) =>
		set((state) => {
			const session = state.documents[id];
			if (!session || session.pinned === pinned) return state;
			const documents: Record<DocumentId, DocumentSession> = {
				...state.documents,
				[id]: { ...session, pinned },
			};
			const pinnedIds = new Set(state.openDocumentIds.filter((docId) => documents[docId]?.pinned));
			return { documents, openDocumentIds: applyPinnedOrder(state.openDocumentIds, pinnedIds) };
		}),

	getDocumentStores: (id) => get().documents[id]?.stores ?? null,
}));

/**
 * Subscribe to a document's own store bundle. `#54` uses this to render a per-tab title and
 * dirty indicator from each document's stores without activating it.
 */
export function useDocumentStores(id: DocumentId): DocumentStores | null {
	return useDocumentRegistry((state) => state.documents[id]?.stores ?? null);
}
