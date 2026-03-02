import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOnboardingStore } from "./onboarding-store";

// Mock localStorage
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
	getItem: (key: string) => storage.get(key) ?? null,
	setItem: (key: string, val: string) => storage.set(key, val),
	removeItem: (key: string) => storage.delete(key),
});

describe("onboarding-store", () => {
	beforeEach(() => {
		storage.clear();
		useOnboardingStore.setState({
			completedGuideIds: [],
			dismissedGuideIds: [],
			activeGuide: null,
			activeStepIndex: 0,
		});
	});

	it("starts a guide by ID", () => {
		useOnboardingStore.getState().startGuide("welcome");
		const { activeGuide, activeStepIndex } = useOnboardingStore.getState();
		expect(activeGuide).not.toBeNull();
		expect(activeGuide?.id).toBe("welcome");
		expect(activeStepIndex).toBe(0);
	});

	it("ignores unknown guide IDs", () => {
		useOnboardingStore.getState().startGuide("nonexistent");
		expect(useOnboardingStore.getState().activeGuide).toBeNull();
	});

	it("advances to next step", () => {
		useOnboardingStore.getState().startGuide("welcome");
		useOnboardingStore.getState().nextStep();
		expect(useOnboardingStore.getState().activeStepIndex).toBe(1);
	});

	it("completes guide on last step next", () => {
		useOnboardingStore.getState().startGuide("welcome");
		const steps = useOnboardingStore.getState().activeGuide?.steps.length ?? 0;
		for (let i = 0; i < steps; i++) {
			useOnboardingStore.getState().nextStep();
		}
		const { activeGuide, completedGuideIds } = useOnboardingStore.getState();
		expect(activeGuide).toBeNull();
		expect(completedGuideIds).toContain("welcome");
	});

	it("persists completed guides to localStorage", () => {
		useOnboardingStore.getState().startGuide("welcome");
		const steps = useOnboardingStore.getState().activeGuide?.steps.length ?? 0;
		for (let i = 0; i < steps; i++) {
			useOnboardingStore.getState().nextStep();
		}
		const raw = storage.get("threatforge-onboarding");
		expect(raw).toBeTruthy();
		const parsed = JSON.parse(raw as string);
		expect(parsed.completedGuideIds).toContain("welcome");
	});

	it("goes back to previous step", () => {
		useOnboardingStore.getState().startGuide("welcome");
		useOnboardingStore.getState().nextStep();
		useOnboardingStore.getState().nextStep();
		expect(useOnboardingStore.getState().activeStepIndex).toBe(2);
		useOnboardingStore.getState().prevStep();
		expect(useOnboardingStore.getState().activeStepIndex).toBe(1);
	});

	it("prevStep does nothing at step 0", () => {
		useOnboardingStore.getState().startGuide("welcome");
		useOnboardingStore.getState().prevStep();
		expect(useOnboardingStore.getState().activeStepIndex).toBe(0);
	});

	it("dismisses guide and persists", () => {
		useOnboardingStore.getState().startGuide("welcome");
		useOnboardingStore.getState().dismissGuide();
		const { activeGuide, dismissedGuideIds } = useOnboardingStore.getState();
		expect(activeGuide).toBeNull();
		expect(dismissedGuideIds).toContain("welcome");
		const raw = storage.get("threatforge-onboarding");
		const parsed = JSON.parse(raw as string);
		expect(parsed.dismissedGuideIds).toContain("welcome");
	});

	it("does not re-show a completed showOnce guide", () => {
		useOnboardingStore.setState({ completedGuideIds: ["welcome"] });
		useOnboardingStore.getState().startGuide("welcome");
		expect(useOnboardingStore.getState().activeGuide).toBeNull();
	});

	it("does not re-show a dismissed showOnce guide", () => {
		useOnboardingStore.setState({ dismissedGuideIds: ["welcome"] });
		useOnboardingStore.getState().startGuide("welcome");
		expect(useOnboardingStore.getState().activeGuide).toBeNull();
	});

	it("resets a specific guide", () => {
		useOnboardingStore.setState({
			completedGuideIds: ["welcome", "dfd-basics"],
			dismissedGuideIds: ["welcome"],
		});
		useOnboardingStore.getState().resetGuide("welcome");
		const { completedGuideIds, dismissedGuideIds } = useOnboardingStore.getState();
		expect(completedGuideIds).not.toContain("welcome");
		expect(completedGuideIds).toContain("dfd-basics");
		expect(dismissedGuideIds).not.toContain("welcome");
	});

	it("allows re-starting a guide after reset", () => {
		useOnboardingStore.setState({ completedGuideIds: ["welcome"] });
		useOnboardingStore.getState().resetGuide("welcome");
		useOnboardingStore.getState().startGuide("welcome");
		expect(useOnboardingStore.getState().activeGuide?.id).toBe("welcome");
	});

	it("resetAll clears everything", () => {
		useOnboardingStore.setState({
			completedGuideIds: ["welcome"],
			dismissedGuideIds: ["dfd-basics"],
		});
		useOnboardingStore.getState().resetAll();
		const state = useOnboardingStore.getState();
		expect(state.completedGuideIds).toHaveLength(0);
		expect(state.dismissedGuideIds).toHaveLength(0);
		expect(state.activeGuide).toBeNull();
		expect(storage.has("threatforge-onboarding")).toBe(false);
	});

	it("nextStep does nothing when no guide is active", () => {
		useOnboardingStore.getState().nextStep();
		expect(useOnboardingStore.getState().activeStepIndex).toBe(0);
	});

	it("dismissGuide does nothing when no guide is active", () => {
		useOnboardingStore.getState().dismissGuide();
		expect(useOnboardingStore.getState().dismissedGuideIds).toHaveLength(0);
	});
});
