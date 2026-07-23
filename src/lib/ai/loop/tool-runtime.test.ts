import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ThreatModel } from "@/types/threat-model";
import {
	canonicalJson,
	createToolRegistry,
	defineExecutableTool,
	type ToolExecutionContext,
} from "./tool-runtime";

const emptyModel: ThreatModel = {
	version: "1.0",
	metadata: {
		title: "T",
		author: "A",
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

function context(): ToolExecutionContext {
	return { document: emptyModel, signal: new AbortController().signal };
}

const deleteThing = defineExecutableTool({
	name: "delete_thing",
	description: "Delete a thing by id.",
	input: { id: z.string().min(1) },
	effect: "mutate",
	destructive: true,
	summarize: (input) => `Delete ${input.id}`,
	execute: async (input) => ({ status: "ok", result: `deleted ${input.id}`, document: emptyModel }),
});

describe("defineExecutableTool", () => {
	it("carries the static effect and destructive classification onto the erased tool", () => {
		expect(deleteThing.effect).toBe("mutate");
		expect(deleteThing.destructive).toBe(true);
	});

	it("refuses a read-only tool that also destroys information", () => {
		expect(() =>
			defineExecutableTool({
				name: "bad",
				description: "contradiction",
				input: { id: z.string() },
				effect: "read",
				destructive: true,
				summarize: () => "",
				execute: async () => ({ status: "ok", result: "" }),
			}),
		).toThrow(/read-only and destructive/);
	});

	it("prepares valid input into a runnable call with a digest and summary", async () => {
		const result = deleteThing.prepare({ id: "web-app" });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.call.summary).toBe("Delete web-app");
		expect(result.call.inputDigest).toBe(canonicalJson({ id: "web-app" }));
		const outcome = await result.call.run(context());
		expect(outcome).toEqual({ status: "ok", result: "deleted web-app", document: emptyModel });
	});

	it("names the offending field when the model invents an extra key", () => {
		const result = deleteThing.prepare({ id: "web-app", colour: "red" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues.join(" ")).toContain("colour");
	});

	it("reports a field-level issue for a wrong type", () => {
		const result = deleteThing.prepare({ id: 42 });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues.join(" ")).toContain("id");
	});

	it("does not let run be reached from a result without narrowing ok", () => {
		const result = deleteThing.prepare({ id: "x" });
		// @ts-expect-error — `call` is unreachable until `ok` is narrowed to true.
		void result.call;
	});
});

describe("createToolRegistry", () => {
	const registry = createToolRegistry([deleteThing]);

	it("resolves an exact-match name", () => {
		expect(registry.get("delete_thing")).toBe(deleteThing);
	});

	it("does not resolve a trailing-space, case-folded, or zero-width variant", () => {
		expect(registry.get("delete_thing ")).toBeUndefined();
		expect(registry.get("DELETE_THING")).toBeUndefined();
		expect(registry.get("delete_thing​")).toBeUndefined();
	});

	it("lists tools in registration order", () => {
		expect(registry.list().map((tool) => tool.name)).toEqual(["delete_thing"]);
	});

	it("throws when two tools share a name", () => {
		expect(() => createToolRegistry([deleteThing, deleteThing])).toThrow(/Duplicate tool name/);
	});

	it("freezes the tool list so it cannot be mutated after construction", () => {
		expect(Object.isFrozen(registry.list())).toBe(true);
	});
});

describe("canonicalJson", () => {
	it("is invariant to key order", () => {
		expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
	});

	it("sorts nested object keys too", () => {
		expect(canonicalJson({ z: { b: 1, a: 2 } })).toBe('{"z":{"a":2,"b":1}}');
	});

	it("distinguishes a number from its string form", () => {
		expect(canonicalJson({ a: 2, b: 1 })).not.toBe(canonicalJson({ a: 2, b: "1" }));
	});

	it("preserves array order while sorting object keys inside elements", () => {
		expect(canonicalJson([{ b: 1, a: 2 }, "x"])).toBe('[{"a":2,"b":1},"x"]');
	});
});
