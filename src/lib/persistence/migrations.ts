import { WORKSPACE_MANIFEST_VERSION } from "./types";

/**
 * IndexedDB schema for the browser workspace database (issue #56).
 *
 * The schema is expressed as an ordered list of single-step migrations. Store creation is the
 * `0 -> 1` migration rather than a pre-step, so every schema change — the first one included —
 * runs through the same transactional, fail-closed mechanism: any migration that throws aborts
 * the whole version-change transaction and leaves the database at its prior version. A future
 * schema change is therefore a new `MIGRATIONS` entry (a data change), not a mechanism change.
 */

/** Current IndexedDB schema version. Bump this and append a migration to evolve the schema. */
export const WORKSPACE_DB_VERSION = 1;

/** Object store holding one pointer record per document (`PersistedDocumentRecord`). */
export const STORE_DOCUMENTS = "documents";
/** Object store holding full `.thf` snapshots (`DocumentRevisionRecord`). */
export const STORE_REVISIONS = "revisions";
/** Object store holding schema markers and future migration bookkeeping. */
export const STORE_META = "meta";
/** Compound index `[documentId, seq]` giving cheap latest-N and prune-oldest without scanning. */
export const INDEX_BY_DOCUMENT = "by_document";

/** A single-step schema migration applied inside the version-change transaction. */
export interface WorkspaceMigration {
	/** The version this migration upgrades from. */
	from: number;
	/** The version this migration upgrades to; always `from + 1`. */
	to: number;
	/**
	 * Apply the migration. Runs inside the version-change transaction; both the database (for
	 * store/index creation) and that transaction (for data transforms) are provided. Throwing
	 * aborts the transaction and fails the open closed.
	 */
	upgrade(db: IDBDatabase, transaction: IDBTransaction): void;
}

/** The `0 -> 1` migration: create the three stores, the compound index, and the schema marker. */
function createInitialSchema(db: IDBDatabase): void {
	if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
		db.createObjectStore(STORE_DOCUMENTS, { keyPath: "id" });
	}
	if (!db.objectStoreNames.contains(STORE_REVISIONS)) {
		const revisions = db.createObjectStore(STORE_REVISIONS, { keyPath: "revisionId" });
		revisions.createIndex(INDEX_BY_DOCUMENT, ["documentId", "seq"], { unique: false });
	}
	if (!db.objectStoreNames.contains(STORE_META)) {
		const meta = db.createObjectStore(STORE_META, { keyPath: "key" });
		// A readable schema marker independent of the IndexedDB version integer, for future
		// corruption checks and migration bookkeeping.
		meta.put({ key: "schemaVersion", value: WORKSPACE_DB_VERSION });
		meta.put({ key: "manifestVersion", value: WORKSPACE_MANIFEST_VERSION });
	}
}

/**
 * Ordered, contiguous list of schema migrations. Entry `i` upgrades from `i` to `i + 1`.
 * Append a new entry (never edit a shipped one) to evolve the schema.
 */
export const MIGRATIONS: readonly WorkspaceMigration[] = [
	{ from: 0, to: 1, upgrade: createInitialSchema },
];

/**
 * Apply every migration in the half-open span `(oldVersion, newVersion]`, in ascending order,
 * against the supplied version-change transaction.
 *
 * A migration throwing propagates to the caller (which aborts the transaction), so a failed
 * upgrade never half-applies. `migrations` is injectable purely so the migration harness can be
 * exercised in isolation; production always uses the module `MIGRATIONS`.
 */
export function runMigrations(
	db: IDBDatabase,
	transaction: IDBTransaction,
	oldVersion: number,
	newVersion: number,
	migrations: readonly WorkspaceMigration[] = MIGRATIONS,
): void {
	for (const migration of migrations) {
		if (migration.to > oldVersion && migration.to <= newVersion) {
			migration.upgrade(db, transaction);
		}
	}
}
