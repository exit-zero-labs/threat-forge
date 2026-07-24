import type { WorkspaceManifestEntry } from "@/lib/persistence/types";
import type { DocumentId } from "@/types/document";

/**
 * One entry in the merged tab strip (`#56` / `#54` seam).
 *
 * A `hydrated` tab has a live registry `DocumentSession`; its title, dirty state, and pin state
 * come from that session's own store bundle. A `restored` tab is a persisted document whose body
 * has not been read from IndexedDB yet — it renders from the localStorage manifest alone (title
 * and adapter path) and carries no live per-tab state until it is activated and hydrated.
 */
export type WorkspaceTab =
	| { id: DocumentId; hydrated: true }
	| { id: DocumentId; hydrated: false; title: string; filePath: string | null };

/**
 * Merge the two open-document projections into the one order the tab strip renders (`#56` D4).
 *
 * The registry owns only **hydrated** sessions — the active document restored at boot plus every
 * document opened or activated this session — in their interactive order (pinned block first,
 * then user reorder). The localStorage manifest owns the **full** persisted open-document list in
 * persisted order, including documents whose bodies were never read back. Rendering the registry
 * alone (the bug this fixes) hides every persisted-but-un-hydrated tab after a reload.
 *
 * The merge is built as three ordered blocks so the WAI-ARIA pin invariant and the persisted order
 * both hold, whatever the hydration state:
 *
 * 1. **Pinned hydrated tabs** lead, in registry order. Pin state lives only on a live session
 *    (`#54` does not persist it), so every pinned tab is hydrated; keeping this block first means a
 *    persisted-but-un-hydrated tab can never thread ahead of a pinned live tab.
 * 2. **The manifest-anchored middle**: the un-pinned hydrated tabs that also have a manifest entry
 *    (in registry order, so reorder stays authoritative) with each un-hydrated manifest document
 *    threaded into its persisted slot — immediately before the first already-placed tab that
 *    follows it in the manifest, or at the block's end when none does.
 * 3. **Registry-only new tabs** trail: un-pinned hydrated documents with *no* manifest anchor yet
 *    (created this session and not written, or the whole registry on desktop) follow the persisted
 *    manifest in registry order.
 *
 * Pure and deterministic so it is unit-testable without React or either store.
 */
export function mergeWorkspaceTabs(
	manifestEntries: readonly WorkspaceManifestEntry[],
	openDocumentIds: readonly DocumentId[],
	pinnedIds: ReadonlySet<DocumentId> = new Set(),
): WorkspaceTab[] {
	const hydratedIds = new Set(openDocumentIds);
	const manifestRank = new Map<DocumentId, number>();
	manifestEntries.forEach((entry, index) => {
		manifestRank.set(entry.id, index);
	});

	const hydrated = openDocumentIds.filter((id) => hydratedIds.has(id));
	// Block 1: pinned hydrated tabs, in registry order — the leading block, always.
	const pinnedLead = hydrated.filter((id) => pinnedIds.has(id));
	// Block 3 seed: un-pinned hydrated tabs with no manifest entry (new this session / desktop).
	const orphanLive = hydrated.filter((id) => !pinnedIds.has(id) && !manifestRank.has(id));

	// Block 2 spine: un-pinned hydrated tabs that are anchored in the manifest, in registry order.
	const middle: DocumentId[] = hydrated.filter((id) => !pinnedIds.has(id) && manifestRank.has(id));
	// Thread each persisted-but-un-hydrated document into its manifest slot within the middle.
	for (const entry of manifestEntries) {
		if (hydratedIds.has(entry.id)) continue;
		const rank = manifestRank.get(entry.id) ?? Number.MAX_SAFE_INTEGER;
		let insertAt = middle.length;
		for (let i = 0; i < middle.length; i++) {
			const placedRank = manifestRank.get(middle[i]);
			if (placedRank !== undefined && placedRank > rank) {
				insertAt = i;
				break;
			}
		}
		middle.splice(insertAt, 0, entry.id);
	}

	const order = [...pinnedLead, ...middle, ...orphanLive];

	const entryById = new Map(manifestEntries.map((entry) => [entry.id, entry]));
	return order.map((id): WorkspaceTab => {
		if (hydratedIds.has(id)) return { id, hydrated: true };
		const entry = entryById.get(id);
		return { id, hydrated: false, title: entry?.title ?? "", filePath: entry?.filePath ?? null };
	});
}
