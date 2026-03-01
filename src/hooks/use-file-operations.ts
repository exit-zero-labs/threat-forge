import { useCallback } from "react";
import { getFileAdapter } from "@/lib/adapters/get-file-adapter";
import type { DfdEdgeData } from "@/stores/canvas-store";
import { useCanvasStore } from "@/stores/canvas-store";
import { useHistoryStore } from "@/stores/history-store";
import { useModelStore } from "@/stores/model-store";
import type { DiagramLayout, ThreatModel } from "@/types/threat-model";

function todayString(): string {
	return new Date().toISOString().split("T")[0];
}

/** Write current canvas positions, boundary colors, and label offsets back into the model. */
function captureCanvasIntoModel(model: ThreatModel): ThreatModel {
	const { nodes, edges, viewport } = useCanvasStore.getState();

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
		if (!edgeData) return f;
		const hasOffset = edgeData.labelOffsetX != null || edgeData.labelOffsetY != null;
		return {
			...f,
			label_offset: hasOffset
				? { x: edgeData.labelOffsetX ?? 0, y: edgeData.labelOffsetY ?? 0 }
				: f.label_offset,
		};
	});

	const diagrams = model.diagrams.map((d) => ({
		...d,
		layout_file: undefined,
		viewport: { ...viewport },
	}));

	return { ...model, elements, trust_boundaries, data_flows, diagrams };
}

/** Build a DiagramLayout from inline model positions (for setPendingLayout). */
function buildLayoutFromModel(model: ThreatModel): DiagramLayout | null {
	if (model.diagrams.length === 0) return null;

	const diagram = model.diagrams[0];

	// Only build if there are inline positions to use
	const hasInlinePositions =
		model.elements.some((e) => e.position) || model.trust_boundaries.some((b) => b.position);

	if (!hasInlinePositions && !diagram.viewport) return null;

	const nodes = [
		...model.elements
			.filter((e) => e.position)
			.map((e) => ({
				id: e.id,
				x: e.position?.x ?? 0,
				y: e.position?.y ?? 0,
			})),
		...model.trust_boundaries
			.filter((b) => b.position)
			.map((b) => ({
				id: b.id,
				x: b.position?.x ?? 0,
				y: b.position?.y ?? 0,
				width: b.size?.width,
				height: b.size?.height,
			})),
	];

	return {
		diagram_id: diagram.id,
		viewport: diagram.viewport ?? { x: 0, y: 0, zoom: 1 },
		nodes,
	};
}

export function useFileOperations() {
	const model = useModelStore((s) => s.model);
	const filePath = useModelStore((s) => s.filePath);
	const isDirty = useModelStore((s) => s.isDirty);
	const setModel = useModelStore((s) => s.setModel);
	const clearModel = useModelStore((s) => s.clearModel);

	const newModel = useCallback(async () => {
		if (isDirty) {
			const adapter = await getFileAdapter();
			const discard = await adapter.confirmDiscard();
			if (!discard) return;
		}

		const adapter = await getFileAdapter();
		const created = await adapter.createNewModel("Untitled Threat Model", "");
		// No pending layout for new models — use default positions
		useCanvasStore.getState().setPendingLayout(null);
		setModel(created, null);
		useHistoryStore.getState().clear();
		// syncFromModel is called by the useEffect in DfdCanvas when model changes
	}, [isDirty, setModel]);

	const openModel = useCallback(async () => {
		if (isDirty) {
			const adapter = await getFileAdapter();
			const discard = await adapter.confirmDiscard();
			if (!discard) return;
		}

		const adapter = await getFileAdapter();
		const result = await adapter.openThreatModel();
		if (!result) return;

		const { model: loaded, path } = result;

		// Build layout from inline positions (new format) or try sidecar (old format)
		const inlineLayout = buildLayoutFromModel(loaded);
		if (inlineLayout) {
			useCanvasStore.getState().setPendingLayout(inlineLayout);
		} else if (loaded.diagrams.length > 0 && loaded.diagrams[0].layout_file && path) {
			// Fallback: try loading old sidecar layout file
			const layout = await adapter.openLayout(path, loaded.diagrams[0].layout_file);
			useCanvasStore.getState().setPendingLayout(layout);
		} else {
			useCanvasStore.getState().setPendingLayout(null);
		}

		setModel(loaded, path);
		useHistoryStore.getState().clear();
		// syncFromModel is called by the useEffect in DfdCanvas when model changes
	}, [isDirty, setModel]);

	const saveModel = useCallback(async () => {
		if (!model) return;

		const captured = captureCanvasIntoModel({
			...model,
			metadata: { ...model.metadata, modified: todayString() },
		});

		const adapter = await getFileAdapter();
		const savedPath = await adapter.saveThreatModel(captured, filePath);
		if (!savedPath) return;

		setModel(captured, savedPath);
	}, [model, filePath, setModel]);

	const saveModelAs = useCallback(async () => {
		if (!model) return;

		const captured = captureCanvasIntoModel({
			...model,
			metadata: { ...model.metadata, modified: todayString() },
		});

		const adapter = await getFileAdapter();
		const savedPath = await adapter.saveThreatModel(captured, null);
		if (!savedPath) return;

		setModel(captured, savedPath);
	}, [model, setModel]);

	const closeModel = useCallback(async () => {
		if (isDirty) {
			const adapter = await getFileAdapter();
			const discard = await adapter.confirmDiscard();
			if (!discard) return;
		}
		clearModel();
		useHistoryStore.getState().clear();
		// DfdCanvas unmounts when model is null, so useEffect won't fire — clear canvas directly
		useCanvasStore.getState().syncFromModel();
	}, [isDirty, clearModel]);

	return { newModel, openModel, saveModel, saveModelAs, closeModel };
}
