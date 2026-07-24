import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModelStore } from "@/stores/model-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import type { ThreatModel } from "@/types/threat-model";
import { useOnboardingTriggers } from "./use-onboarding-triggers";

const WHATS_NEW_STORAGE_KEY = "threatforge-last-seen-version";

const mockModel: ThreatModel = {
	version: "1.0",
	metadata: {
		title: "Test Model",
		author: "Test Author",
		created: "2026-03-15",
		modified: "2026-03-15",
		description: "",
	},
	elements: [],
	data_flows: [],
	trust_boundaries: [],
	threats: [],
	diagrams: [{ id: "main-dfd", name: "Level 0 DFD" }],
};

/** Marks the What's New overlay as already seen, so it does not block the welcome guide. */
function markWhatsNewSeen(): void {
	localStorage.setItem(WHATS_NEW_STORAGE_KEY, "1.0.0");
}

// Zustand shallow-merges action spies into later snapshots, so restoreAllMocks cannot restore
// this action. Capture the implementation once and install a fresh wrapper per test.
const realStartGuide = useOnboardingStore.getState().startGuide;

function spyOnStartGuide(): ReturnType<typeof vi.fn> {
	const spy = vi.fn(realStartGuide);
	useOnboardingStore.setState({ startGuide: spy });
	return spy;
}

describe("useOnboardingTriggers", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		localStorage.clear();
		useOnboardingStore.getState().resetAll();
		useOnboardingStore.setState({ startGuide: realStartGuide });
		useModelStore.setState({ model: null, filePath: null });
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("welcome guide", () => {
		it("starts exactly once, 500ms after an ordinary (non-StrictMode) mount", () => {
			markWhatsNewSeen();
			const startGuideSpy = spyOnStartGuide();

			renderHook(() => useOnboardingTriggers());

			expect(useOnboardingStore.getState().activeGuide).toBeNull();
			act(() => {
				vi.advanceTimersByTime(500);
			});

			expect(startGuideSpy).toHaveBeenCalledOnce();
			expect(startGuideSpy).toHaveBeenCalledWith("welcome");
			expect(useOnboardingStore.getState().activeGuide?.id).toBe("welcome");
		});

		it("replays under StrictMode's mount -> cleanup -> remount and still starts exactly once", () => {
			markWhatsNewSeen();
			const startGuideSpy = spyOnStartGuide();

			// StrictMode synchronously mounts, cleans up, and remounts on the initial commit.
			// The first effect run's timer must be cancelled by that cleanup, and the replay
			// must schedule a replacement — not silently skip scheduling.
			renderHook(() => useOnboardingTriggers(), { wrapper: StrictMode });

			act(() => {
				vi.advanceTimersByTime(500);
			});

			expect(startGuideSpy).toHaveBeenCalledOnce();
			expect(startGuideSpy).toHaveBeenCalledWith("welcome");
			expect(useOnboardingStore.getState().activeGuide?.id).toBe("welcome");
		});

		it("does not fire again well past the delay, under StrictMode", () => {
			markWhatsNewSeen();
			const startGuideSpy = spyOnStartGuide();

			renderHook(() => useOnboardingTriggers(), { wrapper: StrictMode });

			act(() => {
				vi.advanceTimersByTime(5000);
			});

			expect(startGuideSpy).toHaveBeenCalledOnce();
		});

		it("does not fire when the welcome guide was already completed", () => {
			markWhatsNewSeen();
			useOnboardingStore.setState({ completedGuideIds: ["welcome"] });
			const startGuideSpy = spyOnStartGuide();

			renderHook(() => useOnboardingTriggers());
			act(() => {
				vi.advanceTimersByTime(500);
			});

			expect(startGuideSpy).not.toHaveBeenCalled();
			expect(useOnboardingStore.getState().activeGuide).toBeNull();
		});

		it("does not fire when the welcome guide was already dismissed", () => {
			markWhatsNewSeen();
			useOnboardingStore.setState({ dismissedGuideIds: ["welcome"] });
			const startGuideSpy = spyOnStartGuide();

			renderHook(() => useOnboardingTriggers());
			act(() => {
				vi.advanceTimersByTime(500);
			});

			expect(startGuideSpy).not.toHaveBeenCalled();
		});

		it("does not fire while the What's New overlay is visible", () => {
			// beforeEach clears localStorage, so threatforge-last-seen-version is absent and
			// isWhatsNewVisible() is true — the exact interaction that caused #111.
			const startGuideSpy = spyOnStartGuide();

			renderHook(() => useOnboardingTriggers());
			act(() => {
				vi.advanceTimersByTime(500);
			});

			expect(startGuideSpy).not.toHaveBeenCalled();
			expect(useOnboardingStore.getState().activeGuide).toBeNull();
		});

		it("does not fire when another guide is already active at effect setup", () => {
			markWhatsNewSeen();
			useOnboardingStore.getState().startGuide("stride-analysis");
			const startGuideSpy = spyOnStartGuide();

			renderHook(() => useOnboardingTriggers());
			act(() => {
				vi.advanceTimersByTime(500);
			});

			expect(startGuideSpy).not.toHaveBeenCalledWith("welcome");
			expect(useOnboardingStore.getState().activeGuide?.id).toBe("stride-analysis");
		});

		it("re-checks live state at fire time: a guide activated mid-delay is not overwritten", () => {
			markWhatsNewSeen();
			renderHook(() => useOnboardingTriggers());

			// Halfway through the welcome delay, something else starts a different guide.
			act(() => {
				vi.advanceTimersByTime(250);
			});
			act(() => {
				useOnboardingStore.getState().startGuide("ai-assistant");
			});
			act(() => {
				vi.advanceTimersByTime(500);
			});

			expect(useOnboardingStore.getState().activeGuide?.id).toBe("ai-assistant");
		});

		it("re-checks live state at fire time: a completion mid-delay suppresses the stale schedule", () => {
			markWhatsNewSeen();
			renderHook(() => useOnboardingTriggers());

			act(() => {
				vi.advanceTimersByTime(250);
			});
			act(() => {
				useOnboardingStore.setState({ completedGuideIds: ["welcome"] });
			});
			act(() => {
				vi.advanceTimersByTime(500);
			});

			expect(useOnboardingStore.getState().activeGuide).toBeNull();
		});

		it("cancels the pending timer on a real unmount and never starts the guide", () => {
			markWhatsNewSeen();
			const startGuideSpy = spyOnStartGuide();

			const { unmount } = renderHook(() => useOnboardingTriggers());
			unmount();

			act(() => {
				vi.advanceTimersByTime(5000);
			});

			expect(startGuideSpy).not.toHaveBeenCalled();
		});
	});

	describe("dfd-basics guide", () => {
		it("starts 800ms after the model transitions from null to non-null", () => {
			renderHook(() => useOnboardingTriggers());

			act(() => {
				useModelStore.setState({ model: mockModel, filePath: null });
			});
			act(() => {
				vi.advanceTimersByTime(800);
			});

			expect(useOnboardingStore.getState().activeGuide?.id).toBe("dfd-basics");
		});

		it("does not fire again on a later model change once already handled", () => {
			renderHook(() => useOnboardingTriggers());

			act(() => {
				useModelStore.setState({ model: mockModel, filePath: null });
			});
			act(() => {
				vi.advanceTimersByTime(800);
			});
			useOnboardingStore.getState().dismissGuide();

			const startGuideSpy = spyOnStartGuide();
			act(() => {
				useModelStore.setState({
					model: { ...mockModel, metadata: { ...mockModel.metadata, title: "Renamed" } },
					filePath: null,
				});
			});
			act(() => {
				vi.advanceTimersByTime(800);
			});

			expect(startGuideSpy).not.toHaveBeenCalled();
		});

		it("re-checks live state at fire time: a guide activated during its 800ms delay is not overwritten", () => {
			renderHook(() => useOnboardingTriggers());

			act(() => {
				useModelStore.setState({ model: mockModel, filePath: null });
			});

			// Halfway through the dfd-basics delay, something else takes the active guide slot.
			act(() => {
				vi.advanceTimersByTime(400);
			});
			act(() => {
				useOnboardingStore.getState().startGuide("stride-analysis");
			});
			act(() => {
				vi.advanceTimersByTime(400);
			});

			expect(useOnboardingStore.getState().activeGuide?.id).toBe("stride-analysis");
		});

		it.each(["completedGuideIds", "dismissedGuideIds"] as const)(
			"does not fire when dfd-basics is recorded in %s",
			(stateKey) => {
				useOnboardingStore.setState({ [stateKey]: ["dfd-basics"] });
				const startGuideSpy = spyOnStartGuide();

				renderHook(() => useOnboardingTriggers());
				act(() => {
					useModelStore.setState({ model: mockModel, filePath: null });
				});
				act(() => {
					vi.advanceTimersByTime(800);
				});

				expect(startGuideSpy).not.toHaveBeenCalled();
			},
		);
	});
});
