import type { HandleType, Viewport } from "@xyflow/react";
import { create } from "zustand";

/**
 * Workspace-scoped state for the single mounted ReactFlow canvas.
 *
 * Nothing here belongs to a document: the ReactFlow instance handles are registered by
 * whichever `DfdCanvas` is mounted, and the drag/connect fields only exist for the duration
 * of one pointer gesture. Keeping them out of the canvas store means view commands and
 * in-flight gestures do not have to be re-registered when the visible document changes.
 */
interface CanvasInstanceState {
	// ReactFlow instance actions (set by DfdCanvas on init)
	rfFitView: (() => void) | null;
	rfZoomIn: (() => void) | null;
	rfZoomOut: (() => void) | null;
	rfPanBy: ((delta: { x: number; y: number }) => void) | null;
	/** Push a viewport (pan/zoom) into the mounted ReactFlow instance. */
	rfSetViewport: ((viewport: Viewport) => void) | null;
	/** Read the mounted ReactFlow instance's live viewport (pan/zoom). */
	rfGetViewport: (() => Viewport) | null;
	setReactFlowActions: (actions: {
		fitView: () => void;
		zoomIn: () => void;
		zoomOut: () => void;
		panBy: (delta: { x: number; y: number }) => void;
		setViewport?: (viewport: Viewport) => void;
		getViewport?: () => Viewport;
	}) => void;

	/** Element type currently being dragged from palette (workaround for WKWebView dataTransfer issues) */
	draggedType: string | null;
	/** Subtype for the element being dragged from the library */
	draggedSubtype: string | null;
	/** Icon for the element being dragged from the library */
	draggedIcon: string | null;
	/** Display name for the element being dragged from the library */
	draggedName: string | null;
	setDraggedComponent: (
		info: {
			type: string;
			subtype?: string;
			icon?: string;
			name?: string;
		} | null,
	) => void;

	/** Whether a connection drag is in progress (used to show handles on all nodes) */
	isConnecting: boolean;
	setIsConnecting: (connecting: boolean) => void;

	/**
	 * The handle type (`source` or `target`) the in-progress connection/reconnect drag
	 * started from, or `null` when idle. Every connection point renders an overlapping
	 * source/target handle pair (#213); while a drag is active, `NodeHandles` uses this to
	 * suppress pointer events on same-type siblings so the browser's hit test at the drop
	 * point always resolves to the opposite-type handle underneath instead of whichever one
	 * happens to paint on top.
	 */
	connectingHandleType: HandleType | null;
	setConnectingHandleType: (handleType: HandleType | null) => void;

	/** When true, the canvas store skips its drag-end history push — Alt+drag owns its own entry. */
	altDragActive: boolean;
	setAltDragActive: (active: boolean) => void;
}

export const useCanvasInstanceStore = create<CanvasInstanceState>((set) => ({
	rfFitView: null,
	rfZoomIn: null,
	rfZoomOut: null,
	rfPanBy: null,
	rfSetViewport: null,
	rfGetViewport: null,
	setReactFlowActions: (actions) =>
		set({
			rfFitView: actions.fitView,
			rfZoomIn: actions.zoomIn,
			rfZoomOut: actions.zoomOut,
			rfPanBy: actions.panBy,
			rfSetViewport: actions.setViewport ?? null,
			rfGetViewport: actions.getViewport ?? null,
		}),

	draggedType: null,
	draggedSubtype: null,
	draggedIcon: null,
	draggedName: null,
	setDraggedComponent: (info) => {
		if (info) {
			set({
				draggedType: info.type,
				draggedSubtype: info.subtype ?? null,
				draggedIcon: info.icon ?? null,
				draggedName: info.name ?? null,
			});
		} else {
			set({ draggedType: null, draggedSubtype: null, draggedIcon: null, draggedName: null });
		}
	},

	isConnecting: false,
	setIsConnecting: (connecting) => set({ isConnecting: connecting }),

	connectingHandleType: null,
	setConnectingHandleType: (handleType) => set({ connectingHandleType: handleType }),

	altDragActive: false,
	setAltDragActive: (active) => set({ altDragActive: active }),
}));
