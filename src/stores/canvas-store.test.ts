import { beforeEach, describe, expect, it } from "vitest";
import type { ThreatModel } from "@/types/threat-model";
import { useCanvasStore } from "./canvas-store";
import { useModelStore } from "./model-store";

function createTestModel(): ThreatModel {
	return {
		version: "1.0",
		metadata: {
			title: "Test Model",
			author: "Test",
			created: "2026-01-01",
			modified: "2026-01-01",
			description: "",
		},
		elements: [
			{
				id: "process-1",
				type: "process",
				name: "Web App",
				trust_zone: "internal",
				description: "",
				technologies: [],
			},
			{
				id: "data-store-1",
				type: "data_store",
				name: "Database",
				trust_zone: "internal",
				description: "",
				technologies: ["PostgreSQL"],
			},
		],
		data_flows: [
			{
				id: "flow-1",
				from: "process-1",
				to: "data-store-1",
				protocol: "PostgreSQL/TLS",
				data: ["user_records"],
				authenticated: true,
			},
		],
		trust_boundaries: [
			{
				id: "boundary-1",
				name: "Internal Network",
				contains: ["process-1", "data-store-1"],
			},
		],
		threats: [],
		diagrams: [],
	};
}

describe("canvas-store", () => {
	beforeEach(() => {
		useCanvasStore.setState({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
		useModelStore.setState({ model: null, filePath: null, isDirty: false });
	});

	it("syncs nodes and edges from model store", () => {
		useModelStore.getState().setModel(createTestModel(), null);
		useCanvasStore.getState().syncFromModel();

		const { nodes, edges } = useCanvasStore.getState();

		// 1 boundary + 2 elements = 3 nodes
		expect(nodes).toHaveLength(3);
		expect(edges).toHaveLength(1);

		// Boundary node is first
		expect(nodes[0].type).toBe("trustBoundary");
		expect(nodes[0].data.boundaryName).toBe("Internal Network");

		// Element nodes follow
		const processNode = nodes.find((n) => n.id === "process-1");
		expect(processNode).toBeDefined();
		expect(processNode?.type).toBe("process");
		expect(processNode?.data.label).toBe("Web App");

		const dataStoreNode = nodes.find((n) => n.id === "data-store-1");
		expect(dataStoreNode).toBeDefined();
		expect(dataStoreNode?.type).toBe("dataStore");

		// Edge maps flow correctly
		expect(edges[0].id).toBe("flow-1");
		expect(edges[0].source).toBe("process-1");
		expect(edges[0].target).toBe("data-store-1");
	});

	it("clears nodes and edges when model is null", () => {
		// First sync with a model
		useModelStore.getState().setModel(createTestModel(), null);
		useCanvasStore.getState().syncFromModel();
		expect(useCanvasStore.getState().nodes).toHaveLength(3);

		// Clear model
		useModelStore.getState().clearModel();
		useCanvasStore.getState().syncFromModel();

		expect(useCanvasStore.getState().nodes).toHaveLength(0);
		expect(useCanvasStore.getState().edges).toHaveLength(0);
	});

	it("adds a new element to canvas and model", () => {
		useModelStore.getState().setModel(createTestModel(), null);
		useCanvasStore.getState().syncFromModel();

		useCanvasStore.getState().addElement("external_entity", { x: 200, y: 300 });

		const { nodes } = useCanvasStore.getState();
		const newNode = nodes.find((n) => n.type === "externalEntity");
		expect(newNode).toBeDefined();
		expect(newNode?.data.label).toBe("New External Entity");
		expect(newNode?.position).toEqual({ x: 200, y: 300 });

		// Model store should also have the new element
		const model = useModelStore.getState().model;
		expect(model?.elements).toHaveLength(3);
		expect(model?.elements[2].type).toBe("external_entity");
	});

	it("adds a data flow between nodes", () => {
		useModelStore.getState().setModel(createTestModel(), null);
		useCanvasStore.getState().syncFromModel();

		useCanvasStore.getState().addDataFlow("data-store-1", "process-1");

		const { edges } = useCanvasStore.getState();
		expect(edges).toHaveLength(2);

		const newEdge = edges.find((e) => e.source === "data-store-1" && e.target === "process-1");
		expect(newEdge).toBeDefined();

		// Model store should also have the new flow
		const model = useModelStore.getState().model;
		expect(model?.data_flows).toHaveLength(2);
	});

	it("adds a trust boundary", () => {
		useModelStore.getState().setModel(createTestModel(), null);
		useCanvasStore.getState().syncFromModel();

		useCanvasStore.getState().addTrustBoundary("DMZ", { x: 50, y: 50 });

		const { nodes } = useCanvasStore.getState();
		const boundaries = nodes.filter((n) => n.type === "trustBoundary");
		expect(boundaries).toHaveLength(2);

		const newBoundary = boundaries.find((n) => n.data.boundaryName === "DMZ");
		expect(newBoundary).toBeDefined();

		// Model store should have the new boundary
		const model = useModelStore.getState().model;
		expect(model?.trust_boundaries).toHaveLength(2);
	});

	it("assigns child elements to boundary parents on sync", () => {
		useModelStore.getState().setModel(createTestModel(), null);
		useCanvasStore.getState().syncFromModel();

		const processNode = useCanvasStore.getState().nodes.find((n) => n.id === "process-1");
		expect(processNode?.parentId).toBe("boundary-1");
		expect(processNode?.extent).toBe("parent");

		const dataStoreNode = useCanvasStore.getState().nodes.find((n) => n.id === "data-store-1");
		expect(dataStoreNode?.parentId).toBe("boundary-1");
	});

	it("marks model dirty when adding elements", () => {
		useModelStore.getState().setModel(createTestModel(), null);
		useModelStore.getState().markClean();
		useCanvasStore.getState().syncFromModel();

		useCanvasStore.getState().addElement("process", { x: 0, y: 0 });

		expect(useModelStore.getState().isDirty).toBe(true);
	});

	it("resets ID counters from existing model on sync", () => {
		useModelStore.getState().setModel(createTestModel(), null);
		useCanvasStore.getState().syncFromModel();

		// Adding a new element should get ID "process-2" (since process-1 exists)
		useCanvasStore.getState().addElement("process", { x: 0, y: 0 });
		const model = useModelStore.getState().model;
		const newElement = model?.elements[model.elements.length - 1];
		expect(newElement?.id).toBe("process-2");
	});
});
