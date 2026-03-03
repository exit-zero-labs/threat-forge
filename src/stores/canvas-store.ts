import type { Connection, Edge, Node, OnEdgesChange, OnNodesChange, Viewport } from "@xyflow/react";
import { applyEdgeChanges, applyNodeChanges, MarkerType } from "@xyflow/react";
import { create } from "zustand";
import {
	getSelfLoopHandlePair,
	getSmartHandlePair,
	isSelfLoop,
	nodeToRect,
} from "@/lib/canvas-utils";
import { getComponentByType } from "@/lib/component-library";
import type {
	DataFlow,
	DiagramLayout,
	Element,
	ThreatModel,
	TrustBoundary,
} from "@/types/threat-model";
import { useHistoryStore } from "./history-store";
import { useModelStore } from "./model-store";

/** ReactFlow node data payload for DFD elements.
 *  Uses `type` + index signature to satisfy ReactFlow's `Record<string, unknown>` constraint. */
export type DfdNodeData = {
	[key: string]: unknown;
	label: string;
	elementType: string;
	subtype?: string;
	icon?: string;
	trustZone: string;
	description: string;
	technologies: string[];
	/** Element fill color */
	elementFillColor?: string;
	/** Element stroke color */
	elementStrokeColor?: string;
	/** Element fill opacity (0-1) */
	elementFillOpacity?: number;
	/** Element stroke opacity (0-1) */
	elementStrokeOpacity?: number;
	/** Font size in pixels (for text annotations) */
	fontSize?: number;
	/** Font weight: "normal" | "bold" (for text annotations) */
	fontWeight?: string;
	/** For trust boundary group nodes */
	isBoundary?: boolean;
	boundaryName?: string;
	/** Trust boundary fill color (CSS color with opacity) */
	boundaryFillColor?: string;
	/** Trust boundary stroke color (CSS color with opacity) */
	boundaryStrokeColor?: string;
	/** Trust boundary fill opacity (0-1) */
	boundaryFillOpacity?: number;
	/** Trust boundary stroke opacity (0-1) */
	boundaryStrokeOpacity?: number;
};

/** ReactFlow edge data payload for data flows.
 *  Uses `type` + index signature to satisfy ReactFlow's `Record<string, unknown>` constraint. */
export type DfdEdgeData = {
	[key: string]: unknown;
	name: string;
	protocol: string;
	data: string[];
	authenticated: boolean;
	/** User-facing flow number displayed on the edge */
	flowNumber?: number;
	/** Dragged label X offset from default position */
	labelOffsetX?: number;
	/** Dragged label Y offset from default position */
	labelOffsetY?: number;
	/** Custom edge stroke color (hex) */
	strokeColor?: string;
	/** Custom edge stroke opacity (0-1) */
	strokeOpacity?: number;
};

export type DfdNode = Node<DfdNodeData>;
export type DfdEdge = Edge<DfdEdgeData>;

interface CanvasState {
	nodes: DfdNode[];
	edges: DfdEdge[];
	viewport: Viewport;

	/** Element type currently being dragged from palette (workaround for WKWebView dataTransfer issues) */
	draggedType: string | null;
	/** Subtype for the element being dragged from the library */
	draggedSubtype: string | null;
	/** Icon for the element being dragged from the library */
	draggedIcon: string | null;
	/** Display name for the element being dragged from the library */
	draggedName: string | null;

	/** Whether a connection drag is in progress (used to show handles on all nodes) */
	isConnecting: boolean;

	/** Layout to apply on next syncFromModel (set before loading a model) */
	pendingLayout: DiagramLayout | null;

	// ReactFlow change handlers
	onNodesChange: OnNodesChange<DfdNode>;
	onEdgesChange: OnEdgesChange<DfdEdge>;
	setViewport: (viewport: Viewport) => void;

	// Drag state
	setDraggedType: (type: string | null) => void;
	setDraggedComponent: (
		info: {
			type: string;
			subtype?: string;
			icon?: string;
			name?: string;
		} | null,
	) => void;
	setIsConnecting: (connecting: boolean) => void;
	setPendingLayout: (layout: DiagramLayout | null) => void;

	// Canvas actions
	addElement: (
		type: string,
		position: { x: number; y: number },
		opts?: { subtype?: string; icon?: string; name?: string },
	) => void;
	addDataFlow: (
		sourceId: string,
		targetId: string,
		opts?: { sourceHandle?: string; targetHandle?: string; name?: string },
	) => string | null;
	addTrustBoundary: (name: string, position: { x: number; y: number }) => void;
	deleteSelected: () => void;
	duplicateElement: (
		nodeId: string,
		opts?: { offset?: { x: number; y: number }; select?: boolean; skipHistory?: boolean },
	) => string | null;
	reverseEdge: (edgeId: string) => void;
	reconnectEdge: (oldEdge: Edge, newConnection: Connection) => void;

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

	/** Nudge selected nodes by a delta (in flow coordinates) */
	nudgeSelected: (dx: number, dy: number) => void;

	// Sync from model store
	syncFromModel: () => void;
}

/** Model snapshot captured at the start of a drag (with pre-drag canvas positions baked in). */
let preDragSnapshot: ThreatModel | null = null;

/** When true, onNodesChange skips the drag-end history push — Alt+drag owns its own history entry. */
let altDragActive = false;

export function setAltDragActive(active: boolean): void {
	altDragActive = active;
}

/** Nudge gesture state (arrow key): snapshot + debounce timer. */
const nudgeState = {
	snapshot: null as ThreatModel | null,
	timer: null as ReturnType<typeof setTimeout> | null,
};

/** Write current canvas node positions into the model's inline position fields. */
function writePositionsToModel(model: ThreatModel, nodes: DfdNode[]): ThreatModel {
	const nodeMap = new Map(nodes.map((n) => [n.id, n]));
	return {
		...model,
		elements: model.elements.map((el) => {
			const node = nodeMap.get(el.id);
			if (!node) return el;
			return { ...el, position: { x: node.position.x, y: node.position.y } };
		}),
		trust_boundaries: model.trust_boundaries.map((b) => {
			const node = nodeMap.get(b.id);
			if (!node) return b;
			const w = node.width ?? (node.style as Record<string, number> | undefined)?.width ?? 400;
			const h = node.height ?? (node.style as Record<string, number> | undefined)?.height ?? 300;
			return {
				...b,
				position: { x: node.position.x, y: node.position.y },
				size: { width: w, height: h },
			};
		}),
	};
}

let elementCounter = 0;
let flowCounter = 0;
let boundaryCounter = 0;

export function generateElementId(): string {
	elementCounter++;
	return `comp-${elementCounter}`;
}

export function generateFlowId(): string {
	flowCounter++;
	return `flow-${flowCounter}`;
}

export function generateBoundaryId(): string {
	boundaryCounter++;
	return `boundary-${boundaryCounter}`;
}

export function elementToNode(element: Element, position: { x: number; y: number }): DfdNode {
	const isText = element.type === "text";
	return {
		id: element.id,
		type: isText ? "textAnnotation" : "dfdElement",
		position,
		data: {
			label: element.name,
			elementType: element.type,
			subtype: element.subtype,
			icon: element.icon,
			trustZone: element.trust_zone ?? "",
			description: element.description ?? "",
			technologies: element.technologies ?? [],
			elementFillColor: element.fill_color,
			elementStrokeColor: element.stroke_color,
			elementFillOpacity: element.fill_opacity,
			elementStrokeOpacity: element.stroke_opacity,
			fontSize: element.font_size,
			fontWeight: element.font_weight,
		},
	};
}

export function boundaryToNode(
	boundary: TrustBoundary,
	position: { x: number; y: number },
): DfdNode {
	const w = boundary.size?.width ?? 400;
	const h = boundary.size?.height ?? 300;
	return {
		id: boundary.id,
		type: "trustBoundary",
		position,
		width: w,
		height: h,
		// pointerEvents:none on the ReactFlow wrapper so clicks inside the boundary
		// pass through to child nodes and edges. The label and resize handle inside
		// TrustBoundaryNode opt back in with pointer-events:auto.
		style: { width: w, height: h, pointerEvents: "none" as const },
		data: {
			label: boundary.name,
			elementType: "", // unused for boundaries
			trustZone: "",
			description: "",
			technologies: [],
			isBoundary: true,
			boundaryName: boundary.name,
			boundaryFillColor: boundary.fill_color,
			boundaryStrokeColor: boundary.stroke_color,
			boundaryFillOpacity: boundary.fill_opacity,
			boundaryStrokeOpacity: boundary.stroke_opacity,
		},
	};
}

export function flowToEdge(flow: DataFlow): DfdEdge {
	return {
		id: flow.id,
		source: flow.from,
		target: flow.to,
		type: "dataFlow",
		sourceHandle: flow.source_handle,
		targetHandle: flow.target_handle,
		...(flow.stroke_color
			? {
					markerEnd: {
						type: MarkerType.ArrowClosed,
						width: 16,
						height: 16,
						color: flow.stroke_color,
					},
				}
			: {}),
		data: {
			name: flow.name ?? "",
			protocol: flow.protocol,
			data: flow.data,
			authenticated: flow.authenticated,
			flowNumber: flow.flow_number,
			labelOffsetX: flow.label_offset?.x,
			labelOffsetY: flow.label_offset?.y,
			strokeColor: flow.stroke_color,
			strokeOpacity: flow.stroke_opacity,
		},
	};
}

function defaultElementName(type: string): string {
	return getComponentByType(type)?.label ?? "New Component";
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
	nodes: [],
	edges: [],
	viewport: { x: 0, y: 0, zoom: 1 },
	draggedType: null,
	draggedSubtype: null,
	draggedIcon: null,
	draggedName: null,
	isConnecting: false,
	pendingLayout: null,

	onNodesChange: (changes) => {
		// Capture pre-drag model snapshot BEFORE applying changes (nodes still have old positions)
		const hasDragStart = changes.some((c) => c.type === "position" && c.dragging === true);
		if (hasDragStart && !preDragSnapshot) {
			const model = useModelStore.getState().model;
			if (model) {
				preDragSnapshot = writePositionsToModel(model, get().nodes);
			}
		}

		// Apply node changes (positions update here)
		set({ nodes: applyNodeChanges(changes, get().nodes) as DfdNode[] });

		// Handle drag end: push pre-drag snapshot to history, write new positions to model.
		// Skip when altDragActive — the onNodeDragStop handler owns history for Alt+drag.
		const hasDragEnd = changes.some((c) => c.type === "position" && c.dragging === false);
		if (hasDragEnd && preDragSnapshot && !altDragActive) {
			useHistoryStore.getState().pushSnapshot(preDragSnapshot);
			preDragSnapshot = null;
			const model = useModelStore.getState().model;
			if (model) {
				const updated = writePositionsToModel(model, get().nodes);
				useModelStore.setState({ model: updated, isDirty: true });
			}
		}
		if (hasDragEnd && altDragActive) {
			// Clear preDragSnapshot but don't push — Alt+drag handler will manage history
			preDragSnapshot = null;
		}

		// Handle selection changes — process the last selected node for model-store sync.
		// In multi-select batches, multiple nodes may be selected at once; use the last
		// one as the "active" selection for the properties panel.
		const selectionChanges = changes.filter((c) => c.type === "select" && c.selected);
		if (selectionChanges.length > 0) {
			const lastChange = selectionChanges[selectionChanges.length - 1];
			if (lastChange.type === "select") {
				const node = get().nodes.find((n) => n.id === lastChange.id);
				if (node?.data.isBoundary) {
					useModelStore.getState().setSelectedBoundary(lastChange.id);
				} else if (node && !node.data.isBoundary) {
					useModelStore.getState().setSelectedElement(lastChange.id);
				}
			}
		}

		// Handle deselection — only clear model selection when zero nodes remain selected
		const hasDeselection = changes.some((c) => c.type === "select" && !c.selected);
		if (hasDeselection && !changes.some((c) => c.type === "select" && c.selected)) {
			const anyStillSelected = get().nodes.some((n) => n.selected);
			if (!anyStillSelected) {
				useModelStore.getState().setSelectedElement(null);
				useModelStore.getState().setSelectedBoundary(null);
			}
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
				useHistoryStore.getState().pushSnapshot(model);
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
	setIsConnecting: (connecting) => set({ isConnecting: connecting }),
	setPendingLayout: (layout) => set({ pendingLayout: layout }),

	addElement: (type, position, opts) => {
		const id = generateElementId();
		const name = opts?.name ?? defaultElementName(type);

		const newElement: Element = {
			id,
			type,
			name,
			trust_zone: "",
			subtype: opts?.subtype,
			icon: opts?.icon,
			description: "",
			technologies: [],
			position: { x: position.x, y: position.y },
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
			useHistoryStore.getState().pushSnapshot(model);
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
		const id = generateFlowId();

		// Compute next flow number from current model
		const currentModel = useModelStore.getState().model;
		const maxFlowNumber = currentModel
			? currentModel.data_flows.reduce((max, f) => Math.max(max, f.flow_number ?? 0), 0)
			: 0;
		const nextFlowNumber = maxFlowNumber + 1;

		// Determine handles: explicit from user drag, smart routing, or self-loop defaults
		let resolvedSourceHandle: string | undefined;
		let resolvedTargetHandle: string | undefined;
		if (opts?.sourceHandle && opts?.targetHandle) {
			resolvedSourceHandle = opts.sourceHandle;
			resolvedTargetHandle = opts.targetHandle;
		} else if (isSelfLoop(sourceId, targetId)) {
			// Default handle pair for self-loops
			const pair = getSelfLoopHandlePair();
			resolvedSourceHandle = pair.sourceHandle;
			resolvedTargetHandle = pair.targetHandle;
		} else {
			const sourceNode = get().nodes.find((n) => n.id === sourceId);
			const targetNode = get().nodes.find((n) => n.id === targetId);
			if (sourceNode && targetNode) {
				const handlePair = getSmartHandlePair(nodeToRect(sourceNode), nodeToRect(targetNode));
				resolvedSourceHandle = handlePair.sourceHandle;
				resolvedTargetHandle = handlePair.targetHandle;
			}
		}

		const newFlow: DataFlow = {
			id,
			flow_number: nextFlowNumber,
			name: opts?.name ?? "",
			from: sourceId,
			to: targetId,
			protocol: "",
			data: [],
			authenticated: false,
			source_handle: resolvedSourceHandle,
			target_handle: resolvedTargetHandle,
		};

		const newEdge = flowToEdge(newFlow);

		set({ edges: [...get().edges, newEdge] });

		// Update model store
		const model = useModelStore.getState().model;
		if (model) {
			useHistoryStore.getState().pushSnapshot(model);
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
			position: { x: position.x, y: position.y },
		};

		const newNode = boundaryToNode(newBoundary, position);
		// Insert boundaries at the beginning so they render behind other nodes
		set({ nodes: [newNode, ...get().nodes] });

		// Update model store
		const model = useModelStore.getState().model;
		if (model) {
			useHistoryStore.getState().pushSnapshot(model);
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
		let selectedEdges = currentEdges.filter((e) => e.selected);

		// Fallback: if no edges are selected in ReactFlow but model store has a
		// selected edge (happens when user clicks the edge label, which uses
		// stopPropagation and only sets selection in model store), include it.
		if (selectedEdges.length === 0 && selectedNodes.length === 0) {
			const modelSelectedEdgeId = useModelStore.getState().selectedEdgeId;
			if (modelSelectedEdgeId) {
				const fallbackEdge = currentEdges.find((e) => e.id === modelSelectedEdgeId);
				if (fallbackEdge) {
					selectedEdges = [fallbackEdge];
				}
			}
		}

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
			useHistoryStore.getState().pushSnapshot(model);
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

	duplicateElement: (nodeId, opts) => {
		const model = useModelStore.getState().model;
		if (!model) return null;

		const element = model.elements.find((e) => e.id === nodeId);
		if (!element) return null;

		const sourceNode = get().nodes.find((n) => n.id === nodeId);
		const offset = opts?.offset ?? { x: 50, y: 50 };
		const offsetX = sourceNode ? sourceNode.position.x + offset.x : 200;
		const offsetY = sourceNode ? sourceNode.position.y + offset.y : 200;

		const newId = generateElementId();
		const newElement: Element = {
			...element,
			id: newId,
			name: `${element.name} (copy)`,
		};

		const newNode = elementToNode(newElement, { x: offsetX, y: offsetY });
		set({ nodes: [...get().nodes, newNode] });

		if (!opts?.skipHistory) {
			useHistoryStore.getState().pushSnapshot(model);
		}
		useModelStore
			.getState()
			.setModel(
				{ ...model, elements: [...model.elements, newElement] },
				useModelStore.getState().filePath,
			);
		useModelStore.getState().markDirty();
		if (opts?.select !== false) {
			useModelStore.getState().setSelectedElement(newId);
		}
		return newId;
	},

	reverseEdge: (edgeId) => {
		const model = useModelStore.getState().model;
		if (!model) return;

		const flow = model.data_flows.find((f) => f.id === edgeId);
		if (!flow) return;

		useHistoryStore.getState().pushSnapshot(model);

		// Update model: swap from/to and handles (use direct set to preserve selection state)
		const updatedFlows = model.data_flows.map((f) =>
			f.id === edgeId
				? {
						...f,
						from: f.to,
						to: f.from,
						source_handle: f.target_handle?.replace("target", "source"),
						target_handle: f.source_handle?.replace("source", "target"),
					}
				: f,
		);
		useModelStore.setState({
			model: { ...model, data_flows: updatedFlows },
			isDirty: true,
		});

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

	reconnectEdge: (oldEdge, newConnection) => {
		const model = useModelStore.getState().model;
		if (!model) return;
		if (!newConnection.source || !newConnection.target) return;

		const flow = model.data_flows.find((f) => f.id === oldEdge.id);
		if (!flow) return;

		useHistoryStore.getState().pushSnapshot(model);

		// Update model data_flows
		const updatedFlows = model.data_flows.map((f) =>
			f.id === oldEdge.id
				? {
						...f,
						from: newConnection.source as string,
						to: newConnection.target as string,
						source_handle: newConnection.sourceHandle ?? undefined,
						target_handle: newConnection.targetHandle ?? undefined,
					}
				: f,
		);
		useModelStore.setState({
			model: { ...model, data_flows: updatedFlows },
			isDirty: true,
		});

		// Update canvas edges
		const currentEdges = get().edges;
		const updatedEdges = currentEdges.map((e) =>
			e.id === oldEdge.id
				? {
						...e,
						source: newConnection.source as string,
						target: newConnection.target as string,
						sourceHandle: newConnection.sourceHandle,
						targetHandle: newConnection.targetHandle,
					}
				: e,
		);
		set({ edges: updatedEdges });
	},

	// ReactFlow instance actions
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

	nudgeSelected: (dx, dy) => {
		const model = useModelStore.getState().model;
		if (!model) return;

		const selectedNodes = get().nodes.filter((n) => n.selected && !n.data.isBoundary);
		if (selectedNodes.length === 0) return;

		// Capture pre-nudge snapshot on the first keypress of a gesture
		if (!nudgeState.snapshot) {
			nudgeState.snapshot = writePositionsToModel(model, get().nodes);
		}

		// Only update canvas nodes — do NOT touch the model store yet.
		// This avoids triggering syncFromModel which destroys focus.
		const updatedNodes = get().nodes.map((n) => {
			if (!n.selected || n.data.isBoundary) return n;
			return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } };
		});
		set({ nodes: updatedNodes });

		// Debounce: flush to model + history after 300ms of no nudging
		if (nudgeState.timer) clearTimeout(nudgeState.timer);
		nudgeState.timer = setTimeout(() => {
			const currentModel = useModelStore.getState().model;
			if (!currentModel) return;
			// Push the pre-nudge snapshot to history for undo
			if (nudgeState.snapshot) {
				useHistoryStore.getState().pushSnapshot(nudgeState.snapshot);
			}
			// Write final positions to model
			const final = writePositionsToModel(currentModel, get().nodes);
			useModelStore.setState({ model: final, isDirty: true });
			nudgeState.snapshot = null;
			nudgeState.timer = null;
		}, 300);
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

		// Keep existing node state for nodes that still exist (used when model changes in-place)
		const existingNodes = new Map(get().nodes.map((n) => [n.id, n]));
		const existingPositions = new Map(get().nodes.map((n) => [n.id, n.position]));

		// Position priority: saved layout > existing canvas positions > inline model position > default grid
		function resolvePosition(
			id: string,
			inlinePos: { x: number; y: number } | undefined,
			defaultPos: { x: number; y: number },
		): { x: number; y: number } {
			const saved = layoutPositions?.get(id);
			if (saved) return { x: saved.x, y: saved.y };
			return existingPositions.get(id) ?? inlinePos ?? defaultPos;
		}

		// Convert trust boundaries to group nodes
		const boundaryNodes: DfdNode[] = model.trust_boundaries.map((b, i) => {
			const pos = resolvePosition(b.id, b.position, { x: 50 + i * 450, y: 50 });
			const node = boundaryToNode(b, pos);
			// Restore dimensions: saved layout > existing canvas > default
			const saved = layoutPositions?.get(b.id);
			const existing = existingNodes.get(b.id);
			const w =
				saved?.width ?? existing?.width ?? (existing?.style as Record<string, unknown>)?.width;
			const h =
				saved?.height ?? existing?.height ?? (existing?.style as Record<string, unknown>)?.height;
			if (w != null && h != null) {
				node.width = w as number;
				node.height = h as number;
				node.style = {
					...node.style,
					width: w as number,
					height: h as number,
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
			const pos = resolvePosition(e.id, e.position, {
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

		// Convert flows to edges, preserving handle assignments from existing edges.
		// Model handles are authoritative when present (from save/load, reconnect, addDataFlow);
		// only fall back to existing canvas state when the model has no handle data.
		const existingEdgeMap = new Map(get().edges.map((e) => [e.id, e]));
		const edges: DfdEdge[] = model.data_flows.map((flow) => {
			const edge = flowToEdge(flow);
			const existing = existingEdgeMap.get(flow.id);
			if (existing?.sourceHandle && !flow.source_handle) edge.sourceHandle = existing.sourceHandle;
			if (existing?.targetHandle && !flow.target_handle) edge.targetHandle = existing.targetHandle;
			// Preserve dragged label position only if model has no label_offset for this flow.
			// When the model has label_offset (e.g. after undo/redo or drag-end write-back),
			// flowToEdge already applied it — don't override with stale canvas data.
			if (
				!flow.label_offset &&
				(existing?.data?.labelOffsetX != null || existing?.data?.labelOffsetY != null)
			) {
				edge.data = {
					...(edge.data as DfdEdgeData),
					labelOffsetX: existing.data.labelOffsetX,
					labelOffsetY: existing.data.labelOffsetY,
				};
			}
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
