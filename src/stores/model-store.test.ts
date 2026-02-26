import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Threat, ThreatModel } from "@/types/threat-model";
import { useModelStore } from "./model-store";

vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

const mockModel: ThreatModel = {
	version: "1.0",
	metadata: {
		title: "Test Model",
		author: "Test Author",
		created: "2026-03-15",
		modified: "2026-03-15",
		description: "A test threat model",
	},
	elements: [
		{
			id: "web-app",
			type: "process",
			name: "Web Application",
			trust_zone: "internal",
			description: "",
			technologies: [],
		},
	],
	data_flows: [],
	trust_boundaries: [],
	threats: [],
	diagrams: [
		{
			id: "main-dfd",
			name: "Level 0 DFD",
			layout_file: ".threatforge/layouts/main-dfd.json",
		},
	],
};

const mockThreat: Threat = {
	id: "threat-1",
	title: "SQL Injection",
	category: "Tampering",
	element: "web-app",
	severity: "high",
	description: "Malicious SQL in input",
};

describe("useModelStore", () => {
	beforeEach(() => {
		useModelStore.setState({
			model: null,
			filePath: null,
			isDirty: false,
			selectedElementId: null,
			selectedThreatId: null,
			isAnalyzing: false,
		});
	});

	it("starts with no model loaded", () => {
		const state = useModelStore.getState();
		expect(state.model).toBeNull();
		expect(state.filePath).toBeNull();
		expect(state.isDirty).toBe(false);
	});

	it("sets model and file path", () => {
		useModelStore.getState().setModel(mockModel, "/path/to/model.yaml");
		const state = useModelStore.getState();
		expect(state.model).toEqual(mockModel);
		expect(state.filePath).toBe("/path/to/model.yaml");
		expect(state.isDirty).toBe(false);
	});

	it("clears model state", () => {
		useModelStore.getState().setModel(mockModel, "/path/to/model.yaml");
		useModelStore.getState().clearModel();
		const state = useModelStore.getState();
		expect(state.model).toBeNull();
		expect(state.filePath).toBeNull();
	});

	it("tracks dirty state", () => {
		useModelStore.getState().setModel(mockModel, "/path/to/model.yaml");
		useModelStore.getState().markDirty();
		expect(useModelStore.getState().isDirty).toBe(true);
		useModelStore.getState().markClean();
		expect(useModelStore.getState().isDirty).toBe(false);
	});

	it("tracks element selection", () => {
		useModelStore.getState().setSelectedElement("web-app");
		expect(useModelStore.getState().selectedElementId).toBe("web-app");
		useModelStore.getState().setSelectedElement(null);
		expect(useModelStore.getState().selectedElementId).toBeNull();
	});

	it("resets selections when loading a new model", () => {
		useModelStore.getState().setSelectedElement("web-app");
		useModelStore.getState().setSelectedThreat("threat-1");
		useModelStore.getState().setModel(mockModel, "/new/path.yaml");
		expect(useModelStore.getState().selectedElementId).toBeNull();
		expect(useModelStore.getState().selectedThreatId).toBeNull();
	});

	it("adds a single threat", () => {
		useModelStore.getState().setModel(mockModel, null);
		useModelStore.getState().addThreat(mockThreat);
		const state = useModelStore.getState();
		expect(state.model?.threats).toHaveLength(1);
		expect(state.model?.threats[0].title).toBe("SQL Injection");
		expect(state.isDirty).toBe(true);
	});

	it("adds multiple threats at once", () => {
		useModelStore.getState().setModel(mockModel, null);
		const threats: Threat[] = [mockThreat, { ...mockThreat, id: "threat-2", title: "XSS Attack" }];
		useModelStore.getState().addThreats(threats);
		expect(useModelStore.getState().model?.threats).toHaveLength(2);
	});

	it("does not mark dirty when adding zero threats", () => {
		useModelStore.getState().setModel(mockModel, null);
		useModelStore.getState().addThreats([]);
		expect(useModelStore.getState().isDirty).toBe(false);
	});

	it("updates a threat", () => {
		const modelWithThreat = { ...mockModel, threats: [mockThreat] };
		useModelStore.getState().setModel(modelWithThreat, null);
		useModelStore.getState().updateThreat("threat-1", { severity: "critical" });
		const updated = useModelStore.getState().model?.threats[0];
		expect(updated?.severity).toBe("critical");
		expect(updated?.title).toBe("SQL Injection");
		expect(useModelStore.getState().isDirty).toBe(true);
	});

	it("deletes a threat", () => {
		const modelWithThreat = { ...mockModel, threats: [mockThreat] };
		useModelStore.getState().setModel(modelWithThreat, null);
		useModelStore.getState().deleteThreat("threat-1");
		expect(useModelStore.getState().model?.threats).toHaveLength(0);
		expect(useModelStore.getState().isDirty).toBe(true);
	});

	it("clears selectedThreatId when the selected threat is deleted", () => {
		const modelWithThreat = { ...mockModel, threats: [mockThreat] };
		useModelStore.getState().setModel(modelWithThreat, null);
		useModelStore.getState().setSelectedThreat("threat-1");
		useModelStore.getState().deleteThreat("threat-1");
		expect(useModelStore.getState().selectedThreatId).toBeNull();
	});

	it("updates an element", () => {
		useModelStore.getState().setModel(mockModel, null);
		useModelStore.getState().updateElement("web-app", { name: "Updated App", trust_zone: "dmz" });
		const element = useModelStore.getState().model?.elements[0];
		expect(element?.name).toBe("Updated App");
		expect(element?.trust_zone).toBe("dmz");
		expect(element?.type).toBe("process");
		expect(useModelStore.getState().isDirty).toBe(true);
	});
});
