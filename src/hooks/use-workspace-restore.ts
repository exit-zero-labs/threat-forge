import { useEffect } from "react";
import { buildLayoutFromModel } from "@/lib/model-layout-utils";
import { getWorkspaceStorage } from "@/lib/persistence/get-workspace-storage";
import {
	WorkspaceStorageError,
	type WorkspaceStorageErrorKind,
	type WorkspaceUnavailableReason,
} from "@/lib/persistence/types";
import { isTauri } from "@/lib/platform";
import { validateThreatModelVersion } from "@/lib/thf-validation";
import { parseThreatModelYaml } from "@/lib/thf-yaml";
import { useDocumentRegistry } from "@/stores/document-registry";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { DocumentId } from "@/types/document";
import type { ThreatModel } from "@/types/threat-model";

/** Map a storage failure to the availability reason the ephemeral-mode notice renders. */
function unavailableReasonFor(error: unknown): WorkspaceUnavailableReason {
	if (!(error instanceof WorkspaceStorageError)) return "unavailable";
	switch (error.kind) {
		case "private-mode":
		case "migration-failed":
		case "corrupt":
			return error.kind;
		default:
			return "unavailable";
	}
}

/**
 * Mark a document unreadable without destroying it (D5). A corrupt record is never deleted and
 * never auto-activated; `#55` renders the recovery affordance over this state.
 */
function markUnreadable(id: DocumentId, error: unknown): void {
	const kind: WorkspaceStorageErrorKind =
		error instanceof WorkspaceStorageError ? error.kind : "unknown";
	useWorkspaceStore.getState().setPersistenceState(id, {
		status: kind === "corrupt" ? "corrupt" : "error",
		lastPersistedAt: null,
		errorKind: kind,
	});
}

/**
 * Read one stored document and rebuild its registry session under its persisted identity.
 *
 * Exported for `#54`: activating a tab whose document was never hydrated calls this to load that
 * one body on demand. Returns false when the document could not be hydrated — the caller falls
 * back rather than showing an empty document as if it were the restored one.
 */
export async function hydrateDocumentById(
	id: DocumentId,
	options: { activate: boolean } = { activate: true },
): Promise<boolean> {
	const registry = useDocumentRegistry.getState();
	if (registry.documents[id]) {
		// Already live in this session; never re-read stored text over in-memory work.
		if (options.activate) registry.activateDocument(id);
		return true;
	}

	const entry = useWorkspaceStore.getState().documents.find((candidate) => candidate.id === id);
	// Whether this document was a manifest tab when the read began. A document that is *not* in the
	// manifest is an explicit orphan recovery (D5) and is always allowed through; a document that
	// *is* must still be a manifest tab when its body finishes loading, so closing its tab mid-read
	// cannot resurrect it below.
	const hadManifestEntry = entry !== undefined;

	let thf: string | null;
	try {
		const storage = await getWorkspaceStorage();
		thf = await storage.readDocumentBody(id);
	} catch (error) {
		markUnreadable(id, error);
		return false;
	}
	if (thf === null) return false;

	// The read is async, so re-read the current state now that it has resolved.
	const current = useDocumentRegistry.getState();
	if (current.documents[id]) {
		// A concurrent hydration already rebuilt this session; do not read stored text over it.
		if (options.activate) current.activateDocument(id);
		return true;
	}
	if (hadManifestEntry && !useWorkspaceStore.getState().documents.some((c) => c.id === id)) {
		// The tab was closed while its body was being read. Its manifest entry is gone, so
		// re-adding it now would resurrect a document the user just closed. Refuse.
		return false;
	}

	let model: ThreatModel;
	try {
		model = parseThreatModelYaml(thf);
		// Workspace bodies are app-authored in-progress models, so restore deliberately does not
		// re-run full reference validation. It must still enforce ADR-009's exact schema-version
		// gate: an older cached build may not hydrate and later rewrite a newer-format body.
		validateThreatModelVersion(model.version);
	} catch {
		// Unparseable stored text is a corrupt record: mark it, keep it, and let the caller move
		// on. The parser's own message describes the document, so only the typed state is kept.
		markUnreadable(
			id,
			new WorkspaceStorageError("corrupt", "A stored document could not be read."),
		);
		return false;
	}

	useDocumentRegistry.getState().hydrateDocument({
		id,
		model,
		filePath: entry?.filePath ?? null,
		pendingLayout: buildLayoutFromModel(model),
		// A hydrate of a document with no manifest entry is a recovered orphan (D5); it enters
		// the session now, so "now" is the honest creation time for it.
		createdAt: entry?.createdAt ?? new Date().toISOString(),
		activate: options.activate,
		insertIndex: persistedSlotIndex(id),
	});
	return true;
}

/**
 * The index in `openDocumentIds` a newly hydrated document should occupy so the rendered tab order
 * keeps its persisted position instead of jumping to the end (`#56`). It is the count of
 * already-hydrated documents that precede this one in the localStorage manifest, floored past any
 * pinned block so an unpinned restored tab never lands inside it. A document the manifest does not
 * list (a recovered orphan) appends.
 */
function persistedSlotIndex(id: DocumentId): number {
	const registry = useDocumentRegistry.getState();
	const manifestOrder = useWorkspaceStore.getState().documents.map((entry) => entry.id);
	const myRank = manifestOrder.indexOf(id);
	const openDocumentIds = registry.openDocumentIds;
	if (myRank === -1) return openDocumentIds.length;

	let slot = 0;
	let pinnedCount = 0;
	for (const openId of openDocumentIds) {
		if (registry.documents[openId]?.pinned) pinnedCount += 1;
		const rank = manifestOrder.indexOf(openId);
		if (rank !== -1 && rank < myRank) slot += 1;
	}
	return Math.max(slot, pinnedCount);
}

/**
 * Browser workspace restore (issue #56, step 8 / D4).
 *
 * The localStorage manifest is already in memory when the shell first paints (the workspace
 * store rehydrates it synchronously), so nothing here blocks first render. This effect then does
 * the async part after paint: reconcile the manifest against the authoritative IndexedDB
 * records and hydrate **only the active document's** body. Every other document stays a manifest
 * descriptor until `#54` activates it through `hydrateDocumentById`, which is what keeps a large
 * workspace from paying a startup cost per document.
 */
export function useWorkspaceRestore(): void {
	useEffect(() => {
		// Desktop keeps file-based persistence: the filesystem is the source of truth there, so no
		// workspace body is stored and no "this session won't be saved" notice applies. This is the
		// deliberate platform seam, not a fallback; `getWorkspaceStorage` also resolves a no-op.
		if (isTauri()) return;

		let cancelled = false;

		void (async () => {
			const workspace = useWorkspaceStore.getState();
			let storedIds: DocumentId[];
			try {
				const storage = await getWorkspaceStorage();
				storedIds = (await storage.listDocuments()).map((record) => record.id);
			} catch (error) {
				if (cancelled) return;
				// Ephemeral mode: the app stays fully usable and the notice says so. The database is
				// never deleted to clear the failure.
				workspace.setPersistenceAvailability(false, unavailableReasonFor(error));
				return;
			}
			if (cancelled) return;

			workspace.reconcile(storedIds);

			const state = useWorkspaceStore.getState();
			// Try the persisted active document first, or the first manifest document when stale
			// metadata left no active pointer. Fall back through the remaining manifest order so one
			// unreadable document cannot cost the user the whole workspace.
			const candidates = state.activeDocumentId
				? [
						state.activeDocumentId,
						...state.documents
							.map((entry) => entry.id)
							.filter((id) => id !== state.activeDocumentId),
					]
				: state.documents.map((entry) => entry.id);
			for (const id of candidates) {
				if (cancelled) return;
				// A user may activate another restored tab while the boot read is pending. Hydrate
				// without activation, then claim the active pointer only if no user-selected document
				// is live; otherwise the boot task must not steal focus when its slower read resolves.
				const hydrated = await hydrateDocumentById(id, { activate: false });
				if (cancelled) return;
				if (!hydrated) continue;
				const registry = useDocumentRegistry.getState();
				if (registry.activeDocumentId === null) {
					registry.activateDocument(id);
					useWorkspaceStore.getState().setActiveDocumentId(id);
				} else {
					// A user activation won while the boot read was pending. Mirror that settled
					// choice into the manifest before persistence is enabled.
					useWorkspaceStore.getState().setActiveDocumentId(registry.activeDocumentId);
				}
				break;
			}

			if (cancelled) return;
			// Availability is announced last, so autosave starts only once restore has settled.
			// Enabling it earlier would let the "no document is open" branch of the autosave hook
			// run against the not-yet-hydrated registry and clear the persisted active pointer.
			workspace.setPersistenceAvailability(true);
		})();

		return () => {
			cancelled = true;
		};
	}, []);
}
