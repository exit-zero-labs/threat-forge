import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { Element, Threat, ThreatModel } from "@/types/threat-model";

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
	/** Whether STRIDE analysis is running */
	isAnalyzing: boolean;

	// Actions
	setModel: (model: ThreatModel, filePath: string | null) => void;
	clearModel: () => void;
	markDirty: () => void;
	markClean: () => void;
	setSelectedElement: (id: string | null) => void;
	setSelectedThreat: (id: string | null) => void;

	// Element editing
	updateElement: (id: string, updates: Partial<Element>) => void;

	// Threat CRUD
	addThreat: (threat: Threat) => void;
	addThreats: (threats: Threat[]) => void;
	updateThreat: (id: string, updates: Partial<Threat>) => void;
	deleteThreat: (id: string) => void;

	// STRIDE analysis
	analyzeThreats: () => Promise<void>;
}

export const useModelStore = create<ModelState>((set, get) => ({
	model: null,
	filePath: null,
	isDirty: false,
	selectedElementId: null,
	selectedThreatId: null,
	isAnalyzing: false,

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

	updateElement: (id, updates) => {
		const { model } = get();
		if (!model) return;

		const updatedElements = model.elements.map((e) => (e.id === id ? { ...e, ...updates } : e));
		set({
			model: { ...model, elements: updatedElements },
			isDirty: true,
		});
	},

	addThreat: (threat) => {
		const { model } = get();
		if (!model) return;

		set({
			model: { ...model, threats: [...model.threats, threat] },
			isDirty: true,
		});
	},

	addThreats: (threats) => {
		const { model } = get();
		if (!model) return;
		if (threats.length === 0) return;

		set({
			model: { ...model, threats: [...model.threats, ...threats] },
			isDirty: true,
		});
	},

	updateThreat: (id, updates) => {
		const { model } = get();
		if (!model) return;

		const updatedThreats = model.threats.map((t) => (t.id === id ? { ...t, ...updates } : t));
		set({
			model: { ...model, threats: updatedThreats },
			isDirty: true,
		});
	},

	deleteThreat: (id) => {
		const { model, selectedThreatId } = get();
		if (!model) return;

		set({
			model: { ...model, threats: model.threats.filter((t) => t.id !== id) },
			isDirty: true,
			selectedThreatId: selectedThreatId === id ? null : selectedThreatId,
		});
	},

	analyzeThreats: async () => {
		const { model } = get();
		if (!model) return;

		set({ isAnalyzing: true });
		try {
			const newThreats = await invoke<Threat[]>("analyze_stride", { model });
			if (newThreats.length > 0) {
				get().addThreats(newThreats);
			}
		} finally {
			set({ isAnalyzing: false });
		}
	},
}));
