import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiAction } from "@/lib/ai-actions";
import { useHistoryStore } from "@/stores/history-store";
import { useModelStore } from "@/stores/model-store";
import type { ThreatModel } from "@/types/threat-model";
import { executeActions, executeSingleAction, sortActionsByDependency } from "./ai-action-executor";

vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

const mockModel: ThreatModel = {
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
			type: "process",
			name: "Web App",
			trust_zone: "internal",
			description: "",
			technologies: [],
		},
		{
			id: "api-gw",
			type: "process",
			name: "API Gateway",
			trust_zone: "dmz",
			description: "",
			technologies: [],
		},
	],
	data_flows: [],
	trust_boundaries: [],
	threats: [],
	diagrams: [],
};

beforeEach(() => {
	useModelStore.getState().clearModel();
	useHistoryStore.getState().clear();
});

describe("sortActionsByDependency", () => {
	it("places add_element before add_data_flow", () => {
		const actions: AiAction[] = [
			{
				action: "add_data_flow",
				data_flow: { from: "web-app", to: "new-svc", protocol: "HTTPS", data: [] },
			},
			{
				action: "add_element",
				element: { type: "process", name: "New Service" },
			},
		];
		const sorted = sortActionsByDependency(actions);
		expect(sorted[0].action).toBe("add_element");
		expect(sorted[1].action).toBe("add_data_flow");
	});

	it("places updates after adds", () => {
		const actions: AiAction[] = [
			{ action: "update_element", id: "web-app", updates: { name: "Updated" } },
			{
				action: "add_element",
				element: { type: "process", name: "New" },
			},
		];
		const sorted = sortActionsByDependency(actions);
		expect(sorted[0].action).toBe("add_element");
		expect(sorted[1].action).toBe("update_element");
	});

	it("places delete_element after delete_data_flow", () => {
		const actions: AiAction[] = [
			{ action: "delete_element", id: "web-app" },
			{ action: "delete_data_flow", id: "flow-1" },
		];
		const sorted = sortActionsByDependency(actions);
		expect(sorted[0].action).toBe("delete_data_flow");
		expect(sorted[1].action).toBe("delete_element");
	});

	it("preserves relative order within the same priority", () => {
		const actions: AiAction[] = [
			{
				action: "add_element",
				element: { type: "process", name: "First" },
			},
			{
				action: "add_trust_boundary",
				trust_boundary: { name: "Second" },
			},
		];
		const sorted = sortActionsByDependency(actions);
		// Both priority 0 — should preserve input order (stable sort)
		expect(sorted[0].action).toBe("add_element");
		expect(sorted[1].action).toBe("add_trust_boundary");
	});

	it("handles empty array", () => {
		expect(sortActionsByDependency([])).toEqual([]);
	});

	it("does not mutate the input array", () => {
		const actions: AiAction[] = [
			{ action: "delete_element", id: "web-app" },
			{
				action: "add_element",
				element: { type: "process", name: "New" },
			},
		];
		const original = [...actions];
		sortActionsByDependency(actions);
		expect(actions).toEqual(original);
	});
});

describe("executeSingleAction", () => {
	it("returns false when no model is loaded", () => {
		expect(executeSingleAction({ action: "delete_element", id: "x" })).toBe(false);
	});

	it("applies a valid action and pushes undo snapshot", () => {
		useModelStore.getState().setModel(mockModel, null);
		useHistoryStore.getState().clear();

		const success = executeSingleAction({
			action: "add_element",
			element: { type: "process", name: "Auth Service" },
		});

		expect(success).toBe(true);
		const model = useModelStore.getState().model;
		expect(model?.elements.length).toBe(3);
		expect(useHistoryStore.getState().past.length).toBe(1);
	});

	it("returns false and does NOT push undo on failure", () => {
		useModelStore.getState().setModel(mockModel, null);
		useHistoryStore.getState().clear();

		const success = executeSingleAction({
			action: "delete_element",
			id: "nonexistent",
		});

		expect(success).toBe(false);
		// Model unchanged
		expect(useModelStore.getState().model?.elements.length).toBe(2);
		// No undo snapshot pushed
		expect(useHistoryStore.getState().past.length).toBe(0);
	});

	it("marks model as dirty on success", () => {
		useModelStore.getState().setModel(mockModel, "/tmp/test.thf");
		expect(useModelStore.getState().isDirty).toBe(false);

		executeSingleAction({
			action: "add_element",
			element: { type: "data_store", name: "Cache" },
		});

		expect(useModelStore.getState().isDirty).toBe(true);
	});
});

describe("executeActions", () => {
	it("does NOT push undo snapshot when all batch actions fail", () => {
		useModelStore.getState().setModel(mockModel, null);
		useHistoryStore.getState().clear();

		const result = executeActions([{ action: "delete_element", id: "nonexistent" }]);

		expect(result.applied).toBe(0);
		expect(result.failed).toBe(1);
		expect(useHistoryStore.getState().past.length).toBe(0);
	});

	it("pushes undo snapshot when at least one action succeeds", () => {
		useModelStore.getState().setModel(mockModel, null);
		useHistoryStore.getState().clear();

		const result = executeActions([
			{ action: "add_element", element: { type: "process", name: "New" } },
			{ action: "delete_element", id: "nonexistent" },
		]);

		expect(result.applied).toBe(1);
		expect(result.failed).toBe(1);
		expect(useHistoryStore.getState().past.length).toBe(1);
	});
});

describe("reference integrity on updates", () => {
	/** Model carrying one resolvable flow between the two mock elements. */
	const modelWithFlow: ThreatModel = {
		...mockModel,
		data_flows: [
			{
				id: "flow-1",
				flow_number: 1,
				name: "Request",
				from: "web-app",
				to: "api-gw",
				protocol: "HTTPS",
				data: [],
				authenticated: true,
			},
		],
		trust_boundaries: [{ id: "tb-1", name: "Internal", contains: ["web-app", "api-gw"] }],
	};

	beforeEach(() => {
		useModelStore.getState().setModel(modelWithFlow, null);
		useHistoryStore.getState().clear();
	});

	it("rejects repointing a flow source at a nonexistent element", () => {
		const ok = executeSingleAction({
			action: "update_data_flow",
			id: "flow-1",
			updates: { from: "ghost" },
		});
		expect(ok).toBe(false);
		expect(useModelStore.getState().model?.data_flows[0].from).toBe("web-app");
	});

	it("rejects repointing a flow target at a nonexistent element", () => {
		const ok = executeSingleAction({
			action: "update_data_flow",
			id: "flow-1",
			updates: { to: "ghost" },
		});
		expect(ok).toBe(false);
		expect(useModelStore.getState().model?.data_flows[0].to).toBe("api-gw");
	});

	it("rejects repointing both endpoints at nonexistent elements", () => {
		const ok = executeSingleAction({
			action: "update_data_flow",
			id: "flow-1",
			updates: { from: "ghost-a", to: "ghost-b" },
		});
		expect(ok).toBe(false);
	});

	it("validates the resulting flow, so an unrelated field edit still checks endpoints", () => {
		// `protocol` alone is harmless, and both existing endpoints resolve, so this
		// must succeed — the check must not reject every update that omits from/to.
		const ok = executeSingleAction({
			action: "update_data_flow",
			id: "flow-1",
			updates: { protocol: "gRPC" },
		});
		expect(ok).toBe(true);
		expect(useModelStore.getState().model?.data_flows[0].protocol).toBe("gRPC");
	});

	it("still allows repointing a flow at an element that exists", () => {
		const ok = executeSingleAction({
			action: "update_data_flow",
			id: "flow-1",
			updates: { from: "api-gw", to: "web-app" },
		});
		expect(ok).toBe(true);
		const flow = useModelStore.getState().model?.data_flows[0];
		expect(flow?.from).toBe("api-gw");
		expect(flow?.to).toBe("web-app");
	});

	it("drops unresolvable trust boundary members instead of storing them", () => {
		const ok = executeSingleAction({
			action: "update_trust_boundary",
			id: "tb-1",
			updates: { contains: ["web-app", "ghost"] },
		});
		expect(ok).toBe(true);
		expect(useModelStore.getState().model?.trust_boundaries[0].contains).toEqual(["web-app"]);
	});

	it("keeps resolvable trust boundary members on update", () => {
		const ok = executeSingleAction({
			action: "update_trust_boundary",
			id: "tb-1",
			updates: { name: "Renamed" },
		});
		expect(ok).toBe(true);
		const boundary = useModelStore.getState().model?.trust_boundaries[0];
		expect(boundary?.name).toBe("Renamed");
		expect(boundary?.contains).toEqual(["web-app", "api-gw"]);
	});
});
