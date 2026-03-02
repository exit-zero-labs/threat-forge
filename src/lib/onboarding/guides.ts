import type { OnboardingGuide } from "@/types/onboarding";

export const WELCOME_GUIDE: OnboardingGuide = {
	id: "welcome",
	name: "Welcome to Threat Forge",
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

export const STRIDE_ANALYSIS_GUIDE: OnboardingGuide = {
	id: "stride-analysis",
	name: "STRIDE Analysis",
	showOnce: false,
	steps: [
		{
			targetSelector: "[data-testid='tab-threats']",
			title: "Threats Tab",
			content:
				"The Threats tab shows all identified threats. Click here to switch to the threat analysis view.",
			placement: "left",
		},
		{
			targetSelector: "[data-testid='btn-stride-analyze']",
			title: "Run STRIDE Analysis",
			content:
				"Click this button to automatically generate threats based on your diagram elements. The STRIDE methodology covers Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, and Elevation of Privilege.",
			placement: "left",
		},
		{
			targetSelector: "[data-testid='right-panel']",
			title: "Review & Manage Threats",
			content:
				"Each threat shows its STRIDE category and severity. Click a threat to edit its details, add mitigations, or change its status.",
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
			title: "AI Chat Tab",
			content:
				"The AI tab lets you chat with an LLM about your threat model. It can suggest threats, review mitigations, and answer security questions.",
			placement: "left",
		},
		{
			targetSelector: "[data-testid='btn-settings-dialog']",
			title: "Configure API Key",
			content:
				"To use AI features, open Settings and add your API key (OpenAI, Anthropic, or Ollama). Keys are stored securely in encrypted storage.",
			placement: "bottom",
		},
		{
			targetSelector: "[data-testid='tab-ai']",
			title: "Ask About Threats",
			content:
				"Try asking: 'What threats am I missing?' or 'Review the mitigations for my API gateway.' The AI sees your current model and provides contextual suggestions.",
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
