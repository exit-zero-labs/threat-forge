import { useEffect, useRef } from "react";
import { useModelStore } from "@/stores/model-store";
import { useOnboardingStore } from "@/stores/onboarding-store";

const WHATS_NEW_STORAGE_KEY = "threatforge-last-seen-version";
const WELCOME_GUIDE_ID = "welcome";
const WELCOME_DELAY_MS = 500;
const DFD_BASICS_GUIDE_ID = "dfd-basics";
const DFD_BASICS_DELAY_MS = 800;

/** Returns true if the What's New overlay is currently showing (blocks guide display) */
function isWhatsNewVisible(): boolean {
	const lastSeen = localStorage.getItem(WHATS_NEW_STORAGE_KEY);
	// WhatsNewOverlay shows when lastSeen differs from CURRENT_VERSION
	// We can't import CURRENT_VERSION without creating a circular dependency,
	// so we check if the key is absent (first launch) which is the main conflict case
	return lastSeen === null;
}

function isGuideEligible(guideId: string): boolean {
	const { activeGuide, completedGuideIds, dismissedGuideIds } = useOnboardingStore.getState();
	return (
		!activeGuide && !completedGuideIds.includes(guideId) && !dismissedGuideIds.includes(guideId)
	);
}

/**
 * Auto-triggers onboarding guides based on user actions.
 * - "welcome" guide on first app launch (no model open, never completed/dismissed)
 * - "dfd-basics" guide on first model creation
 */
export function useOnboardingTriggers() {
	const model = useModelStore((s) => s.model);
	// Track whether a model was previously null (to detect first creation)
	const hadNoModel = useRef(true);

	// Keep this mount effect replayable: StrictMode cleanup cancels the first timer, then replay
	// schedules its replacement.
	useEffect(() => {
		// Don't show the welcome guide if the What's New overlay is visible (first launch)
		// to avoid two overlapping modals
		if (isWhatsNewVisible()) return;
		if (!isGuideEligible(WELCOME_GUIDE_ID)) return;

		// Delay slightly to let the UI render first
		const timer = setTimeout(() => {
			if (isWhatsNewVisible()) return;
			if (!isGuideEligible(WELCOME_GUIDE_ID)) return;
			useOnboardingStore.getState().startGuide(WELCOME_GUIDE_ID);
		}, WELCOME_DELAY_MS);
		return () => clearTimeout(timer);
	}, []);

	// First-model-created: trigger DFD basics when model transitions from null to non-null
	useEffect(() => {
		if (!model) {
			hadNoModel.current = true;
			return;
		}
		if (!hadNoModel.current) return;
		hadNoModel.current = false;

		if (!isGuideEligible(DFD_BASICS_GUIDE_ID)) return;

		// Delay to let the canvas render after model creation
		const timer = setTimeout(() => {
			if (!isGuideEligible(DFD_BASICS_GUIDE_ID)) return;
			useOnboardingStore.getState().startGuide(DFD_BASICS_GUIDE_ID);
		}, DFD_BASICS_DELAY_MS);
		return () => clearTimeout(timer);
	}, [model]);
}
