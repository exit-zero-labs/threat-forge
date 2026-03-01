import type { DiagramLayout, ThreatModel } from "@/types/threat-model";

/**
 * Adapter interface for file operations.
 *
 * Tauri implementation uses invoke() + native dialogs.
 * Browser implementation uses File API + download links + js-yaml.
 */
export interface FileAdapter {
	/** Create a new empty threat model. */
	createNewModel(title: string, author: string): Promise<ThreatModel>;
	/** Show an open dialog and load a threat model from YAML. */
	openThreatModel(): Promise<{ model: ThreatModel; path: string | null } | null>;
	/** Save a threat model to YAML. If no path provided, show save dialog. */
	saveThreatModel(model: ThreatModel, path: string | null): Promise<string | null>;
	/** @deprecated Layout data is now inline in the YAML. Kept for old-format fallback. */
	openLayout(modelPath: string, layoutFile: string): Promise<DiagramLayout | null>;
	/** @deprecated Layout data is now inline in the YAML. Will be removed in a future release. */
	saveLayout(modelPath: string, layoutFile: string, layout: DiagramLayout): Promise<void>;
	/** Show a confirmation dialog for discarding unsaved changes. */
	confirmDiscard(): Promise<boolean>;
}
