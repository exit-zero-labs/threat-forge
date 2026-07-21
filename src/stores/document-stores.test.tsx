import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ThreatModel } from "@/types/threat-model";
import { useCanvasStore } from "./canvas-store";
import {
	createDocumentStores,
	type DocumentStores,
	getActiveStores,
	setActiveStores,
} from "./document-stores";
import { useHistoryStore } from "./history-store";
import { useModelStore } from "./model-store";

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

describe("document store bundles", () => {
	let original: DocumentStores;

	beforeEach(() => {
		original = getActiveStores();
	});

	afterEach(() => {
		setActiveStores(original);
	});

	it("gives each bundle its own store instances", () => {
		const a = createDocumentStores();
		const b = createDocumentStores();

		expect(a.model).not.toBe(b.model);
		expect(a.canvas).not.toBe(b.canvas);
		expect(a.history).not.toBe(b.history);
	});

	it("routes a canvas mutation to the injected model and history stores, not the active ones", () => {
		const active = createDocumentStores();
		active.model.getState().setModel(createTestModel("Active"), null);
		setActiveStores(active);

		// The active bundle also holds a model, so a canvas store that resolved "the" model
		// store globally would write there instead of into its own bundle.
		const other = createDocumentStores();
		other.model.getState().setModel(createTestModel("Other"), null);

		other.canvas.getState().addElement("web_server", { x: 0, y: 0 });

		expect(other.model.getState().model?.elements).toHaveLength(1);
		expect(other.history.getState().past).toHaveLength(1);
		expect(useModelStore.getState().model?.elements).toHaveLength(0);
		expect(useHistoryStore.getState().past).toHaveLength(0);
	});

	it("allocates element ids per bundle instead of from a shared counter", () => {
		const a = createDocumentStores();
		const b = createDocumentStores();
		a.model.getState().setModel(createTestModel("A"), null);
		b.model.getState().setModel(createTestModel("B"), null);

		a.canvas.getState().addElement("web_server", { x: 0, y: 0 });
		a.canvas.getState().addElement("web_server", { x: 0, y: 0 });
		b.canvas.getState().addElement("web_server", { x: 0, y: 0 });

		expect(a.model.getState().model?.elements.map((e) => e.id)).toEqual(["comp-1", "comp-2"]);
		expect(b.model.getState().model?.elements.map((e) => e.id)).toEqual(["comp-1"]);
	});

	it("groups rapid property edits per bundle so one document cannot swallow another's undo step", () => {
		const a = createDocumentStores();
		const b = createDocumentStores();
		const model = createTestModel("Shared shape");
		model.elements.push({
			id: "comp-1",
			type: "web_server",
			name: "Web App",
			trust_zone: "",
			description: "",
			technologies: [],
		});
		a.model.getState().setModel(structuredClone(model), null);
		b.model.getState().setModel(structuredClone(model), null);

		// Same debounce key, back to back. A shared module-level debounce would treat B's edit
		// as a continuation of A's and drop B's undo step.
		a.model.getState().updateElement("comp-1", { name: "A edit" });
		b.model.getState().updateElement("comp-1", { name: "B edit" });

		expect(a.history.getState().past).toHaveLength(1);
		expect(b.history.getState().past).toHaveLength(1);
	});

	describe("the store facades", () => {
		function DocumentProbe() {
			const filePath = useModelStore((s) => s.filePath);
			const undoDepth = useHistoryStore((s) => s.past.length);
			const nodeCount = useCanvasStore((s) => s.nodes.length);
			return (
				<output>
					{filePath ?? "none"}/{undoDepth}/{nodeCount}
				</output>
			);
		}

		it("re-subscribe through React when the active bundle changes, and restore on return", () => {
			// Bundle A ends up with two undo entries (the explicit snapshot plus the one
			// addElement pushes) and one canvas node; bundle B has none of either.
			const a = createDocumentStores();
			a.model.getState().setModel(createTestModel("A"), "/a.thf");
			a.history.getState().pushSnapshot(createTestModel("A"));
			a.canvas.getState().addElement("web_server", { x: 0, y: 0 });

			const b = createDocumentStores();
			b.model.getState().setModel(createTestModel("B"), "/b.thf");

			setActiveStores(a);
			render(<DocumentProbe />);
			expect(screen.getByRole("status")).toHaveTextContent("/a.thf/2/1");

			act(() => setActiveStores(b));
			expect(screen.getByRole("status")).toHaveTextContent("/b.thf/0/0");

			act(() => setActiveStores(a));
			expect(screen.getByRole("status")).toHaveTextContent("/a.thf/2/1");
		});

		it("read and write the active bundle through getState and setState", () => {
			const a = createDocumentStores();
			const b = createDocumentStores();

			setActiveStores(a);
			useModelStore.setState({ filePath: "/a.thf" });
			expect(a.model.getState().filePath).toBe("/a.thf");

			setActiveStores(b);
			expect(useModelStore.getState().filePath).toBeNull();
			expect(a.model.getState().filePath).toBe("/a.thf");
		});
	});
});
