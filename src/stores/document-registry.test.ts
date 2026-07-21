import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseThreatModelYaml } from "@/lib/thf-yaml";
import type { DocumentId } from "@/types/document";
import type { DiagramLayout, FileSettings, Threat, ThreatModel } from "@/types/threat-model";
// A newer-build document that carries a section, a metadata key, and an element key this build's
// schema does not model. Case 7 uses it to prove the registry treats the model as opaque (#57 seam).
import unknownFieldsRaw from "../../tests/fixtures/thf/v1.0-unknown-fields.thf?raw";
import { useCanvasStore } from "./canvas-store";
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
