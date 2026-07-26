import { describe, expect, it } from "vitest";
import { autoGrantReadOnly } from "@/lib/ai/loop/authorization";
import { GRAPH_ACTION_TOOLS } from "@/lib/ai/tools/graph-action-tools";
import { createAiToolRegistry, READ_TOOLS } from "@/lib/ai/tools/tool-registry";

describe("createAiToolRegistry", () => {
	it("offers the four read tools followed by the twelve mutation tools, all uniquely named", () => {
		const tools = createAiToolRegistry().list();
		expect(tools).toHaveLength(16);

		const names = tools.map((tool) => tool.name);
		expect(new Set(names).size).toBe(16);
		// Read tools lead the advertised list.
		expect(names.slice(0, READ_TOOLS.length)).toEqual(READ_TOOLS.map((tool) => tool.name));
	});

	it("classifies exactly the four read tools as read and the twelve legacy tools as mutate", () => {
		const tools = createAiToolRegistry().list();
		const readNames = tools.filter((tool) => tool.effect === "read").map((tool) => tool.name);
		const mutateNames = tools.filter((tool) => tool.effect === "mutate").map((tool) => tool.name);

		expect(readNames).toEqual(READ_TOOLS.map((tool) => tool.name));
		expect(readNames).toHaveLength(4);
		expect(mutateNames).toHaveLength(12);
		expect(mutateNames.sort()).toEqual(GRAPH_ACTION_TOOLS.map((tool) => tool.name).sort());
	});

	it("marks every read tool non-destructive", () => {
		for (const tool of READ_TOOLS) {
			expect(tool.effect).toBe("read");
			expect(tool.destructive).toBe(false);
		}
	});

	it("auto-grants each read tool but still refuses every mutating tool", () => {
		const target = { callId: "c1", inputDigest: "d1" };
		for (const tool of READ_TOOLS) {
			expect(autoGrantReadOnly(tool, target, 0)).toMatchObject({
				scope: "auto",
				toolName: tool.name,
			});
		}
		for (const tool of GRAPH_ACTION_TOOLS) {
			expect(() => autoGrantReadOnly(tool, target, 0)).toThrow();
		}
	});
});
