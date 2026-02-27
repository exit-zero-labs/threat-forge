import { describe, expect, it } from "vitest";
import type { ThreatModel } from "@/types/threat-model";
import { buildSystemPrompt } from "./ai-prompt";

function emptyModel(): ThreatModel {
	return {
		version: "1.0",
		metadata: {
			title: "Test Model",
			author: "Test Author",
			created: "2026-01-01",
			modified: "2026-01-01",
			description: "",
		},
		elements: [],
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [],
	};
}

describe("buildSystemPrompt", () => {
	it("includes STRIDE methodology and model metadata", () => {
		const prompt = buildSystemPrompt(emptyModel());

		expect(prompt).toContain("STRIDE");
		expect(prompt).toContain("Test Model");
		expect(prompt).toContain("Test Author");
		expect(prompt).toContain("```threats");
		expect(prompt).toContain("--- CURRENT THREAT MODEL ---");
		expect(prompt).toContain("--- END THREAT MODEL ---");
	});

	it("omits sections for empty model", () => {
		const prompt = buildSystemPrompt(emptyModel());

		expect(prompt).not.toContain("Elements:");
		expect(prompt).not.toContain("Data Flows:");
	});

	it("includes elements when present", () => {
		const model = emptyModel();
		model.metadata.title = "Payment Service";
		model.metadata.author = "Alice";
		model.elements.push({
			id: "api-gw",
			type: "process",
			name: "API Gateway",
			trust_zone: "dmz",
			description: "Main entry point",
			technologies: ["nginx"],
		});

		const prompt = buildSystemPrompt(model);

		expect(prompt).toContain("Elements:");
		expect(prompt).toContain("API Gateway");
		expect(prompt).toContain("api-gw");
		expect(prompt).toContain("dmz");
		expect(prompt).toContain("nginx");
		expect(prompt).toContain("Main entry point");
	});

	it("includes data flows when present", () => {
		const model = emptyModel();
		model.data_flows.push({
			id: "flow-1",
			from: "web-app",
			to: "api-gw",
			protocol: "HTTPS",
			data: ["user_input"],
			authenticated: true,
		});

		const prompt = buildSystemPrompt(model);

		expect(prompt).toContain("Data Flows:");
		expect(prompt).toContain("web-app -> api-gw");
		expect(prompt).toContain("HTTPS");
		expect(prompt).toContain("authenticated: true");
	});
});
