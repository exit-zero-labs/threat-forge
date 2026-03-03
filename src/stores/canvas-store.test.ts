import { beforeEach, describe, expect, it } from "vitest";
import { buildLayoutFromModel } from "@/lib/model-layout-utils";
import type { ThreatModel } from "@/types/threat-model";
import { useCanvasStore } from "./canvas-store";
import { useHistoryStore } from "./history-store";
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
				type: "web_server",
				name: "Web App",
				trust_zone: "internal",
				description: "",
				technologies: [],
			},
			{
				id: "data-store-1",
				type: "sql_database",
				name: "Database",
				trust_zone: "internal",
				description: "",
				technologies: ["PostgreSQL"],
			},
		],
		data_flows: [
			{
				id: "flow-1",
				name: "DB Query",
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
		useCanvasStore.setState({
			nodes: [],
			edges: [],
			viewport: { x: 0, y: 0, zoom: 1 },
		});
		useModelStore.setState({ model: null, filePath: null, isDirty: false });
		useHistoryStore.setState({ past: [], future: [] });
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
		expect(processNode?.type).toBe("dfdElement");
		expect(processNode?.data.label).toBe("Web App");

		const dataStoreNode = nodes.find((n) => n.id === "data-store-1");
		expect(dataStoreNode).toBeDefined();
		expect(dataStoreNode?.type).toBe("dfdElement");

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

		// Drop outside any boundary so position isn't adjusted
		useCanvasStore.getState().addElement("web_browser", { x: 600, y: 600 });

		const { nodes } = useCanvasStore.getState();
		const newNode = nodes.find(
			(n) => n.data.elementType === "web_browser" && n.data.label === "Web Browser",
		);
		expect(newNode).toBeDefined();
		expect(newNode?.type).toBe("dfdElement");
		expect(newNode?.position).toEqual({ x: 600, y: 600 });

		// Model store should also have the new element
		const model = useModelStore.getState().model;
		expect(model?.elements).toHaveLength(3);
		expect(model?.elements[2].type).toBe("web_browser");
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

		useCanvasStore.getState().addElement("api_gateway", { x: 0, y: 0 });

		expect(useModelStore.getState().isDirty).toBe(true);
	});

	it("resets ID counters from existing model on sync", () => {
		useModelStore.getState().setModel(createTestModel(), null);
		useCanvasStore.getState().syncFromModel();

		// Existing IDs: process-1, data-store-1 → counter resets to max(1,1) = 1
		// Adding a new element should get "comp-2"
		useCanvasStore.getState().addElement("api_gateway", { x: 0, y: 0 });
		const model = useModelStore.getState().model;
		const newElement = model?.elements[model.elements.length - 1];
		expect(newElement?.id).toBe("comp-2");
	});

	it("allows self-loop when adding data flow", () => {
		useModelStore.getState().setModel(createTestModel(), null);
		useCanvasStore.getState().syncFromModel();

		const result = useCanvasStore.getState().addDataFlow("process-1", "process-1");
		expect(result).not.toBeNull();

		// Edge count should increase by one (self-loop added)
		expect(useCanvasStore.getState().edges).toHaveLength(2);
	});

	it("allows multiple edges between same pair", () => {
		useModelStore.getState().setModel(createTestModel(), null);
		useCanvasStore.getState().syncFromModel();

		// flow-1 already exists: process-1 → data-store-1
		const result = useCanvasStore.getState().addDataFlow("process-1", "data-store-1");
		expect(result).not.toBeNull();
		expect(useCanvasStore.getState().edges).toHaveLength(2);

		// Model store should also have both flows
		const model = useModelStore.getState().model;
		expect(model?.data_flows).toHaveLength(2);
	});

	it("passes source and target handles when provided", () => {
		useModelStore.getState().setModel(createTestModel(), null);
		useCanvasStore.getState().syncFromModel();

		useCanvasStore.getState().addDataFlow("data-store-1", "process-1", {
			sourceHandle: "bottom",
			targetHandle: "top",
			name: "Query Response",
		});

		const { edges } = useCanvasStore.getState();
		const newEdge = edges.find((e) => e.source === "data-store-1" && e.target === "process-1");
		expect(newEdge).toBeDefined();
		expect(newEdge?.sourceHandle).toBe("bottom");
		expect(newEdge?.targetHandle).toBe("top");

		// Model store should have the name
		const model = useModelStore.getState().model;
		const flow = model?.data_flows.find((f) => f.from === "data-store-1" && f.to === "process-1");
		expect(flow?.name).toBe("Query Response");
	});

	it("duplicates an element", () => {
		useModelStore.getState().setModel(createTestModel(), null);
		useCanvasStore.getState().syncFromModel();

		useCanvasStore.getState().duplicateElement("process-1");

		const { nodes } = useCanvasStore.getState();
		const copies = nodes.filter((n) => n.data.label.includes("copy"));
		expect(copies).toHaveLength(1);
		expect(copies[0].data.label).toBe("Web App (copy)");

		const model = useModelStore.getState().model;
		expect(model?.elements).toHaveLength(3);
	});

	it("duplicateElement preserves subtype and icon", () => {
		const model = createTestModel();
		model.elements[0].subtype = "cloudfront";
		model.elements[0].icon = "globe";
		useModelStore.getState().setModel(model, null);
		useCanvasStore.getState().syncFromModel();

		useCanvasStore.getState().duplicateElement("process-1");

		const { nodes } = useCanvasStore.getState();
		const copy = nodes.find((n) => n.data.label === "Web App (copy)");
		expect(copy).toBeDefined();
		expect(copy?.data.subtype).toBe("cloudfront");
		expect(copy?.data.icon).toBe("globe");

		const m = useModelStore.getState().model;
		const newEl = m?.elements.find((e) => e.name === "Web App (copy)");
		expect(newEl).toBeDefined();
		expect(newEl?.subtype).toBe("cloudfront");
		expect(newEl?.icon).toBe("globe");
	});

	it("reverses an edge direction", () => {
		useModelStore.getState().setModel(createTestModel(), null);
		useCanvasStore.getState().syncFromModel();

		useCanvasStore.getState().reverseEdge("flow-1");

		const edge = useCanvasStore.getState().edges.find((e) => e.id === "flow-1");
		expect(edge?.source).toBe("data-store-1");
		expect(edge?.target).toBe("process-1");

		const model = useModelStore.getState().model;
		const flow = model?.data_flows.find((f) => f.id === "flow-1");
		expect(flow?.from).toBe("data-store-1");
		expect(flow?.to).toBe("process-1");
	});

	it("auto-assigns element to boundary when dropped inside", () => {
		useModelStore.getState().setModel(createTestModel(), null);
		useCanvasStore.getState().syncFromModel();

		// Boundary-1 is at default position (50, 50) with size 400x300
		// Drop a new element inside it
		useCanvasStore.getState().addElement("microservice", { x: 100, y: 100 });

		const model = useModelStore.getState().model;
		const boundary = model?.trust_boundaries.find((b) => b.id === "boundary-1");
		// New element gets comp-2 ID (counter resets to 1 from existing model)
		expect(boundary?.contains).toContain("comp-2");
	});

	it("reads inline positions from model via pending layout", () => {
		const model = createTestModel();
		// Set inline positions on elements
		model.elements[0].position = { x: 150, y: 250 };
		model.elements[1].position = { x: 350, y: 450 };
		model.trust_boundaries[0].position = { x: 20, y: 30 };
		model.trust_boundaries[0].size = { width: 600, height: 500 };

		// Build a layout from inline positions (simulating what openModel does)
		const nodes = [
			...model.elements
				.filter((e) => e.position)
				.map((e) => ({
					id: e.id,
					x: e.position?.x ?? 0,
					y: e.position?.y ?? 0,
				})),
			...model.trust_boundaries
				.filter((b) => b.position)
				.map((b) => ({
					id: b.id,
					x: b.position?.x ?? 0,
					y: b.position?.y ?? 0,
					width: b.size?.width,
					height: b.size?.height,
				})),
		];

		useCanvasStore.getState().setPendingLayout({
			diagram_id: "main-dfd",
			viewport: { x: 0, y: 0, zoom: 1 },
			nodes,
		});
		useModelStore.getState().setModel(model, null);
		useCanvasStore.getState().syncFromModel();

		const processNode = useCanvasStore.getState().nodes.find((n) => n.id === "process-1");
		expect(processNode?.position).toEqual({ x: 150, y: 250 });

		const dataStoreNode = useCanvasStore.getState().nodes.find((n) => n.id === "data-store-1");
		expect(dataStoreNode?.position).toEqual({ x: 350, y: 450 });

		const boundaryNode = useCanvasStore.getState().nodes.find((n) => n.id === "boundary-1");
		expect(boundaryNode?.position).toEqual({ x: 20, y: 30 });
		expect(boundaryNode?.width).toBe(600);
		expect(boundaryNode?.height).toBe(500);
	});

	it("reads boundary colors from model fields", () => {
		const model = createTestModel();
		model.trust_boundaries[0].fill_color = "#3b82f6";
		model.trust_boundaries[0].stroke_color = "#1e40af";
		model.trust_boundaries[0].fill_opacity = 0.15;
		model.trust_boundaries[0].stroke_opacity = 0.7;

		useModelStore.getState().setModel(model, null);
		useCanvasStore.getState().syncFromModel();

		const boundaryNode = useCanvasStore.getState().nodes.find((n) => n.id === "boundary-1");
		expect(boundaryNode?.data.boundaryFillColor).toBe("#3b82f6");
		expect(boundaryNode?.data.boundaryStrokeColor).toBe("#1e40af");
		expect(boundaryNode?.data.boundaryFillOpacity).toBe(0.15);
		expect(boundaryNode?.data.boundaryStrokeOpacity).toBe(0.7);
	});

	it("reads element colors from model fields", () => {
		const model = createTestModel();
		model.elements[0].fill_color = "#10b981";
		model.elements[0].stroke_color = "#059669";
		model.elements[0].fill_opacity = 0.2;
		model.elements[0].stroke_opacity = 0.8;

		useModelStore.getState().setModel(model, null);
		useCanvasStore.getState().syncFromModel();

		const elementNode = useCanvasStore.getState().nodes.find((n) => n.id === "process-1");
		expect(elementNode?.data.elementFillColor).toBe("#10b981");
		expect(elementNode?.data.elementStrokeColor).toBe("#059669");
		expect(elementNode?.data.elementFillOpacity).toBe(0.2);
		expect(elementNode?.data.elementStrokeOpacity).toBe(0.8);
	});

	it("reads label offset from data flow model fields", () => {
		const model = createTestModel();
		model.data_flows[0].label_offset = { x: 15, y: -10 };

		useModelStore.getState().setModel(model, null);
		useCanvasStore.getState().syncFromModel();

		const edge = useCanvasStore.getState().edges.find((e) => e.id === "flow-1");
		expect(edge?.data?.labelOffsetX).toBe(15);
		expect(edge?.data?.labelOffsetY).toBe(-10);
	});

	it("captures pre-drag positions and writes post-drag positions on drag end", () => {
		const model = createTestModel();
		model.elements[0].position = { x: 100, y: 100 };
		model.elements[1].position = { x: 300, y: 300 };
		model.trust_boundaries[0].position = { x: 20, y: 20 };
		model.diagrams = [{ id: "main", name: "Main" }];

		const layout = buildLayoutFromModel(model);
		if (layout) useCanvasStore.getState().setPendingLayout(layout);
		useModelStore.getState().setModel(model, null);
		useCanvasStore.getState().syncFromModel();

		// Verify initial positions
		const processNode = useCanvasStore.getState().nodes.find((n) => n.id === "process-1");
		expect(processNode?.position).toEqual({ x: 100, y: 100 });

		// Simulate drag start (dragging: true)
		useCanvasStore
			.getState()
			.onNodesChange([
				{ id: "process-1", type: "position", position: { x: 110, y: 110 }, dragging: true },
			]);

		// History should not have been pushed yet (drag still in progress)
		expect(useHistoryStore.getState().past).toHaveLength(0);

		// Simulate drag end (dragging: false)
		useCanvasStore
			.getState()
			.onNodesChange([
				{ id: "process-1", type: "position", position: { x: 500, y: 500 }, dragging: false },
			]);

		// History should now have the pre-drag snapshot
		expect(useHistoryStore.getState().past).toHaveLength(1);

		// The pre-drag snapshot should have the original position
		const snapshot = useHistoryStore.getState().past[0];
		const snapshotElement = snapshot.elements.find((e) => e.id === "process-1");
		expect(snapshotElement?.position).toEqual({ x: 100, y: 100 });

		// The model should now have the post-drag position
		const updatedModel = useModelStore.getState().model;
		const updatedElement = updatedModel?.elements.find((e) => e.id === "process-1");
		expect(updatedElement?.position).toEqual({ x: 500, y: 500 });
		expect(useModelStore.getState().isDirty).toBe(true);
	});

	it("restores positions on undo via pending layout", () => {
		const model = createTestModel();
		model.elements[0].position = { x: 100, y: 100 };
		model.elements[1].position = { x: 300, y: 300 };
		model.trust_boundaries[0].position = { x: 20, y: 20 };
		model.diagrams = [{ id: "main", name: "Main" }];

		const layout = buildLayoutFromModel(model);
		if (layout) useCanvasStore.getState().setPendingLayout(layout);
		useModelStore.getState().setModel(model, null);
		useCanvasStore.getState().syncFromModel();

		// Simulate drag: process-1 from (100,100) to (500,500)
		useCanvasStore
			.getState()
			.onNodesChange([
				{ id: "process-1", type: "position", position: { x: 110, y: 110 }, dragging: true },
			]);
		useCanvasStore
			.getState()
			.onNodesChange([
				{ id: "process-1", type: "position", position: { x: 500, y: 500 }, dragging: false },
			]);

		// Undo: restore pre-drag snapshot via pending layout
		const currentModel = useModelStore.getState().model;
		expect(currentModel).not.toBeNull();
		const snapshot = useHistoryStore.getState().undo(currentModel as ThreatModel);
		expect(snapshot).not.toBeNull();

		const undoLayout = buildLayoutFromModel(snapshot as ThreatModel);
		if (undoLayout) useCanvasStore.getState().setPendingLayout(undoLayout);
		useModelStore.getState().restoreSnapshot(snapshot as ThreatModel);
		useCanvasStore.getState().syncFromModel();

		// Position should be restored to pre-drag
		const restoredNode = useCanvasStore.getState().nodes.find((n) => n.id === "process-1");
		expect(restoredNode?.position).toEqual({ x: 100, y: 100 });
	});

	it("creates element with subtype and icon from opts", () => {
		useModelStore.getState().setModel(createTestModel(), null);
		useCanvasStore.getState().syncFromModel();

		useCanvasStore.getState().addElement(
			"api_gateway",
			{ x: 600, y: 600 },
			{
				icon: "router",
				name: "API Gateway",
			},
		);

		const { nodes } = useCanvasStore.getState();
		const newNode = nodes.find((n) => n.data.label === "API Gateway");
		expect(newNode).toBeDefined();
		expect(newNode?.type).toBe("dfdElement");
		expect(newNode?.data.icon).toBe("router");

		// Model store should have icon
		const model = useModelStore.getState().model;
		const newElement = model?.elements.find((e) => e.name === "API Gateway");
		expect(newElement).toBeDefined();
		expect(newElement?.icon).toBe("router");
		expect(newElement?.type).toBe("api_gateway");
	});

	it("creates element with library defaults when no opts provided", () => {
		useModelStore.getState().setModel(createTestModel(), null);
		useCanvasStore.getState().syncFromModel();

		useCanvasStore.getState().addElement("sql_database", { x: 300, y: 300 });

		const { nodes } = useCanvasStore.getState();
		const newNode = nodes.find((n) => n.data.label === "SQL Database");
		expect(newNode).toBeDefined();

		const model = useModelStore.getState().model;
		const newElement = model?.elements.find((e) => e.name === "SQL Database");
		expect(newElement).toBeDefined();
		expect(newElement?.type).toBe("sql_database");
	});

	it("syncFromModel preserves subtype and icon in node data", () => {
		const model = createTestModel();
		model.elements[0].subtype = "cloudfront";
		model.elements[0].icon = "globe";

		useModelStore.getState().setModel(model, null);
		useCanvasStore.getState().syncFromModel();

		const processNode = useCanvasStore.getState().nodes.find((n) => n.id === "process-1");
		expect(processNode?.data.subtype).toBe("cloudfront");
		expect(processNode?.data.icon).toBe("globe");
	});

	it("reconnects an edge to a different target", () => {
		const model = createTestModel();
		// Add a third element to reconnect to
		model.elements.push({
			id: "external-1",
			type: "external_entity",
			name: "External API",
			trust_zone: "external",
			description: "",
			technologies: [],
		});
		useModelStore.getState().setModel(model, null);
		useCanvasStore.getState().syncFromModel();

		// flow-1: process-1 → data-store-1
		const oldEdge = useCanvasStore.getState().edges.find((e) => e.id === "flow-1");
		if (!oldEdge) throw new Error("Expected flow-1 edge to exist");

		useCanvasStore.getState().reconnectEdge(oldEdge, {
			source: "process-1",
			target: "external-1",
			sourceHandle: "right-source",
			targetHandle: "left-target",
		});

		// Canvas edge should be updated
		const updatedEdge = useCanvasStore.getState().edges.find((e) => e.id === "flow-1");
		expect(updatedEdge?.source).toBe("process-1");
		expect(updatedEdge?.target).toBe("external-1");
		expect(updatedEdge?.sourceHandle).toBe("right-source");
		expect(updatedEdge?.targetHandle).toBe("left-target");

		// Model flow should be updated
		const updatedModel = useModelStore.getState().model;
		const flow = updatedModel?.data_flows.find((f) => f.id === "flow-1");
		expect(flow?.from).toBe("process-1");
		expect(flow?.to).toBe("external-1");
		expect(flow?.source_handle).toBe("right-source");
		expect(flow?.target_handle).toBe("left-target");

		// History should have the pre-reconnect snapshot
		expect(useHistoryStore.getState().past).toHaveLength(1);
		const snapshot = useHistoryStore.getState().past[0];
		const snapshotFlow = snapshot.data_flows.find((f) => f.id === "flow-1");
		expect(snapshotFlow?.to).toBe("data-store-1");
	});

	it("syncFromModel preserves model handles over stale canvas state", () => {
		const model = createTestModel();
		// Give the flow explicit handles in the model
		model.data_flows[0].source_handle = "bottom-right-source";
		model.data_flows[0].target_handle = "top-left-target";

		useModelStore.getState().setModel(model, null);
		useCanvasStore.getState().syncFromModel();

		// Edge should use the model's handles, not infer from canvas state
		const edge = useCanvasStore.getState().edges.find((e) => e.id === "flow-1");
		expect(edge?.sourceHandle).toBe("bottom-right-source");
		expect(edge?.targetHandle).toBe("top-left-target");

		// Re-sync (simulates property edit triggering model change)
		useCanvasStore.getState().syncFromModel();

		// Handles must still match the model, not revert to stale canvas defaults
		const edgeAfterResync = useCanvasStore.getState().edges.find((e) => e.id === "flow-1");
		expect(edgeAfterResync?.sourceHandle).toBe("bottom-right-source");
		expect(edgeAfterResync?.targetHandle).toBe("top-left-target");
	});
});
