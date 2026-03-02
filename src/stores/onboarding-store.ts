import { create } from "zustand";
import { ALL_GUIDES } from "@/lib/onboarding/guides";
import type { OnboardingGuide } from "@/types/onboarding";

const STORAGE_KEY = "threatforge-onboarding";

interface PersistedOnboardingState {
	completedGuideIds: string[];
	dismissedGuideIds: string[];
}

interface OnboardingState {
	/** Guide IDs that have been completed (all steps walked through) */
	completedGuideIds: string[];
	/** Guide IDs that have been dismissed (user clicked Skip/Dismiss) */
	dismissedGuideIds: string[];
	/** Currently active guide, or null if none */
	activeGuide: OnboardingGuide | null;
	/** Current step index within the active guide */
	activeStepIndex: number;

	// Actions
	startGuide: (guideId: string) => void;
	nextStep: () => void;
	prevStep: () => void;
	dismissGuide: () => void;
	resetGuide: (guideId: string) => void;
	resetAll: () => void;
}

function loadPersisted(): PersistedOnboardingState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed: unknown = JSON.parse(raw);
			if (typeof parsed === "object" && parsed !== null) {
				const obj = parsed as Record<string, unknown>;
				return {
					completedGuideIds: Array.isArray(obj.completedGuideIds)
						? (obj.completedGuideIds as string[])
						: [],
					dismissedGuideIds: Array.isArray(obj.dismissedGuideIds)
						? (obj.dismissedGuideIds as string[])
						: [],
				};
			}
		}
	} catch {
		// Ignore parse errors
	}
	return { completedGuideIds: [], dismissedGuideIds: [] };
}

function persistState(completed: string[], dismissed: string[]): void {
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify({ completedGuideIds: completed, dismissedGuideIds: dismissed }),
	);
}

const initial = loadPersisted();

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
	completedGuideIds: initial.completedGuideIds,
	dismissedGuideIds: initial.dismissedGuideIds,
	activeGuide: null,
	activeStepIndex: 0,

	startGuide: (guideId) => {
		const guide = ALL_GUIDES.find((g) => g.id === guideId);
		if (!guide) return;

		const { completedGuideIds, dismissedGuideIds } = get();

		// Don't re-show if showOnce and already completed or dismissed
		if (
			guide.showOnce &&
			(completedGuideIds.includes(guideId) || dismissedGuideIds.includes(guideId))
		) {
			return;
		}

		set({ activeGuide: guide, activeStepIndex: 0 });
	},

	nextStep: () => {
		const { activeGuide, activeStepIndex, completedGuideIds } = get();
		if (!activeGuide) return;

		if (activeStepIndex < activeGuide.steps.length - 1) {
			set({ activeStepIndex: activeStepIndex + 1 });
		} else {
			// Guide completed
			const updated = completedGuideIds.includes(activeGuide.id)
				? completedGuideIds
				: [...completedGuideIds, activeGuide.id];
			set({ activeGuide: null, activeStepIndex: 0, completedGuideIds: updated });
			persistState(updated, get().dismissedGuideIds);
		}
	},

	prevStep: () => {
		const { activeGuide, activeStepIndex } = get();
		if (!activeGuide || activeStepIndex <= 0) return;
		set({ activeStepIndex: activeStepIndex - 1 });
	},

	dismissGuide: () => {
		const { activeGuide, dismissedGuideIds } = get();
		if (!activeGuide) return;

		const updated = dismissedGuideIds.includes(activeGuide.id)
			? dismissedGuideIds
			: [...dismissedGuideIds, activeGuide.id];
		set({ activeGuide: null, activeStepIndex: 0, dismissedGuideIds: updated });
		persistState(get().completedGuideIds, updated);
	},

	resetGuide: (guideId) => {
		const { completedGuideIds, dismissedGuideIds } = get();
		const updatedCompleted = completedGuideIds.filter((id) => id !== guideId);
		const updatedDismissed = dismissedGuideIds.filter((id) => id !== guideId);
		set({ completedGuideIds: updatedCompleted, dismissedGuideIds: updatedDismissed });
		persistState(updatedCompleted, updatedDismissed);
	},

	resetAll: () => {
		set({
			completedGuideIds: [],
			dismissedGuideIds: [],
			activeGuide: null,
			activeStepIndex: 0,
		});
		localStorage.removeItem(STORAGE_KEY);
	},
}));
