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

	it("Open after an edit starts a fresh document, dropping the previous canvas and history", async () => {
		adapter.createNewModel.mockResolvedValue(makeModel("First"));
		const { result } = renderHook(() => useFileOperations());

		await act(async () => {
			await result.current.newModel();
		});
		const firstId = useDocumentRegistry.getState().openDocumentIds[0];
		act(() => {
			useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 });
		});
		expect(useCanvasStore.getState().nodes.map((n) => n.id)).toContain("comp-1");
		expect(useHistoryStore.getState().past).toHaveLength(1);

		adapter.openThreatModel.mockResolvedValue({ model: makeModel("Second"), path: "/second.thf" });
		await act(async () => {
			await result.current.openModel();
		});

		const registry = useDocumentRegistry.getState();
		expect(registry.activeDocumentId).not.toBe(firstId);
		expect(registry.documents[firstId]).toBeUndefined();
		expect(useModelStore.getState().model?.metadata.title).toBe("Second");
		expect(useModelStore.getState().filePath).toBe("/second.thf");
		expect(useHistoryStore.getState().past).toEqual([]);
		// The new document's canvas cannot contain the previous document's node.
		expect(useCanvasStore.getState().nodes.map((n) => n.id)).not.toContain("comp-1");
		expect(useCanvasStore.getState().nodes).toEqual([]);
	});

	it("Import starts a fresh unsaved document and disposes the previous one", async () => {
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
		expect(registry.documents[firstId]).toBeUndefined();
		expect(registry.openDocumentIds).toHaveLength(1);
		expect(useModelStore.getState().model?.metadata.title).toBe("Imported");
		expect(useModelStore.getState().filePath).toBeNull();
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

	it("New keeps the current document when the discard confirmation is declined", async () => {
		adapter.createNewModel.mockResolvedValue(makeModel("First"));
		const { result } = renderHook(() => useFileOperations());

		await act(async () => {
			await result.current.newModel();
		});
		const firstId = useDocumentRegistry.getState().openDocumentIds[0];
		// Make the document dirty so the discard guard is exercised.
		act(() => {
			useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 });
		});

		adapter.confirmDiscard.mockResolvedValue(false);
		adapter.createNewModel.mockResolvedValue(makeModel("Second"));
		await act(async () => {
			await result.current.newModel();
		});

		const registry = useDocumentRegistry.getState();
		expect(registry.openDocumentIds).toEqual([firstId]);
		expect(registry.activeDocumentId).toBe(firstId);
		expect(useModelStore.getState().model?.metadata.title).toBe("First");
		expect(adapter.createNewModel).toHaveBeenCalledTimes(1);
	});
});
