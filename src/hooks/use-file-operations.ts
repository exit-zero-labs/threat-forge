import { useCallback } from "react";
import { getFileAdapter } from "@/lib/adapters/get-file-adapter";
import { generateHtmlReport } from "@/lib/export/export-html";
import { buildLayoutFromModel } from "@/lib/model-layout-utils";
import type { DfdEdgeData } from "@/stores/canvas-store";
import { useCanvasStore } from "@/stores/canvas-store";
import { useHistoryStore } from "@/stores/history-store";
import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { ThreatModel } from "@/types/threat-model";

function todayString(): string {
	return new Date().toISOString().split("T")[0];
}

function sanitizeFilename(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/** Build an author string like "Jane Doe <jane@example.com>" from settings. */
function getAuthorIdentity(): string {
	const { authorName, authorEmail } = useSettingsStore.getState().settings;
	if (authorName && authorEmail) return `${authorName} <${authorEmail}>`;
	if (authorName) return authorName;
	if (authorEmail) return authorEmail;
	return "";
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
		const identity = getAuthorIdentity();
		const { authorName } = useSettingsStore.getState().settings;
		const created = await adapter.createNewModel("Untitled Threat Model", authorName || "");
		// Populate created_by from settings
		if (identity) {
			created.metadata.created_by = identity;
		}
		// No pending layout for new models — use default positions
		useCanvasStore.getState().setPendingLayout(null);
		setModel(created, null);
		useHistoryStore.getState().clear();
		useSettingsStore.getState().clearFileSettings();
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
		useSettingsStore.getState().loadFileSettings(loaded.metadata.settings);
		// syncFromModel is called by the useEffect in DfdCanvas when model changes
	}, [isDirty, setModel]);

	const saveModel = useCallback(async () => {
		if (!model) return;

		const identity = getAuthorIdentity();
		const captured = captureCanvasIntoModel({
			...model,
			metadata: {
				...model.metadata,
				modified: todayString(),
				modified_by: identity || model.metadata.modified_by,
				last_edit_timestamp: Math.floor(Date.now() / 1000),
			},
		});

		const adapter = await getFileAdapter();
		const savedPath = await adapter.saveThreatModel(captured, filePath);
		if (!savedPath) return;

		setModel(captured, savedPath);
	}, [model, filePath, setModel]);

	const saveModelAs = useCallback(async () => {
		if (!model) return;

		const identity = getAuthorIdentity();
		const captured = captureCanvasIntoModel({
			...model,
			metadata: {
				...model.metadata,
				modified: todayString(),
				modified_by: identity || model.metadata.modified_by,
				last_edit_timestamp: Math.floor(Date.now() / 1000),
			},
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
		useSettingsStore.getState().clearFileSettings();
		// DfdCanvas unmounts when model is null, so useEffect won't fire — clear canvas directly
		useCanvasStore.getState().syncFromModel();
	}, [isDirty, clearModel]);

	const exportAsHtml = useCallback(async () => {
		if (!model) return;

		const captured = captureCanvasIntoModel(model);
		const html = generateHtmlReport(captured);
		const defaultName = sanitizeFilename(model.metadata.title) || "threat-model-report";

		const adapter = await getFileAdapter();
		await adapter.exportAsHtml(html, defaultName);
	}, [model]);

	return { newModel, openModel, saveModel, saveModelAs, closeModel, exportAsHtml };
}
