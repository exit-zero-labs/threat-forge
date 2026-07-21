import { beforeEach, describe, expect, it } from "vitest";
import type { DiagramLayout, FileSettings, ThreatModel } from "@/types/threat-model";
import { useCanvasStore } from "./canvas-store";
import { useDocumentRegistry } from "./document-registry";
import { createDocumentStores, getActiveStores, setActiveStores } from "./document-stores";
import { useHistoryStore } from "./history-store";
import { useModelStore } from "./model-store";

function createTestModel(title: string, settings?: FileSettings): ThreatModel {
	return {
		version: "1.0",
		metadata: {
			title,
			author: "Test",
			created: "2026-01-01",
			modified: "2026-01-01",
			description: "",
			...(settings ? { settings } : {}),
		},
		elements: [],
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [],
	};
}

/** Reset the registry and install a clean scratch bundle so each test starts isolated. */
beforeEach(() => {
	useDocumentRegistry.setState({
		documents: {},
		openDocumentIds: [],
		activeDocumentId: null,
	});
	setActiveStores(createDocumentStores());
});

describe("document registry lifecycle", () => {
	it("registers a document, points the facades at its bundle, and returns a fresh id", () => {
		const registry = useDocumentRegistry.getState();
		const id = registry.createDocument({
			model: createTestModel("Alpha"),
			filePath: "/alpha.thf",
			pendingLayout: null,
		});

		const state = useDocumentRegistry.getState();
		expect(state.activeDocumentId).toBe(id);
		expect(state.openDocumentIds).toEqual([id]);
		expect(state.documents[id]).toBeDefined();
		// The facade now resolves the new document's own bundle.
		expect(getActiveStores()).toBe(registry.getDocumentStores(id));
		expect(useModelStore.getState().model?.metadata.title).toBe("Alpha");
		expect(useModelStore.getState().filePath).toBe("/alpha.thf");
	});

	it("gives every document its own store instances", () => {
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: createTestModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		const b = registry.createDocument({
			model: createTestModel("B"),
			filePath: null,
			pendingLayout: null,
		});

		expect(a).not.toBe(b);
		const storesA = registry.getDocumentStores(a);
		const storesB = registry.getDocumentStores(b);
		expect(storesA?.model).not.toBe(storesB?.model);
		expect(storesA?.canvas).not.toBe(storesB?.canvas);
		expect(storesA?.history).not.toBe(storesB?.history);
		// Creating a second document leaves it active and appends to the open order.
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(b);
		expect(useDocumentRegistry.getState().openDocumentIds).toEqual([a, b]);
	});

	it("seeds the pending layout onto the new bundle, not the outgoing active one", () => {
		const layout: DiagramLayout = {
			diagram_id: "diagram-1",
			nodes: [{ id: "comp-1", x: 10, y: 20 }],
			viewport: { x: 5, y: 6, zoom: 2 },
		};
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: createTestModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		const b = registry.createDocument({
			model: createTestModel("B"),
			filePath: null,
			pendingLayout: layout,
		});

		expect(registry.getDocumentStores(b)?.canvas.getState().pendingLayout).toEqual(layout);
		// The previously active document must not have received the incoming layout.
		expect(registry.getDocumentStores(a)?.canvas.getState().pendingLayout).toBeNull();
	});

	it("seeds fileSettings from model metadata, or null when the model carries none", () => {
		const registry = useDocumentRegistry.getState();
		const withSettings = registry.createDocument({
			model: createTestModel("Configured", { grid_size: 24 }),
			filePath: null,
			pendingLayout: null,
		});
		const withoutSettings = registry.createDocument({
			model: createTestModel("Plain"),
			filePath: null,
			pendingLayout: null,
		});

		expect(useDocumentRegistry.getState().documents[withSettings].fileSettings).toEqual({
			grid_size: 24,
		});
		expect(useDocumentRegistry.getState().documents[withoutSettings].fileSettings).toBeNull();
	});

	it("activates a document by pointing the facades at its bundle", () => {
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: createTestModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		registry.createDocument({
			model: createTestModel("B"),
			filePath: null,
			pendingLayout: null,
		});

		expect(useModelStore.getState().model?.metadata.title).toBe("B");
		registry.activateDocument(a);
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(a);
		expect(getActiveStores()).toBe(registry.getDocumentStores(a));
		expect(useModelStore.getState().model?.metadata.title).toBe("A");
	});

	it("ignores activation of an unknown id", () => {
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: createTestModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		registry.activateDocument("doc-does-not-exist" as ReturnType<typeof registry.createDocument>);
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(a);
		expect(getActiveStores()).toBe(registry.getDocumentStores(a));
	});
});

describe("closing documents", () => {
	it("leaves the active pointer unchanged when a non-active document closes", () => {
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: createTestModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		const b = registry.createDocument({
			model: createTestModel("B"),
			filePath: null,
			pendingLayout: null,
		});

		registry.closeDocument(a);

		const state = useDocumentRegistry.getState();
		expect(state.documents[a]).toBeUndefined();
		expect(state.openDocumentIds).toEqual([b]);
		expect(state.activeDocumentId).toBe(b);
		expect(getActiveStores()).toBe(registry.getDocumentStores(b));
	});

	it("activates a remaining document when the active one closes", () => {
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: createTestModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		const b = registry.createDocument({
			model: createTestModel("B"),
			filePath: null,
			pendingLayout: null,
		});
		const c = registry.createDocument({
			model: createTestModel("C"),
			filePath: null,
			pendingLayout: null,
		});

		registry.closeDocument(c);

		const state = useDocumentRegistry.getState();
		expect(state.documents[c]).toBeUndefined();
		expect(state.openDocumentIds).toEqual([a, b]);
		expect(state.activeDocumentId).toBe(b);
		expect(useModelStore.getState().model?.metadata.title).toBe("B");
	});

	it("clears the pointer and installs a fresh scratch bundle when the last document closes", () => {
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: createTestModel("Only"),
			filePath: "/only.thf",
			pendingLayout: null,
		});

		const before = getActiveStores();
		registry.closeDocument(a);

		const state = useDocumentRegistry.getState();
		expect(state.activeDocumentId).toBeNull();
		expect(state.openDocumentIds).toEqual([]);
		expect(state.documents).toEqual({});
		// A brand-new scratch bundle so nothing written while no document is open can resurface.
		const after = getActiveStores();
		expect(after).not.toBe(before);
		expect(after.model.getState().model).toBeNull();
		expect(after.canvas.getState().nodes).toEqual([]);
	});

	it("ignores closing an unknown id", () => {
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: createTestModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		const before = getActiveStores();

		registry.closeDocument("doc-missing" as typeof a);

		const state = useDocumentRegistry.getState();
		expect(state.openDocumentIds).toEqual([a]);
		expect(state.activeDocumentId).toBe(a);
		expect(getActiveStores()).toBe(before);
	});
});

describe("per-document session metadata", () => {
	it("updates fileSettings and chat-session references on the addressed document only", () => {
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: createTestModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		const b = registry.createDocument({
			model: createTestModel("B"),
			filePath: null,
			pendingLayout: null,
		});

		registry.setDocumentFileSettings(a, { grid_size: 32 });
		registry.setDocumentChatSessionId(a, "session-a");

		const state = useDocumentRegistry.getState();
		expect(state.documents[a].fileSettings).toEqual({ grid_size: 32 });
		expect(state.documents[a].activeChatSessionId).toBe("session-a");
		expect(state.documents[b].fileSettings).toBeNull();
		expect(state.documents[b].activeChatSessionId).toBeNull();
	});

	it("ignores metadata updates for unknown ids", () => {
		const registry = useDocumentRegistry.getState();
		registry.setDocumentFileSettings("doc-missing" as ReturnType<typeof registry.createDocument>, {
			grid_size: 8,
		});
		expect(useDocumentRegistry.getState().documents).toEqual({});
	});
});

describe("document isolation", () => {
	it("keeps a second document's edits out of the first and restores the first on return", () => {
		const registry = useDocumentRegistry.getState();

		// Document A: two elements and their history, seen through the live facades.
		const a = registry.createDocument({
			model: createTestModel("A"),
			filePath: "/a.thf",
			pendingLayout: null,
		});
		useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 });
		useCanvasStore.getState().addElement("web_server", { x: 10, y: 10 });

		expect(useModelStore.getState().model?.elements.map((e) => e.id)).toEqual(["comp-1", "comp-2"]);
		expect(useHistoryStore.getState().past).toHaveLength(2);

		// Activating B must present B's own empty bundle, not A's populated one.
		const b = registry.createDocument({
			model: createTestModel("B"),
			filePath: "/b.thf",
			pendingLayout: null,
		});
		expect(useModelStore.getState().model?.elements).toEqual([]);
		expect(useCanvasStore.getState().nodes).toEqual([]);
		expect(useHistoryStore.getState().past).toEqual([]);
		expect(useModelStore.getState().filePath).toBe("/b.thf");

		// Editing B allocates ids from B's own counter and must not touch A's bundle.
		useCanvasStore.getState().addElement("data_store", { x: 5, y: 5 });
		expect(useModelStore.getState().model?.elements.map((e) => e.id)).toEqual(["comp-1"]);
		expect(registry.getDocumentStores(a)?.model.getState().model?.elements).toHaveLength(2);

		// Returning to A restores its canvas, ids, and undo depth byte-for-byte.
		registry.activateDocument(a);
		expect(useModelStore.getState().model?.metadata.title).toBe("A");
		expect(useModelStore.getState().model?.elements.map((e) => e.id)).toEqual(["comp-1", "comp-2"]);
		expect(useModelStore.getState().filePath).toBe("/a.thf");
		expect(useHistoryStore.getState().past).toHaveLength(2);
		// B remains intact with its single, independently numbered element.
		expect(registry.getDocumentStores(b)?.model.getState().model?.elements).toHaveLength(1);
	});
});
