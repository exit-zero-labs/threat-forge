import type { CanvasState, DfdEdgeData } from "@/stores/canvas-store-factory";
import type { ThreatModel } from "@/types/threat-model";

/**
 * The canvas state a capture reads. Narrowed to the three geometry fields so a caller can pass
 * *a specific document's* canvas store rather than whatever the active facade happens to
 * resolve — which is what lets a debounced workspace write finish against the document it was
 * scheduled for, even if the user switched documents in the meantime.
 */
export type CanvasCaptureSource = Pick<CanvasState, "nodes" | "edges" | "viewport">;

/**
 * Write current canvas positions, boundary colors, and label offsets back into the model.
 *
 * Every durable write goes through this function: without it a save would persist the model as
 * last edited through the property panels and silently drop every node drag, boundary resize,
 * label nudge, and viewport change. Both the file save path (`use-file-operations.ts`) and the
 * browser workspace autosave (`use-workspace-persistence.ts`) share it.
 */
export function captureCanvasIntoModel(
	model: ThreatModel,
	canvas: CanvasCaptureSource,
): ThreatModel {
	const { nodes, edges, viewport } = canvas;

	const nodeMap = new Map(nodes.map((n) => [n.id, n]));
	const edgeMap = new Map(edges.map((e) => [e.id, e]));

	const elements = model.elements.map((el) => {
		const node = nodeMap.get(el.id);
		if (!node) return el;
		return { ...el, position: { x: node.position.x, y: node.position.y } };
	});

	const trust_boundaries = model.trust_boundaries.map((b) => {
		const node = nodeMap.get(b.id);
		if (!node) return b;
		const w = node.width ?? (node.style as Record<string, number> | undefined)?.width ?? 400;
		const h = node.height ?? (node.style as Record<string, number> | undefined)?.height ?? 300;
		return {
			...b,
			position: { x: node.position.x, y: node.position.y },
			size: { width: w, height: h },
			fill_color: node.data.boundaryFillColor ?? b.fill_color,
			stroke_color: node.data.boundaryStrokeColor ?? b.stroke_color,
			fill_opacity: node.data.boundaryFillOpacity ?? b.fill_opacity,
			stroke_opacity: node.data.boundaryStrokeOpacity ?? b.stroke_opacity,
		};
	});

	const data_flows = model.data_flows.map((f) => {
		const edge = edgeMap.get(f.id);
		const edgeData = edge?.data as DfdEdgeData | undefined;
		if (!edge) return f;
		const hasOffset = edgeData && (edgeData.labelOffsetX != null || edgeData.labelOffsetY != null);
		return {
			...f,
			label_offset: hasOffset
				? { x: edgeData.labelOffsetX ?? 0, y: edgeData.labelOffsetY ?? 0 }
				: f.label_offset,
			source_handle: edge.sourceHandle ?? f.source_handle,
			target_handle: edge.targetHandle ?? f.target_handle,
			stroke_color: edgeData?.strokeColor ?? f.stroke_color,
			stroke_opacity: edgeData?.strokeOpacity ?? f.stroke_opacity,
		};
	});

	const diagrams = model.diagrams.map((d) => ({
		...d,
		layout_file: undefined,
		viewport: { ...viewport },
	}));

	return { ...model, elements, trust_boundaries, data_flows, diagrams };
}
