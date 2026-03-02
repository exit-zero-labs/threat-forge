import { describe, expect, it } from "vitest";
import type { ThreatModel } from "@/types/threat-model";
import { generateHtmlReport } from "./export-html";

function makeModel(overrides: Partial<ThreatModel> = {}): ThreatModel {
	return {
		version: "1.0",
		metadata: {
			title: "Test Model",
			author: "Tester",
			created: "2026-01-01",
			modified: "2026-01-02",
			description: "A test description",
		},
		elements: [
			{
				id: "web-app",
				type: "process",
				name: "Web Application",
				trust_zone: "internal",
				description: "Frontend app",
				technologies: ["React", "TypeScript"],
				position: { x: 100, y: 200 },
			},
			{
				id: "api-gw",
				type: "process",
				name: "API Gateway",
				trust_zone: "dmz",
				description: "Gateway",
				technologies: ["nginx"],
				position: { x: 400, y: 200 },
			},
			{
				id: "ext-api",
				type: "external_entity",
				name: "External API",
				trust_zone: "external",
				description: "Third party",
				technologies: [],
				position: { x: 700, y: 200 },
			},
		],
		data_flows: [
			{
				id: "flow-1",
				flow_number: 1,
				name: "User Request",
				from: "web-app",
				to: "api-gw",
				protocol: "HTTPS",
				data: ["user_input"],
				authenticated: true,
			},
			{
				id: "flow-2",
				name: "API Call",
				from: "api-gw",
				to: "ext-api",
				protocol: "HTTPS",
				data: ["payload"],
				authenticated: false,
			},
		],
		trust_boundaries: [
			{
				id: "boundary-1",
				name: "Internal Network",
				contains: ["web-app", "api-gw"],
				position: { x: 50, y: 150 },
				size: { width: 500, height: 200 },
			},
		],
		threats: [
			{
				id: "threat-1",
				title: "SQL Injection",
				category: "Tampering",
				element: "api-gw",
				severity: "high",
				description: "SQL injection risk",
				mitigation: { status: "mitigated", description: "Parameterized queries" },
			},
			{
				id: "threat-2",
				title: "Spoofing Attack",
				category: "Spoofing",
				element: "ext-api",
				severity: "medium",
				description: "Spoofing risk",
			},
		],
		diagrams: [{ id: "main-dfd", name: "Level 0 DFD" }],
		...overrides,
	};
}

describe("generateHtmlReport", () => {
	it("produces valid HTML with doctype", () => {
		const html = generateHtmlReport(makeModel());
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("</html>");
	});

	it("includes model title and metadata", () => {
		const html = generateHtmlReport(makeModel());
		expect(html).toContain("Test Model");
		expect(html).toContain("Tester");
		expect(html).toContain("2026-01-01");
		expect(html).toContain("A test description");
	});

	it("includes navigation anchors", () => {
		const html = generateHtmlReport(makeModel());
		expect(html).toContain('href="#diagram"');
		expect(html).toContain('href="#threats"');
		expect(html).toContain('href="#elements"');
		expect(html).toContain('href="#flows"');
		expect(html).toContain('href="#boundaries"');
	});

	it("renders element inventory", () => {
		const html = generateHtmlReport(makeModel());
		expect(html).toContain("Web Application");
		expect(html).toContain("API Gateway");
		expect(html).toContain("External API");
	});

	it("renders data flow inventory with flow numbers", () => {
		const html = generateHtmlReport(makeModel());
		expect(html).toContain("User Request");
		expect(html).toContain("#1");
		expect(html).toContain("HTTPS");
	});

	it("renders threats sorted by severity", () => {
		const html = generateHtmlReport(makeModel());
		expect(html).toContain("SQL Injection");
		expect(html).toContain("Spoofing Attack");
		expect(html).toContain("high");
		expect(html).toContain("medium");
	});

	it("renders trust boundaries", () => {
		const html = generateHtmlReport(makeModel());
		expect(html).toContain("Internal Network");
	});

	it("renders summary stats", () => {
		const html = generateHtmlReport(makeModel());
		// 3 elements, 2 flows, 1 boundary, 2 threats, 1 mitigated, 50% coverage
		expect(html).toContain("Elements");
		expect(html).toContain("Data Flows");
		expect(html).toContain("Boundaries");
		expect(html).toContain("Mitigated");
		expect(html).toContain("50%");
	});

	it("renders STRIDE categories", () => {
		const html = generateHtmlReport(makeModel());
		expect(html).toContain("Tampering");
		expect(html).toContain("Spoofing");
	});

	it("renders diagram with positioned elements", () => {
		const html = generateHtmlReport(makeModel());
		expect(html).toContain("dg-element");
		expect(html).toContain("dg-boundary");
		expect(html).toContain("dg-flow-line");
	});

	it("escapes HTML in user content", () => {
		const html = generateHtmlReport(
			makeModel({
				metadata: {
					title: '<script>alert("xss")</script>',
					author: "Test",
					created: "2026-01-01",
					modified: "2026-01-01",
					description: "",
				},
			}),
		);
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
	});

	it("handles empty model gracefully", () => {
		const html = generateHtmlReport(
			makeModel({
				elements: [],
				data_flows: [],
				trust_boundaries: [],
				threats: [],
			}),
		);
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("No threats identified");
		expect(html).toContain("No elements defined");
	});

	it("includes print media styles", () => {
		const html = generateHtmlReport(makeModel());
		expect(html).toContain("@media print");
	});
});
