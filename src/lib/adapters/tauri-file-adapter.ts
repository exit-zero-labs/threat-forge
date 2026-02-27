import { invoke } from "@tauri-apps/api/core";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import type { DiagramLayout, ThreatModel } from "@/types/threat-model";
import type { FileAdapter } from "./file-adapter";

const YAML_FILTER = {
	name: "ThreatForge Model",
	extensions: ["threatforge.yaml", "yaml", "yml"],
};

export class TauriFileAdapter implements FileAdapter {
	async createNewModel(title: string, author: string): Promise<ThreatModel> {
		return invoke<ThreatModel>("create_new_model", { title, author });
	}

	async openThreatModel(): Promise<{ model: ThreatModel; path: string | null } | null> {
		const selected = await open({
			multiple: false,
			filters: [YAML_FILTER],
		});
		if (!selected) return null;

		const path = typeof selected === "string" ? selected : selected;
		const model = await invoke<ThreatModel>("open_threat_model", { path });
		return { model, path };
	}

	async saveThreatModel(model: ThreatModel, path: string | null): Promise<string | null> {
		let targetPath = path;
		if (!targetPath) {
			const selected = await save({
				filters: [YAML_FILTER],
				defaultPath: "model.threatforge.yaml",
			});
			if (!selected) return null;
			targetPath = selected;
		}

		await invoke("save_threat_model", { path: targetPath, model });
		return targetPath;
	}

	async openLayout(modelPath: string, layoutFile: string): Promise<DiagramLayout | null> {
		const layoutPath = resolveLayoutPath(modelPath, layoutFile);
		try {
			return await invoke<DiagramLayout>("open_layout", { path: layoutPath });
		} catch {
			return null;
		}
	}

	async saveLayout(modelPath: string, layoutFile: string, layout: DiagramLayout): Promise<void> {
		const layoutPath = resolveLayoutPath(modelPath, layoutFile);
		try {
			await invoke("save_layout", { path: layoutPath, layout });
		} catch {
			// Layout save failure is non-fatal
		}
	}

	async confirmDiscard(): Promise<boolean> {
		return confirm("You have unsaved changes. Discard them?", {
			title: "Unsaved Changes",
			kind: "warning",
			okLabel: "Discard",
			cancelLabel: "Cancel",
		});
	}
}

function resolveLayoutPath(modelPath: string, layoutFile: string): string {
	const lastSep = Math.max(modelPath.lastIndexOf("/"), modelPath.lastIndexOf("\\"));
	const dir = lastSep >= 0 ? modelPath.substring(0, lastSep) : ".";
	return `${dir}/${layoutFile}`;
}
