import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEGACY_ACTION_TOOLS } from "@/lib/ai/schemas/actions";
import { useModelStore } from "@/stores/model-store";
import type { ThreatModel } from "@/types/threat-model";
import { createGraphToolRegistry, GRAPH_ACTION_TOOLS } from "./graph-action-tools";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const model: ThreatModel = {
	version: "1.0",
	metadata: {
		title: "T",
		author: "A",
		created: "2026-01-01",
		modified: "2026-01-01",
		description: "",
	},
	elements: [
		{
			id: "web-app",
			type: "process",
			name: "Web App",
			trust_zone: "internal",
			description: "",
			technologies: [],
		},
		{
			id: "api-gw",
			type: "process",
			name: "API GW",
			trust_zone: "dmz",
			description: "",
			technologies: [],
		},
	],
	data_flows: [
		{
			id: "flow-1",
			flow_number: 1,
			name: "req",
			from: "web-app",
			to: "api-gw",
			protocol: "HTTPS",
			data: [],
			authenticated: true,
		},
	],
	trust_boundaries: [{ id: "tb-1", name: "Internal", contains: ["web-app"] }],
	threats: [
		{ id: "threat-1", title: "Spoof", category: "Spoofing", severity: "high", description: "d" },
	],
	diagrams: [],
};

/** One valid input per tool, so every tool can be prepared and run. */
const VALID_INPUT: Record<string, unknown> = {
	add_element: { action: "add_element", element: { type: "process", name: "New" } },
	update_element: { action: "update_element", id: "web-app", updates: { description: "x" } },
	delete_element: { action: "delete_element", id: "web-app" },
	add_data_flow: { action: "add_data_flow", data_flow: { from: "web-app", to: "api-gw" } },
	update_data_flow: { action: "update_data_flow", id: "flow-1", updates: { protocol: "gRPC" } },
	delete_data_flow: { action: "delete_data_flow", id: "flow-1" },
	add_trust_boundary: { action: "add_trust_boundary", trust_boundary: { name: "DMZ" } },
	update_trust_boundary: { action: "update_trust_boundary", id: "tb-1", updates: { name: "R" } },
	delete_trust_boundary: { action: "delete_trust_boundary", id: "tb-1" },
	add_threat: {
		action: "add_threat",
		threat: { title: "X", category: "Tampering", severity: "low", description: "d" },
	},
	update_threat: { action: "update_threat", id: "threat-1", updates: { title: "Renamed" } },
	delete_threat: { action: "delete_threat", id: "threat-1" },
};

const ctx = () => ({
	document: useModelStore.getState().model as ThreatModel,
	signal: new AbortController().signal,
});

beforeEach(() => {
	useModelStore.getState().clearModel();
	useModelStore.getState().setModel(model, null);
});

describe("the graph action registry", () => {
	it("advertises exactly the twelve legacy action names", () => {
		expect(GRAPH_ACTION_TOOLS.map((t) => t.name)).toEqual(LEGACY_ACTION_TOOLS.map((t) => t.name));
	});

	it("resolves each tool by exact name from the registry", () => {
		const registry = createGraphToolRegistry();
		for (const tool of LEGACY_ACTION_TOOLS) {
			expect(registry.get(tool.name)?.name).toBe(tool.name);
		}
		expect(registry.list()).toHaveLength(12);
	});

	it("marks the four delete tools destructive and the other eight not", () => {
		for (const tool of GRAPH_ACTION_TOOLS) {
			expect(tool.effect).toBe("mutate");
			const shouldBeDestructive = tool.name.startsWith("delete_");
			expect(tool.destructive).toBe(shouldBeDestructive);
		}
	});
});

describe("running a tool computes without committing", () => {
	it("leaves the model store untouched for every one of the twelve tools", async () => {
		const before = useModelStore.getState().model;
		for (const tool of GRAPH_ACTION_TOOLS) {
			const prepared = tool.prepare(VALID_INPUT[tool.name]);
			expect(prepared.ok).toBe(true);
			if (!prepared.ok) continue;
			const outcome = await prepared.call.run(ctx());
			expect(outcome.status).toBe("ok");
			// The tool returned a new document — but never wrote it to the store.
			expect(useModelStore.getState().model).toBe(before);
		}
	});

	it("returns an ok outcome carrying a changed document", async () => {
		const tool = createGraphToolRegistry().get("add_element");
		const prepared = tool?.prepare(VALID_INPUT.add_element);
		expect(prepared?.ok).toBe(true);
		if (!prepared?.ok) return;
		const outcome = await prepared.call.run(ctx());
		expect(outcome.status).toBe("ok");
		if (outcome.status !== "ok") return;
		expect(outcome.document?.elements.some((e) => e.name === "New")).toBe(true);
	});

	it("returns an error naming the unresolved id when applyAction fails", async () => {
		const tool = createGraphToolRegistry().get("delete_element");
		const prepared = tool?.prepare({ action: "delete_element", id: "ghost" });
		expect(prepared?.ok).toBe(true);
		if (!prepared?.ok) return;
		const outcome = await prepared.call.run(ctx());
		expect(outcome.status).toBe("error");
		expect(outcome.result).toContain("ghost");
	});

	it("rejects invalid input at prepare with a field-level issue", () => {
		const tool = createGraphToolRegistry().get("add_element");
		const prepared = tool?.prepare({ action: "add_element", element: { type: "process" } });
		expect(prepared?.ok).toBe(false);
		if (prepared?.ok !== false) return;
		expect(prepared.issues.join(" ")).toContain("name");
	});
});
