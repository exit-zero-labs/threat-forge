import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Vp {
	x: number;
	y: number;
	zoom: number;
}

// The ReactFlow instance is stubbed: `useReactFlow` returns these spies, which DfdCanvas also
// registers into `canvas-instance-store`, so the same handles drive the viewport decision (#54
// step 7) and the registry's outgoing-viewport flush. `getViewport` returns a controllable live
// value; `setViewport` records the restore and updates it.
const rf = vi.hoisted(() => {
	let live: Vp = { x: 0, y: 0, zoom: 1 };
	const setViewport = vi.fn((v: Vp) => {
		live = v;
	});
	const getViewport = vi.fn(() => live);
	const fitView = vi.fn();
	return {
		setViewport,
		getViewport,
		fitView,
		zoomIn: vi.fn(),
		zoomOut: vi.fn(),
		screenToFlowPosition: vi.fn((p: { x: number; y: number }) => p),
		setLive: (v: Vp) => {
			live = v;
		},
		reset: () => {
			live = { x: 0, y: 0, zoom: 1 };
			setViewport.mockClear();
			getViewport.mockClear();
			fitView.mockClear();
		},
	};
});

vi.mock("@xyflow/react", () => ({
	ReactFlow: ({ children }: { children?: React.ReactNode }) => (
		<div data-testid="react-flow">{children}</div>
	),
	Background: () => null,
	BackgroundVariant: { Dots: "dots" },
	Controls: () => null,
	MiniMap: () => null,
	SelectionMode: { Partial: "partial" },
	Handle: () => null,
	Position: { Top: "top", Right: "right", Bottom: "bottom", Left: "left" },
	NodeResizeControl: () => null,
	BaseEdge: () => null,
	EdgeLabelRenderer: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	getBezierPath: () => ["", 0, 0],
	useViewport: () => ({ x: 0, y: 0, zoom: 1 }),
	useReactFlow: () => ({
		screenToFlowPosition: rf.screenToFlowPosition,
		setViewport: rf.setViewport,
		getViewport: rf.getViewport,
		fitView: rf.fitView,
		zoomIn: rf.zoomIn,
		zoomOut: rf.zoomOut,
	}),
}));

import { useCanvasStore } from "@/stores/canvas-store";
import { useDocumentRegistry } from "@/stores/document-registry";
import { createDocumentStores, setActiveStores } from "@/stores/document-stores";
import { useModelStore } from "@/stores/model-store";
import type { Element, ThreatModel } from "@/types/threat-model";
import { DfdCanvas } from "./dfd-canvas";

function makeModel(title: string, elements: Element[] = []): ThreatModel {
	return {
		version: "1.0",
		metadata: { title, author: "", created: "", modified: "", description: "" },
		elements,
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [],
	};
}

const elementFixture: Element = {
	id: "comp-1",
	type: "process",
	name: "Server",
	trust_zone: "",
	description: "",
	technologies: [],
};

let originalRaf: typeof requestAnimationFrame;

beforeEach(() => {
	rf.reset();
	// Run the effect's requestAnimationFrame decision synchronously so a single act() settles it.
	originalRaf = globalThis.requestAnimationFrame;
	globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
		cb(0);
		return 0;
	}) as typeof requestAnimationFrame;
	useDocumentRegistry.setState({ documents: {}, openDocumentIds: [], activeDocumentId: null });
	setActiveStores(createDocumentStores());
});

afterEach(() => {
	globalThis.requestAnimationFrame = originalRaf;
});

describe("DfdCanvas viewport on activation (#54 step 7)", () => {
	it("fits the view for an imported document with no inline positions, never inheriting the previous document's viewport", () => {
		const registry = useDocumentRegistry.getState();
		registry.createDocument({ model: makeModel("A"), filePath: "/a.thf", pendingLayout: null });
		// A has a laid-out node and a distinctive on-screen viewport.
		act(() => {
			useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 });
		});
		act(() => {
			useCanvasStore.getState().setViewport({ x: 120, y: -40, zoom: 2 });
		});

		render(<DfdCanvas />);
		rf.reset();
		rf.setLive({ x: 120, y: -40, zoom: 2 });

		// Import B: elements but no inline positions (pendingLayout null), so its viewport is default.
		act(() => {
			registry.createDocument({
				model: makeModel("B", [elementFixture]),
				filePath: null,
				pendingLayout: null,
			});
		});

		// B's nodes sync and then the view is fit. The pre-step-7 build keeps `initialSyncDone`
		// latched from A's mount and never re-fits, rendering B at A's pan/zoom — so it fails here.
		expect(rf.fitView).toHaveBeenCalled();
		// B never receives A's viewport.
		expect(rf.setViewport).not.toHaveBeenCalled();
	});

	it("restores a laid-out document's own viewport when returning to it", () => {
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: makeModel("A"),
			filePath: "/a.thf",
			pendingLayout: null,
		});
		act(() => {
			useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 });
		});

		render(<DfdCanvas />);

		// Simulate the user panning A on screen, then switch away to an imported B.
		rf.setLive({ x: 120, y: -40, zoom: 2 });
		act(() => {
			registry.createDocument({
				model: makeModel("B", [elementFixture]),
				filePath: null,
				pendingLayout: null,
			});
		});
		// A's live viewport was flushed into A's own canvas store on the way out.
		expect(registry.getDocumentStores(a)?.canvas.getState().viewport).toEqual({
			x: 120,
			y: -40,
			zoom: 2,
		});

		rf.reset();
		// Returning to A restores A's stored viewport after its nodes re-sync.
		act(() => {
			registry.activateDocument(a);
		});
		expect(rf.setViewport).toHaveBeenLastCalledWith({ x: 120, y: -40, zoom: 2 });
		expect(rf.fitView).not.toHaveBeenCalled();
	});

	it("fits the view for a fresh empty document rather than restoring a default viewport", () => {
		const registry = useDocumentRegistry.getState();
		registry.createDocument({ model: makeModel("A"), filePath: "/a.thf", pendingLayout: null });
		render(<DfdCanvas />);
		rf.reset();

		act(() => {
			registry.createDocument({ model: makeModel("B"), filePath: null, pendingLayout: null });
		});

		expect(rf.fitView).toHaveBeenCalled();
		expect(rf.setViewport).not.toHaveBeenCalled();
	});

	it("does not move the viewport when the active document is merely edited", () => {
		const registry = useDocumentRegistry.getState();
		registry.createDocument({
			model: makeModel("A", [elementFixture]),
			filePath: "/a.thf",
			pendingLayout: null,
		});
		render(<DfdCanvas />);
		rf.reset();

		// An edit changes the model reference but not the active document: the viewport decision is
		// latched for the activation and must not re-run.
		act(() => {
			useModelStore.getState().updateMetadata({ title: "Edited" });
		});

		expect(rf.setViewport).not.toHaveBeenCalled();
		expect(rf.fitView).not.toHaveBeenCalled();
	});
});
