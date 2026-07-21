import type { DocumentId } from "@/types/document";
import type { DocumentRevisionRecord, PersistedDocumentRecord } from "./types";

/**
 * The browser workspace storage contract (issue #56).
 *
 * Implemented over IndexedDB in the browser (`IndexeddbWorkspaceStorage`) and by a no-op on
 * the desktop (`NoopWorkspaceStorage`), selected by `getWorkspaceStorage`. Every method either
 * resolves with data or rejects with a typed {@link WorkspaceStorageError}; no raw internal
 * error crosses this boundary. The stored body is opaque `.thf` text, so the layer never
 * parses, interprets, or projects document content.
 */
export interface WorkspaceStorage {
	/**
	 * Whether persistence is usable in this environment. Resolves false (never throws) when
	 * IndexedDB is missing or blocked (e.g. private mode), so the caller can enter ephemeral
	 * mode instead of crashing.
	 */
	isAvailable(): Promise<boolean>;

	/** Every document pointer record, for boot reconciliation against the manifest. */
	listDocuments(): Promise<PersistedDocumentRecord[]>;

	/**
	 * The current `.thf` text for a document, or null when no such document is stored. Rejects
	 * with a `corrupt` error when the pointer references a missing revision — never a silent
	 * empty body.
	 */
	readDocumentBody(id: DocumentId): Promise<string | null>;

	/**
	 * Persist a new revision of a document's `.thf` text and atomically flip its pointer to it,
	 * pruning history beyond {@link MAX_REVISIONS_PER_DOCUMENT}. Rejects with a typed error
	 * (e.g. `quota-exceeded`) on failure, leaving the prior committed revision intact.
	 *
	 * Title, file path, and order live in the localStorage manifest, not in IndexedDB, so they
	 * are not parameters here (see D1: the `documents` record carries no title or path).
	 */
	writeDocumentBody(id: DocumentId, thf: string): Promise<void>;

	/** Remove a document and all its revisions. A user-confirmed `#55` action, never automatic. */
	deleteDocument(id: DocumentId): Promise<void>;

	/** Every stored revision for a document, oldest first, for `#55` recovery and inspection. */
	listRevisions(id: DocumentId): Promise<DocumentRevisionRecord[]>;
}
