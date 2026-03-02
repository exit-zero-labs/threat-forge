import { useEffect, useRef } from "react";
import { useModelStore } from "@/stores/model-store";
import { useOnboardingStore } from "@/stores/onboarding-store";

const WHATS_NEW_STORAGE_KEY = "threatforge-last-seen-version";

/** Returns true if the What's New overlay is currently showing (blocks guide display) */
function isWhatsNewVisible(): boolean {
	const lastSeen = localStorage.getItem(WHATS_NEW_STORAGE_KEY);
	// WhatsNewOverlay shows when lastSeen differs from CURRENT_VERSION
	// We can't import CURRENT_VERSION without creating a circular dependency,
	// so we check if the key is absent (first launch) which is the main conflict case
	return lastSeen === null;
}

/**
 * Auto-triggers onboarding guides based on user actions.
 * - "welcome" guide on first app launch (no model open, never completed/dismissed)
 * - "dfd-basics" guide on first model creation
 */
export function useOnboardingTriggers() {
	const model = useModelStore((s) => s.model);
	const startGuide = useOnboardingStore((s) => s.startGuide);
	const completedGuideIds = useOnboardingStore((s) => s.completedGuideIds);
	const dismissedGuideIds = useOnboardingStore((s) => s.dismissedGuideIds);
	const activeGuide = useOnboardingStore((s) => s.activeGuide);

	// Track whether we've already attempted the first-launch trigger this session
	const firstLaunchChecked = useRef(false);
	// Track whether a model was previously null (to detect first creation)
	const hadNoModel = useRef(true);

	// First-launch: trigger welcome guide once on mount if never seen
	useEffect(() => {
		if (firstLaunchChecked.current) return;
		firstLaunchChecked.current = true;

		// Don't show the welcome guide if the What's New overlay is visible (first launch)
		// to avoid two overlapping modals
		if (isWhatsNewVisible()) return;

		const alreadySeen =
			completedGuideIds.includes("welcome") || dismissedGuideIds.includes("welcome");
		if (!alreadySeen && !activeGuide) {
			// Delay slightly to let the UI render first
			const timer = setTimeout(() => {
				startGuide("welcome");
			}, 500);
			return () => clearTimeout(timer);
		}
	}, [completedGuideIds, dismissedGuideIds, activeGuide, startGuide]);

	// First-model-created: trigger DFD basics when model transitions from null to non-null
	useEffect(() => {
		if (!model) {
			hadNoModel.current = true;
			return;
		}

		if (hadNoModel.current) {
			hadNoModel.current = false;

			const alreadySeen =
				completedGuideIds.includes("dfd-basics") || dismissedGuideIds.includes("dfd-basics");
			if (!alreadySeen && !activeGuide) {
				// Delay to let the canvas render after model creation
				const timer = setTimeout(() => {
					startGuide("dfd-basics");
				}, 800);
				return () => clearTimeout(timer);
			}
		}
	}, [model, completedGuideIds, dismissedGuideIds, activeGuide, startGuide]);
}
