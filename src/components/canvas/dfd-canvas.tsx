import {
	Background,
	BackgroundVariant,
	type Connection,
	Controls,
	MiniMap,
	ReactFlow,
	useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect } from "react";
import type { DfdEdge, DfdNode } from "@/stores/canvas-store";
import { useCanvasStore } from "@/stores/canvas-store";
import { useModelStore } from "@/stores/model-store";
import type { ElementType } from "@/types/threat-model";
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
	const syncFromModel = useCanvasStore((s) => s.syncFromModel);
	const model = useModelStore((s) => s.model);
	const { screenToFlowPosition } = useReactFlow();

	// Sync canvas from model when it changes (new model loaded, file opened).
	// `model` is intentionally in deps — syncFromModel reads from model-store internally,
	// but we need the effect to re-run when the model reference changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: model triggers re-sync
	useEffect(() => {
		syncFromModel();
	}, [syncFromModel, model]);

	const onConnect = useCallback(
		(connection: Connection) => {
			if (connection.source && connection.target) {
				addDataFlow(connection.source, connection.target);
			}
		},
		[addDataFlow],
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
	}, []);

	return (
		<div className="h-full w-full" onKeyDown={onKeyDown}>
			<ReactFlow<DfdNode, DfdEdge>
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				onMoveEnd={(_event, viewport) => setViewport(viewport)}
				onDragOver={onDragOver}
				onDrop={onDrop}
				onPaneClick={onPaneClick}
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
				<Background variant={BackgroundVariant.Dots} gap={16} size={1} color="oklch(0.35 0 0)" />
				<Controls className="!bg-card !border-border !shadow-md [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-accent" />
				<MiniMap
					className="!bg-card !border-border"
					nodeColor="oklch(0.4 0 0)"
					maskColor="oklch(0.1 0 0 / 0.7)"
				/>
			</ReactFlow>
		</div>
	);
}
