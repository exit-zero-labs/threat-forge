import type { OnboardingGuide } from "@/types/onboarding";

export const WELCOME_GUIDE: OnboardingGuide = {
	id: "welcome",
	name: "Welcome to Threat Forge",
	showOnce: true,
	steps: [
		{
			targetSelector: "[data-testid='canvas-area']",
			title: "The canvas",
			content:
				"Where the system goes. Drag pieces out of the palette and arrange them until it looks like the thing you actually built.",
			placement: "bottom",
		},
		{
			targetSelector: "[data-testid='component-palette']",
			title: "The palette",
			content:
				"Generic shapes if you want to move fast, named services if you want the details filled in. Double-click drops one in the middle.",
			placement: "right",
		},
		{
			targetSelector: "[data-testid='right-panel']",
			title: "The right-hand panel",
			content:
				"Everything about the selected element, plus the threats tab and the AI. Most of your time gets spent here.",
			placement: "left",
		},
		{
			targetSelector: "[data-testid='btn-save']",
			title: "Saving",
			content:
				"Writes one .thf file. It is YAML, so you can commit it, diff it, and read it years from now without this app.",
			placement: "bottom",
		},
	],
};

export const DFD_BASICS_GUIDE: OnboardingGuide = {
	id: "dfd-basics",
	name: "DFD Basics",
	showOnce: true,
	steps: [
		{
			targetSelector: "[data-testid='palette-item-generic']",
			title: "Add something",
			content:
				"Drag this out for a plain process or service. You can rename it and set its type afterwards.",
			placement: "right",
		},
		{
			targetSelector: "[data-testid='palette-item-trust-boundary']",
			title: "Trust boundaries",
			content:
				"Draw the lines where trust stops. Anything you drop inside a boundary belongs to it, and STRIDE cares a great deal about which side things are on.",
			placement: "right",
		},
		{
			targetSelector: "[data-testid='tab-threats']",
			title: "Then find the threats",
			content:
				"Open the Threats tab and run STRIDE. It reads the diagram you just drew and proposes what could go wrong.",
			placement: "left",
		},
	],
};

export const STRIDE_ANALYSIS_GUIDE: OnboardingGuide = {
	id: "stride-analysis",
	name: "STRIDE Analysis",
	showOnce: false,
	steps: [
		{
			targetSelector: "[data-testid='tab-threats']",
			title: "The threats tab",
			content: "Every threat on the model, in one list. This is the view you will be arguing with.",
			placement: "left",
		},
		{
			targetSelector: "[data-testid='btn-stride-analyze']",
			title: "Run it",
			content:
				"Walks your elements and flows through all six STRIDE categories: spoofing, tampering, repudiation, information disclosure, denial of service, elevation of privilege. It is thorough rather than clever, which is the point.",
			placement: "left",
		},
		{
			targetSelector: "[data-testid='right-panel']",
			title: "Now do the real work",
			content:
				"Open a threat to set severity, write the mitigation, or mark it as not applicable. The generated list is a starting point, not a verdict.",
			placement: "left",
		},
	],
};

export const AI_ASSISTANT_GUIDE: OnboardingGuide = {
	id: "ai-assistant",
	name: "AI Assistant",
	showOnce: false,
	steps: [
		{
			targetSelector: "[data-testid='tab-ai']",
			title: "The AI tab",
			content:
				"Chat about the model you have open. It can read the document, propose threats, and edit elements and flows directly rather than telling you to.",
			placement: "left",
		},
		{
			targetSelector: "[data-testid='btn-settings-dialog']",
			title: "Bring your own key",
			content:
				"Add an OpenAI or Anthropic key in Settings. Calls go straight to the provider, never through a server of ours. Desktop keys are encrypted at rest; browser keys are encrypted using a key your browser will not export, though anything running on this page can still use them.",
			placement: "bottom",
		},
		{
			targetSelector: "[data-testid='tab-ai']",
			title: "What to ask it",
			content:
				"Try 'what am I missing on the payment flow?' or 'review the mitigations on my API gateway.' Vague questions get vague answers here, same as anywhere else.",
			placement: "left",
		},
	],
};

export const ALL_GUIDES: OnboardingGuide[] = [
	WELCOME_GUIDE,
	DFD_BASICS_GUIDE,
	STRIDE_ANALYSIS_GUIDE,
	AI_ASSISTANT_GUIDE,
];
