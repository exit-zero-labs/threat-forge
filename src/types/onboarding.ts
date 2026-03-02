/** A single step in an onboarding guide */
export interface OnboardingStep {
	/** Target element to highlight, via data-testid or CSS selector */
	targetSelector: string;
	/** Step title */
	title: string;
	/** Step description */
	content: string;
	/** Tooltip placement relative to the target */
	placement: "top" | "bottom" | "left" | "right";
}

/** A complete onboarding guide */
export interface OnboardingGuide {
	/** Unique guide identifier */
	id: string;
	/** Display name */
	name: string;
	/** Ordered steps */
	steps: OnboardingStep[];
	/** Only show this guide once (track completion in localStorage) */
	showOnce: boolean;
}
