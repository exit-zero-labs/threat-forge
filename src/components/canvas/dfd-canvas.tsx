import {
	Background,
	BackgroundVariant,
	type Connection,
	Controls,
	type HandleType,
	MiniMap,
	type OnConnectStart,
	type OnNodeDrag,
	ReactFlow,
	SelectionMode,
	useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { EyeOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCanvasInstanceStore } from "@/stores/canvas-instance-store";
import type { DfdEdge, DfdNode } from "@/stores/canvas-store";
import { useCanvasStore } from "@/stores/canvas-store";
import { useDocumentRegistry } from "@/stores/document-registry";
import { useHistoryStore } from "@/stores/history-store";
import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";
import { buildEdgeMenuItems, buildNodeMenuItems, CanvasContextMenu } from "./canvas-context-menu";
import { DataFlowEdge } from "./edges/data-flow-edge";
import { DfdElementNode } from "./nodes/dfd-element-node";
import { TextAnnotationNode } from "./nodes/text-annotation-node";
import { TrustBoundaryNode } from "./nodes/trust-boundary-node";

const nodeTypes = {
	dfdElement: DfdElementNode,
	textAnnotation: TextAnnotationNode,
	trustBoundary: TrustBoundaryNode,
};

const edgeTypes = {
	dataFlow: DataFlowEdge,
};

const defaultEdgeOptions = {
	type: "dataFlow",
	markerEnd: {
		type: "arrowclosed" as const,
		width: 16,
		height: 16,
	},
};

export function DfdCanvas() {
	const nodes = useCanvasStore((s) => s.nodes);
	const edges = useCanvasStore((s) => s.edges);
	const onNodesChange = useCanvasStore((s) => s.onNodesChange);
	const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
	const setViewport = useCanvasStore((s) => s.setViewport);
	const addElement = useCanvasStore((s) => s.addElement);
	const addDataFlow = useCanvasStore((s) => s.addDataFlow);
	const addTrustBoundary = useCanvasStore((s) => s.addTrustBoundary);
	const duplicateElement = useCanvasStore((s) => s.duplicateElement);
	const reverseEdge = useCanvasStore((s) => s.reverseEdge);
	const reconnectEdge = useCanvasStore((s) => s.reconnectEdge);
	const syncFromModel = useCanvasStore((s) => s.syncFromModel);
	const model = useModelStore((s) => s.model);
	// Which document is active. A change is a tab switch (or a New/Open/Import/template, which now
	// activate a new tab), and drives the once-per-activation viewport decision below (#54 step 7).
	const activeDocumentId = useDocumentRegistry((s) => s.activeDocumentId);
	const {
		screenToFlowPosition,
		setViewport: setReactFlowViewport,
		getViewport: getReactFlowViewport,
		fitView: fitViewFn,
		zoomIn: zoomInFn,
		zoomOut: zoomOutFn,
	} = useReactFlow();

	const canvasLocked = useUiStore((s) => s.canvasLocked);

	// panBy is not exposed by useReactFlow in this version — implement via viewport manipulation
	const panByFn = useCallback(
		(delta: { x: number; y: number }) => {
			const vp = getReactFlowViewport();
			setReactFlowViewport({ x: vp.x + delta.x, y: vp.y + delta.y, zoom: vp.zoom });
		},
		[getReactFlowViewport, setReactFlowViewport],
	);

	// Expose ReactFlow actions to the canvas instance store so keyboard shortcuts and document
	// activation (viewport restore/flush on switch) can drive the mounted instance.
	useEffect(() => {
		useCanvasInstanceStore.getState().setReactFlowActions({
			fitView: () => fitViewFn(),
			zoomIn: () => zoomInFn(),
			zoomOut: () => zoomOutFn(),
			panBy: (delta) => panByFn(delta),
			setViewport: (viewport) => setReactFlowViewport(viewport),
			getViewport: () => getReactFlowViewport(),
		});
	}, [fitViewFn, zoomInFn, zoomOutFn, panByFn, setReactFlowViewport, getReactFlowViewport]);

	// Context menu state
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		nodeId?: string;
		edgeId?: string;
	} | null>(null);

	// Track connection source for validation feedback
	const connectingNodeId = useRef<string | null>(null);

	// Whether the viewport decision has already run for the current activation. Reset per activation
	// (below) so it runs once each time a document becomes active, not once per component lifetime.
	const initialSyncDone = useRef(false);
	// The active document this canvas last ran the viewport decision for; a change is a real switch.
	const lastActivatedIdRef = useRef(activeDocumentId);

	// Sync the canvas from the model on every relevant change (edit, new model, file open, tab
	// switch) and, once per activation, decide the incoming viewport after the nodes are synced.
	// `model` and `activeDocumentId` are in deps to re-run on edits and on switches; everything else
	// is read from store snapshots rather than subscribed.
	// biome-ignore lint/correctness/useExhaustiveDependencies: model/activeDocumentId trigger re-sync
	useEffect(() => {
		// A newly activated document must re-run the viewport decision even if the previous document
		// had already latched it. This closes the hole (#54 step 7) where importing a model with no
		// inline positions kept the latch set and rendered the import at the previous document's
		// pan/zoom — a silent, off-screen visual regression.
		if (lastActivatedIdRef.current !== activeDocumentId) {
			lastActivatedIdRef.current = activeDocumentId;
			initialSyncDone.current = false;
		}

		const hadPendingLayout = useCanvasStore.getState().pendingLayout != null;
		// A pending layout means a file/layout was just loaded — reset so we apply its viewport.
		if (hadPendingLayout) initialSyncDone.current = false;

		syncFromModel();

		// Decide the viewport only once per activation, and only after syncFromModel has populated
		// this document's nodes — deciding before the sync would act on the outgoing document's
		// geometry. Property edits re-run this effect with the latch still set and never move the view.
		if (!initialSyncDone.current) {
			initialSyncDone.current = true;
			requestAnimationFrame(() => {
				const { nodes, viewport } = useCanvasStore.getState();
				const isDefaultViewport = viewport.x === 0 && viewport.y === 0 && viewport.zoom === 1;
				if (hadPendingLayout || (nodes.length > 0 && !isDefaultViewport)) {
					// Loaded from a file/layout (apply its stored viewport) or returning to a laid-out
					// document (restore the viewport flushed when we left it).
					setReactFlowViewport(viewport);
				} else {
					// A fresh new or imported document, or one sitting at the default viewport: frame
					// its content instead of restoring a meaningless default pan/zoom.
					fitViewFn();
				}
			});
		}
	}, [syncFromModel, model, activeDocumentId, setReactFlowViewport, fitViewFn]);

	const onConnect = useCallback(
		(connection: Connection) => {
			if (connection.source && connection.target) {
				addDataFlow(connection.source, connection.target, {
					sourceHandle: connection.sourceHandle ?? undefined,
					targetHandle: connection.targetHandle ?? undefined,
				});
			}
			connectingNodeId.current = null;
		},
		[addDataFlow],
	);

	const onConnectStart: OnConnectStart = useCallback((_event, params) => {
		connectingNodeId.current = params.nodeId ?? null;
		useCanvasInstanceStore.getState().setIsConnecting(true);
		useCanvasInstanceStore.getState().setConnectingHandleType(params.handleType ?? null);
	}, []);

	const onConnectEnd = useCallback(() => {
		connectingNodeId.current = null;
		useCanvasInstanceStore.getState().setIsConnecting(false);
		useCanvasInstanceStore.getState().setConnectingHandleType(null);
	}, []);

	const onReconnect = useCallback(
		(oldEdge: DfdEdge, newConnection: Connection) => {
			reconnectEdge(oldEdge, newConnection);
		},
		[reconnectEdge],
	);

	const onReconnectStart = useCallback(
		(_event: React.MouseEvent, _edge: DfdEdge, handleType: HandleType) => {
			useCanvasInstanceStore.getState().setIsConnecting(true);
			useCanvasInstanceStore.getState().setConnectingHandleType(handleType);
		},
		[],
	);

	const onReconnectEnd = useCallback(
		(_event: MouseEvent | TouchEvent, _edge: DfdEdge, _handleType: HandleType) => {
			useCanvasInstanceStore.getState().setIsConnecting(false);
			useCanvasInstanceStore.getState().setConnectingHandleType(null);
		},
		[],
	);

	/** Validates whether a connection is allowed */
	const isValidConnection = useCallback(
		(connection: Connection | DfdEdge) => {
			if (!connection.source || !connection.target) return false;
			// Reject connections to/from text annotation nodes
			const sourceNode = nodes.find((n) => n.id === connection.source);
			const targetNode = nodes.find((n) => n.id === connection.target);
			if (sourceNode?.type === "textAnnotation" || targetNode?.type === "textAnnotation")
				return false;
			return true;
		},
		[nodes],
	);

	const onDragOver = useCallback((event: React.DragEvent) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
	}, []);

	const onDrop = useCallback(
		(event: React.DragEvent) => {
			event.preventDefault();

			// Read type from Zustand store — workaround for WKWebView dataTransfer issues
			// where getData() returns empty for custom MIME types during drop events.
			// Clear immediately after reading to prevent onDragEnd fallback from double-creating.
			const store = useCanvasInstanceStore.getState();
			const draggedType = store.draggedType;
			const draggedSubtype = store.draggedSubtype;
			const draggedIcon = store.draggedIcon;
			const draggedName = store.draggedName;
			store.setDraggedComponent(null);
			if (!draggedType) return;

			// Convert screen coordinates to flow coordinates (accounts for zoom/pan)
			const position = screenToFlowPosition({
				x: event.clientX,
				y: event.clientY,
			});

			if (draggedType === "trust_boundary") {
				addTrustBoundary("New Boundary", position);
			} else {
				const opts =
					draggedSubtype || draggedIcon || draggedName
						? {
								subtype: draggedSubtype ?? undefined,
								icon: draggedIcon ?? undefined,
								name: draggedName ?? undefined,
							}
						: undefined;
				addElement(draggedType, position, opts);
			}
		},
		[addElement, addTrustBoundary, screenToFlowPosition],
	);

	const onPaneClick = useCallback(() => {
		useModelStore.getState().setSelectedElement(null);
		useModelStore.getState().setSelectedEdge(null);
		useModelStore.getState().setSelectedBoundary(null);
		setContextMenu(null);
	}, []);

	const onNodeClick = useCallback((_event: React.MouseEvent, node: DfdNode) => {
		if (node.data.isBoundary) {
			useModelStore.getState().setSelectedBoundary(node.id);
		} else {
			useModelStore.getState().setSelectedElement(node.id);
		}
		useUiStore.getState().setRightPanelTab("properties");
	}, []);

	const onEdgeClick = useCallback((_event: React.MouseEvent, edge: DfdEdge) => {
		useModelStore.getState().setSelectedEdge(edge.id);
		useUiStore.getState().setRightPanelTab("properties");
	}, []);

	/** Track Alt+drag state for position swap on drop */
	const altDragRef = useRef<{
		originalId: string;
		cloneId: string;
		startPos: { x: number; y: number };
		/** Model snapshot captured BEFORE the clone was created (clean undo point) */
		preCloneSnapshot: import("@/types/threat-model").ThreatModel;
	} | null>(null);

	/** Alt+Drag to duplicate: create ghost at original position, swap positions on drop */
	const onNodeDragStart = useCallback<OnNodeDrag<DfdNode>>(
		(event, node) => {
			if (event.altKey && !node.data.isBoundary) {
				const model = useModelStore.getState().model;
				if (!model) return;

				// Capture clean snapshot BEFORE cloning
				const preCloneSnapshot = { ...model };

				// Tell the canvas store to skip its own drag-end history push
				useCanvasInstanceStore.getState().setAltDragActive(true);

				const cloneId = duplicateElement(node.id, {
					offset: { x: 0, y: 0 },
					select: false,
					skipHistory: true,
				});
				if (cloneId) {
					altDragRef.current = {
						originalId: node.id,
						cloneId,
						startPos: { x: node.position.x, y: node.position.y },
						preCloneSnapshot,
					};
				} else {
					useCanvasInstanceStore.getState().setAltDragActive(false);
				}
			}
		},
		[duplicateElement],
	);

	/** On drag stop: if Alt+drag was active, swap positions so original stays and copy moves */
	const onNodeDragStop = useCallback<OnNodeDrag<DfdNode>>((_event, node) => {
		const info = altDragRef.current;
		if (!info) return;

		// Always clear Alt+drag state
		altDragRef.current = null;
		useCanvasInstanceStore.getState().setAltDragActive(false);

		// If drag stopped on a different node (shouldn't happen, but safety), clean up the orphaned clone
		if (node.id !== info.originalId) {
			const store = useCanvasStore.getState();
			const cleanedNodes = store.nodes.filter((n) => n.id !== info.cloneId);
			useCanvasStore.setState({ nodes: cleanedNodes });
			// Revert model to pre-clone state
			useModelStore.setState({ model: info.preCloneSnapshot });
			return;
		}

		const dropPos = { x: node.position.x, y: node.position.y };
		const store = useCanvasStore.getState();

		// Move original back to its starting position, clone to the drop position
		const updatedNodes = store.nodes.map((n) => {
			if (n.id === info.originalId) {
				return { ...n, position: { ...info.startPos } };
			}
			if (n.id === info.cloneId) {
				return { ...n, position: { ...dropPos } };
			}
			return n;
		});
		useCanvasStore.setState({ nodes: updatedNodes });

		// Push the pre-clone snapshot as the single undo point
		useHistoryStore.getState().pushSnapshot(info.preCloneSnapshot);

		// Update model positions for both original (back to start) and clone (at drop)
		const model = useModelStore.getState().model;
		if (model) {
			const updatedElements = model.elements.map((el) => {
				if (el.id === info.originalId) return { ...el, position: { ...info.startPos } };
				if (el.id === info.cloneId) return { ...el, position: { ...dropPos } };
				return el;
			});
			useModelStore.setState({
				model: { ...model, elements: updatedElements },
				isDirty: true,
			});
		}

		// Select the clone (the "copy" at the drop position)
		useModelStore.getState().setSelectedElement(info.cloneId);
	}, []);

	const onNodeContextMenu = useCallback((event: React.MouseEvent, node: DfdNode) => {
		event.preventDefault();
		if (node.data.isBoundary) return;
		setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
	}, []);

	const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: DfdEdge) => {
		event.preventDefault();
		setContextMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
	}, []);

	const contextMenuItems = useMemo(() => {
		if (!contextMenu) return [];
		if (contextMenu.nodeId) {
			const node = useCanvasStore.getState().nodes.find((n) => n.id === contextMenu.nodeId);
			return buildNodeMenuItems({
				onEditProperties: () => {
					useModelStore.getState().setSelectedElement(contextMenu.nodeId ?? null);
					useUiStore.getState().setRightPanelTab("properties");
				},
				onDelete: () => {
					// Select the node then delete
					const nodeId = contextMenu.nodeId;
					if (nodeId) {
						const nodes = useCanvasStore.getState().nodes;
						const updated = nodes.map((n) => ({
							...n,
							selected: n.id === nodeId,
						}));
						useCanvasStore.setState({ nodes: updated });
						useCanvasStore.getState().deleteSelected();
					}
				},
				onDuplicate: () => {
					if (contextMenu.nodeId) duplicateElement(contextMenu.nodeId);
				},
				onViewThreats: () => {
					useModelStore.getState().setSelectedElement(contextMenu.nodeId ?? null);
					useUiStore.getState().setRightPanelTab("threats");
				},
				isTextAnnotation: node?.type === "textAnnotation",
			});
		}
		if (contextMenu.edgeId) {
			return buildEdgeMenuItems({
				onEditProperties: () => {
					useModelStore.getState().setSelectedEdge(contextMenu.edgeId ?? null);
					useUiStore.getState().setRightPanelTab("properties");
				},
				onDelete: () => {
					const edgeId = contextMenu.edgeId;
					if (edgeId) {
						const edges = useCanvasStore.getState().edges;
						const updated = edges.map((e) => ({
							...e,
							selected: e.id === edgeId,
						}));
						useCanvasStore.setState({ edges: updated });
						useCanvasStore.getState().deleteSelected();
					}
				},
				onReverseDirection: () => {
					if (contextMenu.edgeId) reverseEdge(contextMenu.edgeId);
				},
			});
		}
		return [];
	}, [contextMenu, duplicateElement, reverseEdge]);

	const minimapVisible = useSettingsStore((s) => s.settings.minimapVisible);
	const [minimapHovered, setMinimapHovered] = useState(false);

	// Subscribe to effective preset so canvas re-renders when theme changes,
	// picking up the new CSS variable values for ReactFlow sub-components.
	const effectivePresetId = useUiStore((s) => s.getEffectivePresetId());

	// Read resolved CSS variable values so ReactFlow prop-based colors update on theme change
	// biome-ignore lint/correctness/useExhaustiveDependencies: effectivePresetId triggers recalculation when theme changes
	const canvasColors = useMemo(() => {
		const style = getComputedStyle(document.documentElement);
		return {
			dotColor: style.getPropertyValue("--color-muted-foreground").trim() || "oklch(0.35 0 0)",
			minimapNodeColor:
				style.getPropertyValue("--color-muted-foreground").trim() || "oklch(0.4 0 0)",
			minimapMaskColor:
				style.getPropertyValue("--color-background").trim() || "oklch(0.1 0 0 / 0.7)",
		};
	}, [effectivePresetId]);

	return (
		<div className="h-full w-full">
			<ReactFlow<DfdNode, DfdEdge>
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				onConnectStart={onConnectStart}
				onConnectEnd={onConnectEnd}
				edgesReconnectable={!canvasLocked}
				onReconnect={onReconnect}
				onReconnectStart={onReconnectStart}
				onReconnectEnd={onReconnectEnd}
				isValidConnection={isValidConnection}
				onMoveEnd={(_event, viewport) => setViewport(viewport)}
				onDragOver={onDragOver}
				onDrop={onDrop}
				onPaneClick={onPaneClick}
				onNodeClick={onNodeClick}
				onEdgeClick={onEdgeClick}
				onNodeDragStart={onNodeDragStart}
				onNodeDragStop={onNodeDragStop}
				onNodeContextMenu={onNodeContextMenu}
				onEdgeContextMenu={onEdgeContextMenu}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				defaultEdgeOptions={defaultEdgeOptions}
				fitView
				snapToGrid
				snapGrid={[16, 16]}
				multiSelectionKeyCode="Shift"
				selectionMode={SelectionMode.Partial}
				deleteKeyCode={null}
				nodesDraggable={!canvasLocked}
				nodesConnectable={!canvasLocked}
				elementsSelectable={!canvasLocked}
				className="bg-background"
				proOptions={{ hideAttribution: true }}
			>
				<Background
					variant={BackgroundVariant.Dots}
					gap={16}
					size={1}
					color={canvasColors.dotColor}
				/>
				<Controls className="!bg-card !border-border !shadow-md [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-accent" />
				{minimapVisible && (
					<MiniMap
						className="!bg-card !border !border-border !rounded-md !shadow-sm"
						nodeColor={canvasColors.minimapNodeColor}
						maskColor={canvasColors.minimapMaskColor}
						style={{ width: 160, height: 120 }}
					/>
				)}
				{/* Minimap hide button — overlaid in bottom-right corner */}
				{minimapVisible && (
					<div
						className="absolute bottom-1 right-1 z-10"
						style={{ pointerEvents: "none" }}
						onMouseEnter={() => setMinimapHovered(true)}
						onMouseLeave={() => setMinimapHovered(false)}
					>
						<div style={{ width: 160, height: 120, position: "relative", pointerEvents: "auto" }}>
							{minimapHovered && (
								<button
									type="button"
									className="absolute right-1 top-1 z-20 rounded bg-card/80 p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
									style={{ pointerEvents: "auto" }}
									title="Hide minimap"
									onClick={() => useSettingsStore.getState().updateSetting("minimapVisible", false)}
								>
									<EyeOff className="h-3.5 w-3.5" />
								</button>
							)}
						</div>
					</div>
				)}
			</ReactFlow>
			{contextMenu && contextMenuItems.length > 0 && (
				<CanvasContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					items={contextMenuItems}
					onClose={() => setContextMenu(null)}
				/>
			)}
		</div>
	);
}
