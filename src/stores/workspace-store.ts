import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
	type DocumentPersistenceState,
	WORKSPACE_MANIFEST_VERSION,
	WORKSPACE_STORAGE_NAMESPACE,
	type WorkspaceManifestEntry,
	type WorkspacePreferences,
	type WorkspaceUnavailableReason,
} from "@/lib/persistence/types";
import type { DocumentId } from "@/types/document";

/** Outcome of reconciling the localStorage manifest against the authoritative IndexedDB store. */
export interface ManifestReconciliation {
	/** Manifest entries that still have a backing IndexedDB record. */
	kept: WorkspaceManifestEntry[];
	/** Ids dropped from the manifest because IndexedDB has no record for them. */
	droppedIds: DocumentId[];
	/** Ids present in IndexedDB but absent from the manifest — recoverable orphans (`#55`). */
	orphanIds: DocumentId[];
}

/**
 * The two-projection reconciliation rule (D5). The IndexedDB `documents` store is authoritative
 * for existence; the localStorage manifest is a fast-render projection. When they disagree:
 *
 * - a manifest entry with no IndexedDB record is stale and dropped;
 * - an IndexedDB record with no manifest entry is a recoverable orphan (surfaced, never lost).
 *
 * Pure and side-effect free so it can be tested directly; the store action applies its result.
 */
export function reconcileManifest(
	entries: readonly WorkspaceManifestEntry[],
	storedIds: readonly DocumentId[],
): ManifestReconciliation {
	const storedIdSet = new Set(storedIds);
	const manifestIdSet = new Set(entries.map((entry) => entry.id));

	const kept: WorkspaceManifestEntry[] = [];
	const droppedIds: DocumentId[] = [];
	for (const entry of entries) {
		if (storedIdSet.has(entry.id)) {
			kept.push(entry);
		} else {
			droppedIds.push(entry.id);
		}
	}

	const orphanIds = storedIds.filter((id) => !manifestIdSet.has(id));

	return { kept, droppedIds, orphanIds };
}

/** Fields projected to localStorage under {@link WORKSPACE_STORAGE_NAMESPACE}. */
interface PersistedWorkspaceState {
	schemaVersion: number;
	documents: WorkspaceManifestEntry[];
	activeDocumentId: DocumentId | null;
	preferences: WorkspacePreferences;
}

interface WorkspaceState extends PersistedWorkspaceState {
	/** Per-document persistence status. Runtime-only; never persisted. */
	persistence: Record<DocumentId, DocumentPersistenceState>;
	/** Whether local persistence is usable this session. Runtime-only. */
	persistenceAvailable: boolean;
	/** Why persistence is unavailable, when it is. Runtime-only. */
	unavailableReason: WorkspaceUnavailableReason | null;
	/** IndexedDB records with no manifest entry, surfaced for `#55` recovery. Runtime-only. */
	recoverableDocumentIds: DocumentId[];

	/** Insert or replace a manifest entry (matched by id), preserving order for existing ids. */
	upsertManifestEntry: (entry: WorkspaceManifestEntry) => void;
	/** Remove a manifest entry and any active pointer to it. */
	removeManifestEntry: (id: DocumentId) => void;
	/** Reorder manifest entries to match the given id order; unlisted entries keep their tail. */
	setManifestOrder: (orderedIds: readonly DocumentId[]) => void;
	/** Set the persisted active-document pointer. */
	setActiveDocumentId: (id: DocumentId | null) => void;
	/** Set a document's runtime persistence state. */
	setPersistenceState: (id: DocumentId, state: DocumentPersistenceState) => void;
	/** Record whether persistence is available and, if not, why. */
	setPersistenceAvailability: (
		available: boolean,
		reason?: WorkspaceUnavailableReason | null,
	) => void;
	/** Apply {@link reconcileManifest} against the authoritative stored ids. */
	reconcile: (storedIds: readonly DocumentId[]) => void;
}

const INITIAL_PERSISTED: PersistedWorkspaceState = {
	schemaVersion: WORKSPACE_MANIFEST_VERSION,
	documents: [],
	activeDocumentId: null,
	preferences: {},
};

/**
 * The workspace store: the localStorage manifest projection plus runtime persistence
 * observability (issue #56, D1/D2). Only the manifest slice is written to localStorage;
 * persistence status, availability, and orphan lists are runtime-only, mirroring the
 * `settings-store` persist convention.
 */
export const useWorkspaceStore = create<WorkspaceState>()(
	persist(
		(set) => ({
			...INITIAL_PERSISTED,
			persistence: {},
			persistenceAvailable: false,
			unavailableReason: null,
			recoverableDocumentIds: [],

			upsertManifestEntry: (entry) =>
				set((state) => {
					const index = state.documents.findIndex((existing) => existing.id === entry.id);
					if (index === -1) {
						return { documents: [...state.documents, entry] };
					}
					const documents = state.documents.slice();
					documents[index] = entry;
					return { documents };
				}),

			removeManifestEntry: (id) =>
				set((state) => ({
					documents: state.documents.filter((entry) => entry.id !== id),
					activeDocumentId: state.activeDocumentId === id ? null : state.activeDocumentId,
				})),

			setManifestOrder: (orderedIds) =>
				set((state) => {
					const rank = new Map(orderedIds.map((id, index) => [id, index]));
					const documents = state.documents
						.slice()
						.sort(
							(a, b) =>
								(rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
								(rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
						);
					return { documents };
				}),

			setActiveDocumentId: (id) => set({ activeDocumentId: id }),

			setPersistenceState: (id, state) =>
				set((current) => ({
					persistence: { ...current.persistence, [id]: state },
				})),

			setPersistenceAvailability: (available, reason = null) =>
				set({ persistenceAvailable: available, unavailableReason: available ? null : reason }),

			reconcile: (storedIds) =>
				set((state) => {
					const { kept, orphanIds } = reconcileManifest(state.documents, storedIds);
					const keptIds = new Set(kept.map((entry) => entry.id));
					return {
						documents: kept,
						activeDocumentId:
							state.activeDocumentId && keptIds.has(state.activeDocumentId)
								? state.activeDocumentId
								: null,
						recoverableDocumentIds: orphanIds,
					};
				}),
		}),
		{
			name: WORKSPACE_STORAGE_NAMESPACE,
			storage: createJSONStorage(() => localStorage),
			// Persist only the manifest slice: never persistence status, availability, orphans, a
			// body, a revision, or a credential.
			partialize: (state): PersistedWorkspaceState => ({
				schemaVersion: state.schemaVersion,
				documents: state.documents,
				activeDocumentId: state.activeDocumentId,
				preferences: state.preferences,
			}),
		},
	),
);
