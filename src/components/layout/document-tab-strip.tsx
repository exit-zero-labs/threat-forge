import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFileOperations } from "@/hooks/use-file-operations";
import { cn } from "@/lib/utils";
import { useDocumentRegistry } from "@/stores/document-registry";
import { useSettingsStore } from "@/stores/settings-store";
import type { DocumentId } from "@/types/document";
import { DocumentTab, TAB_DRAG_MIME } from "./document-tab";

/**
 * The document tab strip (`#54` D3/D4).
 *
 * A plain container that always renders the new-document button and, when at least one document is
 * open, a `role="tablist"` of {@link DocumentTab}s. It owns the WAI-ARIA tabs keyboard contract
 * with **manual activation** (arrows move focus only), the roving `tabindex`, deterministic focus
 * after a close, and the D3 overflow behaviour (shrink-to-floor then horizontal scroll, with the
 * focused/active tab always scrolled into view).
 */
export function DocumentTabStrip() {
	const openDocumentIds = useDocumentRegistry((s) => s.openDocumentIds);
	const activeDocumentId = useDocumentRegistry((s) => s.activeDocumentId);
	const documents = useDocumentRegistry((s) => s.documents);
	const { newModel, closeDocumentById } = useFileOperations();

	// The tab that holds the roving `tabindex={0}`. It follows arrow navigation while focus is in
	// the tablist and otherwise tracks the active document (reset on blur and on active change).
	const [focusedId, setFocusedId] = useState<DocumentId | null>(activeDocumentId);
	const tablistRef = useRef<HTMLDivElement>(null);
	const newDocumentButtonRef = useRef<HTMLButtonElement>(null);

	// A focusedId left pointing at a just-closed document would leave no tab holding tabindex 0
	// for one render; fall back to the active document until the effect below resyncs.
	const effectiveFocusedId =
		focusedId && openDocumentIds.includes(focusedId) ? focusedId : activeDocumentId;

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

	const handleActivate = useCallback((id: DocumentId) => {
		useDocumentRegistry.getState().activateDocument(id);
	}, []);

	const handlePin = useCallback((id: DocumentId, pinned: boolean) => {
		useDocumentRegistry.getState().setDocumentPinned(id, pinned);
	}, []);

	/**
	 * Close a tab, then place focus deterministically (D4): on the tab that becomes active, or on
	 * the always-present new-document button when the last tab closes. A declined dirty prompt
	 * leaves the document open, so nothing moves.
	 */
	const handleClose = useCallback(
		async (id: DocumentId) => {
			await closeDocumentById(id);
			if (useDocumentRegistry.getState().documents[id]) return; // confirmation declined
			const nextActive = useDocumentRegistry.getState().activeDocumentId;
			if (nextActive) {
				focusTab(nextActive);
			} else {
				newDocumentButtonRef.current?.focus();
			}
		},
		[closeDocumentById, focusTab],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			const count = openDocumentIds.length;
			if (count === 0 || !effectiveFocusedId) return;
			const currentIndex = Math.max(0, openDocumentIds.indexOf(effectiveFocusedId));
			const mod = e.metaKey || e.ctrlKey;

			// Reorder the focused tab one position within its block; focus follows it (D4/D5).
			if (mod && e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
				e.preventDefault();
				e.stopPropagation();
				const delta = e.key === "ArrowRight" ? 1 : -1;
				useDocumentRegistry.getState().reorderDocument(effectiveFocusedId, currentIndex + delta);
				document.getElementById(`tab-${effectiveFocusedId}`)?.focus();
				scrollTabIntoView(effectiveFocusedId);
				return;
			}

			switch (e.key) {
				case "ArrowRight":
					e.preventDefault();
					e.stopPropagation();
					focusTab(openDocumentIds[(currentIndex + 1) % count]);
					break;
				case "ArrowLeft":
					e.preventDefault();
					e.stopPropagation();
					focusTab(openDocumentIds[(currentIndex - 1 + count) % count]);
					break;
				case "Home":
					e.preventDefault();
					e.stopPropagation();
					focusTab(openDocumentIds[0]);
					break;
				case "End":
					e.preventDefault();
					e.stopPropagation();
					focusTab(openDocumentIds[count - 1]);
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
		[openDocumentIds, effectiveFocusedId, focusTab, handleActivate, handleClose, scrollTabIntoView],
	);

	const handleBlur = useCallback(
		(e: React.FocusEvent<HTMLDivElement>) => {
			// Focus left the tablist entirely: hand the roving tabindex back to the active tab.
			if (!e.currentTarget.contains(e.relatedTarget)) setFocusedId(activeDocumentId);
		},
		[activeDocumentId],
	);

	const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		// Only a tab drag is a reorder; a palette element drag must fall through unhandled.
		if (e.dataTransfer.types.includes(TAB_DRAG_MIME)) {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
		}
	}, []);

	const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		const draggedId = e.dataTransfer.getData(TAB_DRAG_MIME) as DocumentId;
		const order = useDocumentRegistry.getState().openDocumentIds;
		if (!draggedId || !order.includes(draggedId)) return;
		e.preventDefault();
		// The drop index is the first *other* tab whose horizontal midpoint the pointer has not yet
		// passed. Measuring against the other tabs (excluding the dragged one) yields the final index
		// directly, and reorderDocument clamps it into the dragged tab's pinned/unpinned block.
		let index = 0;
		for (const id of order) {
			if (id === draggedId) continue;
			const rect = document.getElementById(`tab-${id}`)?.getBoundingClientRect();
			if (rect && e.clientX < rect.left + rect.width / 2) break;
			index++;
		}
		useDocumentRegistry.getState().reorderDocument(draggedId, index);
	}, []);

	return (
		<div className="flex h-9 shrink-0 items-stretch border-b border-border bg-card">
			{openDocumentIds.length > 0 && (
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
					{openDocumentIds.map((id) => {
						const session = documents[id];
						if (!session) return null;
						return (
							<DocumentTab
								key={id}
								documentId={id}
								stores={session.stores}
								selected={id === activeDocumentId}
								focused={id === effectiveFocusedId}
								pinned={session.pinned}
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
