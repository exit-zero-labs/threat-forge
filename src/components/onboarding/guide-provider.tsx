import { useOnboardingStore } from "@/stores/onboarding-store";
import { GuideOverlay } from "./guide-overlay";
import { GuideTooltip } from "./guide-tooltip";

/**
 * Renders the onboarding overlay and tooltip when a guide is active.
 * Place this at the top level of the app layout.
 */
export function GuideProvider() {
	const activeGuide = useOnboardingStore((s) => s.activeGuide);
	const activeStepIndex = useOnboardingStore((s) => s.activeStepIndex);
	const nextStep = useOnboardingStore((s) => s.nextStep);
	const prevStep = useOnboardingStore((s) => s.prevStep);
	const dismissGuide = useOnboardingStore((s) => s.dismissGuide);

	if (!activeGuide) return null;

	const step = activeGuide.steps[activeStepIndex];
	if (!step) return null;

	return (
		<>
			<GuideOverlay targetSelector={step.targetSelector} onClickOutside={dismissGuide} />
			<GuideTooltip
				step={step}
				stepIndex={activeStepIndex}
				totalSteps={activeGuide.steps.length}
				onNext={nextStep}
				onPrev={prevStep}
				onDismiss={dismissGuide}
			/>
		</>
	);
}
