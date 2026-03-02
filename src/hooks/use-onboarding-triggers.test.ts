import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModelStore } from "@/stores/model-store";
import { useOnboardingStore } from "@/stores/onboarding-store";

// We test the trigger logic by simulating state changes directly,
// since the hook relies on React effects that are hard to test in isolation.

describe("onboarding trigger logic", () => {
	beforeEach(() => {
		localStorage.clear();
		useOnboardingStore.getState().resetAll();
		useModelStore.getState().clearModel();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("welcome guide can be started when never seen before", () => {
		const { completedGuideIds, dismissedGuideIds } = useOnboardingStore.getState();
		expect(completedGuideIds).not.toContain("welcome");
		expect(dismissedGuideIds).not.toContain("welcome");

		useOnboardingStore.getState().startGuide("welcome");
		expect(useOnboardingStore.getState().activeGuide?.id).toBe("welcome");
	});

	it("welcome guide is blocked after completion", () => {
		useOnboardingStore.getState().startGuide("welcome");
		// Walk through all steps to complete it
		const guide = useOnboardingStore.getState().activeGuide;
		if (guide) {
			for (let i = 0; i < guide.steps.length; i++) {
				useOnboardingStore.getState().nextStep();
			}
		}
		expect(useOnboardingStore.getState().completedGuideIds).toContain("welcome");

		// Try to start again — should be blocked because showOnce: true
		useOnboardingStore.getState().startGuide("welcome");
		expect(useOnboardingStore.getState().activeGuide).toBeNull();
	});

	it("welcome guide is blocked after dismissal", () => {
		useOnboardingStore.getState().startGuide("welcome");
		useOnboardingStore.getState().dismissGuide();
		expect(useOnboardingStore.getState().dismissedGuideIds).toContain("welcome");

		useOnboardingStore.getState().startGuide("welcome");
		expect(useOnboardingStore.getState().activeGuide).toBeNull();
	});

	it("dfd-basics guide can be started when model is created", () => {
		useOnboardingStore.getState().startGuide("dfd-basics");
		expect(useOnboardingStore.getState().activeGuide?.id).toBe("dfd-basics");
	});

	it("stride-analysis guide can be restarted (showOnce: false)", () => {
		useOnboardingStore.getState().startGuide("stride-analysis");
		// Complete it
		const guide = useOnboardingStore.getState().activeGuide;
		if (guide) {
			for (let i = 0; i < guide.steps.length; i++) {
				useOnboardingStore.getState().nextStep();
			}
		}
		expect(useOnboardingStore.getState().completedGuideIds).toContain("stride-analysis");

		// Can start again because showOnce: false
		useOnboardingStore.getState().startGuide("stride-analysis");
		expect(useOnboardingStore.getState().activeGuide?.id).toBe("stride-analysis");
	});

	it("ai-assistant guide can be restarted (showOnce: false)", () => {
		useOnboardingStore.getState().startGuide("ai-assistant");
		expect(useOnboardingStore.getState().activeGuide?.id).toBe("ai-assistant");

		// Dismiss it
		useOnboardingStore.getState().dismissGuide();

		// Can start again because showOnce: false
		useOnboardingStore.getState().startGuide("ai-assistant");
		expect(useOnboardingStore.getState().activeGuide?.id).toBe("ai-assistant");
	});

	it("ALL_GUIDES contains all 4 guides", async () => {
		const { ALL_GUIDES } = await import("@/lib/onboarding/guides");
		expect(ALL_GUIDES).toHaveLength(4);
		expect(ALL_GUIDES.map((g) => g.id)).toEqual([
			"welcome",
			"dfd-basics",
			"stride-analysis",
			"ai-assistant",
		]);
	});

	it("STRIDE analysis guide has 3 steps targeting threats tab", async () => {
		const { STRIDE_ANALYSIS_GUIDE } = await import("@/lib/onboarding/guides");
		expect(STRIDE_ANALYSIS_GUIDE.steps).toHaveLength(3);
		expect(STRIDE_ANALYSIS_GUIDE.steps[0].targetSelector).toContain("tab-threats");
		expect(STRIDE_ANALYSIS_GUIDE.steps[1].targetSelector).toContain("btn-stride-analyze");
	});

	it("AI assistant guide has 3 steps targeting AI tab", async () => {
		const { AI_ASSISTANT_GUIDE } = await import("@/lib/onboarding/guides");
		expect(AI_ASSISTANT_GUIDE.steps).toHaveLength(3);
		expect(AI_ASSISTANT_GUIDE.steps[0].targetSelector).toContain("tab-ai");
	});
});
