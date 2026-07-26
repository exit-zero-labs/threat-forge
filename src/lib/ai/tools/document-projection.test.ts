import { describe, expect, it } from "vitest";
import type { ThreatModel } from "@/types/threat-model";
import {
	applicableFilters,
	countEntities,
	DOCUMENT_SECTIONS,
	filterCompactEntities,
	firstInapplicableFilter,
	getFullEntity,
} from "./document-projection";

function richModel(overrides: Partial<ThreatModel> = {}): ThreatModel {
	return {
		version: "1.0",
		metadata: {
			title: "T",
			author: "A",
			created: "2026-01-01",
			modified: "2026-01-01",
			description: "",
		},
		layers: [{ id: "L1", name: "Edge", description: "the edge layer" }],
		groups: [{ id: "G1", name: "Payments", type: "service", description: "payments group" }],
		elements: [
			{
				id: "web-app",
				type: "process",
				name: "Web App",
				trust_zone: "internal",
				layer: "L1",
				group: "G1",
				subtype: "spa",
				icon: "react",
				encryption: "tls",
				description: "the web front end",
				technologies: ["react", "vite"],
				tags: ["frontend"],
				stores: ["session"],
				// Layout fields that must never be projected.
				position: { x: 10, y: 20 },
				fill_color: "#fff",
				stroke_color: "#000",
				font_size: 12,
			},
			{
				id: "db",
				type: "sql_database",
				name: "DB",
				trust_zone: "restricted",
				description: "",
				technologies: [],
			},
		],
		data_flows: [
			{
				id: "f-in",
				name: "request",
				from: "db",
				to: "web-app",
				protocol: "HTTPS",
				data: ["query"],
				authenticated: true,
			},
			{
				id: "f-out",
				name: "response",
				from: "web-app",
				to: "db",
				protocol: "TCP",
				data: ["rows"],
				authenticated: false,
			},
		],
		trust_boundaries: [{ id: "tb1", name: "Internal", contains: ["web-app", "db"] }],
		relationships: [{ id: "r1", type: "depends_on", from: "web-app", to: "db" }],
		threats: [
			{
				id: "t1",
				title: "Spoof",
				category: "Spoofing",
				severity: "high",
				element: "web-app",
				description: "spoofing risk",
			},
			{
				id: "t2",
				title: "Tamper",
				category: "Tampering",
				severity: "critical",
				flow: "f-out",
				description: "tamper risk",
				mitigation: { status: "mitigated", description: "signed" },
			},
		],
		diagrams: [{ id: "d1", name: "Architecture", kind: "architecture" }],
		...overrides,
	};
}

describe("compact projection", () => {
	it("projects exactly the compact element fields and no layout or style key", () => {
		const [projected] = filterCompactEntities(richModel(), "elements", {
			references: "L1",
		});
		expect(Object.keys(projected).sort()).toEqual(
			["group", "id", "layer", "name", "trust_zone", "type"].sort(),
		);
		for (const forbidden of ["position", "fill_color", "stroke_color", "font_size"]) {
			expect(projected).not.toHaveProperty(forbidden);
		}
	});

	it("projects an unmitigated threat's status as the explicit string 'none'", () => {
		const matches = filterCompactEntities(richModel(), "threats", {});
		const t1 = matches.find((threat) => threat.id === "t1");
		expect(t1?.mitigation_status).toBe("none");
	});
});

describe("full projection derived reference lists", () => {
	it("derives incoming/outgoing flows, boundaries, and threats for an element", () => {
		const full = getFullEntity(richModel(), "elements", "web-app");
		expect(full?.incoming_flow_ids).toEqual(["f-in"]);
		expect(full?.outgoing_flow_ids).toEqual(["f-out"]);
		expect(full?.trust_boundary_ids).toEqual(["tb1"]);
		expect(full?.threat_ids).toEqual(["t1"]);
	});

	it("excludes every layout/style field from the full element projection", () => {
		const full = getFullEntity(richModel(), "elements", "web-app");
		for (const forbidden of [
			"position",
			"fill_color",
			"stroke_color",
			"fill_opacity",
			"stroke_opacity",
			"font_size",
			"font_weight",
		]) {
			expect(full).not.toHaveProperty(forbidden);
		}
	});

	it("caps a 40-item list at 10 items and reports the true total", () => {
		const model = richModel();
		model.elements[0].technologies = Array.from({ length: 40 }, (_, i) => `tech-${i}`);
		const full = getFullEntity(model, "elements", "web-app");
		expect(full?.technologies).toHaveLength(10);
		expect(full?.technologies_total).toBe(40);
	});

	it("returns undefined for a missing id", () => {
		expect(getFullEntity(richModel(), "elements", "ghost")).toBeUndefined();
	});

	it("returns undefined for a kind whose optional section is absent", () => {
		const model = richModel({ layers: undefined });
		expect(getFullEntity(model, "layers", "L1")).toBeUndefined();
		expect(countEntities(model, "layers")).toBe(0);
	});
});

describe("references filter", () => {
	it("returns entities that point at an id, never the id's own element", () => {
		const model = richModel();
		// The element web-app is not returned by references: "web-app" — it is
		// referenced by others, it does not reference itself.
		expect(filterCompactEntities(model, "elements", { references: "web-app" })).toEqual([]);
		expect(
			filterCompactEntities(model, "data_flows", { references: "web-app" }).map((f) => f.id),
		).toEqual(["f-in", "f-out"]);
		expect(
			filterCompactEntities(model, "trust_boundaries", { references: "web-app" }).map((b) => b.id),
		).toEqual(["tb1"]);
		expect(
			filterCompactEntities(model, "threats", { references: "web-app" }).map((t) => t.id),
		).toEqual(["t1"]);
		expect(
			filterCompactEntities(model, "relationships", { references: "web-app" }).map((r) => r.id),
		).toEqual(["r1"]);
	});
});

describe("filter combination and document order", () => {
	it("combines filters with AND", () => {
		const model = richModel();
		expect(
			filterCompactEntities(model, "threats", { severity: "critical", category: "Spoofing" }),
		).toEqual([]);
		expect(
			filterCompactEntities(model, "threats", { severity: "high", category: "Spoofing" }).map(
				(t) => t.id,
			),
		).toEqual(["t1"]);
	});

	it("matches protocol case-insensitively but exactly", () => {
		const model = richModel();
		expect(
			filterCompactEntities(model, "data_flows", { protocol: "https" }).map((f) => f.id),
		).toEqual(["f-in"]);
		expect(filterCompactEntities(model, "data_flows", { protocol: "http" })).toEqual([]);
	});

	it("matches a text filter case-insensitively across the section's fields", () => {
		const model = richModel();
		expect(filterCompactEntities(model, "elements", { text: "FRONT" }).map((e) => e.id)).toEqual([
			"web-app",
		]);
	});

	it("preserves document order", () => {
		const model = richModel();
		expect(filterCompactEntities(model, "data_flows", {}).map((f) => f.id)).toEqual([
			"f-in",
			"f-out",
		]);
	});
});

describe("filter applicability table", () => {
	it("lists the applicable filters per kind in canonical order", () => {
		expect(applicableFilters("elements")).toEqual([
			"text",
			"references",
			"element_type",
			"trust_zone",
		]);
		expect(applicableFilters("data_flows")).toEqual([
			"text",
			"references",
			"protocol",
			"authenticated",
		]);
		expect(applicableFilters("threats")).toEqual([
			"text",
			"references",
			"severity",
			"category",
			"mitigation_status",
		]);
		expect(applicableFilters("layers")).toEqual(["text"]);
		expect(applicableFilters("diagrams")).toEqual(["text"]);
	});

	it("reports the first inapplicable filter in canonical order", () => {
		// severity does not apply to elements; references does.
		expect(firstInapplicableFilter("elements", { references: "L1", severity: "high" })).toBe(
			"severity",
		);
		expect(firstInapplicableFilter("elements", { references: "L1" })).toBeNull();
		// When two inapplicable filters are set, the earlier one in canonical order wins.
		expect(firstInapplicableFilter("layers", { references: "x", severity: "high" })).toBe(
			"references",
		);
	});
});

describe("section coverage", () => {
	it("exposes ops for all eight document sections", () => {
		expect(DOCUMENT_SECTIONS).toHaveLength(8);
		const model = richModel();
		for (const kind of DOCUMENT_SECTIONS) {
			// Every section can be counted and searched without throwing.
			expect(typeof countEntities(model, kind)).toBe("number");
			expect(Array.isArray(filterCompactEntities(model, kind, {}))).toBe(true);
		}
	});
});
