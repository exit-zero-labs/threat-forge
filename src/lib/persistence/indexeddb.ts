import {
	MIGRATIONS,
	runMigrations,
	WORKSPACE_DB_VERSION,
	type WorkspaceMigration,
} from "./migrations";
import { WORKSPACE_STORAGE_NAMESPACE, WorkspaceStorageError } from "./types";

/** Options for {@link openWorkspaceDb}. Overrides exist only to exercise the upgrade harness. */
export interface OpenWorkspaceDbOptions {
	/** Database name; defaults to the shared workspace namespace. */
	name?: string;
	/** Target schema version; defaults to {@link WORKSPACE_DB_VERSION}. */
	version?: number;
	/** Migration list to apply; defaults to the module `MIGRATIONS`. */
	migrations?: readonly WorkspaceMigration[];
}

/**
 * Map a raw open-time failure to a typed, user-safe reason. Private-mode browsers surface a
 * `SecurityError`; everything else that prevents opening is `unavailable`. No raw internal
 * message is propagated.
 */
function mapOpenError(error: unknown): WorkspaceStorageError {
	if (error instanceof WorkspaceStorageError) return error;
	const name = error instanceof DOMException ? error.name : "";
	if (name === "SecurityError" || name === "InvalidStateError") {
		return new WorkspaceStorageError(
			"private-mode",
			"Local storage is blocked in this browser mode, so this workspace cannot be saved.",
		);
	}
	return new WorkspaceStorageError(
		"unavailable",
		"Local storage is unavailable, so this workspace cannot be saved.",
	);
}

/**
 * Map a read/write failure (a `DOMException` from a request, transaction, or a synchronous
 * throw) to a typed error the caller can branch on. A full quota surfaces distinctly from an
 * abort or an unknown internal failure; no raw internal message crosses the boundary.
 */
export function mapWorkspaceError(error: unknown): WorkspaceStorageError {
	if (error instanceof WorkspaceStorageError) return error;
	const name =
		error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";
	switch (name) {
		case "QuotaExceededError":
			return new WorkspaceStorageError(
				"quota-exceeded",
				"Local storage is full, so recent changes could not be saved.",
			);
		case "AbortError":
			return new WorkspaceStorageError(
				"aborted",
				"The workspace write was aborted before it committed.",
			);
		case "SecurityError":
		case "InvalidStateError":
			return new WorkspaceStorageError(
				"private-mode",
				"Local storage is blocked in this browser mode, so this workspace cannot be saved.",
			);
		default:
			return new WorkspaceStorageError("unknown", "The workspace storage operation failed.");
	}
}

/**
 * Open the workspace IndexedDB database, creating or migrating its schema inside a single
 * transactional `onupgradeneeded`. Rejects with a typed {@link WorkspaceStorageError}:
 *
 * - `unavailable` when `indexedDB` is absent or the open otherwise fails;
 * - `private-mode` when the browser blocks IndexedDB (private/restricted context);
 * - `migration-failed` when a migration throws — the transaction aborts and the database is
 *   left at its prior version, never half-migrated. The database is never deleted on failure.
 */
export function openWorkspaceDb(options: OpenWorkspaceDbOptions = {}): Promise<IDBDatabase> {
	const {
		name = WORKSPACE_STORAGE_NAMESPACE,
		version = WORKSPACE_DB_VERSION,
		migrations = MIGRATIONS,
	} = options;

	return new Promise<IDBDatabase>((resolve, reject) => {
		const factory = globalThis.indexedDB;
		if (!factory) {
			reject(
				new WorkspaceStorageError(
					"unavailable",
					"Local storage is unavailable, so this workspace cannot be saved.",
				),
			);
			return;
		}

		let request: IDBOpenDBRequest;
		try {
			request = factory.open(name, version);
		} catch (error) {
			// Some private-mode browsers throw synchronously from `open()`.
			reject(mapOpenError(error));
			return;
		}

		// Captured so `onerror` can distinguish a migration abort from a plain open failure.
		let migrationError: unknown = null;

		request.onupgradeneeded = (event) => {
			const db = request.result;
			const transaction = request.transaction;
			if (!transaction) {
				// The version-change transaction is always present here; treat its absence as a
				// fail-closed migration failure rather than proceeding without one.
				migrationError = new WorkspaceStorageError(
					"migration-failed",
					"The workspace database could not be upgraded.",
				);
				return;
			}
			try {
				runMigrations(db, transaction, event.oldVersion, event.newVersion ?? version, migrations);
			} catch (error) {
				migrationError = error;
				// Abort the version-change transaction: IndexedDB rolls the upgrade back atomically,
				// so the database stays at its prior version instead of half-migrating.
				transaction.abort();
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => {
			reject(
				migrationError
					? new WorkspaceStorageError(
							"migration-failed",
							"The workspace database could not be upgraded and was left unchanged.",
						)
					: mapOpenError(request.error),
			);
		};
		request.onblocked = () => {
			reject(
				new WorkspaceStorageError(
					"unavailable",
					"The workspace database is in use by another tab and could not be opened.",
				),
			);
		};
	});
}
