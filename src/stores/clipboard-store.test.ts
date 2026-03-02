import { beforeEach, describe, expect, it } from "vitest";
import type { ThreatModel } from "@/types/threat-model";
import { useCanvasStore } from "./canvas-store";
import { useClipboardStore } from "./clipboard-store";
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
				id: "el-1",
				type: "web_server",
				name: "Web App",
				trust_zone: "internal",
				description: "",
				technologies: [],
				position: { x: 100, y: 100 },
			},
			{
				id: "el-2",
				type: "sql_database",
				name: "Database",
				trust_zone: "internal",
				description: "",
				technologies: ["PostgreSQL"],
				position: { x: 300, y: 300 },
			},
			{
				id: "el-3",
				type: "api_gateway",
				name: "API Gateway",
				trust_zone: "dmz",
				description: "",
				technologies: [],
				position: { x: 500, y: 100 },
			},
		],
		data_flows: [
			{
				id: "flow-1",
				name: "DB Query",
				from: "el-1",
				to: "el-2",
				protocol: "PostgreSQL/TLS",
				data: ["user_records"],
				authenticated: true,
			},
			{
				id: "flow-2",
				name: "API Call",
				from: "el-3",
				to: "el-1",
				protocol: "HTTPS",
				data: ["requests"],
				authenticated: true,
			},
		],
		trust_boundaries: [
			{
				id: "boundary-1",
				name: "Internal Network",
				contains: ["el-1", "el-2"],
				position: { x: 50, y: 50 },
				size: { width: 400, height: 300 },
			},
		],
		threats: [],
		diagrams: [],
	};
}

function setupCanvas() {
	useModelStore.getState().setModel(createTestModel(), null);
	useCanvasStore.getState().syncFromModel();
}

function selectNodes(...ids: string[]) {
	const nodes = useCanvasStore.getState().nodes;
	useCanvasStore.setState({
		nodes: nodes.map((n) => ({ ...n, selected: ids.includes(n.id) })),
	});
}

describe("clipboard-store", () => {
	beforeEach(() => {
		useCanvasStore.setState({
			nodes: [],
			edges: [],
			viewport: { x: 0, y: 0, zoom: 1 },
		});
		useModelStore.setState({ model: null, filePath: null, isDirty: false });
		useHistoryStore.setState({ past: [], future: [] });
		useClipboardStore.setState({ clipboard: null, pasteCount: 0 });
	});

	describe("selectAll", () => {
		it("marks all nodes as selected", () => {
			setupCanvas();
			useClipboardStore.getState().selectAll();
			const nodes = useCanvasStore.getState().nodes;
			expect(nodes.every((n) => n.selected)).toBe(true);
		});

		it("is a no-op when there are no nodes", () => {
			useClipboardStore.getState().selectAll();
			expect(useCanvasStore.getState().nodes).toHaveLength(0);
		});
	});

	describe("copySelected", () => {
		it("is a no-op with no selection", () => {
			setupCanvas();
			useClipboardStore.getState().copySelected();
			expect(useClipboardStore.getState().clipboard).toBeNull();
		});

		it("copies a single selected element", () => {
			setupCanvas();
			selectNodes("el-1");
			useClipboardStore.getState().copySelected();

			const clipboard = useClipboardStore.getState().clipboard;
			expect(clipboard).not.toBeNull();
			expect(clipboard?.elements).toHaveLength(1);
			expect(clipboard?.elements[0].id).toBe("el-1");
			expect(clipboard?.flows).toHaveLength(0);
			expect(clipboard?.boundaries).toHaveLength(0);
		});

		it("copies multiple selected elements", () => {
			setupCanvas();
			selectNodes("el-1", "el-2");
			useClipboardStore.getState().copySelected();

			const clipboard = useClipboardStore.getState().clipboard;
			expect(clipboard?.elements).toHaveLength(2);
		});

		it("includes edges between selected nodes only", () => {
			setupCanvas();
			selectNodes("el-1", "el-2");
			useClipboardStore.getState().copySelected();

			const clipboard = useClipboardStore.getState().clipboard;
			// flow-1 connects el-1 → el-2 (both selected) → included
			// flow-2 connects el-3 → el-1 (el-3 not selected) → excluded
			expect(clipboard?.flows).toHaveLength(1);
			expect(clipboard?.flows[0].id).toBe("flow-1");
		});

		it("excludes edges where only one endpoint is selected", () => {
			setupCanvas();
			selectNodes("el-1");
			useClipboardStore.getState().copySelected();

			const clipboard = useClipboardStore.getState().clipboard;
			expect(clipboard?.flows).toHaveLength(0);
		});

		it("copies a trust boundary", () => {
			setupCanvas();
			selectNodes("boundary-1");
			useClipboardStore.getState().copySelected();

			const clipboard = useClipboardStore.getState().clipboard;
			expect(clipboard?.boundaries).toHaveLength(1);
			expect(clipboard?.boundaries[0].id).toBe("boundary-1");
			expect(clipboard?.elements).toHaveLength(0);
		});

		it("resets pasteCount on copy", () => {
			setupCanvas();
			selectNodes("el-1");
			useClipboardStore.setState({ pasteCount: 3 });
			useClipboardStore.getState().copySelected();
			expect(useClipboardStore.getState().pasteCount).toBe(0);
		});
	});

	describe("cutSelected", () => {
		it("copies and then deletes selected nodes", () => {
			setupCanvas();
			selectNodes("el-1");
			const initialCount = useCanvasStore.getState().nodes.length;

			useClipboardStore.getState().cutSelected();

			// Clipboard should have the cut element
			const clipboard = useClipboardStore.getState().clipboard;
			expect(clipboard?.elements).toHaveLength(1);

			// Canvas should have fewer nodes
			const nodes = useCanvasStore.getState().nodes;
			expect(nodes.length).toBe(initialCount - 1);
			expect(nodes.find((n) => n.id === "el-1")).toBeUndefined();

			// Model should also be updated
			const model = useModelStore.getState().model;
			expect(model?.elements.find((e) => e.id === "el-1")).toBeUndefined();
		});
	});

	describe("paste", () => {
		it("is a no-op when clipboard is empty", () => {
			setupCanvas();
			useClipboardStore.getState().paste();
			// No change
			expect(useModelStore.getState().model?.elements).toHaveLength(3);
		});

		it("generates new IDs for pasted elements", () => {
			setupCanvas();
			selectNodes("el-1");
			useClipboardStore.getState().copySelected();
			useClipboardStore.getState().paste();

			const model = useModelStore.getState().model;
			expect(model?.elements).toHaveLength(4);
			const ids = model?.elements.map((e) => e.id) ?? [];
			// All IDs should be unique
			expect(new Set(ids).size).toBe(4);
		});

		it("adds (copy) suffix on first paste", () => {
			setupCanvas();
			selectNodes("el-1");
			useClipboardStore.getState().copySelected();
			useClipboardStore.getState().paste();

			const model = useModelStore.getState().model;
			const pastedEl = model?.elements[model.elements.length - 1];
			expect(pastedEl?.name).toBe("Web App (copy)");
		});

		it("offsets positions by 50*pasteCount", () => {
			setupCanvas();
			selectNodes("el-1");
			useClipboardStore.getState().copySelected();
			useClipboardStore.getState().paste();

			const nodes = useCanvasStore.getState().nodes;
			const pastedNode = nodes.find((n) => n.data.label === "Web App (copy)");
			expect(pastedNode?.position).toEqual({ x: 150, y: 150 });
		});

		it("increments offset on multiple pastes", () => {
			setupCanvas();
			selectNodes("el-1");
			useClipboardStore.getState().copySelected();

			useClipboardStore.getState().paste(); // offset 50
			useClipboardStore.getState().paste(); // offset 100

			const nodes = useCanvasStore.getState().nodes;
			// Second paste — name is NOT "(copy)" anymore
			const secondPaste = nodes[nodes.length - 1];
			expect(secondPaste.position).toEqual({ x: 200, y: 200 });
		});

		it("remaps edge source/target to new IDs", () => {
			setupCanvas();
			selectNodes("el-1", "el-2");
			useClipboardStore.getState().copySelected();
			useClipboardStore.getState().paste();

			const model = useModelStore.getState().model;
			// Original flow-1: el-1 → el-2, plus new flow with remapped IDs
			expect(model?.data_flows).toHaveLength(3);

			const newFlow = model?.data_flows[model.data_flows.length - 1];
			// New flow should NOT reference original IDs
			expect(newFlow?.from).not.toBe("el-1");
			expect(newFlow?.to).not.toBe("el-2");
			// But the new from/to should exist as new element IDs
			const elementIds = new Set(model?.elements.map((e) => e.id));
			expect(elementIds.has(newFlow?.from ?? "")).toBe(true);
			expect(elementIds.has(newFlow?.to ?? "")).toBe(true);
		});

		it("pushes one history snapshot for undo", () => {
			setupCanvas();
			selectNodes("el-1", "el-2");
			useClipboardStore.getState().copySelected();

			expect(useHistoryStore.getState().past).toHaveLength(0);
			useClipboardStore.getState().paste();
			expect(useHistoryStore.getState().past).toHaveLength(1);
		});

		it("selects only pasted nodes after paste", () => {
			setupCanvas();
			selectNodes("el-1");
			useClipboardStore.getState().copySelected();
			useClipboardStore.getState().paste();

			const nodes = useCanvasStore.getState().nodes;
			const selectedNodes = nodes.filter((n) => n.selected);
			expect(selectedNodes).toHaveLength(1);
			expect(selectedNodes[0].data.label).toBe("Web App (copy)");
		});
	});
});
