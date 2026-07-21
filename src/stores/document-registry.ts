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
		const state = get();
		const session = state.documents[id];
		if (!session) return;

		const prevActiveId = state.activeDocumentId;
		// A real switch moves between two live documents. Creation flows (New, Open, Import,
		// template) reach here with `prevActiveId === null` because they close the previous
		// document first, so their viewport/session behavior is left to the DfdCanvas mount
		// and stays pixel-identical to the single-document path.
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

		if (isSwitch) {
			// Restore the incoming document's on-screen viewport. A document that has never been
			// laid out (no nodes yet) keeps the existing fit-to-view behavior.
			const incoming = session.stores.canvas.getState();
			if (incoming.nodes.length > 0) {
				instance.rfSetViewport?.(incoming.viewport);
			} else {
				instance.rfFitView?.();
			}
		}

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
