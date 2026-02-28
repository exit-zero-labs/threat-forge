import type { Edge, Node, OnEdgesChange, OnNodesChange, Viewport } from "@xyflow/react";
import { applyEdgeChanges, applyNodeChanges } from "@xyflow/react";
import { create } from "zustand";
import { getSmartHandlePair, isSelfLoop, nodeToRect } from "@/lib/canvas-utils";
import type {
	DataFlow,
	DiagramLayout,
	Element,
	ElementType,
	TrustBoundary,
} from "@/types/threat-model";
import { useModelStore } from "./model-store";

/** ReactFlow node data payload for DFD elements.
 *  Uses `type` + index signature to satisfy ReactFlow's `Record<string, unknown>` constraint. */
export type DfdNodeData = {
	[key: string]: unknown;
	label: string;
	elementType: ElementType;
	trustZone: string;
	description: string;
	technologies: string[];
	/** For trust boundary group nodes */
	isBoundary?: boolean;
	boundaryName?: string;
};

/** ReactFlow edge data payload for data flows.
 *  Uses `type` + index signature to satisfy ReactFlow's `Record<string, unknown>` constraint. */
export type DfdEdgeData = {
	[key: string]: unknown;
	name: string;
	protocol: string;
	data: string[];
	authenticated: boolean;
};

export type DfdNode = Node<DfdNodeData>;
export type DfdEdge = Edge<DfdEdgeData>;

interface CanvasState {
	nodes: DfdNode[];
	edges: DfdEdge[];
	viewport: Viewport;

	/** Element type currently being dragged from palette (workaround for WKWebView dataTransfer issues) */
	draggedType: string | null;

	/** Layout to apply on next syncFromModel (set before loading a model) */
	pendingLayout: DiagramLayout | null;

	// ReactFlow change handlers
	onNodesChange: OnNodesChange<DfdNode>;
	onEdgesChange: OnEdgesChange<DfdEdge>;
	setViewport: (viewport: Viewport) => void;

	// Drag state
	setDraggedType: (type: string | null) => void;
	setPendingLayout: (layout: DiagramLayout | null) => void;

	// Canvas actions
	addElement: (type: ElementType, position: { x: number; y: number }) => void;
	addDataFlow: (
		sourceId: string,
		targetId: string,
		opts?: { sourceHandle?: string; targetHandle?: string; name?: string },
	) => string | null;
	addTrustBoundary: (name: string, position: { x: number; y: number }) => void;
	deleteSelected: () => void;
	duplicateElement: (nodeId: string) => void;
	reverseEdge: (edgeId: string) => void;

	// Sync from model store
	syncFromModel: () => void;
}

let elementCounter = 0;
let flowCounter = 0;
let boundaryCounter = 0;

function generateElementId(type: ElementType): string {
	elementCounter++;
	const prefix =
		type === "data_store" ? "data-store" : type === "external_entity" ? "external" : "process";
	return `${prefix}-${elementCounter}`;
}

function generateFlowId(): string {
	flowCounter++;
	return `flow-${flowCounter}`;
}

function generateBoundaryId(): string {
	boundaryCounter++;
	return `boundary-${boundaryCounter}`;
}

function elementTypeToNodeType(type: ElementType): string {
	switch (type) {
		case "process":
			return "process";
		case "data_store":
			return "dataStore";
		case "external_entity":
			return "externalEntity";
	}
}

function elementToNode(element: Element, position: { x: number; y: number }): DfdNode {
	return {
		id: element.id,
		type: elementTypeToNodeType(element.type),
		position,
		data: {
			label: element.name,
			elementType: element.type,
			trustZone: element.trust_zone ?? "",
			description: element.description ?? "",
			technologies: element.technologies ?? [],
		},
	};
}

function boundaryToNode(boundary: TrustBoundary, position: { x: number; y: number }): DfdNode {
	return {
		id: boundary.id,
		type: "trustBoundary",
		position,
		width: 400,
		height: 300,
		style: { width: 400, height: 300 },
		data: {
			label: boundary.name,
			elementType: "process", // unused for boundaries
			trustZone: "",
			description: "",
			technologies: [],
			isBoundary: true,
			boundaryName: boundary.name,
		},
	};
}

function flowToEdge(flow: DataFlow): DfdEdge {
	return {
		id: flow.id,
		source: flow.from,
		target: flow.to,
		type: "dataFlow",
		animated: flow.authenticated,
		data: {
			name: flow.name ?? "",
			protocol: flow.protocol,
			data: flow.data,
			authenticated: flow.authenticated,
		},
	};
}

function defaultElementName(type: ElementType): string {
	switch (type) {
		case "process":
			return "New Process";
		case "data_store":
			return "New Data Store";
		case "external_entity":
			return "New External Entity";
	}
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
	nodes: [],
	edges: [],
	viewport: { x: 0, y: 0, zoom: 1 },
	draggedType: null,
	pendingLayout: null,

	onNodesChange: (changes) => {
		set({ nodes: applyNodeChanges(changes, get().nodes) as DfdNode[] });

		// Propagate position changes to keep model aware of dirty state
		const hasPositionChange = changes.some((c) => c.type === "position" && c.dragging === false);
		if (hasPositionChange) {
			useModelStore.getState().markDirty();
		}

		// Handle selection changes
		const selectionChange = changes.find((c) => c.type === "select" && c.selected);
		if (selectionChange && selectionChange.type === "select") {
			const node = get().nodes.find((n) => n.id === selectionChange.id);
			if (node && !node.data.isBoundary) {
				useModelStore.getState().setSelectedElement(selectionChange.id);
			}
		}

		// Handle deselection
		const deselection = changes.find((c) => c.type === "select" && !c.selected);
		if (deselection && !changes.some((c) => c.type === "select" && c.selected)) {
			useModelStore.getState().setSelectedElement(null);
		}
	},

	onEdgesChange: (changes) => {
		const prevEdges = get().edges;
		const nextEdges = applyEdgeChanges(changes, prevEdges) as DfdEdge[];
		set({ edges: nextEdges });

		// Handle edge removal — remove from model store
		const removals = changes.filter(
			(c): c is Extract<typeof c, { type: "remove" }> => c.type === "remove",
		);
		if (removals.length > 0) {
			const model = useModelStore.getState().model;
			if (model) {
				const removedIds = new Set(removals.map((r) => r.id));
				const updatedFlows = model.data_flows.filter((f) => !removedIds.has(f.id));
				useModelStore
					.getState()
					.setModel({ ...model, data_flows: updatedFlows }, useModelStore.getState().filePath);
				useModelStore.getState().markDirty();
			}
		}
	},

	setViewport: (viewport) => set({ viewport }),
	setDraggedType: (type) => set({ draggedType: type }),
	setPendingLayout: (layout) => set({ pendingLayout: layout }),

	addElement: (type, position) => {
		const id = generateElementId(type);
		const name = defaultElementName(type);

		const newElement: Element = {
			id,
			type,
			name,
			trust_zone: "",
			description: "",
			technologies: [],
		};

		const newNode = elementToNode(newElement, position);

		// Check if the drop position is inside a trust boundary
		const boundaryNode = get().nodes.find((n) => {
			if (!n.data.isBoundary) return false;
			const bw = n.width ?? (n.style as Record<string, number> | undefined)?.width ?? 400;
			const bh = n.height ?? (n.style as Record<string, number> | undefined)?.height ?? 300;
			return (
				position.x >= n.position.x &&
				position.x <= n.position.x + bw &&
				position.y >= n.position.y &&
				position.y <= n.position.y + bh
			);
		});

		if (boundaryNode) {
			newNode.parentId = boundaryNode.id;
			newNode.extent = "parent";
			// Adjust position to be relative to the boundary
			newNode.position = {
				x: position.x - boundaryNode.position.x,
				y: position.y - boundaryNode.position.y,
			};
		}

		// Update canvas
		set({ nodes: [...get().nodes, newNode] });

		// Update model store
		const model = useModelStore.getState().model;
		if (model) {
			// If dropped inside boundary, add to its contains array
			let updatedBoundaries = model.trust_boundaries;
			if (boundaryNode) {
				updatedBoundaries = model.trust_boundaries.map((b) =>
					b.id === boundaryNode.id ? { ...b, contains: [...b.contains, id] } : b,
				);
			}
			useModelStore.getState().setModel(
				{
					...model,
					elements: [...model.elements, newElement],
					trust_boundaries: updatedBoundaries,
				},
				useModelStore.getState().filePath,
			);
			useModelStore.getState().markDirty();
		}

		// Select the new element
		useModelStore.getState().setSelectedElement(id);
	},

	addDataFlow: (sourceId, targetId, opts) => {
		// Prevent self-loops
		if (isSelfLoop(sourceId, targetId)) {
			return null;
		}

		const id = generateFlowId();
		const newFlow: DataFlow = {
			id,
			name: opts?.name ?? "",
			from: sourceId,
			to: targetId,
			protocol: "",
			data: [],
			authenticated: false,
		};

		const newEdge = flowToEdge(newFlow);

		// Use explicitly provided handles (from user drag), or fall back to smart routing
		if (opts?.sourceHandle && opts?.targetHandle) {
			newEdge.sourceHandle = opts.sourceHandle;
			newEdge.targetHandle = opts.targetHandle;
		} else {
			const sourceNode = get().nodes.find((n) => n.id === sourceId);
			const targetNode = get().nodes.find((n) => n.id === targetId);
			if (sourceNode && targetNode) {
				const handlePair = getSmartHandlePair(nodeToRect(sourceNode), nodeToRect(targetNode));
				newEdge.sourceHandle = handlePair.sourceHandle;
				newEdge.targetHandle = handlePair.targetHandle;
			}
		}

		set({ edges: [...get().edges, newEdge] });

		// Update model store
		const model = useModelStore.getState().model;
		if (model) {
			useModelStore
				.getState()
				.setModel(
					{ ...model, data_flows: [...model.data_flows, newFlow] },
					useModelStore.getState().filePath,
				);
			useModelStore.getState().markDirty();
		}

		return id;
	},

	addTrustBoundary: (name, position) => {
		const id = generateBoundaryId();
		const newBoundary: TrustBoundary = {
			id,
			name,
			contains: [],
		};

		const newNode = boundaryToNode(newBoundary, position);
		// Insert boundaries at the beginning so they render behind other nodes
		set({ nodes: [newNode, ...get().nodes] });

		// Update model store
		const model = useModelStore.getState().model;
		if (model) {
			useModelStore.getState().setModel(
				{
					...model,
					trust_boundaries: [...model.trust_boundaries, newBoundary],
				},
				useModelStore.getState().filePath,
			);
			useModelStore.getState().markDirty();
		}
	},

	deleteSelected: () => {
		const currentNodes = get().nodes;
		const currentEdges = get().edges;
		const selectedNodes = currentNodes.filter((n) => n.selected);
		const selectedEdges = currentEdges.filter((e) => e.selected);

		if (selectedNodes.length === 0 && selectedEdges.length === 0) return;

		const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
		const selectedEdgeIds = new Set(selectedEdges.map((e) => e.id));

		// Find all edges to remove: explicitly selected + connected to removed nodes
		const connectedEdgeIds = currentEdges
			.filter((e) => selectedNodeIds.has(e.source) || selectedNodeIds.has(e.target))
			.map((e) => e.id);
		const allRemovedEdgeIds = new Set([...selectedEdgeIds, ...connectedEdgeIds]);

		// Remove nodes and affected edges
		const nextNodes = currentNodes.filter((n) => !selectedNodeIds.has(n.id));
		const nextEdges = currentEdges.filter((e) => !allRemovedEdgeIds.has(e.id));

		set({ nodes: nextNodes, edges: nextEdges });

		// Update model store
		const model = useModelStore.getState().model;
		if (model) {
			useModelStore.getState().setModel(
				{
					...model,
					elements: model.elements.filter((e) => !selectedNodeIds.has(e.id)),
					data_flows: model.data_flows.filter((f) => !allRemovedEdgeIds.has(f.id)),
					trust_boundaries: model.trust_boundaries
						.filter((b) => !selectedNodeIds.has(b.id))
						.map((b) => ({
							...b,
							contains: b.contains.filter((c) => !selectedNodeIds.has(c)),
						})),
				},
				useModelStore.getState().filePath,
			);
			useModelStore.getState().markDirty();
			useModelStore.getState().setSelectedElement(null);
		}
	},

	duplicateElement: (nodeId) => {
		const model = useModelStore.getState().model;
		if (!model) return;

		const element = model.elements.find((e) => e.id === nodeId);
		if (!element) return;

		const sourceNode = get().nodes.find((n) => n.id === nodeId);
		const offsetX = sourceNode ? sourceNode.position.x + 50 : 200;
		const offsetY = sourceNode ? sourceNode.position.y + 50 : 200;

		const newId = generateElementId(element.type);
		const newElement: Element = {
			...element,
			id: newId,
			name: `${element.name} (copy)`,
		};

		const newNode = elementToNode(newElement, { x: offsetX, y: offsetY });
		set({ nodes: [...get().nodes, newNode] });

		useModelStore
			.getState()
			.setModel(
				{ ...model, elements: [...model.elements, newElement] },
				useModelStore.getState().filePath,
			);
		useModelStore.getState().markDirty();
		useModelStore.getState().setSelectedElement(newId);
	},

	reverseEdge: (edgeId) => {
		const model = useModelStore.getState().model;
		if (!model) return;

		const flow = model.data_flows.find((f) => f.id === edgeId);
		if (!flow) return;

		// Update model: swap from/to
		const updatedFlows = model.data_flows.map((f) =>
			f.id === edgeId ? { ...f, from: f.to, to: f.from } : f,
		);
		useModelStore
			.getState()
			.setModel({ ...model, data_flows: updatedFlows }, useModelStore.getState().filePath);
		useModelStore.getState().markDirty();

		// Update canvas edge: swap source/target
		const currentEdges = get().edges;
		const updatedEdges = currentEdges.map((e) =>
			e.id === edgeId
				? {
						...e,
						source: e.target,
						target: e.source,
						sourceHandle: e.targetHandle?.replace("target", "source"),
						targetHandle: e.sourceHandle?.replace("source", "target"),
					}
				: e,
		);
		set({ edges: updatedEdges });
	},

	syncFromModel: () => {
		const model = useModelStore.getState().model;
		if (!model) {
			set({ nodes: [], edges: [], pendingLayout: null });
			return;
		}

		// Consume pending layout (set before loading a model via setPendingLayout)
		const layout = get().pendingLayout;
		const layoutPositions = layout ? new Map(layout.nodes.map((n) => [n.id, n])) : null;

		// Reset counters based on existing IDs
		const maxElementNum = model.elements.reduce((max, e) => {
			const match = e.id.match(/-(\d+)$/);
			return match ? Math.max(max, Number.parseInt(match[1], 10)) : max;
		}, 0);
		const maxFlowNum = model.data_flows.reduce((max, f) => {
			const match = f.id.match(/-(\d+)$/);
			return match ? Math.max(max, Number.parseInt(match[1], 10)) : max;
		}, 0);
		const maxBoundaryNum = model.trust_boundaries.reduce((max, b) => {
			const match = b.id.match(/-(\d+)$/);
			return match ? Math.max(max, Number.parseInt(match[1], 10)) : max;
		}, 0);
		elementCounter = maxElementNum;
		flowCounter = maxFlowNum;
		boundaryCounter = maxBoundaryNum;

		// Keep existing positions for nodes that still exist (used when model changes in-place)
		const existingPositions = new Map(get().nodes.map((n) => [n.id, n.position]));

		// Position priority: saved layout > existing canvas positions > default grid
		function resolvePosition(
			id: string,
			defaultPos: { x: number; y: number },
		): { x: number; y: number } {
			const saved = layoutPositions?.get(id);
			if (saved) return { x: saved.x, y: saved.y };
			return existingPositions.get(id) ?? defaultPos;
		}

		// Convert trust boundaries to group nodes
		const boundaryNodes: DfdNode[] = model.trust_boundaries.map((b, i) => {
			const pos = resolvePosition(b.id, { x: 50 + i * 450, y: 50 });
			const node = boundaryToNode(b, pos);
			// Restore saved dimensions for boundaries
			const saved = layoutPositions?.get(b.id);
			if (saved?.width != null && saved?.height != null) {
				node.width = saved.width;
				node.height = saved.height;
				node.style = {
					...node.style,
					width: saved.width,
					height: saved.height,
				};
			}
			return node;
		});

		// Build a set of elements that belong to boundaries
		const elementToBoundary = new Map<string, string>();
		for (const b of model.trust_boundaries) {
			for (const elementId of b.contains) {
				elementToBoundary.set(elementId, b.id);
			}
		}

		// Convert elements to nodes
		const elementNodes: DfdNode[] = model.elements.map((e, i) => {
			const pos = resolvePosition(e.id, {
				x: 100 + (i % 4) * 250,
				y: 100 + Math.floor(i / 4) * 200,
			});
			const node = elementToNode(e, pos);

			// Parent to boundary if contained
			const parentBoundary = elementToBoundary.get(e.id);
			if (parentBoundary) {
				node.parentId = parentBoundary;
				node.extent = "parent";
			}

			return node;
		});

		// Convert flows to edges, preserving handle assignments from existing edges
		const existingEdgeMap = new Map(get().edges.map((e) => [e.id, e]));
		const edges: DfdEdge[] = model.data_flows.map((flow) => {
			const edge = flowToEdge(flow);
			const existing = existingEdgeMap.get(flow.id);
			if (existing?.sourceHandle) edge.sourceHandle = existing.sourceHandle;
			if (existing?.targetHandle) edge.targetHandle = existing.targetHandle;
			return edge;
		});

		// Boundaries first (rendered behind), then elements
		set({
			nodes: [...boundaryNodes, ...elementNodes],
			edges,
			pendingLayout: null,
			...(layout ? { viewport: layout.viewport } : {}),
		});
	},
}));
