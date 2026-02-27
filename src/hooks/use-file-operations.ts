import { useCallback } from "react";
import { getFileAdapter } from "@/lib/adapters/get-file-adapter";
import { useCanvasStore } from "@/stores/canvas-store";
import { useModelStore } from "@/stores/model-store";
import type { ThreatModel } from "@/types/threat-model";

function todayString(): string {
	return new Date().toISOString().split("T")[0];
}

/** Build a DiagramLayout from current canvas state. */
function captureLayout(diagramId: string) {
	const { nodes, viewport } = useCanvasStore.getState();
	return {
		diagram_id: diagramId,
		viewport,
		nodes: nodes.map((n) => ({
			id: n.id,
			x: n.position.x,
			y: n.position.y,
			...(n.width != null ? { width: n.width } : {}),
			...(n.height != null ? { height: n.height } : {}),
		})),
	};
}

/** Save layout alongside the model file. Failures are non-fatal. */
async function persistLayout(modelPath: string, model: ThreatModel): Promise<void> {
	if (model.diagrams.length === 0) return;
	const adapter = await getFileAdapter();
	const layout = captureLayout(model.diagrams[0].id);
	await adapter.saveLayout(modelPath, model.diagrams[0].layout_file, layout);
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

		// Try to load the saved layout so positions are restored
		if (loaded.diagrams.length > 0 && path) {
			const layout = await adapter.openLayout(path, loaded.diagrams[0].layout_file);
			useCanvasStore.getState().setPendingLayout(layout);
		} else {
			useCanvasStore.getState().setPendingLayout(null);
		}

		setModel(loaded, path);
		// syncFromModel is called by the useEffect in DfdCanvas when model changes
	}, [isDirty, setModel]);

	const saveModel = useCallback(async () => {
		if (!model) return;

		const modelToSave: ThreatModel = {
			...model,
			metadata: { ...model.metadata, modified: todayString() },
		};

		const adapter = await getFileAdapter();
		const savedPath = await adapter.saveThreatModel(modelToSave, filePath);
		if (!savedPath) return;

		// Save layout alongside model
		await persistLayout(savedPath, modelToSave);

		setModel(modelToSave, savedPath);
	}, [model, filePath, setModel]);

	const saveModelAs = useCallback(async () => {
		if (!model) return;

		const modelToSave: ThreatModel = {
			...model,
			metadata: { ...model.metadata, modified: todayString() },
		};

		const adapter = await getFileAdapter();
		const savedPath = await adapter.saveThreatModel(modelToSave, null);
		if (!savedPath) return;

		// Save layout alongside model
		await persistLayout(savedPath, modelToSave);

		setModel(modelToSave, savedPath);
	}, [model, setModel]);

	const closeModel = useCallback(async () => {
		if (isDirty) {
			const adapter = await getFileAdapter();
			const discard = await adapter.confirmDiscard();
			if (!discard) return;
		}
		clearModel();
		// DfdCanvas unmounts when model is null, so useEffect won't fire — clear canvas directly
		useCanvasStore.getState().syncFromModel();
	}, [isDirty, clearModel]);

	return { newModel, openModel, saveModel, saveModelAs, closeModel };
}
