import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFileOperations } from "@/hooks/use-file-operations";
import { hydrateDocumentById } from "@/hooks/use-workspace-restore";
import { cn } from "@/lib/utils";
import { mergeWorkspaceTabs } from "@/lib/workspace-tabs";
import {
	moveDocumentInOrder,
	nextActiveDocumentId,
	useDocumentRegistry,
} from "@/stores/document-registry";
import { useSettingsStore } from "@/stores/settings-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { DocumentId } from "@/types/document";
import { DocumentTab, RestoredDocumentTab } from "./document-tab";

/**
 * The document tab strip (`#54` D3/D4, `#56` restore seam).
 *
 * A plain container that always renders the new-document button and, when at least one document is
 * open, a `role="tablist"` of tabs. The tablist is the union of two projections: the hydrated
 * sessions the registry owns and the persisted-but-un-hydrated documents the localStorage manifest
 * owns, merged into one persisted order by {@link mergeWorkspaceTabs}. Rendering the registry alone
 * hid every restored tab after a reload — the `#54`/`#56` seam this component closes.
 *
 * It owns the WAI-ARIA tabs keyboard contract with **manual activation** (arrows move focus only),
 * the roving `tabindex`, deterministic focus after a close, and the D3 overflow behaviour
 * (shrink-to-floor then horizontal scroll, with the focused/active tab always scrolled into view).
 */
export function DocumentTabStrip() {
	const openDocumentIds = useDocumentRegistry((s) => s.openDocumentIds);
	const activeDocumentId = useDocumentRegistry((s) => s.activeDocumentId);
	const documents = useDocumentRegistry((s) => s.documents);
	const manifestEntries = useWorkspaceStore((s) => s.documents);
	const persistedActiveId = useWorkspaceStore((s) => s.activeDocumentId);
	const { newModel, closeDocumentById } = useFileOperations();

	// The full, ordered tablist: hydrated sessions merged with un-hydrated manifest documents in
	// persisted order. `openDocumentIds` holds exactly the hydrated ids, so it is also the hydrated
	// set the merge needs; the pinned subset keeps the pinned hydrated block leading.
	const pinnedIds = new Set(openDocumentIds.filter((id) => documents[id]?.pinned));
	const tabs = mergeWorkspaceTabs(manifestEntries, openDocumentIds, pinnedIds);
	const tabOrder = tabs.map((tab) => tab.id);

	// The selected (active) tab. Until boot restore finishes hydrating the active document the
	// registry pointer is still null, so fall back to the *persisted* active pointer while that tab
	// is on screen — or the first manifest tab when stale metadata has no pointer. Otherwise every
	// tab would render `aria-selected=false` on first paint. Once hydration resolves, the registry
	// pointer takes over.
	const selectedId =
		activeDocumentId ??
		(persistedActiveId && tabOrder.includes(persistedActiveId)
			? persistedActiveId
			: (tabOrder[0] ?? null));

	// The tab that holds the roving `tabindex={0}`. It follows arrow navigation while focus is in
	// the tablist and otherwise tracks the active document (reset on blur and on active change).
	const [focusedId, setFocusedId] = useState<DocumentId | null>(activeDocumentId);
	const tablistRef = useRef<HTMLDivElement>(null);
	const newDocumentButtonRef = useRef<HTMLButtonElement>(null);
	// The tab currently being reordered. Tracked here rather than in `dataTransfer` because
	// WKWebView (desktop) returns an empty `getData()` for a custom MIME during `drop`, so the
	// desktop reorder would otherwise silently no-op.
	const draggedIdRef = useRef<DocumentId | null>(null);
	// The most recent activation request. A restored tab hydrates asynchronously, so a slow read
	// that resolves after a later click must not steal activation — last request wins.
	const activationSeqRef = useRef(0);

	// A focusedId left pointing at a just-closed document would leave no tab holding tabindex 0 for
	// one render; fall back to the selected tab (registry, then persisted) and finally the first tab
	// so the tablist always has exactly one focusable tab, even before the active body hydrates.
	const effectiveFocusedId =
		focusedId && tabOrder.includes(focusedId) ? focusedId : (selectedId ?? tabOrder[0] ?? null);

	const scrollTabIntoView = useCallback((id: DocumentId) => {
		const behavior = useSettingsStore.getState().settings.reduceMotion ? "auto" : "smooth";
		document
			.getElementById(`tab-${id}`)
			?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior });
	}, []);

	// Keep the roving tabindex on the active document when focus is not being driven by the
	// keyboard, and keep the active tab scrolled into view (covers close-activation and the
	// command-palette "Switch to" commands, which change the active document off-screen).
	useEffect(() => {
		setFocusedId(activeDocumentId);
		if (activeDocumentId) scrollTabIntoView(activeDocumentId);
	}, [activeDocumentId, scrollTabIntoView]);

	const focusTab = useCallback(
		(id: DocumentId) => {
			setFocusedId(id);
			const el = document.getElementById(`tab-${id}`);
			el?.focus();
			scrollTabIntoView(id);
		},
		[scrollTabIntoView],
	);

	/**
	 * Persist the current merged order onto the manifest so a live reorder or pin survives a reload
	 * (`#56`). The merged order already places every un-hydrated manifest document, so passing it to
	 * `setManifestOrder` keeps restored tabs in their slots rather than flushing them to the tail.
	 * A no-op when nothing is persisted yet (desktop, or before the first autosave).
	 */
	const persistOrder = useCallback(() => {
		const manifest = useWorkspaceStore.getState().documents;
		if (manifest.length === 0) return;
		const registry = useDocumentRegistry.getState();
		const order = registry.openDocumentIds;
		const pinned = new Set(order.filter((id) => registry.documents[id]?.pinned));
		const merged = mergeWorkspaceTabs(manifest, order, pinned).map((tab) => tab.id);
		useWorkspaceStore.getState().setManifestOrder(merged);
	}, []);

	/**
	 * Move a tab to `toVisibleIndex` within the **full visible order** (`#56`), not the registry
	 * alone. Computing the move against `tabOrder` — the merged hydrated + restored list the strip
	 * actually renders — is what keeps a move by one visible position a move by one visible position
	 * when un-hydrated siblings lie between live tabs; a registry-only `registryIndex + delta` skips
	 * every restored tab in between and lands the tab in the wrong slot.
	 *
	 * The desired order is projected coherently into both stores: the manifest takes the whole
	 * desired visible order (so a restored target hydrates at its new persisted slot), and the
	 * registry moves the target to that order's hydrated-only projection. A restored target is
	 * hydrated first — the control never silently no-ops — and stays non-draggable until then.
	 */
	const applyVisibleReorder = useCallback(
		(targetId: DocumentId, toVisibleIndex: number) => {
			const order = tabOrder;
			const currentIndex = order.indexOf(targetId);
			if (currentIndex === -1) return;
			const registry = useDocumentRegistry.getState();
			// Pinned tabs are always hydrated (`#54` does not persist pin state) and lead the visible
			// order, so the pinned block size is measured over `tabOrder` directly.
			const pinnedCount = order.filter((id) => registry.documents[id]?.pinned).length;
			const isPinnedTarget = Boolean(registry.documents[targetId]?.pinned);
			const desired = moveDocumentInOrder(
				order,
				targetId,
				toVisibleIndex,
				isPinnedTarget,
				pinnedCount,
			);
			if (desired.length === order.length && desired.every((id, i) => id === order[i])) {
				// Clamped to the same slot (block edge): keep focus, and do not hydrate a restored tab
				// for a move that changes nothing.
				document.getElementById(`tab-${targetId}`)?.focus();
				return;
			}
			// Persist the desired visible order up front so a restored target hydrates into its new
			// slot; `persistOrder` below re-derives the manifest from the settled registry afterwards.
			useWorkspaceStore.getState().setManifestOrder(desired);

			const commit = () => {
				const live = useDocumentRegistry.getState();
				const hydratedDesired = desired.filter((id) => live.documents[id]);
				live.reorderDocument(targetId, hydratedDesired.indexOf(targetId));
				persistOrder();
				document.getElementById(`tab-${targetId}`)?.focus();
				scrollTabIntoView(targetId);
			};

			if (useDocumentRegistry.getState().documents[targetId]) {
				commit();
			} else {
				void hydrateDocumentById(targetId, { activate: false }).then((ok) => {
					if (ok) commit();
				});
			}
		},
		[tabOrder, persistOrder, scrollTabIntoView],
	);

	const handleActivate = useCallback((id: DocumentId) => {
		const registry = useDocumentRegistry.getState();
		// Every activation supersedes any earlier still-pending restored-tab hydration.
		activationSeqRef.current += 1;
		const seq = activationSeqRef.current;
		if (registry.documents[id]) {
			registry.activateDocument(id);
			return;
		}
		// Restored tab: read its body first, then activate only on a successful hydration and only
		// when this is still the newest activation request. `hydrateDocumentById` marks an unreadable
		// document fail-visibly, so a failed read never selects a blank, success-shaped document; a
		// superseded read hydrates the document in the background without stealing the active pointer.
		void hydrateDocumentById(id, { activate: false }).then((ok) => {
			if (!ok || activationSeqRef.current !== seq) return;
			useDocumentRegistry.getState().activateDocument(id);
		});
	}, []);

	const handlePin = useCallback(
		(id: DocumentId, pinned: boolean) => {
			const registry = useDocumentRegistry.getState();
			if (registry.documents[id]) {
				registry.setDocumentPinned(id, pinned);
				persistOrder();
				return;
			}
			// Pinning is ordering-plus-identity over a live session; a restored tab has none yet, so
			// hydrate it in the background (without activating) and pin on success.
			void hydrateDocumentById(id, { activate: false }).then((ok) => {
				if (!ok) return;
				useDocumentRegistry.getState().setDocumentPinned(id, pinned);
				persistOrder();
			});
		},
		[persistOrder],
	);

	/**
	 * Close a tab, then place focus deterministically (D4): on the tab that becomes active, or on
	 * the always-present new-document button when nothing remains active.
	 *
	 * A hydrated tab is closed through the shared {@link closeDocumentById}, which owns the
	 * dirty-confirmation path (a declined prompt leaves it open and moves nothing), the manifest
	 * cleanup, and the full-order neighbour activation.
	 *
	 * A never-hydrated restored tab has no live session and is clean by construction. Usually it is
	 * a background tab, so closing it only drops its manifest entry. The exception is the **selected
	 * boot tab**: before boot hydration resolves, the persisted active document renders selected but
	 * is not yet in the registry. Closing it must supersede that pending activation (so its in-flight
	 * boot read cannot resurrect it — `hydrateDocumentById` refuses a document whose manifest entry
	 * was dropped mid-read), drop its open-manifest entry while retaining its IndexedDB body for
	 * `#55`, and hydrate/activate its full-order neighbour instead of leaving nothing selected.
	 */
	const handleClose = useCallback(
		async (id: DocumentId) => {
			// A close is the newest selection-affecting action. Any earlier restored-tab click that
			// is still reading may hydrate in the background, but it must not steal activation after
			// this close settles.
			activationSeqRef.current += 1;
			if (useDocumentRegistry.getState().documents[id]) {
				await closeDocumentById(id);
				if (useDocumentRegistry.getState().documents[id]) return; // confirmation declined
			} else {
				const registry = useDocumentRegistry.getState();
				const workspace = useWorkspaceStore.getState();
				// The selected boot tab: no registry document is active yet and this un-hydrated tab is
				// the persisted active one whose body is still loading.
				const isPendingActive =
					registry.activeDocumentId === null && workspace.activeDocumentId === id;
				if (isPendingActive) {
					// Resolve the D1 neighbour over the full visible order before dropping the entry, then
					// supersede any pending activation and drop the closed tab's manifest entry (its body
					// is retained for `#55`). `removeManifestEntry` also clears the persisted active
					// pointer, so the in-flight boot read for this id refuses to resurrect it.
					const neighborId = nextActiveDocumentId(tabOrder, id);
					const closeSeq = activationSeqRef.current;
					workspace.removeManifestEntry(id);
					if (neighborId) {
						const hydrated = await hydrateDocumentById(neighborId, { activate: false });
						if (
							hydrated &&
							activationSeqRef.current === closeSeq &&
							useDocumentRegistry.getState().activeDocumentId === null
						) {
							useDocumentRegistry.getState().activateDocument(neighborId);
						}
					}
				} else {
					workspace.removeManifestEntry(id);
				}
			}
			const nextActive = useDocumentRegistry.getState().activeDocumentId;
			useWorkspaceStore.getState().setActiveDocumentId(nextActive);
			if (nextActive) {
				focusTab(nextActive);
			} else {
				newDocumentButtonRef.current?.focus();
			}
		},
		[closeDocumentById, focusTab, tabOrder],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			const count = tabOrder.length;
			if (count === 0 || !effectiveFocusedId) return;
			const currentIndex = Math.max(0, tabOrder.indexOf(effectiveFocusedId));
			const mod = e.metaKey || e.ctrlKey;

			// Reorder the focused tab one position within its block; focus follows it (D4/D5). The
			// move is computed against the full *visible* order so a restored (un-hydrated) sibling
			// between live tabs cannot skew the destination — `applyVisibleReorder` hydrates a
			// restored target at its new persisted slot first, so the control never silently no-ops.
			if (mod && e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
				e.preventDefault();
				e.stopPropagation();
				const delta = e.key === "ArrowRight" ? 1 : -1;
				applyVisibleReorder(effectiveFocusedId, currentIndex + delta);
				return;
			}

			switch (e.key) {
				case "ArrowRight":
					e.preventDefault();
					e.stopPropagation();
					focusTab(tabOrder[(currentIndex + 1) % count]);
					break;
				case "ArrowLeft":
					e.preventDefault();
					e.stopPropagation();
					focusTab(tabOrder[(currentIndex - 1 + count) % count]);
					break;
				case "Home":
					e.preventDefault();
					e.stopPropagation();
					focusTab(tabOrder[0]);
					break;
				case "End":
					e.preventDefault();
					e.stopPropagation();
					focusTab(tabOrder[count - 1]);
					break;
				case "Enter":
				case " ":
					// Manual activation: arrows only moved focus; Enter/Space commit it.
					e.preventDefault();
					e.stopPropagation();
					handleActivate(effectiveFocusedId);
					break;
				case "Delete":
					e.preventDefault();
					e.stopPropagation();
					void handleClose(effectiveFocusedId);
					break;
			}
		},
		[tabOrder, effectiveFocusedId, focusTab, handleActivate, handleClose, applyVisibleReorder],
	);

	const handleBlur = useCallback(
		(e: React.FocusEvent<HTMLDivElement>) => {
			// Focus left the tablist entirely: hand the roving tabindex back to the active tab.
			if (!e.currentTarget.contains(e.relatedTarget)) setFocusedId(activeDocumentId);
		},
		[activeDocumentId],
	);

	const handleReorderStart = useCallback((id: DocumentId) => {
		draggedIdRef.current = id;
	}, []);

	const handleReorderEnd = useCallback(() => {
		draggedIdRef.current = null;
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		// Only an in-progress tab drag is a reorder; a palette element drag falls through unhandled.
		// The dragged id comes from the ref, not `dataTransfer.types`, which WKWebView leaves empty
		// for a custom MIME.
		if (draggedIdRef.current !== null) {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
		}
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent<HTMLDivElement>) => {
			const draggedId = draggedIdRef.current;
			// Only a hydrated tab is draggable (restored tabs are non-draggable), so a drag id is
			// always a live registry document; guard anyway.
			if (!draggedId || !useDocumentRegistry.getState().documents[draggedId]) return;
			e.preventDefault();
			// The drop index is measured against the full *visible* order — every rendered tab,
			// hydrated or restored — not the registry alone. An un-hydrated tab lying between live
			// tabs occupies a visible slot too, so measuring registry tabs only would shift the
			// destination past it. `applyVisibleReorder` projects the visible target index back into
			// both stores coherently.
			let index = 0;
			for (const id of tabOrder) {
				if (id === draggedId) continue;
				const rect = document.getElementById(`tab-${id}`)?.getBoundingClientRect();
				if (rect && e.clientX < rect.left + rect.width / 2) break;
				index++;
			}
			applyVisibleReorder(draggedId, index);
			draggedIdRef.current = null;
		},
		[tabOrder, applyVisibleReorder],
	);

	return (
		<div className="flex h-9 shrink-0 items-stretch border-b border-border bg-card">
			{tabs.length > 0 && (
				<div
					ref={tablistRef}
					role="tablist"
					aria-label="Open documents"
					aria-orientation="horizontal"
					onKeyDown={handleKeyDown}
					onBlur={handleBlur}
					onDragOver={handleDragOver}
					onDrop={handleDrop}
					className="flex min-w-0 flex-1 items-stretch overflow-x-auto overscroll-x-contain"
				>
					{tabs.map((tab) => {
						const selected = tab.id === selectedId;
						const focused = tab.id === effectiveFocusedId;
						if (tab.hydrated) {
							const session = documents[tab.id];
							if (!session) return null;
							return (
								<DocumentTab
									key={tab.id}
									documentId={tab.id}
									stores={session.stores}
									selected={selected}
									focused={focused}
									pinned={session.pinned}
									onActivate={handleActivate}
									onClose={(closeId) => void handleClose(closeId)}
									onPin={handlePin}
									onReorderStart={handleReorderStart}
									onReorderEnd={handleReorderEnd}
								/>
							);
						}
						return (
							<RestoredDocumentTab
								key={tab.id}
								documentId={tab.id}
								title={tab.title}
								filePath={tab.filePath}
								selected={selected}
								focused={focused}
								onActivate={handleActivate}
								onClose={(closeId) => void handleClose(closeId)}
								onPin={handlePin}
							/>
						);
					})}
				</div>
			)}
			<button
				ref={newDocumentButtonRef}
				type="button"
				data-testid="btn-new-document"
				aria-label="New document"
				title="New document"
				onClick={() => void newModel()}
				className={cn(
					"flex shrink-0 items-center justify-center px-2 text-muted-foreground",
					"hover:bg-accent hover:text-foreground",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
				)}
			>
				<Plus className="h-4 w-4" aria-hidden="true" />
			</button>
		</div>
	);
}
