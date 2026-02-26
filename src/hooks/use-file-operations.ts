import { invoke } from "@tauri-apps/api/core";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";
import { useCanvasStore } from "@/stores/canvas-store";
import { useModelStore } from "@/stores/model-store";
import type { DiagramLayout, ThreatModel } from "@/types/threat-model";

const YAML_FILTER = {
	name: "ThreatForge Model",
	extensions: ["threatforge.yaml", "yaml", "yml"],
};

async function confirmUnsavedChanges(): Promise<boolean> {
	return confirm("You have unsaved changes. Discard them?", {
		title: "Unsaved Changes",
		kind: "warning",
		okLabel: "Discard",
		cancelLabel: "Cancel",
	});
}

function todayString(): string {
	return new Date().toISOString().split("T")[0];
}

/** Resolve a layout_file path (relative) against the model file's directory. */
function resolveLayoutPath(modelPath: string, layoutFile: string): string {
	const lastSep = Math.max(modelPath.lastIndexOf("/"), modelPath.lastIndexOf("\\"));
	const dir = lastSep >= 0 ? modelPath.substring(0, lastSep) : ".";
	return `${dir}/${layoutFile}`;
}

/** Build a DiagramLayout from current canvas state. */
function captureLayout(diagramId: string): DiagramLayout {
	const { nodes, viewport } = useCanvasStore.getState();
	return {
		diagram_id: diagramId,
		viewport,
		nodes: nodes.map((n) => ({
			id: n.id,
			x: n.position.x,
			y: n.position.y,
			...(n.style?.width != null ? { width: Number(n.style.width) } : {}),
			...(n.style?.height != null ? { height: Number(n.style.height) } : {}),
		})),
	};
}

/** Save layout alongside the model file. Failures are non-fatal. */
async function persistLayout(modelPath: string, model: ThreatModel): Promise<void> {
	if (model.diagrams.length === 0) return;
	const layoutPath = resolveLayoutPath(modelPath, model.diagrams[0].layout_file);
	const layout = captureLayout(model.diagrams[0].id);
	try {
		await invoke("save_layout", { path: layoutPath, layout });
	} catch {
		// Layout save failure is non-fatal — model YAML is already saved
	}
}

export function useFileOperations() {
	const model = useModelStore((s) => s.model);
	const filePath = useModelStore((s) => s.filePath);
	const isDirty = useModelStore((s) => s.isDirty);
	const setModel = useModelStore((s) => s.setModel);
	const clearModel = useModelStore((s) => s.clearModel);
	const syncFromModel = useCanvasStore((s) => s.syncFromModel);

	const newModel = useCallback(async () => {
		if (isDirty) {
			const discard = await confirmUnsavedChanges();
			if (!discard) return;
		}

		const created = await invoke<ThreatModel>("create_new_model", {
			title: "Untitled Threat Model",
			author: "",
		});
		// No pending layout for new models — use default positions
		useCanvasStore.getState().setPendingLayout(null);
		setModel(created, null);
		// Defer sync to next tick so store update settles
		setTimeout(() => syncFromModel(), 0);
	}, [isDirty, setModel, syncFromModel]);

	const openModel = useCallback(async () => {
		if (isDirty) {
			const discard = await confirmUnsavedChanges();
			if (!discard) return;
		}

		const selected = await open({
			multiple: false,
			filters: [YAML_FILTER],
		});
		if (!selected) return;

		const path = typeof selected === "string" ? selected : selected;
		const loaded = await invoke<ThreatModel>("open_threat_model", { path });

		// Try to load the saved layout so positions are restored
		if (loaded.diagrams.length > 0) {
			const layoutPath = resolveLayoutPath(path, loaded.diagrams[0].layout_file);
			try {
				const layout = await invoke<DiagramLayout>("open_layout", { path: layoutPath });
				useCanvasStore.getState().setPendingLayout(layout);
			} catch {
				// No layout file yet — first open, use default positions
				useCanvasStore.getState().setPendingLayout(null);
			}
		}

		setModel(loaded, path);
		setTimeout(() => syncFromModel(), 0);
	}, [isDirty, setModel, syncFromModel]);

	const saveModel = useCallback(async () => {
		if (!model) return;

		let targetPath = filePath;
		if (!targetPath) {
			const selected = await save({
				filters: [YAML_FILTER],
				defaultPath: "model.threatforge.yaml",
			});
			if (!selected) return;
			targetPath = selected;
		}

		const modelToSave: ThreatModel = {
			...model,
			metadata: { ...model.metadata, modified: todayString() },
		};

		await invoke("save_threat_model", {
			path: targetPath,
			model: modelToSave,
		});

		// Save layout alongside model
		await persistLayout(targetPath, modelToSave);

		setModel(modelToSave, targetPath);
	}, [model, filePath, setModel]);

	const saveModelAs = useCallback(async () => {
		if (!model) return;

		const selected = await save({
			filters: [YAML_FILTER],
			defaultPath: filePath ?? "model.threatforge.yaml",
		});
		if (!selected) return;

		const modelToSave: ThreatModel = {
			...model,
			metadata: { ...model.metadata, modified: todayString() },
		};

		await invoke("save_threat_model", {
			path: selected,
			model: modelToSave,
		});

		// Save layout alongside model
		await persistLayout(selected, modelToSave);

		setModel(modelToSave, selected);
	}, [model, filePath, setModel]);

	const closeModel = useCallback(async () => {
		if (isDirty) {
			const discard = await confirmUnsavedChanges();
			if (!discard) return;
		}
		clearModel();
		setTimeout(() => syncFromModel(), 0);
	}, [isDirty, clearModel, syncFromModel]);

	return { newModel, openModel, saveModel, saveModelAs, closeModel };
}
