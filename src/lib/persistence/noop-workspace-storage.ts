import type { DocumentId } from "@/types/document";
import type { DocumentRevisionRecord, PersistedDocumentRecord } from "./types";
import type { WorkspaceStorage } from "./workspace-storage";

/**
 * Desktop workspace storage: a no-op (issue #56, D4).
 *
 * On the desktop the filesystem is the source of truth, so browser workspace persistence must
 * not run. This implementation satisfies the full {@link WorkspaceStorage} contract while
 * touching no IndexedDB: `isAvailable` is false and every read is empty, so the shared hooks
 * can mount on both platforms with no branching of their own and never persist on desktop.
 */
export class NoopWorkspaceStorage implements WorkspaceStorage {
	async isAvailable(): Promise<boolean> {
		return false;
	}

	async listDocuments(): Promise<PersistedDocumentRecord[]> {
		return [];
	}

	async readDocumentBody(_id: DocumentId): Promise<string | null> {
		return null;
	}

	async writeDocumentBody(_id: DocumentId, _thf: string): Promise<void> {
		// Desktop persistence is the filesystem; nothing to store here.
	}

	async deleteDocument(_id: DocumentId): Promise<void> {
		// No stored workspace document to delete on desktop.
	}

	async listRevisions(_id: DocumentId): Promise<DocumentRevisionRecord[]> {
		return [];
	}
}
