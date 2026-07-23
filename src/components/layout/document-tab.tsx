import { Pin, X } from "lucide-react";
import { useStore } from "zustand";
import { documentDisplayTitle } from "@/lib/document-display-title";
import { cn } from "@/lib/utils";
import type { DocumentStores } from "@/stores/document-stores";
import { useSettingsStore } from "@/stores/settings-store";
import type { DocumentId } from "@/types/document";

/**
 * MIME type for a tab reorder drag. Deliberately distinct from the palette's `text/plain` element
 * drag, and the payload is only a `DocumentId` (a random `doc-<uuid>` that encodes nothing about
 * the file). `setDraggedComponent` is never called, so a tab dropped on the canvas stays a no-op —
 * the canvas drop handler is gated on `useCanvasInstanceStore.draggedType`.
 */
export const TAB_DRAG_MIME = "application/x-threatforge-tab";

export interface DocumentTabProps {
	/** The document this tab represents. */
	documentId: DocumentId;
	/** The document's own store bundle, passed by the strip so the tab never activates it to read. */
	stores: DocumentStores;
	/** Whether this is the active document (exactly one tab is selected). */
	selected: boolean;
	/** Whether this tab currently holds the tablist's roving `tabindex={0}`. */
	focused: boolean;
	/** Whether this document is pinned to the leading block. */
	pinned: boolean;
	/** Activate this document. */
	onActivate: (id: DocumentId) => void;
	/** Close this document through the same dirty-confirmation path as `Delete`. */
	onClose: (id: DocumentId) => void;
	/** Toggle this document's pinned state. */
	onPin: (id: DocumentId, pinned: boolean) => void;
	/** Record that this tab began a reorder drag (the strip tracks the dragged id out-of-band). */
	onReorderStart?: (id: DocumentId) => void;
	/** Clear the reorder drag once it ends, whether or not it produced a drop. */
	onReorderEnd?: () => void;
}

/**
 * One tab in the document tablist (`#54` D2/D4).
 *
 * Renders its own document's title and dirty state read from *that document's* store bundle — not
 * the active-document facade — so a background document going dirty updates its own tab.
 *
 * Structure: a plain wrapper holds the `role="tab"` element and the pin/close `<button>`s as
 * *siblings*. The buttons are deliberately not descendants of the `role="tab"` element, because a
 * `tab` role makes its children presentational — a nested button would vanish from the
 * accessibility tree. The tab's accessible name is set with `aria-label` so the state suffixes
 * (", unsaved changes" / ", pinned") join it (D4: colour alone never carries state) while the
 * sibling controls keep their own labels. Only the `role="tab"` element carries the roving
 * `tabindex`; the controls are `tabindex={-1}`, so each tab stays a single tab stop.
 */
export function DocumentTab({
	documentId,
	stores,
	selected,
	focused,
	pinned,
	onActivate,
	onClose,
	onPin,
	onReorderStart,
	onReorderEnd,
}: DocumentTabProps) {
	const model = useStore(stores.model, (s) => s.model);
	const filePath = useStore(stores.model, (s) => s.filePath);
	const isDirty = useStore(stores.model, (s) => s.isDirty);
	const reduceMotion = useSettingsStore((s) => s.settings.reduceMotion);

	const title = documentDisplayTitle(model, filePath);
	const accessibleName = `${title}${isDirty ? ", unsaved changes" : ""}${pinned ? ", pinned" : ""}`;
	// The hover tooltip carries the full title and the path the truncated label may be hiding (D3).
	const tooltip = filePath ? `${title}\n${filePath}` : title;

	return (
		<div
			data-testid={`document-tab-${documentId}`}
			draggable
			onDragStart={(e) => {
				// The reorder id is tracked by the strip via `onReorderStart`, not read back from
				// `dataTransfer`: WKWebView (desktop) returns an empty `getData()` for a custom MIME
				// during `drop`, the same reason the palette carries its payload out-of-band (see the
				// note in `dfd-canvas.tsx`). The MIME is still set for the drag cursor and non-WebKit.
				onReorderStart?.(documentId);
				e.dataTransfer.setData(TAB_DRAG_MIME, documentId);
				e.dataTransfer.effectAllowed = "move";
			}}
			onDragEnd={() => onReorderEnd?.()}
			className={cn(
				"group relative flex h-full shrink-0 items-center border-r border-border",
				"min-w-[7rem] max-w-[14rem]",
				pinned && "max-w-[8rem]",
				selected ? "bg-background" : "bg-card hover:bg-accent/50",
			)}
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard activation for this tab is owned
			    by the tablist (APG manual-activation pattern) — Enter/Space on the focused tab activate
			    via DocumentTabStrip's onKeyDown; a per-tab key handler would double-activate. */}
			<div
				role="tab"
				id={`tab-${documentId}`}
				aria-selected={selected}
				aria-controls="document-panel"
				aria-label={accessibleName}
				tabIndex={focused ? 0 : -1}
				title={tooltip}
				onClick={() => onActivate(documentId)}
				className={cn(
					"flex h-full min-w-0 flex-1 cursor-pointer select-none items-center gap-1.5 pl-3 text-sm outline-none",
					"focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
					selected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
				)}
				style={{ transition: reduceMotion ? "none" : "color 150ms ease" }}
			>
				{pinned && <Pin className="h-3 w-3 shrink-0" aria-hidden="true" />}
				<span className="min-w-0 flex-1 truncate">{title}</span>
				{isDirty && (
					<span
						data-testid={`dirty-dot-${documentId}`}
						aria-hidden="true"
						className="h-2 w-2 shrink-0 rounded-full bg-foreground"
					/>
				)}
			</div>

			<button
				type="button"
				tabIndex={-1}
				aria-label={pinned ? `Unpin ${title}` : `Pin ${title}`}
				title={pinned ? "Unpin" : "Pin"}
				onClick={(e) => {
					e.stopPropagation();
					onPin(documentId, !pinned);
				}}
				className={cn(
					"mr-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground",
					// Keep the strip uncluttered: an unpinned tab reveals the pin control on hover/focus
					// only; a pinned tab always shows it, because it is also that tab's state marker.
					!pinned && "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
				)}
			>
				<Pin className="h-3 w-3" aria-hidden="true" />
			</button>
			<button
				type="button"
				tabIndex={-1}
				aria-label={`Close ${title}`}
				title="Close"
				data-testid={`close-tab-${documentId}`}
				onClick={(e) => {
					e.stopPropagation();
					onClose(documentId);
				}}
				className="mr-1.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				<X className="h-3.5 w-3.5" aria-hidden="true" />
			</button>
		</div>
	);
}
