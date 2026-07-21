import { create } from "zustand";
import { createDocumentId } from "@/lib/document-id";
import type { DocumentId, DocumentSession } from "@/types/document";
import type { DiagramLayout, FileSettings, ThreatModel } from "@/types/threat-model";
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
		};

		set((state) => ({
			documents: { ...state.documents, [id]: session },
			openDocumentIds: [...state.openDocumentIds, id],
		}));

		get().activateDocument(id);
		return id;
	},

	activateDocument: (id) => {
		const session = get().documents[id];
		if (!session) return;
		set({ activeDocumentId: id });
		setActiveStores(session.stores);
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

		// The active document closed. Activation policy on close (which sibling becomes active)
		// is owned by the tab UX in #54; here we deterministically fall back to the most
		// recently created document still open.
		const nextActiveId = remainingIds[remainingIds.length - 1];
		if (nextActiveId !== undefined) {
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

	getDocumentStores: (id) => get().documents[id]?.stores ?? null,
}));

/**
 * Subscribe to a document's own store bundle. `#54` uses this to render a per-tab title and
 * dirty indicator from each document's stores without activating it.
 */
export function useDocumentStores(id: DocumentId): DocumentStores | null {
	return useDocumentRegistry((state) => state.documents[id]?.stores ?? null);
}
