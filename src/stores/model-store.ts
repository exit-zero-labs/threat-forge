import { create } from "zustand";
import type { ThreatModel } from "@/types/threat-model";

interface ModelState {
	/** The currently loaded threat model, or null if no model is open */
	model: ThreatModel | null;
	/** The file path of the currently open model */
	filePath: string | null;
	/** Whether the model has unsaved changes */
	isDirty: boolean;
	/** Currently selected element ID */
	selectedElementId: string | null;
	/** Currently selected threat ID */
	selectedThreatId: string | null;

	// Actions
	setModel: (model: ThreatModel, filePath: string | null) => void;
	clearModel: () => void;
	markDirty: () => void;
	markClean: () => void;
	setSelectedElement: (id: string | null) => void;
	setSelectedThreat: (id: string | null) => void;
}

export const useModelStore = create<ModelState>((set) => ({
	model: null,
	filePath: null,
	isDirty: false,
	selectedElementId: null,
	selectedThreatId: null,

	setModel: (model, filePath) =>
		set({
			model,
			filePath,
			isDirty: false,
			selectedElementId: null,
			selectedThreatId: null,
		}),

	clearModel: () =>
		set({
			model: null,
			filePath: null,
			isDirty: false,
			selectedElementId: null,
			selectedThreatId: null,
		}),

	markDirty: () => set({ isDirty: true }),
	markClean: () => set({ isDirty: false }),
	setSelectedElement: (id) => set({ selectedElementId: id }),
	setSelectedThreat: (id) => set({ selectedThreatId: id }),
}));
