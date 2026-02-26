import { invoke } from "@tauri-apps/api/core";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";
import { useCanvasStore } from "@/stores/canvas-store";
import { useModelStore } from "@/stores/model-store";
import type { ThreatModel } from "@/types/threat-model";

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
