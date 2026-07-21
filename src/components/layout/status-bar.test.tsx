import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useCanvasStore } from "@/stores/canvas-store";
import { useDocumentRegistry } from "@/stores/document-registry";
import { createDocumentStores, setActiveStores } from "@/stores/document-stores";
import type { ThreatModel } from "@/types/threat-model";
import { StatusBar } from "./status-bar";

function createTestModel(title: string): ThreatModel {
	return {
		version: "1.0",
		metadata: {
			title,
			author: "Test",
			created: "2026-01-01",
			modified: "2026-01-01",
			description: "",
		},
		elements: [],
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [],
	};
}

beforeEach(() => {
	useDocumentRegistry.setState({
		documents: {},
		openDocumentIds: [],
		activeDocumentId: null,
	});
	setActiveStores(createDocumentStores());
});

/**
 * Plan step 9 case 10 — the React re-subscription proof. `StatusBar` reads `model`, `isDirty`,
 * `filePath`, `past.length`, and `future.length` through the store facades. Because activating a
 * document swaps the bundle those facades resolve, the mounted component must re-render and
 * re-subscribe on a switch rather than serve a stale snapshot.
 */
describe("StatusBar across a document switch (plan step 9)", () => {
	it("case 10 - reflects the active document's counts and file path across switches", () => {
		const registry = useDocumentRegistry.getState();

		// Document A: two elements, one flow, three history pushes, saved at /a.thf.
		const a = registry.createDocument({
			model: createTestModel("A"),
			filePath: "/a.thf",
			pendingLayout: null,
		});
		useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 });
		useCanvasStore.getState().addElement("data_store", { x: 10, y: 10 });
		useCanvasStore.getState().addDataFlow("comp-1", "comp-2");

		render(<StatusBar />);
		const bar = screen.getByTestId("status-bar");
		expect(bar).toHaveTextContent("2 elements");
		expect(bar).toHaveTextContent("1 flow");
		expect(bar).toHaveTextContent("Undo: 3 / Redo: 0");
		expect(bar).toHaveTextContent("/a.thf");

		// Switch to an empty, unsaved document B: the same mounted bar now shows B's state.
		act(() => {
			registry.createDocument({ model: createTestModel("B"), filePath: null, pendingLayout: null });
		});
		expect(bar).toHaveTextContent("0 elements");
		expect(bar).toHaveTextContent("0 flows");
		expect(bar).not.toHaveTextContent("Undo:");
		expect(bar).not.toHaveTextContent("/a.thf");

		// Returning to A restores its rendered counts and file path — a stale snapshot would not.
		act(() => {
			registry.activateDocument(a);
		});
		expect(bar).toHaveTextContent("2 elements");
		expect(bar).toHaveTextContent("1 flow");
		expect(bar).toHaveTextContent("Undo: 3 / Redo: 0");
		expect(bar).toHaveTextContent("/a.thf");
	});
});
