import { create } from "zustand";
import type { DataFlow, Element, TrustBoundary } from "@/types/threat-model";
import {
	boundaryToNode,
	elementToNode,
	flowToEdge,
	generateBoundaryId,
	generateElementId,
	generateFlowId,
	useCanvasStore,
} from "./canvas-store";
import { useHistoryStore } from "./history-store";
import { useModelStore } from "./model-store";

interface ClipboardEntry {
	elements: Element[];
	flows: DataFlow[];
	boundaries: TrustBoundary[];
	/** Centroid anchor point for offset calculation */
	anchorX: number;
	anchorY: number;
}

interface ClipboardState {
	clipboard: ClipboardEntry | null;
	pasteCount: number;

	selectAll: () => void;
	copySelected: () => void;
	cutSelected: () => void;
	paste: () => void;
}

export const useClipboardStore = create<ClipboardState>((set, get) => ({
	clipboard: null,
	pasteCount: 0,

	selectAll: () => {
		const nodes = useCanvasStore.getState().nodes;
		if (nodes.length === 0) return;
		const updated = nodes.map((n) => ({ ...n, selected: true }));
		useCanvasStore.setState({ nodes: updated });
	},

	copySelected: () => {
		const { nodes, edges } = useCanvasStore.getState();
		const model = useModelStore.getState().model;
		if (!model) return;

		const selectedNodes = nodes.filter((n) => n.selected);
		if (selectedNodes.length === 0) return;

		const selectedIds = new Set(selectedNodes.map((n) => n.id));

		// Look up model entities for selected nodes — deep-clone mutable arrays
		const elements: Element[] = [];
		const boundaries: TrustBoundary[] = [];

		for (const node of selectedNodes) {
			if (node.data.isBoundary) {
				const boundary = model.trust_boundaries.find((b) => b.id === node.id);
				if (boundary) {
					boundaries.push({
						...boundary,
						contains: [...boundary.contains],
						position: { x: node.position.x, y: node.position.y },
						size: {
							width: node.width ?? (node.style as Record<string, number> | undefined)?.width ?? 400,
							height:
								node.height ?? (node.style as Record<string, number> | undefined)?.height ?? 300,
						},
					});
				}
			} else {
				const element = model.elements.find((e) => e.id === node.id);
				if (element) {
					elements.push({
						...element,
						technologies: element.technologies ? [...element.technologies] : [],
						position: { x: node.position.x, y: node.position.y },
					});
				}
			}
		}

		// Only include edges where both endpoints are selected — deep-clone mutable arrays
		const flows: DataFlow[] = [];
		for (const edge of edges) {
			if (selectedIds.has(edge.source) && selectedIds.has(edge.target)) {
				const flow = model.data_flows.find((f) => f.id === edge.id);
				if (flow) flows.push({ ...flow, data: flow.data ? [...flow.data] : [] });
			}
		}

		// Compute centroid from selected node positions
		const allPositions = selectedNodes.map((n) => n.position);
		const anchorX = allPositions.reduce((s, p) => s + p.x, 0) / allPositions.length;
		const anchorY = allPositions.reduce((s, p) => s + p.y, 0) / allPositions.length;

		set({
			clipboard: { elements, flows, boundaries, anchorX, anchorY },
			pasteCount: 0,
		});
	},

	cutSelected: () => {
		get().copySelected();
		useCanvasStore.getState().deleteSelected();
	},

	paste: () => {
		const { clipboard, pasteCount } = get();
		if (!clipboard) return;

		const model = useModelStore.getState().model;
		if (!model) return;

		const newCount = pasteCount + 1;
		const offset = 50 * newCount;
		const isFirstPaste = newCount === 1;

		// Build old→new ID mapping
		const idMap = new Map<string, string>();
		for (const el of clipboard.elements) {
			idMap.set(el.id, generateElementId());
		}
		for (const b of clipboard.boundaries) {
			idMap.set(b.id, generateBoundaryId());
		}
		for (const f of clipboard.flows) {
			idMap.set(f.id, generateFlowId());
		}

		// Clone elements with new IDs and offset positions — deep-clone mutable arrays
		const newElements: Element[] = clipboard.elements.map((el) => ({
			...el,
			id: idMap.get(el.id) ?? el.id,
			name: isFirstPaste ? `${el.name} (copy)` : el.name,
			technologies: el.technologies ? [...el.technologies] : [],
			position: el.position ? { x: el.position.x + offset, y: el.position.y + offset } : undefined,
		}));

		// Clone boundaries with new IDs, remapped contains, offset positions
		const newElIds = new Set(newElements.map((e) => e.id));
		const newBoundaries: TrustBoundary[] = clipboard.boundaries.map((b) => ({
			...b,
			id: idMap.get(b.id) ?? b.id,
			name: isFirstPaste ? `${b.name} (copy)` : b.name,
			contains: b.contains.map((c) => idMap.get(c) ?? c).filter((c) => newElIds.has(c)),
			position: b.position ? { x: b.position.x + offset, y: b.position.y + offset } : undefined,
		}));

		// Clone flows with new IDs, remapped source/target — deep-clone mutable arrays
		const newFlows: DataFlow[] = clipboard.flows.map((f) => ({
			...f,
			id: idMap.get(f.id) ?? f.id,
			from: idMap.get(f.from) ?? f.from,
			to: idMap.get(f.to) ?? f.to,
			data: f.data ? [...f.data] : [],
		}));

		// Push one history snapshot for undo
		useHistoryStore.getState().pushSnapshot(model);

		// Update model store
		useModelStore.setState({
			model: {
				...model,
				elements: [...model.elements, ...newElements],
				data_flows: [...model.data_flows, ...newFlows],
				trust_boundaries: [...model.trust_boundaries, ...newBoundaries],
			},
			isDirty: true,
		});

		// Build canvas nodes for pasted items — boundaries first, then elements
		const newBoundaryNodes = newBoundaries.map((b) => {
			const node = boundaryToNode(b, b.position ?? { x: offset, y: offset });
			return { ...node, selected: true };
		});

		const newElementNodes = newElements.map((el) => {
			const node = elementToNode(el, el.position ?? { x: offset, y: offset });
			// If this element belongs to a pasted boundary, set parentId
			for (const nb of newBoundaries) {
				if (nb.contains.includes(el.id)) {
					node.parentId = nb.id;
					node.extent = "parent";
					// Adjust position to be relative to boundary
					if (nb.position && el.position) {
						node.position = {
							x: el.position.x - nb.position.x,
							y: el.position.y - nb.position.y,
						};
					}
					break;
				}
			}
			return { ...node, selected: true };
		});

		const newEdges = newFlows.map((f) => flowToEdge(f));

		// Add to canvas: deselect old, insert boundaries at front (render behind),
		// then existing nodes, then new element nodes at end
		const canvasState = useCanvasStore.getState();
		const deselectedOld = canvasState.nodes.map((n) => ({ ...n, selected: false }));

		useCanvasStore.setState({
			nodes: [...newBoundaryNodes, ...deselectedOld, ...newElementNodes],
			edges: [...canvasState.edges, ...newEdges],
		});

		set({ pasteCount: newCount });
	},
}));
