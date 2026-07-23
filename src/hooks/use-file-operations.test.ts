import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCanvasStore } from "@/stores/canvas-store";
import { useDocumentRegistry } from "@/stores/document-registry";
import { createDocumentStores, setActiveStores } from "@/stores/document-stores";
import { useHistoryStore } from "@/stores/history-store";
import { useModelStore } from "@/stores/model-store";
import type { ThreatModel } from "@/types/threat-model";

// A single controllable fake file adapter. Each test configures what it returns.
const adapter = vi.hoisted(() => ({
	createNewModel: vi.fn(),
	openThreatModel: vi.fn(),
	importThreatModel: vi.fn(),
	saveThreatModel: vi.fn(),
	openLayout: vi.fn(),
	saveLayout: vi.fn(),
	exportAsHtml: vi.fn(),
	confirmDiscard: vi.fn(),
}));

vi.mock("@/lib/adapters/get-file-adapter", () => ({
	getFileAdapter: () => Promise.resolve(adapter),
}));

const { useFileOperations } = await import("@/hooks/use-file-operations");

function makeModel(title: string): ThreatModel {
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
	vi.clearAllMocks();
	useDocumentRegistry.setState({
		documents: {},
		openDocumentIds: [],
		activeDocumentId: null,
	});
	setActiveStores(createDocumentStores());
	adapter.confirmDiscard.mockResolvedValue(true);
	adapter.openLayout.mockResolvedValue(null);
});

describe("useFileOperations lifecycle through the document registry", () => {
	it("New opens an active registry document with a clean history and no file path", async () => {
		adapter.createNewModel.mockResolvedValue(makeModel("Untitled Threat Model"));
		const { result } = renderHook(() => useFileOperations());

		await act(async () => {
			await result.current.newModel();
		});

		const registry = useDocumentRegistry.getState();
		expect(registry.activeDocumentId).not.toBeNull();
		expect(registry.openDocumentIds).toHaveLength(1);
		expect(useModelStore.getState().model?.metadata.title).toBe("Untitled Threat Model");
		expect(useModelStore.getState().filePath).toBeNull();
		expect(useHistoryStore.getState().past).toEqual([]);
	});

	it("Save As to two different paths keeps the same document id and preserves undo depth", async () => {
		adapter.createNewModel.mockResolvedValue(makeModel("Doc"));
		const { result } = renderHook(() => useFileOperations());

		await act(async () => {
			await result.current.newModel();
		});
		const id = useDocumentRegistry.getState().openDocumentIds[0];

		// One history-pushing edit gives the document a non-empty undo stack.
		act(() => {
			useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 });
		});
		expect(useHistoryStore.getState().past).toHaveLength(1);

		adapter.saveThreatModel.mockResolvedValueOnce("/a.thf");
		await act(async () => {
			await result.current.saveModelAs();
		});
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(id);
		expect(useModelStore.getState().filePath).toBe("/a.thf");
		expect(useHistoryStore.getState().past).toHaveLength(1);

		adapter.saveThreatModel.mockResolvedValueOnce("/b.thf");
		await act(async () => {
			await result.current.saveModelAs();
		});
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(id);
		expect(useDocumentRegistry.getState().openDocumentIds).toEqual([id]);
		expect(useModelStore.getState().filePath).toBe("/b.thf");
		expect(useHistoryStore.getState().past).toHaveLength(1);
	});

	it("Open adds a new active tab and leaves the edited previous document open (#54 step 6)", async () => {
		adapter.createNewModel.mockResolvedValue(makeModel("First"));
		const { result } = renderHook(() => useFileOperations());

		await act(async () => {
			await result.current.newModel();
		});
		const firstId = useDocumentRegistry.getState().openDocumentIds[0];
		act(() => {
			useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 });
		});
		expect(useHistoryStore.getState().past).toHaveLength(1);

		adapter.openThreatModel.mockResolvedValue({ model: makeModel("Second"), path: "/second.thf" });
		await act(async () => {
			await result.current.openModel();
		});

		const registry = useDocumentRegistry.getState();
		// The opened document is a NEW active tab; the first document is untouched, not disposed.
		expect(registry.openDocumentIds).toHaveLength(2);
		expect(registry.documents[firstId]).toBeDefined();
		expect(registry.activeDocumentId).not.toBe(firstId);
		expect(useModelStore.getState().model?.metadata.title).toBe("Second");
		expect(useModelStore.getState().filePath).toBe("/second.thf");
		// The active (new) document has its own empty canvas and history.
		expect(useHistoryStore.getState().past).toEqual([]);
		expect(useCanvasStore.getState().nodes.map((n) => n.id)).not.toContain("comp-1");
		// The first document keeps its node and undo depth on its own bundle.
		const firstStores = registry.getDocumentStores(firstId);
		expect(firstStores?.canvas.getState().nodes.map((n) => n.id)).toContain("comp-1");
		expect(firstStores?.history.getState().past).toHaveLength(1);
		// Opening is no longer destructive, so nothing is confirmed.
		expect(adapter.confirmDiscard).not.toHaveBeenCalled();
	});

	it("Import adds a new unsaved tab, leaving the previous document open (#54 step 6)", async () => {
		adapter.createNewModel.mockResolvedValue(makeModel("First"));
		const { result } = renderHook(() => useFileOperations());

		await act(async () => {
			await result.current.newModel();
		});
		const firstId = useDocumentRegistry.getState().openDocumentIds[0];

		adapter.importThreatModel.mockResolvedValue({ model: makeModel("Imported") });
		await act(async () => {
			await result.current.importModel();
		});

		const registry = useDocumentRegistry.getState();
		expect(registry.documents[firstId]).toBeDefined();
		expect(registry.openDocumentIds).toHaveLength(2);
		expect(registry.activeDocumentId).not.toBe(firstId);
		expect(useModelStore.getState().model?.metadata.title).toBe("Imported");
		expect(useModelStore.getState().filePath).toBeNull();
		expect(adapter.confirmDiscard).not.toHaveBeenCalled();
	});

	it("Close disposes the active document and returns to an empty scratch view", async () => {
		adapter.createNewModel.mockResolvedValue(makeModel("Doc"));
		const { result } = renderHook(() => useFileOperations());

		await act(async () => {
			await result.current.newModel();
		});
		act(() => {
			useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 });
		});

		await act(async () => {
			await result.current.closeModel();
		});

		const registry = useDocumentRegistry.getState();
		expect(registry.activeDocumentId).toBeNull();
		expect(registry.openDocumentIds).toEqual([]);
		expect(registry.documents).toEqual({});
		expect(useModelStore.getState().model).toBeNull();
		expect(useCanvasStore.getState().nodes).toEqual([]);
		expect(useHistoryStore.getState().past).toEqual([]);
	});

	it("New opens a second tab without prompting, leaving a dirty first document intact (#54 step 6)", async () => {
		adapter.createNewModel.mockResolvedValue(makeModel("First"));
		const { result } = renderHook(() => useFileOperations());

		await act(async () => {
			await result.current.newModel();
		});
		const firstId = useDocumentRegistry.getState().openDocumentIds[0];
		// Make the first document dirty with one undo step.
		act(() => {
			useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 });
		});
		const firstStores = useDocumentRegistry.getState().getDocumentStores(firstId);
		expect(firstStores?.model.getState().isDirty).toBe(true);

		adapter.createNewModel.mockResolvedValue(makeModel("Second"));
		await act(async () => {
			await result.current.newModel();
		});

		const registry = useDocumentRegistry.getState();
		// A second tab opened and is active; the first stays open — pre-change code prompted and
		// closed the first, so this discriminates the new lifecycle.
		expect(registry.openDocumentIds).toHaveLength(2);
		expect(registry.openDocumentIds[0]).toBe(firstId);
		expect(registry.activeDocumentId).not.toBe(firstId);
		expect(adapter.confirmDiscard).not.toHaveBeenCalled();
		expect(adapter.createNewModel).toHaveBeenCalledTimes(2);
		// The first document is untouched: still dirty, still holding its node and undo depth.
		expect(firstStores?.model.getState().isDirty).toBe(true);
		expect(firstStores?.model.getState().model?.metadata.title).toBe("First");
		expect(firstStores?.canvas.getState().nodes.map((n) => n.id)).toContain("comp-1");
		expect(firstStores?.history.getState().past).toHaveLength(1);
	});

	it("closeModel prompts with the active document's title and keeps it open when declined (#54 step 6)", async () => {
		adapter.createNewModel.mockResolvedValue(makeModel("Draft"));
		const { result } = renderHook(() => useFileOperations());

		await act(async () => {
			await result.current.newModel();
		});
		const id = useDocumentRegistry.getState().activeDocumentId;
		// Give the document a path (so its display title is the basename) and dirty it.
		act(() => {
			useModelStore.getState().setModel(makeModel("Draft"), "/reports/quarterly.thf");
			useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 });
		});

		adapter.confirmDiscard.mockResolvedValueOnce(false);
		await act(async () => {
			await result.current.closeModel();
		});

		// The prompt names the document by its basename, and declining leaves it open.
		expect(adapter.confirmDiscard).toHaveBeenCalledWith("quarterly");
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(id);
		expect(id && useDocumentRegistry.getState().documents[id]).toBeDefined();
	});
});

describe("useFileOperations surfaces open rejections without partial loads", () => {
	it("alerts the rejection message and leaves the current document intact", async () => {
		adapter.createNewModel.mockResolvedValue(makeModel("Kept"));
		const { result } = renderHook(() => useFileOperations());
		await act(async () => {
			await result.current.newModel();
		});
		const keptId = useDocumentRegistry.getState().openDocumentIds[0];

		// The browser validator and the desktop reader both reject with the same message string;
		// `openModel` shows it and returns early. A duplicate-ID rejection is used as the exemplar.
		const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
		adapter.openThreatModel.mockRejectedValue(
			new Error("Duplicate ID 'app' in section 'elements'"),
		);

		await act(async () => {
			await result.current.openModel();
		});

		expect(alertSpy).toHaveBeenCalledWith("Open failed: Duplicate ID 'app' in section 'elements'");
		// Discriminating against a partial-load regression: the previously-open document survives.
		const registry = useDocumentRegistry.getState();
		expect(registry.activeDocumentId).toBe(keptId);
		expect(registry.openDocumentIds).toEqual([keptId]);
		expect(useModelStore.getState().model?.metadata.title).toBe("Kept");
		alertSpy.mockRestore();
	});

	it("does not alert on a successful open", async () => {
		adapter.createNewModel.mockResolvedValue(makeModel("First"));
		const { result } = renderHook(() => useFileOperations());
		await act(async () => {
			await result.current.newModel();
		});

		const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
		adapter.openThreatModel.mockResolvedValue({ model: makeModel("Second"), path: "/second.thf" });

		await act(async () => {
			await result.current.openModel();
		});

		expect(alertSpy).not.toHaveBeenCalled();
		expect(useModelStore.getState().model?.metadata.title).toBe("Second");
		alertSpy.mockRestore();
	});
});
