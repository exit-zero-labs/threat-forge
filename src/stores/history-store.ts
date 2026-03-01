import { create } from "zustand";
import type { ThreatModel } from "@/types/threat-model";

const MAX_HISTORY_SIZE = 20;

interface HistoryState {
	past: ThreatModel[];
	future: ThreatModel[];

	/** Save a snapshot before a mutation. Clears future (new action invalidates redo). */
	pushSnapshot: (model: ThreatModel) => void;

	/** Undo: push currentModel to future, pop from past, return the restored snapshot. */
	undo: (currentModel: ThreatModel) => ThreatModel | null;

	/** Redo: push currentModel to past, pop from future, return the restored snapshot. */
	redo: (currentModel: ThreatModel) => ThreatModel | null;

	/** Clear all history (used on new/open file operations). */
	clear: () => void;

	canUndo: () => boolean;
	canRedo: () => boolean;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
	past: [],
	future: [],

	pushSnapshot: (model) => {
		set((state) => {
			const newPast = [...state.past, structuredClone(model)];
			// Trim to max size, dropping oldest entries
			if (newPast.length > MAX_HISTORY_SIZE) {
				newPast.splice(0, newPast.length - MAX_HISTORY_SIZE);
			}
			return { past: newPast, future: [] };
		});
	},

	undo: (currentModel) => {
		const { past } = get();
		if (past.length === 0) return null;

		const snapshot = past[past.length - 1];
		set((state) => ({
			past: state.past.slice(0, -1),
			future: [...state.future, structuredClone(currentModel)],
		}));
		return snapshot;
	},

	redo: (currentModel) => {
		const { future } = get();
		if (future.length === 0) return null;

		const snapshot = future[future.length - 1];
		set((state) => ({
			past: [...state.past, structuredClone(currentModel)],
			future: state.future.slice(0, -1),
		}));
		return snapshot;
	},

	clear: () => set({ past: [], future: [] }),

	canUndo: () => get().past.length > 0,
	canRedo: () => get().future.length > 0,
}));
