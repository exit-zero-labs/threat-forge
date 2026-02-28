import {
	Background,
	BackgroundVariant,
	type Connection,
	Controls,
	MiniMap,
	type OnConnectStart,
	ReactFlow,
	useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isDuplicateEdge, isSelfLoop } from "@/lib/canvas-utils";
import type { DfdEdge, DfdNode } from "@/stores/canvas-store";
import { useCanvasStore } from "@/stores/canvas-store";
import { useModelStore } from "@/stores/model-store";
import { useUiStore } from "@/stores/ui-store";
import type { ElementType } from "@/types/threat-model";
import { buildEdgeMenuItems, buildNodeMenuItems, CanvasContextMenu } from "./canvas-context-menu";
import { DataFlowEdge } from "./edges/data-flow-edge";
import { DataStoreNode } from "./nodes/data-store-node";
import { ExternalEntityNode } from "./nodes/external-entity-node";
import { ProcessNode } from "./nodes/process-node";
import { TrustBoundaryNode } from "./nodes/trust-boundary-node";

const nodeTypes = {
	process: ProcessNode,
	dataStore: DataStoreNode,
	externalEntity: ExternalEntityNode,
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
	const deleteSelected = useCanvasStore((s) => s.deleteSelected);
	const duplicateElement = useCanvasStore((s) => s.duplicateElement);
	const reverseEdge = useCanvasStore((s) => s.reverseEdge);
	const syncFromModel = useCanvasStore((s) => s.syncFromModel);
	const model = useModelStore((s) => s.model);
	const {
		screenToFlowPosition,
		setViewport: setReactFlowViewport,
		fitView: fitViewFn,
	} = useReactFlow();

	// Context menu state
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		nodeId?: string;
		edgeId?: string;
	} | null>(null);

	// Track connection source for validation feedback
	const connectingNodeId = useRef<string | null>(null);

	// Sync canvas from model when it changes (new model loaded, file opened).
	// `model` is intentionally in deps — syncFromModel reads from model-store internally,
	// but we need the effect to re-run when the model reference changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: model triggers re-sync
	useEffect(() => {
		const hadPendingLayout = useCanvasStore.getState().pendingLayout != null;
		syncFromModel();

		// After nodes are set, restore saved viewport or fit to new content
		requestAnimationFrame(() => {
			if (hadPendingLayout) {
				const { viewport } = useCanvasStore.getState();
				setReactFlowViewport(viewport);
			} else {
				fitViewFn();
			}
		});
	}, [syncFromModel, model, setReactFlowViewport, fitViewFn]);

	const onConnect = useCallback(
		(connection: Connection) => {
			if (connection.source && connection.target) {
				addDataFlow(connection.source, connection.target);
			}
			connectingNodeId.current = null;
		},
		[addDataFlow],
	);

	const onConnectStart: OnConnectStart = useCallback((_event, params) => {
		connectingNodeId.current = params.nodeId ?? null;
	}, []);

	const onConnectEnd = useCallback(() => {
		connectingNodeId.current = null;
	}, []);

	/** Validates whether a connection is allowed (no self-loops, no duplicates) */
	const isValidConnection = useCallback(
		(connection: Connection | DfdEdge) => {
			if (!connection.source || !connection.target) return false;
			if (isSelfLoop(connection.source, connection.target)) return false;
			if (isDuplicateEdge(edges, connection.source, connection.target)) return false;
			return true;
		},
		[edges],
	);

	const onDragOver = useCallback((event: React.DragEvent) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
	}, []);

	const onDrop = useCallback(
		(event: React.DragEvent) => {
			event.preventDefault();

			// Read type from Zustand store — workaround for WKWebView dataTransfer issues
			// where getData() returns empty for custom MIME types during drop events
			const draggedType = useCanvasStore.getState().draggedType;
			if (!draggedType) return;

			// Convert screen coordinates to flow coordinates (accounts for zoom/pan)
			const position = screenToFlowPosition({
				x: event.clientX,
				y: event.clientY,
			});

			if (draggedType === "trust_boundary") {
				addTrustBoundary("New Boundary", position);
			} else {
				addElement(draggedType as ElementType, position);
			}

			useCanvasStore.getState().setDraggedType(null);
		},
		[addElement, addTrustBoundary, screenToFlowPosition],
	);

	const onKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (event.key === "Delete" || event.key === "Backspace") {
				deleteSelected();
			}
		},
		[deleteSelected],
	);

	const onPaneClick = useCallback(() => {
		useModelStore.getState().setSelectedElement(null);
		setContextMenu(null);
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
			});
		}
		if (contextMenu.edgeId) {
			return buildEdgeMenuItems({
				onEditProperties: () => {
					/* Edge properties are edited via inline label editing */
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

	// Subscribe to themePresetId so canvas re-renders when theme changes,
	// picking up the new CSS variable values for ReactFlow sub-components.
	const themePresetId = useUiStore((s) => s.themePresetId);

	// Read resolved CSS variable values so ReactFlow prop-based colors update on theme change
	// biome-ignore lint/correctness/useExhaustiveDependencies: themePresetId triggers recalculation when theme changes
	const canvasColors = useMemo(() => {
		const style = getComputedStyle(document.documentElement);
		return {
			dotColor: style.getPropertyValue("--color-muted-foreground").trim() || "oklch(0.35 0 0)",
			minimapNodeColor:
				style.getPropertyValue("--color-muted-foreground").trim() || "oklch(0.4 0 0)",
			minimapMaskColor:
				style.getPropertyValue("--color-background").trim() || "oklch(0.1 0 0 / 0.7)",
		};
	}, [themePresetId]);

	return (
		<div className="h-full w-full" onKeyDown={onKeyDown}>
			<ReactFlow<DfdNode, DfdEdge>
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				onConnectStart={onConnectStart}
				onConnectEnd={onConnectEnd}
				isValidConnection={isValidConnection}
				onMoveEnd={(_event, viewport) => setViewport(viewport)}
				onDragOver={onDragOver}
				onDrop={onDrop}
				onPaneClick={onPaneClick}
				onNodeContextMenu={onNodeContextMenu}
				onEdgeContextMenu={onEdgeContextMenu}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				defaultEdgeOptions={defaultEdgeOptions}
				fitView
				snapToGrid
				snapGrid={[16, 16]}
				deleteKeyCode={null}
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
				<MiniMap
					className="!bg-card !border-border"
					nodeColor={canvasColors.minimapNodeColor}
					maskColor={canvasColors.minimapMaskColor}
				/>
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
