import type { DocumentId } from "@/types/document";
import { mapWorkspaceError, openWorkspaceDb } from "./indexeddb";
import { INDEX_BY_DOCUMENT, STORE_DOCUMENTS, STORE_REVISIONS } from "./migrations";
import {
	type DocumentRevisionRecord,
	MAX_REVISIONS_PER_DOCUMENT,
	type PersistedDocumentRecord,
	WorkspaceStorageError,
} from "./types";
import type { WorkspaceStorage } from "./workspace-storage";

/**
 * Observability seam for the crash-safety test only. Production callers never pass hooks.
 *
 * IndexedDB commits a transaction atomically, which makes the write ordering (revision first,
 * pointer flip second, both in one transaction) impossible to observe from the outside. This
 * seam lets the test abort the live transaction after both writes are queued but before it
 * commits, proving the prior committed revision and pointer survive a mid-write abort.
 */
export interface WorkspaceWriteHooks {
	/** Invoked once with the live write transaction after both writes are queued, pre-commit. */
	beforeCommit?: (transaction: IDBTransaction) => void;
}

/** Build the unique, monotonic revision id for a document/seq pair. */
function revisionIdFor(documentId: DocumentId, seq: number): string {
	return `${documentId}#${seq}`;
}

/** Key range covering every `[documentId, seq]` index entry for one document. */
function documentSeqRange(documentId: DocumentId): IDBKeyRange {
	// `[]` sorts after every number, so this bounds the whole `[documentId, *]` sub-range.
	return IDBKeyRange.bound([documentId], [documentId, []]);
}

/** Abort a transaction without throwing if it has already settled. */
function safeAbort(transaction: IDBTransaction): void {
	try {
		transaction.abort();
	} catch {
		// Already committed or aborting; nothing to undo.
	}
}

/**
 * IndexedDB-backed workspace storage (issue #56, D3).
 *
 * One open connection is cached per instance; a fresh instance opens its own connection, which
 * is what the durability test relies on to reconnect and read a committed body. All failures
 * are mapped to typed {@link WorkspaceStorageError}s at this boundary.
 */
export class IndexeddbWorkspaceStorage implements WorkspaceStorage {
	private connection: Promise<IDBDatabase> | null = null;

	/** Open (once) and cache the connection; a failed open is not cached so it can be retried. */
	private open(): Promise<IDBDatabase> {
		if (!this.connection) {
			this.connection = openWorkspaceDb().catch((error: unknown) => {
				this.connection = null;
				throw error;
			});
		}
		return this.connection;
	}

	async isAvailable(): Promise<boolean> {
		try {
			await this.open();
			return true;
		} catch {
			return false;
		}
	}

	async listDocuments(): Promise<PersistedDocumentRecord[]> {
		const db = await this.open();
		return new Promise<PersistedDocumentRecord[]>((resolve, reject) => {
			const transaction = db.transaction(STORE_DOCUMENTS, "readonly");
			const request = transaction.objectStore(STORE_DOCUMENTS).getAll();
			request.onsuccess = () => {
				const records: PersistedDocumentRecord[] = request.result;
				resolve(records);
			};
			request.onerror = () => reject(mapWorkspaceError(request.error));
		});
	}

	async readDocumentBody(id: DocumentId): Promise<string | null> {
		const db = await this.open();
		return new Promise<string | null>((resolve, reject) => {
			let transaction: IDBTransaction;
			try {
				transaction = db.transaction([STORE_DOCUMENTS, STORE_REVISIONS], "readonly");
			} catch (error) {
				reject(mapWorkspaceError(error));
				return;
			}
			const pointerRequest = transaction.objectStore(STORE_DOCUMENTS).get(id);
			pointerRequest.onsuccess = () => {
				const pointer: PersistedDocumentRecord | undefined = pointerRequest.result;
				if (!pointer) {
					resolve(null);
					return;
				}
				const revisionRequest = transaction
					.objectStore(STORE_REVISIONS)
					.get(pointer.currentRevisionId);
				revisionRequest.onsuccess = () => {
					const revision: DocumentRevisionRecord | undefined = revisionRequest.result;
					if (!revision) {
						// The pointer references a missing revision: a corrupt record, never a
						// silent empty body. #55 recovers it; #56 surfaces it.
						reject(
							new WorkspaceStorageError(
								"corrupt",
								"A stored document is missing its current revision.",
							),
						);
						return;
					}
					resolve(revision.thf);
				};
				revisionRequest.onerror = () => reject(mapWorkspaceError(revisionRequest.error));
			};
			pointerRequest.onerror = () => reject(mapWorkspaceError(pointerRequest.error));
		});
	}

	async listRevisions(id: DocumentId): Promise<DocumentRevisionRecord[]> {
		const db = await this.open();
		return new Promise<DocumentRevisionRecord[]>((resolve, reject) => {
			const transaction = db.transaction(STORE_REVISIONS, "readonly");
			// getAll over the compound index returns records ordered by `[documentId, seq]`, i.e.
			// oldest revision first.
			const request = transaction
				.objectStore(STORE_REVISIONS)
				.index(INDEX_BY_DOCUMENT)
				.getAll(documentSeqRange(id));
			request.onsuccess = () => {
				const records: DocumentRevisionRecord[] = request.result;
				resolve(records);
			};
			request.onerror = () => reject(mapWorkspaceError(request.error));
		});
	}

	async writeDocumentBody(id: DocumentId, thf: string, hooks?: WorkspaceWriteHooks): Promise<void> {
		const db = await this.open();
		await new Promise<void>((resolve, reject) => {
			let settled = false;
			const fail = (error: unknown) => {
				if (settled) return;
				settled = true;
				reject(mapWorkspaceError(error));
			};
			const succeed = () => {
				if (settled) return;
				settled = true;
				resolve();
			};

			let transaction: IDBTransaction;
			try {
				transaction = db.transaction([STORE_DOCUMENTS, STORE_REVISIONS], "readwrite");
			} catch (error) {
				fail(error);
				return;
			}

			transaction.oncomplete = () => succeed();
			transaction.onabort = () =>
				fail(
					transaction.error ??
						new WorkspaceStorageError(
							"aborted",
							"The workspace write was aborted before it committed.",
						),
				);
			transaction.onerror = () => fail(transaction.error);

			const documents = transaction.objectStore(STORE_DOCUMENTS);
			const revisions = transaction.objectStore(STORE_REVISIONS);
			const byDocument = revisions.index(INDEX_BY_DOCUMENT);

			// 1. Find the current highest seq for this document without reading any body.
			const highestSeqRequest = byDocument.openKeyCursor(documentSeqRange(id), "prev");
			highestSeqRequest.onerror = () => fail(highestSeqRequest.error);
			highestSeqRequest.onsuccess = () => {
				try {
					const cursor = highestSeqRequest.result;
					const key = cursor?.key;
					const currentSeq = Array.isArray(key) && typeof key[1] === "number" ? key[1] : 0;
					const seq = currentSeq + 1;
					const revisionId = revisionIdFor(id, seq);
					const now = new Date().toISOString();

					// 2. Write the new full-snapshot revision first.
					const revision: DocumentRevisionRecord = {
						revisionId,
						documentId: id,
						thf,
						seq,
						createdAt: now,
					};
					revisions.put(revision);

					// 3. Flip the pointer to the new revision, in the same transaction.
					const pointer: PersistedDocumentRecord = {
						id,
						currentRevisionId: revisionId,
						updatedAt: now,
					};
					documents.put(pointer);

					// 4. Prune the oldest revisions beyond the retention bound. getAllKeys returns
					// primary keys ordered by `[documentId, seq]`, so the leading keys are oldest.
					const keysRequest = byDocument.getAllKeys(documentSeqRange(id));
					keysRequest.onerror = () => fail(keysRequest.error);
					keysRequest.onsuccess = () => {
						try {
							const keys = keysRequest.result;
							const excess = keys.length - MAX_REVISIONS_PER_DOCUMENT;
							for (let i = 0; i < excess; i++) {
								revisions.delete(keys[i]);
							}
							// 5. The transaction now auto-commits. The seam lets the crash-safety test
							// abort here, before commit, to prove the prior revision survives.
							hooks?.beforeCommit?.(transaction);
						} catch (error) {
							fail(error);
							safeAbort(transaction);
						}
					};
				} catch (error) {
					fail(error);
					safeAbort(transaction);
				}
			};
		});
	}

	async deleteDocument(id: DocumentId): Promise<void> {
		const db = await this.open();
		await new Promise<void>((resolve, reject) => {
			let transaction: IDBTransaction;
			try {
				transaction = db.transaction([STORE_DOCUMENTS, STORE_REVISIONS], "readwrite");
			} catch (error) {
				reject(mapWorkspaceError(error));
				return;
			}
			transaction.oncomplete = () => resolve();
			transaction.onabort = () => reject(mapWorkspaceError(transaction.error));
			transaction.onerror = () => reject(mapWorkspaceError(transaction.error));

			const revisions = transaction.objectStore(STORE_REVISIONS);
			transaction.objectStore(STORE_DOCUMENTS).delete(id);
			const keysRequest = revisions.index(INDEX_BY_DOCUMENT).getAllKeys(documentSeqRange(id));
			keysRequest.onsuccess = () => {
				for (const key of keysRequest.result) {
					revisions.delete(key);
				}
			};
		});
	}
}
