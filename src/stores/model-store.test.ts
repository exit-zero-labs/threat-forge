import { beforeEach, describe, expect, it } from "vitest";
import type { ThreatModel } from "@/types/threat-model";
import { useModelStore } from "./model-store";

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

describe("useModelStore", () => {
	beforeEach(() => {
		useModelStore.setState({
			model: null,
			filePath: null,
			isDirty: false,
			selectedElementId: null,
			selectedThreatId: null,
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
});
