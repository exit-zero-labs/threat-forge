import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LEGACY_ACTION_TOOLS, parseLegacyAction } from "./actions";

/** The smallest payload each action accepts, keyed by tool name. */
const MINIMAL_PAYLOADS: Record<string, unknown> = {
	add_element: { action: "add_element", element: { type: "process", name: "Auth" } },
	update_element: { action: "update_element", id: "api-gw", updates: { name: "Gateway" } },
	delete_element: { action: "delete_element", id: "api-gw" },
	add_data_flow: { action: "add_data_flow", data_flow: { from: "a", to: "b" } },
	update_data_flow: { action: "update_data_flow", id: "f1", updates: { protocol: "HTTPS" } },
	delete_data_flow: { action: "delete_data_flow", id: "f1" },
	add_trust_boundary: { action: "add_trust_boundary", trust_boundary: { name: "DMZ" } },
	update_trust_boundary: { action: "update_trust_boundary", id: "tb1", updates: { name: "DMZ" } },
	delete_trust_boundary: { action: "delete_trust_boundary", id: "tb1" },
	add_threat: {
		action: "add_threat",
		threat: {
			title: "SQL Injection",
			category: "Tampering",
			severity: "high",
			description: "Risk",
		},
	},
	update_threat: { action: "update_threat", id: "t1", updates: { title: "Renamed" } },
	delete_threat: { action: "delete_threat", id: "t1" },
};

describe("legacy action registry", () => {
	it("registers the twelve actions the system prompt advertises", () => {
		expect(LEGACY_ACTION_TOOLS.map((tool) => tool.name)).toEqual([
			"add_element",
			"update_element",
			"delete_element",
			"add_data_flow",
			"update_data_flow",
			"delete_data_flow",
			"add_trust_boundary",
			"update_trust_boundary",
			"delete_trust_boundary",
			"add_threat",
			"update_threat",
			"delete_threat",
		]);
	});

	it("routes every registered tool through the shared action parser", () => {
		// A tool added to the registry but left out of the discriminated union
		// would advertise itself to the model and then be rejected on arrival.
		for (const tool of LEGACY_ACTION_TOOLS) {
			const payload = MINIMAL_PAYLOADS[tool.name];
			expect(payload, `no minimal payload for ${tool.name}`).toBeDefined();

			const viaTool = tool.parseInput(payload);
			const viaUnion = parseLegacyAction(payload);
			expect(viaTool.ok, `${tool.name} rejected by its own schema`).toBe(true);
			expect(viaUnion.ok, `${tool.name} rejected by the action union`).toBe(true);
		}
	});

	it("gives every tool a model-facing description", () => {
		for (const tool of LEGACY_ACTION_TOOLS) {
			expect(tool.description.length, `${tool.name} has no description`).toBeGreaterThan(0);
		}
	});

	it("emits a closed object schema for every tool", () => {
		for (const tool of LEGACY_ACTION_TOOLS) {
			const schema = tool.jsonSchema();
			expect(schema.type, tool.name).toBe("object");
			expect(schema.additionalProperties, tool.name).toBe(false);
			expect(Object.keys(schema.properties).length, tool.name).toBeGreaterThan(0);
			expect(schema.required, tool.name).toContain("action");
		}
	});
});

describe("generated JSON Schema", () => {
	function schemaFor(name: string) {
		const tool = LEGACY_ACTION_TOOLS.find((candidate) => candidate.name === name);
		if (!tool) throw new Error(`no tool named ${name}`);
		return tool.jsonSchema();
	}

	it("describes add_element with its required fields and field documentation", () => {
		const schema = schemaFor("add_element");
		expect(schema.required).toEqual(["action", "element"]);
		expect(schema.properties.element).toMatchObject({
			type: "object",
			additionalProperties: false,
			required: ["type", "name"],
			properties: {
				type: {
					type: "string",
					minLength: 1,
					description: 'One of "process", "data_store", "external_entity", or "text".',
				},
				position: {
					type: "object",
					required: ["x", "y"],
					description: "Canvas position in pixels; x grows right and y grows down.",
				},
			},
		});
	});

	it("advertises the STRIDE categories as an enum rather than a free string", () => {
		expect(schemaFor("add_threat").properties.threat).toMatchObject({
			properties: {
				category: {
					enum: [
						"Spoofing",
						"Tampering",
						"Repudiation",
						"Information Disclosure",
						"Denial of Service",
						"Elevation of Privilege",
					],
				},
			},
		});
	});

	it("advertises every writable element field on update_element", () => {
		const updates = schemaFor("update_element").properties.updates;
		expect(updates).toMatchObject({ type: "object", additionalProperties: false });

		// `id` is the one field an update may never write; every other schema
		// field stays writable, and this list is what proves it.
		const { properties } = z
			.object({ properties: z.record(z.string(), z.unknown()) })
			.parse(updates);
		expect(Object.keys(properties)).toEqual([
			"name",
			"type",
			"trust_zone",
			"subtype",
			"icon",
			"description",
			"technologies",
			"stores",
			"encryption",
			"layer",
			"group",
			"tags",
			"position",
			"fill_color",
			"stroke_color",
			"fill_opacity",
			"stroke_opacity",
			"font_size",
			"font_weight",
		]);
	});
});

describe("severity acceptance", () => {
	it("accepts non-canonical casing and keeps the model's spelling", () => {
		const result = parseLegacyAction({
			action: "add_threat",
			threat: {
				title: "Credential stuffing",
				category: "Spoofing",
				severity: "High",
				description: "Risk",
			},
		});
		expect(result.ok).toBe(true);
		if (!result.ok || result.value.action !== "add_threat") throw new Error("expected add_threat");
		expect(result.value.threat.severity).toBe("High");
	});

	it("rejects a severity outside the enum", () => {
		const result = parseLegacyAction({
			action: "add_threat",
			threat: {
				title: "Credential stuffing",
				category: "Spoofing",
				severity: "extreme",
				description: "Risk",
			},
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues.join(" ")).toContain("threat.severity");
	});

	it("rejects an inherited object key that survives lowercasing", () => {
		// An `in` lookup against a severity object literal would answer true for
		// "constructor", and lowercasing does not change it.
		for (const severity of ["constructor", "Constructor", "valueOf"]) {
			const result = parseLegacyAction({
				action: "update_threat",
				id: "t1",
				updates: { severity },
			});
			expect(result.ok, `${severity} must not be a severity`).toBe(false);
		}
	});
});

describe("parseLegacyAction issues", () => {
	it("names the unknown action rather than reporting twelve unrelated failures", () => {
		const result = parseLegacyAction({ action: "drop_database", id: "x" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]).toContain("action");
	});
});
