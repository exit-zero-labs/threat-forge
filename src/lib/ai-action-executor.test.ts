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
