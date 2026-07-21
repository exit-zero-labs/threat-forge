import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "./tools";

const sampleTool = defineTool({
	name: "add_widget",
	description: "Add a widget.",
	input: {
		name: z.string().min(1).describe("Human-readable widget name."),
		size: z.strictObject({ width: z.number(), height: z.number() }).optional(),
		tags: z.array(z.string()).optional(),
	},
});

describe("defineTool.jsonSchema", () => {
	it("emits an object schema that forbids model-invented keys", () => {
		const schema = sampleTool.jsonSchema();
		expect(schema.type).toBe("object");
		expect(schema.additionalProperties).toBe(false);
		expect(schema.required).toEqual(["name"]);
	});

	it("carries field descriptions through to the provider payload", () => {
		expect(sampleTool.jsonSchema().properties).toMatchObject({
			name: { type: "string", minLength: 1, description: "Human-readable widget name." },
			tags: { type: "array", items: { type: "string" } },
		});
	});

	it("forbids invented keys on nested objects too", () => {
		expect(sampleTool.jsonSchema().properties).toMatchObject({
			size: { type: "object", additionalProperties: false, required: ["width", "height"] },
		});
	});

	it("omits `required` when every field is optional", () => {
		const optionalOnly = defineTool({
			name: "ping",
			description: "No required input.",
			input: { note: z.string().optional() },
		});
		expect(optionalOnly.jsonSchema().required).toBeUndefined();
	});

	it("does not leak the `$schema` dialect key that neither provider consumes", () => {
		expect(Object.keys(sampleTool.jsonSchema())).toEqual([
			"type",
			"properties",
			"required",
			"additionalProperties",
		]);
	});
});

describe("defineTool.parseInput", () => {
	it("returns the typed value for valid input", () => {
		const result = sampleTool.parseInput({ name: "Gateway", tags: ["edge"] });
		expect(result).toEqual({ ok: true, value: { name: "Gateway", tags: ["edge"] } });
	});

	it("reports a path-prefixed issue for a wrong field type", () => {
		const result = sampleTool.parseInput({ name: "Gateway", size: { width: "wide", height: 2 } });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]).toContain("size.width");
	});

	it("reports the offending key when the model invents a field", () => {
		const result = sampleTool.parseInput({ name: "Gateway", colour: "red" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues.join(" ")).toContain("colour");
	});

	it("rejects a non-object input rather than coercing it", () => {
		expect(sampleTool.parseInput("Gateway").ok).toBe(false);
		expect(sampleTool.parseInput(["Gateway"]).ok).toBe(false);
		expect(sampleTool.parseInput(null).ok).toBe(false);
	});

	it("rejects a `__proto__` key that Zod would silently discard", () => {
		// `JSON.parse` gives `__proto__` as a real own property, and Zod's strict
		// check skips that key by name — so the schema alone reports success with
		// the key dropped. Dropping is the wrong outcome: the caller would apply a
		// mutation that differs from what the model asked for. The control
		// assertion below fails if Zod ever starts rejecting it, at which point
		// the extra walk can go.
		const payload: unknown = JSON.parse('{ "name": "Gateway", "__proto__": { "polluted": true } }');

		const zodAlone = sampleTool.inputSchema.safeParse(payload);
		expect(zodAlone.success).toBe(true);

		const result = sampleTool.parseInput(payload);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues).toEqual(['__proto__: "__proto__" is not an accepted key']);
	});

	it("rejects a `__proto__` key nested inside an accepted field", () => {
		const payload: unknown = JSON.parse(
			'{ "name": "Gateway", "size": { "width": 1, "height": 2, "__proto__": {} } }',
		);
		const result = sampleTool.parseInput(payload);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues[0]).toContain("size.__proto__");
	});

	it("rejects a `__proto__` key nested inside an array element", () => {
		const payload: unknown = JSON.parse('{ "name": "Gateway", "tags": [{ "__proto__": {} }] }');
		const result = sampleTool.parseInput(payload);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues[0]).toContain("tags[0].__proto__");
	});

	it("does not overflow the stack on deeply nested model output", () => {
		const depth = 20000;
		const payload: unknown = JSON.parse(
			`{ "name": "Gateway", "tags": ${"[".repeat(depth)}${"]".repeat(depth)} }`,
		);
		expect(sampleTool.parseInput(payload).ok).toBe(false);
	});
});
