import { describe, expect, it } from "vitest";
import { AI_ASSISTANT_GUIDE, ALL_GUIDES, STRIDE_ANALYSIS_GUIDE } from "./guides";

describe("onboarding guide definitions", () => {
	it("ALL_GUIDES contains all 4 guides in a stable order", () => {
		expect(ALL_GUIDES).toHaveLength(4);
		expect(ALL_GUIDES.map((g) => g.id)).toEqual([
			"welcome",
			"dfd-basics",
			"stride-analysis",
			"ai-assistant",
		]);
	});

	it("STRIDE analysis guide has 3 steps targeting the threats tab", () => {
		expect(STRIDE_ANALYSIS_GUIDE.steps).toHaveLength(3);
		expect(STRIDE_ANALYSIS_GUIDE.steps[0].targetSelector).toContain("tab-threats");
		expect(STRIDE_ANALYSIS_GUIDE.steps[1].targetSelector).toContain("btn-stride-analyze");
	});

	it("AI assistant guide has 3 steps targeting the AI tab", () => {
		expect(AI_ASSISTANT_GUIDE.steps).toHaveLength(3);
		expect(AI_ASSISTANT_GUIDE.steps[0].targetSelector).toContain("tab-ai");
	});
});
