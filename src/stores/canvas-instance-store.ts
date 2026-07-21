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
	setReactFlowActions: (actions: {
		fitView: () => void;
		zoomIn: () => void;
		zoomOut: () => void;
		panBy: (delta: { x: number; y: number }) => void;
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

	/** When true, the canvas store skips its drag-end history push — Alt+drag owns its own entry. */
	altDragActive: boolean;
	setAltDragActive: (active: boolean) => void;
}

export const useCanvasInstanceStore = create<CanvasInstanceState>((set) => ({
	rfFitView: null,
	rfZoomIn: null,
	rfZoomOut: null,
	rfPanBy: null,
	setReactFlowActions: (actions) =>
		set({
			rfFitView: actions.fitView,
			rfZoomIn: actions.zoomIn,
			rfZoomOut: actions.zoomOut,
			rfPanBy: actions.panBy,
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

	altDragActive: false,
	setAltDragActive: (active) => set({ altDragActive: active }),
}));
