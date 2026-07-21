import { describe, expect, it } from "vitest";
import { LEGACY_ACTION_TOOLS } from "@/lib/ai/schemas/actions";
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

const NO_TOOLS = { tools: [] } as const;

describe("buildSystemPrompt", () => {
	it("includes STRIDE methodology and model metadata", () => {
		const prompt = buildSystemPrompt(emptyModel(), NO_TOOLS);

		expect(prompt).toContain("STRIDE");
		expect(prompt).toContain("Test Model");
		expect(prompt).toContain("Test Author");
		expect(prompt).toContain("```threats");
		expect(prompt).toContain("--- CURRENT THREAT MODEL ---");
		expect(prompt).toContain("--- END THREAT MODEL ---");
	});

	it("omits sections for empty model", () => {
		const prompt = buildSystemPrompt(emptyModel(), NO_TOOLS);

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

		const prompt = buildSystemPrompt(model, NO_TOOLS);

		expect(prompt).toContain("Elements:");
		expect(prompt).toContain("API Gateway");
		expect(prompt).toContain("api-gw");
		expect(prompt).toContain("dmz");
		expect(prompt).toContain("nginx");
		expect(prompt).toContain("Main entry point");
	});

	it("includes response format instructions", () => {
		const prompt = buildSystemPrompt(emptyModel(), NO_TOOLS);

		expect(prompt).toContain("<response>");
		expect(prompt).toContain("Do NOT narrate");
	});

	it("includes data flows when present", () => {
		const model = emptyModel();
		model.data_flows.push({
			id: "flow-1",
			name: "",
			from: "web-app",
			to: "api-gw",
			protocol: "HTTPS",
			data: ["user_input"],
			authenticated: true,
		});

		const prompt = buildSystemPrompt(model, NO_TOOLS);

		expect(prompt).toContain("Data Flows:");
		expect(prompt).toContain("web-app -> api-gw");
		expect(prompt).toContain("HTTPS");
		expect(prompt).toContain("authenticated: true");
	});

	it("emits the fenced actions instructions only when no tools are offered", () => {
		// This single split is what makes #64's removal mechanical: native tools
		// replace the fenced path, so the ` ```actions ` instructions must vanish
		// exactly when a non-empty tool list is passed.
		const fenced = buildSystemPrompt(emptyModel(), { tools: [] });
		expect(fenced).toContain("```actions");

		const withTools = buildSystemPrompt(emptyModel(), {
			tools: [{ name: "add_element", description: "Add an element." }],
		});
		expect(withTools).not.toContain("```actions");
	});

	it("generates the supported-action catalogue from the tool registry", () => {
		// The prompt cannot advertise an action the validator would reject, because
		// both read the same registry.
		const prompt = buildSystemPrompt(emptyModel(), { tools: [] });
		const catalogue = LEGACY_ACTION_TOOLS.map((tool) => tool.name).join(", ");
		expect(prompt).toContain(`Supported actions: ${catalogue}.`);
	});
});
