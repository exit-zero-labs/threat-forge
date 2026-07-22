import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseThreatModelYaml } from "@/lib/thf-yaml";
import type { ChatSession } from "@/types/chat-session";
import type { DocumentId } from "@/types/document";
import type { DiagramLayout, FileSettings, Threat, ThreatModel } from "@/types/threat-model";
// A newer-build document that carries a section, a metadata key, and an element key this build's
// schema does not model. Case 7 uses it to prove the registry treats the model as opaque (#57 seam).
import unknownFieldsRaw from "../../tests/fixtures/thf/v1.0-unknown-fields.thf?raw";
import { useCanvasInstanceStore } from "./canvas-instance-store";
import { useCanvasStore } from "./canvas-store";
import { useChatStore } from "./chat-store";
import { useClipboardStore } from "./clipboard-store";
import { useDocumentRegistry } from "./document-registry";
import { createDocumentStores, getActiveStores, setActiveStores } from "./document-stores";
import { useHistoryStore } from "./history-store";
import { useModelStore } from "./model-store";
import { useUiStore } from "./ui-store";

/**
 * A controllable STRIDE adapter whose `analyze` stays pending until the test resolves it, so case
 * 6 can switch documents mid-analysis and observe which document the threats land on.
 */
const stride = vi.hoisted(() => {
	let pendingResolve: ((threats: Threat[]) => void) | null = null;
	const analyze = vi.fn(
		() =>
			new Promise<Threat[]>((resolve) => {
				pendingResolve = resolve;
			}),
	);
	return {
		analyze,
		resolvePending: (threats: Threat[]) => {
			pendingResolve?.(threats);
			pendingResolve = null;
		},
		reset: () => {
			pendingResolve = null;
			analyze.mockClear();
		},
	};
});

vi.mock("@/lib/adapters/get-stride-adapter", () => ({
	getStrideAdapter: () => Promise.resolve({ analyze: stride.analyze }),
}));

function makeThreat(id: string): Threat {
	return { id, title: `Threat ${id}`, category: "Spoofing", severity: "high", description: "" };
}

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
	stride.reset();
	// Workspace singletons are shared across documents; reset them so the negative control in
	// case 3 starts from a known baseline rather than inheriting another test's state.
	useClipboardStore.setState({ clipboard: null, pasteCount: 0 });
	useUiStore.setState({ rightPanelTab: "properties" });
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

/** Fetch a document's own store bundle, failing loudly rather than casting past a null. */
function requireStores(id: DocumentId) {
	const stores = useDocumentRegistry.getState().getDocumentStores(id);
	if (!stores) throw new Error(`expected a store bundle for ${id}`);
	return stores;
}

/**
 * Seed document A with two elements, one flow, a distinct element and threat selection, a
 * non-default viewport, and file settings. Shared by cases 1 and 2 so the isolation assertion
 * (case 1) and the restore assertion (case 2) exercise the same fully populated document.
 */
function seedPopulatedDocumentA(): DocumentId {
	const registry = useDocumentRegistry.getState();
	const a = registry.createDocument({
		model: createTestModel("A", { grid_size: 24 }),
		filePath: "/a.thf",
		pendingLayout: null,
	});
	useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 }); // comp-1, pushes history
	useCanvasStore.getState().addElement("data_store", { x: 40, y: 40 }); // comp-2, pushes history
	useCanvasStore.getState().addDataFlow("comp-1", "comp-2"); // flow-1, pushes history
	// A distinct selection on two independent axes; setSelectedThreat does not clear the element.
	useModelStore.getState().setSelectedElement("comp-1");
	useModelStore.getState().setSelectedThreat("threat-x");
	useCanvasStore.getState().setViewport({ x: 100, y: 200, zoom: 2 });
	return a;
}

/**
 * Plan step 9 — ten discriminating isolation cases. Each fails for a leak (state bleeding across
 * a switch) and for the opposite defect of wiping a document's state on every switch.
 *
 * Traceability (plan case -> test):
 *   1  -> "case 1 - activating another document exposes none of A's canvas, history, selection, viewport, or file settings"
 *   2  -> "case 2 - returning to a document restores its canvas, history, selection, viewport, and file settings"
 *   3  -> "case 3 - workspace clipboard and right-panel tab persist across a document switch"
 *   4  -> "case 4 - each document allocates element ids from its own counter"
 *   5  -> "case 5 - undo in a document with empty history never restores another document's snapshot"
 *   6  -> "case 6 - a STRIDE analysis resolving after a switch lands its threats on the originating document"
 *   7  -> "case 7 - unknown model fields survive push/undo/redo and a document switch"
 *   8  -> pre-existing: src/hooks/use-file-operations.test.ts
 *         "Save As to two different paths keeps the same document id and preserves undo depth"
 *   9  -> "case 9 - ten documents each report their own node count, history depth, and selection"
 *   10 -> src/components/layout/status-bar.test.tsx
 *         "case 10 - reflects the active document's counts and file path across switches"
 */
describe("document state isolation (plan step 9)", () => {
	it("case 1 - activating another document exposes none of A's canvas, history, selection, viewport, or file settings", () => {
		const registry = useDocumentRegistry.getState();
		const a = seedPopulatedDocumentA();
		// Sanity: A really is populated before we switch away.
		expect(useModelStore.getState().model?.elements).toHaveLength(2);
		expect(useModelStore.getState().model?.data_flows).toHaveLength(1);
		expect(useHistoryStore.getState().past).toHaveLength(3);

		const b = registry.createDocument({
			model: createTestModel("B"),
			filePath: null,
			pendingLayout: null,
		});

		// Canvas: nothing from A is visible under B.
		expect(useCanvasStore.getState().nodes).toEqual([]);
		expect(useCanvasStore.getState().edges).toEqual([]);
		expect(useModelStore.getState().model?.elements).toEqual([]);
		expect(useModelStore.getState().model?.data_flows).toEqual([]);
		// History.
		expect(useHistoryStore.getState().past).toEqual([]);
		expect(useHistoryStore.getState().future).toEqual([]);
		// Selection — every axis the acceptance criterion names.
		expect(useModelStore.getState().selectedElementId).toBeNull();
		expect(useModelStore.getState().selectedEdgeId).toBeNull();
		expect(useModelStore.getState().selectedBoundaryId).toBeNull();
		expect(useModelStore.getState().selectedThreatId).toBeNull();
		// Viewport, dirty flag, and path.
		expect(useCanvasStore.getState().viewport).toEqual({ x: 0, y: 0, zoom: 1 });
		expect(useModelStore.getState().isDirty).toBe(false);
		expect(useModelStore.getState().filePath).toBeNull();
		// File settings live on the session record; B carried none while A keeps its own.
		expect(useDocumentRegistry.getState().documents[b].fileSettings).toBeNull();
		expect(useDocumentRegistry.getState().documents[a].fileSettings).toEqual({ grid_size: 24 });
	});

	it("case 2 - returning to a document restores its canvas, history, selection, viewport, and file settings", () => {
		const registry = useDocumentRegistry.getState();
		const a = seedPopulatedDocumentA();

		registry.createDocument({ model: createTestModel("B"), filePath: null, pendingLayout: null });
		// B is active and empty here (asserted by case 1); now return to A.
		registry.activateDocument(a);

		// Restore, not reset: A comes back exactly as it was left, so this fails any design that
		// "prevents leaks" by clearing state on switch.
		expect(useModelStore.getState().model?.metadata.title).toBe("A");
		expect(useModelStore.getState().model?.elements.map((e) => e.id)).toEqual(["comp-1", "comp-2"]);
		expect(useModelStore.getState().model?.data_flows.map((f) => f.id)).toEqual(["flow-1"]);
		expect(useModelStore.getState().filePath).toBe("/a.thf");
		expect(useModelStore.getState().isDirty).toBe(true);
		expect(useHistoryStore.getState().past).toHaveLength(3);
		// Selection restored on both axes rather than cleared.
		expect(useModelStore.getState().selectedElementId).toBe("comp-1");
		expect(useModelStore.getState().selectedThreatId).toBe("threat-x");
		expect(useModelStore.getState().selectedEdgeId).toBeNull();
		expect(useModelStore.getState().selectedBoundaryId).toBeNull();
		expect(useCanvasStore.getState().viewport).toEqual({ x: 100, y: 200, zoom: 2 });
		expect(useDocumentRegistry.getState().documents[a].fileSettings).toEqual({ grid_size: 24 });
	});

	it("case 3 - workspace clipboard and right-panel tab persist across a document switch", () => {
		const registry = useDocumentRegistry.getState();
		registry.createDocument({ model: createTestModel("A"), filePath: null, pendingLayout: null });
		useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 });
		// Select the node so there is something to copy, then copy it into the workspace clipboard.
		useCanvasStore.setState({
			nodes: useCanvasStore.getState().nodes.map((n) => ({ ...n, selected: true })),
		});
		useUiStore.getState().setRightPanelTab("threats");
		useClipboardStore.getState().copySelected();
		expect(useClipboardStore.getState().clipboard?.elements).toHaveLength(1);

		registry.createDocument({ model: createTestModel("B"), filePath: null, pendingLayout: null });

		// Workspace state belongs to the window, not the document, so it survives the switch. This
		// fails any implementation that scopes workspace state per document.
		expect(useUiStore.getState().rightPanelTab).toBe("threats");
		expect(useClipboardStore.getState().clipboard?.elements).toHaveLength(1);
		expect(useClipboardStore.getState().clipboard?.elements[0].id).toBe("comp-1");
	});

	it("case 4 - each document allocates element ids from its own counter", () => {
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: createTestModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 }); // comp-1
		useCanvasStore.getState().addElement("web_server", { x: 10, y: 10 }); // comp-2
		useCanvasStore.getState().addElement("web_server", { x: 20, y: 20 }); // comp-3
		expect(useModelStore.getState().model?.elements.map((e) => e.id)).toEqual([
			"comp-1",
			"comp-2",
			"comp-3",
		]);

		registry.createDocument({ model: createTestModel("B"), filePath: null, pendingLayout: null });
		useCanvasStore.getState().addElement("data_store", { x: 0, y: 0 });
		// B numbers from its own counter, and A's ids are untouched — this fails the module-level
		// counters the plan's evidence item 2 called out.
		expect(useModelStore.getState().model?.elements.map((e) => e.id)).toEqual(["comp-1"]);
		expect(
			requireStores(a)
				.model.getState()
				.model?.elements.map((e) => e.id),
		).toEqual(["comp-1", "comp-2", "comp-3"]);

		// Returning to A continues A's own counter at comp-4.
		registry.activateDocument(a);
		useCanvasStore.getState().addElement("web_server", { x: 30, y: 30 });
		expect(useModelStore.getState().model?.elements.map((e) => e.id)).toEqual([
			"comp-1",
			"comp-2",
			"comp-3",
			"comp-4",
		]);
	});

	it("case 5 - undo in a document with empty history never restores another document's snapshot", () => {
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: createTestModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 });
		expect(useHistoryStore.getState().canUndo()).toBe(true);

		registry.createDocument({ model: createTestModel("B"), filePath: null, pendingLayout: null });
		expect(useHistoryStore.getState().canUndo()).toBe(false);

		const bModel = useModelStore.getState().model as ThreatModel;
		const restored = useHistoryStore.getState().undo(bModel);
		// B's empty history yields nothing and does not reach into A's snapshots.
		expect(restored).toBeNull();
		expect(useModelStore.getState().model?.elements).toEqual([]);
		expect(requireStores(a).history.getState().canUndo()).toBe(true);
		expect(requireStores(a).history.getState().past).toHaveLength(1);
	});

	it("case 6 - a STRIDE analysis resolving after a switch lands its threats on the originating document", async () => {
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: createTestModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		const aStores = requireStores(a);

		// Start the analysis on A's own store; the adapter promise stays pending.
		const analysis = aStores.model.getState().analyzeThreats();
		expect(aStores.model.getState().isAnalyzing).toBe(true);

		// Switch to B while the analysis is in flight.
		const b = registry.createDocument({
			model: createTestModel("B"),
			filePath: null,
			pendingLayout: null,
		});
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(b);

		// Let the adapter chain reach `analyze(model)` so a resolve actually settles the call.
		await vi.waitFor(() => expect(stride.analyze).toHaveBeenCalledTimes(1));

		// Resolving now must attribute the threats to A, not the active document. This fails any
		// design where the model store resolves "the active document" at completion time.
		stride.resolvePending([makeThreat("t1")]);
		await analysis;

		expect(aStores.model.getState().model?.threats.map((t) => t.id)).toEqual(["t1"]);
		expect(aStores.model.getState().isAnalyzing).toBe(false);
		expect(requireStores(b).model.getState().model?.threats).toEqual([]);
		expect(useModelStore.getState().model?.threats).toEqual([]);
	});

	it("case 7 - unknown model fields survive push/undo/redo and a document switch", () => {
		// A document written by a hypothetical newer build. The registry must treat the model as an
		// opaque payload (the #57 seam), so schema-unknown fields survive history and a switch.
		const forwardModel = parseThreatModelYaml(unknownFieldsRaw);
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: forwardModel,
			filePath: "/forward.thf",
			pendingLayout: null,
		});
		const aStores = requireStores(a);

		// Push a snapshot, mutate, then undo and redo through the history store as the app does.
		aStores.history.getState().pushSnapshot(aStores.model.getState().model as ThreatModel);
		aStores.model.getState().updateMetadata({ title: "Edited" });
		const undone = aStores.history.getState().undo(aStores.model.getState().model as ThreatModel);
		if (!undone) throw new Error("expected an undo snapshot");
		aStores.model.getState().restoreSnapshot(undone);
		const redone = aStores.history.getState().redo(aStores.model.getState().model as ThreatModel);
		if (!redone) throw new Error("expected a redo snapshot");
		aStores.model.getState().restoreSnapshot(redone);

		// Switch away and back, then read the model through the live facade.
		registry.createDocument({ model: createTestModel("B"), filePath: null, pendingLayout: null });
		registry.activateDocument(a);

		const roundTripped = useModelStore.getState().model as ThreatModel & {
			unknown_future_section: unknown;
			metadata: { unknown_future_flag?: unknown };
			elements: Array<{ unknown_future_note?: unknown }>;
		};
		expect(roundTripped.unknown_future_section).toEqual([
			{ id: "future-1", name: "Section introduced by a newer build" },
		]);
		expect(roundTripped.metadata.unknown_future_flag).toBe(true);
		expect(roundTripped.elements[0].unknown_future_note).toBe(
			"written by a newer ThreatForge build",
		);
	});

	it("case 9 - ten documents each report their own node count, history depth, and selection", () => {
		const registry = useDocumentRegistry.getState();
		const ids: DocumentId[] = [];
		// Document i carries i+1 elements, so every document has a distinct, checkable node count.
		for (let i = 0; i < 10; i++) {
			ids.push(
				registry.createDocument({
					model: createTestModel(`Doc ${i}`),
					filePath: `/doc-${i}.thf`,
					pendingLayout: null,
				}),
			);
			for (let n = 0; n <= i; n++) {
				useCanvasStore.getState().addElement("web_server", { x: n * 10, y: 0 });
			}
			useModelStore.getState().setSelectedElement("comp-1");
		}

		// Activate in a shuffled but deterministic order; each document reports only its own state.
		for (const idx of [3, 7, 0, 9, 1, 5, 8, 2, 6, 4]) {
			registry.activateDocument(ids[idx]);
			const count = idx + 1;
			expect(useModelStore.getState().model?.metadata.title).toBe(`Doc ${idx}`);
			expect(useModelStore.getState().model?.elements).toHaveLength(count);
			expect(useCanvasStore.getState().nodes).toHaveLength(count);
			expect(useHistoryStore.getState().past).toHaveLength(count);
			expect(useModelStore.getState().selectedElementId).toBe("comp-1");
			expect(useModelStore.getState().filePath).toBe(`/doc-${idx}.thf`);
		}
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

/**
 * `hydrateDocument` (plan step 6) is the one registry surface browser restore (`#56`) needs:
 * rebuild a session under a *persisted* identity rather than minting a new one. These cases fail
 * for an implementation that reuses `createDocument`, which always mints and always activates.
 */
describe("hydrateDocument (issue #56 restore seam)", () => {
	const persisted = "doc-persisted-1" as DocumentId;

	it("rebuilds a session under the persisted id and createdAt instead of minting new ones", () => {
		const registry = useDocumentRegistry.getState();
		registry.hydrateDocument({
			id: persisted,
			model: createTestModel("Restored"),
			filePath: "/restored.thf",
			pendingLayout: null,
			createdAt: "2026-01-02T03:04:05.000Z",
			activate: true,
		});

		const state = useDocumentRegistry.getState();
		expect(state.openDocumentIds).toEqual([persisted]);
		expect(state.documents[persisted].createdAt).toBe("2026-01-02T03:04:05.000Z");
		expect(state.activeDocumentId).toBe(persisted);
		expect(useModelStore.getState().model?.metadata.title).toBe("Restored");
		expect(useModelStore.getState().filePath).toBe("/restored.thf");
	});

	it("seeds the pending layout and file settings exactly as createDocument does", () => {
		const layout: DiagramLayout = {
			diagram_id: "diagram-1",
			viewport: { x: 5, y: 6, zoom: 2 },
			nodes: [{ id: "comp-1", x: 11, y: 22 }],
		};
		const settings: FileSettings = { grid_size: 25 };

		useDocumentRegistry.getState().hydrateDocument({
			id: persisted,
			model: createTestModel("Restored", settings),
			filePath: null,
			pendingLayout: layout,
			createdAt: "2026-01-02T03:04:05.000Z",
			activate: true,
		});

		expect(useCanvasStore.getState().pendingLayout).toEqual(layout);
		expect(useDocumentRegistry.getState().documents[persisted].fileSettings).toEqual(settings);
	});

	it("leaves the active pointer alone when activate is false", () => {
		const registry = useDocumentRegistry.getState();
		const live = registry.createDocument({
			model: createTestModel("Live"),
			filePath: null,
			pendingLayout: null,
		});

		registry.hydrateDocument({
			id: persisted,
			model: createTestModel("Background"),
			filePath: null,
			pendingLayout: null,
			createdAt: "2026-01-02T03:04:05.000Z",
			activate: false,
		});

		const state = useDocumentRegistry.getState();
		expect(state.activeDocumentId).toBe(live);
		expect(state.openDocumentIds).toEqual([live, persisted]);
		// The active document's own stores are untouched by the background hydration.
		expect(useModelStore.getState().model?.metadata.title).toBe("Live");
	});

	it("does not rebuild or overwrite an already-open document on a second hydrate", () => {
		const registry = useDocumentRegistry.getState();
		registry.hydrateDocument({
			id: persisted,
			model: createTestModel("Restored"),
			filePath: null,
			pendingLayout: null,
			createdAt: "2026-01-02T03:04:05.000Z",
			activate: true,
		});
		// The user edits the live document after it was restored.
		useModelStore.getState().updateMetadata({ title: "Edited since restore" });
		const bundle = useDocumentRegistry.getState().documents[persisted].stores;

		registry.hydrateDocument({
			id: persisted,
			model: createTestModel("Stale copy from storage"),
			filePath: null,
			pendingLayout: null,
			createdAt: "2026-01-02T03:04:05.000Z",
			activate: true,
		});

		const state = useDocumentRegistry.getState();
		expect(state.openDocumentIds).toEqual([persisted]);
		expect(state.documents[persisted].stores).toBe(bundle);
		// Stored text never overwrites unsaved in-memory work.
		expect(useModelStore.getState().model?.metadata.title).toBe("Edited since restore");
	});

	it("does not disturb a sibling document's state", () => {
		const registry = useDocumentRegistry.getState();
		const live = registry.createDocument({
			model: createTestModel("Live"),
			filePath: null,
			pendingLayout: null,
		});
		useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 });

		registry.hydrateDocument({
			id: persisted,
			model: createTestModel("Restored"),
			filePath: null,
			pendingLayout: null,
			createdAt: "2026-01-02T03:04:05.000Z",
			activate: true,
		});

		const liveStores = useDocumentRegistry.getState().getDocumentStores(live);
		expect(liveStores?.model.getState().model?.elements).toHaveLength(1);
		expect(useModelStore.getState().model?.elements).toHaveLength(0);
	});
});
