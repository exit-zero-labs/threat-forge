import { describe, expect, it } from "vitest";
import type { DfdEdge, DfdNode } from "@/stores/canvas-store-factory";
import type { ThreatModel } from "@/types/threat-model";
import { type CanvasCaptureSource, captureCanvasIntoModel } from "./model-capture";

/**
 * `captureCanvasIntoModel` is the single choke point every durable write goes through — the file
 * save and the browser workspace autosave both call it. These cases assert the geometry a user
 * produces by dragging survives that write; without them a capture regression would silently
 * throw away every node drag with no test turning red.
 */

function modelWithGeometry(): ThreatModel {
	return {
		version: "1.0",
		metadata: {
			title: "Capture",
			author: "Test",
			created: "2026-01-01",
			modified: "2026-01-01",
			description: "",
		},
		elements: [
			element("comp-1", "Web", { x: 0, y: 0 }),
			element("comp-off-canvas", "Detached", { x: 7, y: 7 }),
		],
		data_flows: [
			{
				id: "flow-1",
				name: "Loop",
				from: "comp-1",
				to: "comp-1",
				protocol: "https",
				data: [],
				authenticated: true,
			},
		],
		trust_boundaries: [
			{
				id: "boundary-1",
				name: "DMZ",
				contains: [],
				position: { x: 0, y: 0 },
				size: { width: 400, height: 300 },
				fill_color: "#111111",
			},
		],
		threats: [],
		diagrams: [{ id: "diagram-1", name: "Main", layout_file: "main.layout.json" }],
	};
}

function element(id: string, name: string, position: { x: number; y: number }) {
	return {
		id,
		name,
		type: "web_server" as const,
		trust_zone: "internal",
		description: "",
		technologies: [],
		position,
	};
}

function canvas(overrides: Partial<CanvasCaptureSource> = {}): CanvasCaptureSource {
	return { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, ...overrides };
}

function elementNode(id: string, x: number, y: number): DfdNode {
	return {
		id,
		type: "dfdNode",
		position: { x, y },
		data: {
			label: id,
			elementType: "web_server",
			trustZone: "internal",
			description: "",
			technologies: [],
		},
	};
}

describe("captureCanvasIntoModel", () => {
	it("folds dragged element positions back into the model", () => {
		const captured = captureCanvasIntoModel(
			modelWithGeometry(),
			canvas({ nodes: [elementNode("comp-1", 120, 240)] }),
		);

		expect(captured.elements[0].position).toEqual({ x: 120, y: 240 });
	});

	it("leaves an element that has no node on the canvas untouched", () => {
		const captured = captureCanvasIntoModel(
			modelWithGeometry(),
			canvas({ nodes: [elementNode("comp-1", 120, 240)] }),
		);

		expect(captured.elements[1].position).toEqual({ x: 7, y: 7 });
	});

	it("captures trust boundary geometry and colors, defaulting size when the node has none", () => {
		const boundary: DfdNode = {
			id: "boundary-1",
			type: "boundaryNode",
			position: { x: 50, y: 60 },
			width: 640,
			height: 480,
			data: {
				label: "DMZ",
				elementType: "boundary",
				trustZone: "internal",
				description: "",
				technologies: [],
				isBoundary: true,
				boundaryFillColor: "#abcdef",
				boundaryFillOpacity: 0.25,
			},
		};

		const captured = captureCanvasIntoModel(modelWithGeometry(), canvas({ nodes: [boundary] }));

		expect(captured.trust_boundaries[0]).toMatchObject({
			position: { x: 50, y: 60 },
			size: { width: 640, height: 480 },
			fill_color: "#abcdef",
			fill_opacity: 0.25,
		});
	});

	it("captures a dragged edge label offset, handles, and stroke", () => {
		const edge: DfdEdge = {
			id: "flow-1",
			source: "comp-1",
			target: "comp-1",
			sourceHandle: "right-source",
			targetHandle: "top-target",
			data: {
				name: "Loop",
				protocol: "https",
				data: [],
				authenticated: true,
				labelOffsetX: 12,
				labelOffsetY: -8,
				strokeColor: "#ff0000",
			},
		};

		const captured = captureCanvasIntoModel(modelWithGeometry(), canvas({ edges: [edge] }));

		expect(captured.data_flows[0]).toMatchObject({
			label_offset: { x: 12, y: -8 },
			source_handle: "right-source",
			target_handle: "top-target",
			stroke_color: "#ff0000",
		});
	});

	it("writes the live viewport into every diagram and drops the sidecar layout reference", () => {
		const captured = captureCanvasIntoModel(
			modelWithGeometry(),
			canvas({ viewport: { x: -40, y: 15, zoom: 1.75 } }),
		);

		expect(captured.diagrams[0].viewport).toEqual({ x: -40, y: 15, zoom: 1.75 });
		expect(captured.diagrams[0].layout_file).toBeUndefined();
	});

	it("captures from the canvas it is given rather than any ambient active canvas", () => {
		// The workspace autosave relies on this: a write scheduled for one document must record
		// that document's geometry even if another document became active before it ran.
		const model = modelWithGeometry();
		const documentA = canvas({ nodes: [elementNode("comp-1", 10, 10)] });
		const documentB = canvas({ nodes: [elementNode("comp-1", 999, 999)] });

		expect(captureCanvasIntoModel(model, documentA).elements[0].position).toEqual({ x: 10, y: 10 });
		expect(captureCanvasIntoModel(model, documentB).elements[0].position).toEqual({
			x: 999,
			y: 999,
		});
	});
});
