import type { DocumentId } from "@/types/document";

/**
 * Browser workspace persistence contracts (issue #56).
 *
 * The persistence layer holds exactly two kinds of value: the opaque `.thf` text of a
 * document (and its bounded revision history) and a light manifest of ids, order, titles,
 * and workspace preferences. It never holds, derives, or projects a credential — the
 * disjointness is proven by `no-credentials.test.ts`, not asserted here.
 */

/**
 * The single namespace shared by both browser stores: the localStorage manifest key and the
 * IndexedDB database name. Kept disjoint from the keychain's `tf-api-key-` namespace.
 */
export const WORKSPACE_STORAGE_NAMESPACE = "threatforge-workspace";

/**
 * Retention bound for full `.thf` snapshots per document. Mirrors the history store's cap;
 * the write transaction prunes the oldest revisions beyond this count.
 */
export const MAX_REVISIONS_PER_DOCUMENT = 20;

/**
 * Schema version of the localStorage manifest projection. Independent of the IndexedDB
 * database version (`WORKSPACE_DB_VERSION`) because the two stores evolve separately.
 */
export const WORKSPACE_MANIFEST_VERSION = 1;

/**
 * The authoritative pointer record for one document in the IndexedDB `documents` store. It
 * carries no body: `currentRevisionId` references the live revision in the `revisions` store.
 */
export interface PersistedDocumentRecord {
	/** The branded `doc-<uuid>` identity, also the store's key path. */
	id: DocumentId;
	/** The revision the document currently resolves to. Flipped atomically on every write. */
	currentRevisionId: string;
	/** ISO timestamp of the last committed write. */
	updatedAt: string;
}

/**
 * One full `.thf` snapshot in the IndexedDB `revisions` store. Every revision is an
 * independently openable `.thf` file, which is what makes `#55` export a trivial blob write.
 */
export interface DocumentRevisionRecord {
	/** `${documentId}#${seq}` — unique per revision and monotonic within a document. */
	revisionId: string;
	/** The owning document's identity; indexed for cheap latest-N and prune-oldest queries. */
	documentId: DocumentId;
	/** The exact text produced by `serializeThreatModelYaml` — opaque to the storage layer. */
	thf: string;
	/** Per-document monotonic counter; the second component of the `by_document` index key. */
	seq: number;
	/** ISO timestamp of when this revision was written. */
	createdAt: string;
}

/**
 * One entry in the localStorage manifest: enough to render an un-hydrated tab (`#54`) without
 * touching IndexedDB. Reconciled against the authoritative `documents` store at boot.
 */
export interface WorkspaceManifestEntry {
	/** The branded document identity; the join key against the IndexedDB `documents` store. */
	id: DocumentId;
	/** Cached title for labelling a tab before its body is hydrated. */
	title: string;
	/** Adapter metadata, never identity; null for a browser document with no on-disk file. */
	filePath: string | null;
	/** Persisted tab order. User reorder is `#54`; #56 only preserves the value. */
	order: number;
	/** ISO timestamp; advisory and reconciled against IndexedDB, never authoritative. */
	updatedAt: string;
}

/**
 * Workspace-scoped preferences projected into the manifest. #56 defines none; future issues
 * extend this type. Never user settings, never file settings, never a credential.
 */
export type WorkspacePreferences = Record<string, never>;

/** The full localStorage manifest projection (D1). The only thing read to render the shell. */
export interface WorkspaceManifest {
	/** Manifest schema version; see `WORKSPACE_MANIFEST_VERSION`. */
	schemaVersion: number;
	/** Open documents in persisted order. */
	documents: WorkspaceManifestEntry[];
	/** The persisted active-document pointer, or null. */
	activeDocumentId: DocumentId | null;
	/** Workspace preferences (see `WorkspacePreferences`). */
	preferences: WorkspacePreferences;
}

/** Lifecycle of a document's local persistence, surfaced to the status bar (D2). */
export type DocumentPersistenceStatus =
	| "idle"
	| "pending"
	| "writing"
	| "saved"
	| "error"
	| "corrupt";

/** Observable per-document persistence state. Runtime-only; never written to disk. */
export interface DocumentPersistenceState {
	/** Current persistence status. */
	status: DocumentPersistenceStatus;
	/** ISO timestamp of the last successful local persist, or null if never persisted. */
	lastPersistedAt: string | null;
}

/**
 * Why the workspace storage is unavailable, for the boot/ephemeral path (D5). A subset of
 * {@link WorkspaceStorageErrorKind}; kept as its own type because the workspace store records
 * exactly these availability reasons.
 */
export type WorkspaceUnavailableReason =
	| "unavailable"
	| "private-mode"
	| "migration-failed"
	| "corrupt";

/**
 * Every distinguishable failure the storage boundary can surface. Callers switch on `kind` —
 * notably to tell a full quota (`quota-exceeded`) apart from private mode (`private-mode`) —
 * so failures fail visibly instead of collapsing into a success-shaped fallback.
 */
export type WorkspaceStorageErrorKind =
	| WorkspaceUnavailableReason
	| "quota-exceeded"
	| "aborted"
	| "not-found"
	| "unknown";

/**
 * The only error type the storage boundary throws. It carries a user-safe message and a
 * machine-readable `kind`; it never embeds a raw internal error string or a secret.
 */
export class WorkspaceStorageError extends Error {
	readonly kind: WorkspaceStorageErrorKind;

	constructor(kind: WorkspaceStorageErrorKind, message: string) {
		super(message);
		this.name = "WorkspaceStorageError";
		this.kind = kind;
	}
}
