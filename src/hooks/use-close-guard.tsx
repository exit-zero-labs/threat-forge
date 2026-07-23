import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { documentDisplayTitle } from "@/lib/document-display-title";
import { isTauri } from "@/lib/platform";
import { useDocumentRegistry } from "@/stores/document-registry";
import type { DocumentId } from "@/types/document";

/** An open document with unsaved changes, carrying its id so lists key on a stable value. */
interface DirtyDocument {
	id: DocumentId;
	title: string;
}

/**
 * Every open document that currently has unsaved changes, read from each document's own model
 * store — so a dirty *background* document counts, not only the active one.
 */
function currentDirtyDocuments(): DirtyDocument[] {
	const { documents, openDocumentIds } = useDocumentRegistry.getState();
	const dirty: DirtyDocument[] = [];
	for (const id of openDocumentIds) {
		const stores = documents[id]?.stores;
		if (!stores) continue;
		const { model, filePath, isDirty } = stores.model.getState();
		if (isDirty) dirty.push({ id, title: documentDisplayTitle(model, filePath) });
	}
	return dirty;
}

/**
 * Window and application close guards (`#54` D6 / step 9). Mounted once in the app shell; returns
 * the desktop close-summary modal (or `null`), which the shell renders.
 *
 * - **Browser:** a `beforeunload` listener is registered **only while at least one document is
 *   dirty** and removed as soon as none are. Browsers replace any custom string with their own, so
 *   the handler only calls `preventDefault`. Conditional registration keeps bfcache and the
 *   `#56` `pagehide` autosave flush intact — an always-registered handler would disable bfcache.
 * - **Desktop:** `onCloseRequested` calls `preventDefault()` **first** (the Tauri API destroys the
 *   window if the handler throws before preventing — the default is fail-open, and fail-open here
 *   means data loss), then either closes immediately when nothing is dirty or shows an in-app
 *   summary listing every dirty document. Any failure falls back to `window.confirm` so the window
 *   is never left unclosable and is never destroyed without asking.
 */
export function useCloseGuard(): ReactNode {
	const [dirtyCount, setDirtyCount] = useState(0);
	const [pendingDocuments, setPendingDocuments] = useState<DirtyDocument[] | null>(null);
	const destroyWindowRef = useRef<(() => Promise<void>) | null>(null);

	// Track the dirty count by subscribing to the registry (open set) and to each open document's
	// own model store, re-subscribing as documents open and close.
	useEffect(() => {
		const recompute = () => setDirtyCount(currentDirtyDocuments().length);
		const modelUnsubs = new Map<DocumentId, () => void>();

		const resubscribe = () => {
			const { documents, openDocumentIds } = useDocumentRegistry.getState();
			for (const id of openDocumentIds) {
				const stores = documents[id]?.stores;
				if (stores && !modelUnsubs.has(id)) {
					modelUnsubs.set(id, stores.model.subscribe(recompute));
				}
			}
			for (const [id, unsub] of modelUnsubs) {
				if (!openDocumentIds.includes(id)) {
					unsub();
					modelUnsubs.delete(id);
				}
			}
		};

		resubscribe();
		recompute();
		const registryUnsub = useDocumentRegistry.subscribe(() => {
			resubscribe();
			recompute();
		});

		return () => {
			registryUnsub();
			for (const unsub of modelUnsubs.values()) unsub();
			modelUnsubs.clear();
		};
	}, []);

	// Browser: register beforeunload only while dirty (and never on desktop, which guards via
	// onCloseRequested). Removing it as soon as nothing is dirty preserves bfcache.
	useEffect(() => {
		if (dirtyCount === 0 || isTauri()) return;
		const handler = (event: BeforeUnloadEvent) => {
			// The only reliable, cross-browser signal. No custom string: browsers ignore it.
			event.preventDefault();
		};
		window.addEventListener("beforeunload", handler);
		return () => window.removeEventListener("beforeunload", handler);
	}, [dirtyCount]);

	// Desktop: intercept the native window close.
	useEffect(() => {
		if (!isTauri()) return;
		let unlisten: (() => void) | undefined;
		let cancelled = false;

		void (async () => {
			try {
				const { getCurrentWindow } = await import("@tauri-apps/api/window");
				const win = getCurrentWindow();
				destroyWindowRef.current = () => win.destroy();
				const un = await win.onCloseRequested(async (event) => {
					try {
						// Prevent first: the API fails open (destroys the window) if the handler throws
						// before preventing, and fail-open here is silent data loss.
						event.preventDefault();
						const dirty = currentDirtyDocuments();
						if (dirty.length === 0) {
							await win.destroy();
							return;
						}
						setPendingDocuments(dirty);
					} catch {
						// Never lose data silently, never leave the window unclosable.
						if (window.confirm("You have unsaved changes. Discard them and close?")) {
							try {
								await win.destroy();
							} catch {
								// The window API is unavailable; nothing further can be done safely.
							}
						}
					}
				});
				if (cancelled) un();
				else unlisten = un;
			} catch {
				// Window API unavailable: no desktop guard to install.
			}
		})();

		return () => {
			cancelled = true;
			unlisten?.();
			destroyWindowRef.current = null;
		};
	}, []);

	const cancelClose = useCallback(() => setPendingDocuments(null), []);
	const discardAndClose = useCallback(async () => {
		setPendingDocuments(null);
		try {
			await destroyWindowRef.current?.();
		} catch {
			// Nothing further can be done safely if the window API rejects.
		}
	}, []);

	if (!pendingDocuments) return null;
	return (
		<CloseSummaryModal
			documents={pendingDocuments}
			onCancel={cancelClose}
			onConfirm={() => void discardAndClose()}
		/>
	);
}

function CloseSummaryModal({
	documents,
	onCancel,
	onConfirm,
}: {
	documents: DirtyDocument[];
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="close-guard-title"
			data-testid="close-guard-modal"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		>
			<div className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-2xl">
				<h2 id="close-guard-title" className="text-sm font-semibold text-foreground">
					Unsaved changes
				</h2>
				<p className="mt-2 text-sm text-muted-foreground">
					{documents.length === 1
						? "This document has unsaved changes:"
						: `${documents.length} documents have unsaved changes:`}
				</p>
				<ul className="mt-2 max-h-40 overflow-y-auto text-sm text-foreground">
					{documents.map((doc) => (
						<li key={doc.id} className="truncate">
							{doc.title}
						</li>
					))}
				</ul>
				<div className="mt-4 flex justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground hover:bg-destructive/90"
					>
						Discard and close
					</button>
				</div>
			</div>
		</div>
	);
}
