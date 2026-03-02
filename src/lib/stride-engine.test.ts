import { describe, expect, it } from "vitest";
import type { ThreatModel } from "@/types/threat-model";
import { analyzeStride } from "./stride-engine";

function sampleModel(): ThreatModel {
	return {
		version: "1.0",
		metadata: {
			title: "Test",
			author: "Test",
			created: "2026-01-01",
			modified: "2026-01-01",
			description: "",
		},
		elements: [
			{
				id: "web-app",
				type: "web_server",
				name: "Web Application",
				trust_zone: "internal",
				description: "",
				technologies: [],
			},
			{
				id: "db",
				type: "sql_database",
				name: "Database",
				trust_zone: "internal",
				description: "",
				technologies: ["PostgreSQL"],
			},
			{
				id: "user",
				type: "web_browser",
				name: "End User",
				trust_zone: "external",
				description: "",
				technologies: [],
			},
		],
		data_flows: [
			{
				id: "flow-1",
				name: "",
				from: "web-app",
				to: "db",
				protocol: "PostgreSQL/TLS",
				data: ["user_records"],
				authenticated: true,
			},
		],
		trust_boundaries: [
			{
				id: "boundary-1",
				name: "Internal Network",
				contains: ["web-app", "db"],
			},
		],
		threats: [],
		diagrams: [],
	};
}

describe("analyzeStride", () => {
	it("generates 6 threats for a service (web_server)", () => {
		const model = sampleModel();
		const threats = analyzeStride(model);
		const serviceThreats = threats.filter((t) => t.element === "web-app");
		expect(serviceThreats).toHaveLength(6);
	});

	it("generates 3 threats for a store (sql_database)", () => {
		const model = sampleModel();
		const threats = analyzeStride(model);
		const storeThreats = threats.filter((t) => t.element === "db");
		expect(storeThreats).toHaveLength(3);
	});

	it("generates 2 threats for an actor (web_browser)", () => {
		const model = sampleModel();
		const threats = analyzeStride(model);
		const actorThreats = threats.filter((t) => t.element === "user");
		expect(actorThreats).toHaveLength(2);
	});

	it("generates 3 threats for a data flow", () => {
		const model = sampleModel();
		const threats = analyzeStride(model);
		const flowThreats = threats.filter((t) => t.flow === "flow-1");
		expect(flowThreats).toHaveLength(3);
	});

	it("generates 14 total threats for the sample model", () => {
		const model = sampleModel();
		const threats = analyzeStride(model);
		expect(threats).toHaveLength(14);
	});

	it("skips existing threats (deduplication)", () => {
		const model = sampleModel();
		model.threats.push({
			id: "existing-1",
			title: "Existing spoofing",
			category: "Spoofing",
			element: "web-app",
			severity: "high",
			description: "",
		});

		const threats = analyzeStride(model);
		const spoofingWeb = threats.filter((t) => t.element === "web-app" && t.category === "Spoofing");
		expect(spoofingWeb).toHaveLength(0);
	});

	it("includes element name in threat titles", () => {
		const model = sampleModel();
		const threats = analyzeStride(model);
		const webThreats = threats.filter((t) => t.element === "web-app");
		for (const t of webThreats) {
			expect(t.title).toContain("Web Application");
		}
	});

	it("boosts severity for cross-boundary flows", () => {
		const model = sampleModel();
		model.data_flows.push({
			id: "flow-2",
			name: "",
			from: "web-app",
			to: "user",
			protocol: "HTTPS",
			data: ["response"],
			authenticated: false,
		});

		const threats = analyzeStride(model);
		const dosThreat = threats.find(
			(t) => t.flow === "flow-2" && t.category === "Denial of Service",
		);
		expect(dosThreat).toBeDefined();
		expect(dosThreat?.severity).toBe("high");
	});

	it("keeps base severity for same-boundary flows", () => {
		const model = sampleModel();
		const threats = analyzeStride(model);
		const dosThreat = threats.find(
			(t) => t.flow === "flow-1" && t.category === "Denial of Service",
		);
		expect(dosThreat).toBeDefined();
		expect(dosThreat?.severity).toBe("medium");
	});

	it("maps legacy process type to service category", () => {
		const model = sampleModel();
		model.elements[0].type = "process";
		const threats = analyzeStride(model);
		// "process" defaults to service category → should get 6 threats
		const processThreats = threats.filter((t) => t.element === "web-app");
		expect(processThreats).toHaveLength(6);
	});
});
