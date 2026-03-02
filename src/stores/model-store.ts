import { create } from "zustand";
import { getStrideAdapter } from "@/lib/adapters/get-stride-adapter";
import type {
	DataFlow,
	Element,
	Metadata,
	Threat,
	ThreatModel,
	TrustBoundary,
} from "@/types/threat-model";
import { useHistoryStore } from "./history-store";

interface ModelState {
	/** The currently loaded threat model, or null if no model is open */
	model: ThreatModel | null;
	/** The file path of the currently open model */
	filePath: string | null;
	/** Whether the model has unsaved changes */
	isDirty: boolean;
	/** Currently selected element ID */
	selectedElementId: string | null;
	/** Currently selected edge/flow ID */
	selectedEdgeId: string | null;
	/** Currently selected trust boundary ID */
	selectedBoundaryId: string | null;
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
	setSelectedEdge: (id: string | null) => void;
	setSelectedBoundary: (id: string | null) => void;
	setSelectedThreat: (id: string | null) => void;

	// Metadata editing
	updateMetadata: (updates: Partial<Metadata>) => void;

	// Element editing
	updateElement: (id: string, updates: Partial<Element>) => void;

	// Data flow editing
	updateDataFlow: (id: string, updates: Partial<DataFlow>) => void;

	// Trust boundary editing
	updateTrustBoundary: (id: string, updates: Partial<TrustBoundary>) => void;

	// Threat CRUD
	addThreat: (threat: Threat) => void;
	addThreats: (threats: Threat[]) => void;
	updateThreat: (id: string, updates: Partial<Threat>) => void;
	deleteThreat: (id: string) => void;

	// Undo/redo
	restoreSnapshot: (snapshot: ThreatModel) => void;

	// STRIDE analysis
	analyzeThreats: () => Promise<void>;
}

let lastDebouncedCaptureTime = 0;
let lastDebouncedCaptureKey = "";
const CAPTURE_DEBOUNCE_MS = 300;

/** Capture a history snapshot for a discrete action. Always pushes. Resets debounce state. */
function captureHistory(model: ThreatModel | null): void {
	if (!model) return;
	lastDebouncedCaptureTime = 0;
	lastDebouncedCaptureKey = "";
	useHistoryStore.getState().pushSnapshot(model);
}

/**
 * Capture a history snapshot with key-based debouncing for rapid property edits.
 * Consecutive calls with the same key within CAPTURE_DEBOUNCE_MS are grouped
 * into a single undo step (only the first push is recorded).
 */
function captureHistoryDebounced(model: ThreatModel | null, key: string): void {
	if (!model) return;
	const now = Date.now();
	if (key === lastDebouncedCaptureKey && now - lastDebouncedCaptureTime < CAPTURE_DEBOUNCE_MS)
		return;
	lastDebouncedCaptureTime = now;
	lastDebouncedCaptureKey = key;
	useHistoryStore.getState().pushSnapshot(model);
}

/** Reset the debounce state. Exported for testing. */
export function resetCaptureDebounce(): void {
	lastDebouncedCaptureTime = 0;
	lastDebouncedCaptureKey = "";
}

export const useModelStore = create<ModelState>((set, get) => ({
	model: null,
	filePath: null,
	isDirty: false,
	selectedElementId: null,
	selectedEdgeId: null,
	selectedBoundaryId: null,
	selectedThreatId: null,
	isAnalyzing: false,

	setModel: (model, filePath) =>
		set({
			model,
			filePath,
			isDirty: false,
			selectedElementId: null,
			selectedEdgeId: null,
			selectedBoundaryId: null,
			selectedThreatId: null,
		}),

	clearModel: () =>
		set({
			model: null,
			filePath: null,
			isDirty: false,
			selectedElementId: null,
			selectedEdgeId: null,
			selectedBoundaryId: null,
			selectedThreatId: null,
		}),

	markDirty: () => set({ isDirty: true }),
	markClean: () => set({ isDirty: false }),
	setSelectedElement: (id) =>
		set({
			selectedElementId: id,
			selectedEdgeId: null,
			selectedBoundaryId: null,
		}),
	setSelectedEdge: (id) =>
		set({
			selectedEdgeId: id,
			selectedElementId: null,
			selectedBoundaryId: null,
		}),
	setSelectedBoundary: (id) =>
		set({
			selectedBoundaryId: id,
			selectedElementId: null,
			selectedEdgeId: null,
		}),
	setSelectedThreat: (id) => set({ selectedThreatId: id }),

	updateMetadata: (updates) => {
		const { model } = get();
		if (!model) return;
		set({
			model: { ...model, metadata: { ...model.metadata, ...updates } },
			isDirty: true,
		});
	},

	updateElement: (id, updates) => {
		const { model } = get();
		if (!model) return;

		captureHistoryDebounced(model, `element:${id}`);
		const updatedElements = model.elements.map((e) => (e.id === id ? { ...e, ...updates } : e));
		set({
			model: { ...model, elements: updatedElements },
			isDirty: true,
		});
	},

	updateDataFlow: (id, updates) => {
		const { model } = get();
		if (!model) return;

		captureHistoryDebounced(model, `flow:${id}`);
		const updatedFlows = model.data_flows.map((f) => (f.id === id ? { ...f, ...updates } : f));
		set({
			model: { ...model, data_flows: updatedFlows },
			isDirty: true,
		});
	},

	updateTrustBoundary: (id, updates) => {
		const { model } = get();
		if (!model) return;

		captureHistoryDebounced(model, `boundary:${id}`);
		const updatedBoundaries = model.trust_boundaries.map((b) =>
			b.id === id ? { ...b, ...updates } : b,
		);
		set({
			model: { ...model, trust_boundaries: updatedBoundaries },
			isDirty: true,
		});
	},

	addThreat: (threat) => {
		const { model } = get();
		if (!model) return;

		captureHistory(model);
		set({
			model: { ...model, threats: [...model.threats, threat] },
			isDirty: true,
		});
	},

	addThreats: (threats) => {
		const { model } = get();
		if (!model) return;
		if (threats.length === 0) return;

		captureHistory(model);
		set({
			model: { ...model, threats: [...model.threats, ...threats] },
			isDirty: true,
		});
	},

	updateThreat: (id, updates) => {
		const { model } = get();
		if (!model) return;

		captureHistoryDebounced(model, `threat:${id}`);
		const updatedThreats = model.threats.map((t) => (t.id === id ? { ...t, ...updates } : t));
		set({
			model: { ...model, threats: updatedThreats },
			isDirty: true,
		});
	},

	deleteThreat: (id) => {
		const { model, selectedThreatId } = get();
		if (!model) return;

		captureHistory(model);
		set({
			model: { ...model, threats: model.threats.filter((t) => t.id !== id) },
			isDirty: true,
			selectedThreatId: selectedThreatId === id ? null : selectedThreatId,
		});
	},

	restoreSnapshot: (snapshot) => {
		lastDebouncedCaptureTime = 0;
		lastDebouncedCaptureKey = "";
		set({
			model: snapshot,
			isDirty: true,
		});
	},

	analyzeThreats: async () => {
		const { model } = get();
		if (!model) return;

		set({ isAnalyzing: true });
		try {
			const adapter = await getStrideAdapter();
			const newThreats = await adapter.analyze(model);
			if (newThreats.length > 0) {
				get().addThreats(newThreats);
			}
		} finally {
			set({ isAnalyzing: false });
		}
	},
}));
