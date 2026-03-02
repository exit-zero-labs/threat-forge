import type { OnboardingGuide } from "@/types/onboarding";

export const WELCOME_GUIDE: OnboardingGuide = {
	id: "welcome",
	name: "Welcome to ThreatForge",
	showOnce: true,
	steps: [
		{
			targetSelector: "[data-testid='canvas-area']",
			title: "The Canvas",
			content:
				"This is your threat modeling canvas. Drag components from the palette to build your system architecture diagram.",
			placement: "bottom",
		},
		{
			targetSelector: "[data-testid='component-palette']",
			title: "Component Palette",
			content:
				"Drag generic components or pre-built library items onto the canvas. Double-click to add at center.",
			placement: "right",
		},
		{
			targetSelector: "[data-testid='right-panel']",
			title: "Properties & Analysis",
			content:
				"View and edit element properties, run STRIDE threat analysis, and chat with AI for threat suggestions.",
			placement: "left",
		},
		{
			targetSelector: "[data-testid='btn-save']",
			title: "Save Your Work",
			content:
				"Save your threat model as a human-readable YAML file. It's git-friendly and version-controllable.",
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
			title: "Add a Component",
			content: "Drag this onto the canvas to create a generic component (process, service, etc.).",
			placement: "right",
		},
		{
			targetSelector: "[data-testid='palette-item-trust-boundary']",
			title: "Trust Boundaries",
			content:
				"Drag a boundary onto the canvas to define trust zones. Drop components inside to assign them.",
			placement: "right",
		},
		{
			targetSelector: "[data-testid='tab-threats']",
			title: "Analyze Threats",
			content:
				"Switch to the Threats tab and run STRIDE analysis to automatically identify potential security threats.",
			placement: "left",
		},
	],
};

export const ALL_GUIDES: OnboardingGuide[] = [WELCOME_GUIDE, DFD_BASICS_GUIDE];
