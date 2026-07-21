import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSession } from "@/types/chat-session";
import type { DiagramLayout, FileSettings, ThreatModel } from "@/types/threat-model";
import { useCanvasInstanceStore } from "./canvas-instance-store";
import { useCanvasStore } from "./canvas-store";
import { useChatStore } from "./chat-store";
import { useDocumentRegistry } from "./document-registry";
import { createDocumentStores, getActiveStores, setActiveStores } from "./document-stores";
import { useHistoryStore } from "./history-store";
import { useModelStore } from "./model-store";
import { useUiStore } from "./ui-store";

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

// Coverage for the file-scoped settings that #53 step 6 moved off the workspace settings
// store and onto the per-document session. The corresponding cases previously lived in
// `settings-store.test.ts`.
describe("document-owned file settings", () => {
	it("seeds fileSettings from every provided metadata settings field", () => {
		const registry = useDocumentRegistry.getState();
		const id = registry.createDocument({
			model: createTestModel("Configured", {
				grid_size: 24,
				default_element_fill: "#3b82f6",
			}),
			filePath: null,
			pendingLayout: null,
		});

		const { fileSettings } = useDocumentRegistry.getState().documents[id];
		expect(fileSettings).not.toBeNull();
		expect(fileSettings?.grid_size).toBe(24);
		expect(fileSettings?.default_element_fill).toBe("#3b82f6");
	});

	it("disposes fileSettings when the document is closed", () => {
		const registry = useDocumentRegistry.getState();
		const id = registry.createDocument({
			model: createTestModel("Configured", { grid_size: 24 }),
			filePath: "/only.thf",
			pendingLayout: null,
		});
		expect(useDocumentRegistry.getState().documents[id].fileSettings).toEqual({ grid_size: 24 });

		registry.closeDocument(id);
		// The session — and with it the file settings — is gone entirely, not merely blanked.
		expect(useDocumentRegistry.getState().documents[id]).toBeUndefined();
	});

	it("replaces fileSettings wholesale, dropping fields absent from the new value", () => {
		const registry = useDocumentRegistry.getState();
		const id = registry.createDocument({
			model: createTestModel("Configured", {
				grid_size: 24,
				default_element_fill: "#3b82f6",
			}),
			filePath: null,
			pendingLayout: null,
		});

		registry.setDocumentFileSettings(id, { grid_size: 32, default_boundary_fill: "#22c55e" });

		const { fileSettings } = useDocumentRegistry.getState().documents[id];
		expect(fileSettings?.grid_size).toBe(32);
		expect(fileSettings?.default_boundary_fill).toBe("#22c55e");
		// The field only present in the previous value must not survive the replacement.
		expect(fileSettings?.default_element_fill).toBeUndefined();
	});

	it("isolates fileSettings between two open documents", () => {
		const registry = useDocumentRegistry.getState();
		const configured = registry.createDocument({
			model: createTestModel("Configured", { grid_size: 24 }),
			filePath: "/configured.thf",
			pendingLayout: null,
		});
		// A second document whose model carries no settings must not inherit the first's.
		const plain = registry.createDocument({
			model: createTestModel("Plain"),
			filePath: "/plain.thf",
			pendingLayout: null,
		});

		expect(useDocumentRegistry.getState().documents[plain].fileSettings).toBeNull();
		expect(useDocumentRegistry.getState().documents[configured].fileSettings).toEqual({
			grid_size: 24,
		});

		// Mutating one document's settings leaves the other untouched.
		registry.setDocumentFileSettings(plain, { grid_size: 8 });
		expect(useDocumentRegistry.getState().documents[configured].fileSettings).toEqual({
			grid_size: 24,
		});
	});
});

describe("canvas viewport on document switch", () => {
	let live = { x: 0, y: 0, zoom: 1 };
	const rfSetViewport = vi.fn((viewport: typeof live) => {
		live = viewport;
	});
	const rfGetViewport = vi.fn(() => live);
	const rfFitView = vi.fn();

	beforeEach(() => {
		live = { x: 0, y: 0, zoom: 1 };
		rfSetViewport.mockClear();
		rfGetViewport.mockClear();
		rfFitView.mockClear();
		// Stand in for the mounted ReactFlow instance registered by DfdCanvas.
		useCanvasInstanceStore.setState({ rfSetViewport, rfGetViewport, rfFitView });
	});

	afterEach(() => {
		useCanvasInstanceStore.setState({
			rfSetViewport: null,
			rfGetViewport: null,
			rfFitView: null,
		});
		useUiStore.getState().setRightPanelTab("properties");
	});

	it("flushes the outgoing viewport and restores the incoming one on a real switch", () => {
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: createTestModel("A"),
			filePath: "/a.thf",
			pendingLayout: null,
		});
		// Give A a laid-out node so its restore pushes a viewport instead of fitting.
		useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 });
		// Simulate the user having panned and zoomed A on screen.
		live = { x: 120, y: -40, zoom: 2 };

		// Creating B switches away from A, flushing A's live viewport into A's own canvas store.
		const b = registry.createDocument({
			model: createTestModel("B"),
			filePath: "/b.thf",
			pendingLayout: null,
		});
		expect(registry.getDocumentStores(a)?.canvas.getState().viewport).toEqual({
			x: 120,
			y: -40,
			zoom: 2,
		});
		// B has no nodes yet, so activation fits the view rather than pushing a viewport.
		expect(rfFitView).toHaveBeenCalled();

		// Work in B and simulate a distinct on-screen viewport for it.
		useCanvasStore.getState().addElement("data_store", { x: 5, y: 5 });
		live = { x: 7, y: 8, zoom: 3 };

		// Returning to A flushes B's viewport and restores A's saved pan/zoom exactly.
		registry.activateDocument(a);
		expect(registry.getDocumentStores(b)?.canvas.getState().viewport).toEqual({
			x: 7,
			y: 8,
			zoom: 3,
		});
		expect(rfSetViewport).toHaveBeenLastCalledWith({ x: 120, y: -40, zoom: 2 });
	});

	it("fits the view when returning to a document that has no laid-out nodes", () => {
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

		rfFitView.mockClear();
		rfSetViewport.mockClear();
		registry.activateDocument(a);

		// A never received a node, so switching back fits rather than restoring a stored viewport.
		expect(rfFitView).toHaveBeenCalledTimes(1);
		expect(rfSetViewport).not.toHaveBeenCalled();
	});

	it("keeps workspace UI state across a document switch (negative control)", () => {
		// Workspace-scoped UI state must survive a switch; only document state is per-document.
		useUiStore.getState().setRightPanelTab("threats");

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
		registry.activateDocument(a);

		expect(useUiStore.getState().rightPanelTab).toBe("threats");
	});
});

describe("AI session references on document switch", () => {
	function makeSession(id: string): ChatSession {
		return { id, title: id, messages: [], createdAt: "t", updatedAt: "t" };
	}

	beforeEach(() => {
		// Reset the workspace chat store so session state does not leak between tests.
		useChatStore.setState({
			sessions: [],
			activeSessionId: null,
			sessionKey: null,
			messages: [],
			isStreaming: false,
			error: null,
		});
	});

	it("remembers each document's active chat session and restores it on return", () => {
		useChatStore.setState({
			sessions: [makeSession("sess-a"), makeSession("sess-b")],
			activeSessionId: "sess-a",
			sessionKey: "threatforge-chat-sessions:unsaved",
			messages: [],
		});

		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: createTestModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		// Creating B switches away from A, recording A's active session reference.
		const b = registry.createDocument({
			model: createTestModel("B"),
			filePath: null,
			pendingLayout: null,
		});
		expect(useDocumentRegistry.getState().documents[a].activeChatSessionId).toBe("sess-a");

		// The user selects a different session while B is active.
		useChatStore.getState().switchSession("sess-b");
		expect(useChatStore.getState().activeSessionId).toBe("sess-b");

		// Returning to A records B's session and restores A's remembered one.
		registry.activateDocument(a);
		expect(useDocumentRegistry.getState().documents[b].activeChatSessionId).toBe("sess-b");
		expect(useChatStore.getState().activeSessionId).toBe("sess-a");
	});

	it("does not restore a chat session that no longer exists", () => {
		useChatStore.setState({
			sessions: [makeSession("sess-x"), makeSession("sess-y")],
			activeSessionId: "sess-x",
			sessionKey: "threatforge-chat-sessions:unsaved",
			messages: [],
		});

		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: createTestModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		// Leaving A records its active session (sess-x).
		registry.createDocument({
			model: createTestModel("B"),
			filePath: null,
			pendingLayout: null,
		});
		// The user moves to sess-y in B and sess-x is later deleted from the workspace store.
		useChatStore.getState().switchSession("sess-y");
		useChatStore.setState({ sessions: [makeSession("sess-y")], activeSessionId: "sess-y" });

		// Returning to A tries to restore sess-x, which no longer exists: switchSession no-ops
		// and the active session is left as-is rather than cleared.
		registry.activateDocument(a);
		expect(useChatStore.getState().activeSessionId).toBe("sess-y");
	});
});
