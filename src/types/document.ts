import type { DocumentStores } from "@/stores/document-stores";
import type { FileSettings } from "@/types/threat-model";

/**
 * Opaque workspace identity for an open document.
 *
 * The brand makes "document identity is independent of the file path" a compile-time
 * property: a `filePath`, title, or any other plain string cannot be passed where a
 * document identity is required.
 *
 * Document ids exist only at runtime and in workspace metadata. They are never derived
 * from a file path, title, or model content, and are never written to a `.thf` file.
 */
export type DocumentId = string & { readonly __brand: "DocumentId" };

/**
 * One open document owned by the registry. The registry keeps exactly one session per
 * open document and never copies state between sessions: everything document-scoped lives
 * inside `stores`, so activating another document cannot expose this document's canvas,
 * history, or selection.
 *
 * `fileSettings` and `activeChatSessionId` are the two document-scoped values that do not
 * yet live in a store bundle. `#53` step 6 moves `fileSettings` off the workspace settings
 * store into this record; step 8 populates `activeChatSessionId`. Neither field holds
 * credentials or AI conversation content.
 */
export interface DocumentSession {
	/** Stable, path-independent identity that survives Save As, rename, and path changes. */
	id: DocumentId;
	/** ISO timestamp of when the document was opened, for ordering and diagnostics. */
	createdAt: string;
	/** The document's own isolated model, canvas, and history stores. */
	stores: DocumentStores;
	/** File-scoped settings from `metadata.settings`, or null when the model carries none. */
	fileSettings: FileSettings | null;
	/** Reference to the AI session this document last used, or null. Populated from step 8. */
	activeChatSessionId: string | null;
	/**
	 * Whether the tab is pinned to the leading pinned block (`#54` D5). Pinning is ordering plus
	 * identity, not close protection. Session-scoped and unpersisted: `#54` writes no tab order or
	 * pin state to storage, so a reload loses it — as it currently loses the whole workspace.
	 */
	pinned: boolean;
}
