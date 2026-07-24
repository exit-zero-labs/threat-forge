import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { getWorkspaceStorage } from "@/lib/persistence/get-workspace-storage";
import { WORKSPACE_MANIFEST_VERSION, type WorkspaceManifestEntry } from "@/lib/persistence/types";
import { serializeThreatModelYaml } from "@/lib/thf-yaml";
import { useDocumentRegistry } from "@/stores/document-registry";
import { createDocumentStores, setActiveStores } from "@/stores/document-stores";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { DocumentId } from "@/types/document";
import type { ThreatModel } from "@/types/threat-model";
import { hydrateDocumentById } from "./use-workspace-restore";

// The file adapter is the only mocked boundary — the dirty-confirmation prompt. The registry, the
// workspace manifest, and the real on-demand hydration path (against fake-indexeddb) all run for
// real, because the behaviour under test is the shared close operation's lifecycle side effects.
const adapter = vi.hoisted(() => ({
	confirmDiscard: vi.fn(),
}));
vi.mock("@/lib/adapters/get-file-adapter", () => ({
	getFileAdapter: () => Promise.resolve(adapter),
}));

const { useFileOperations } = await import("./use-file-operations");

let idCounter = 0;
function nextId(): DocumentId {
	idCounter += 1;
	return `doc-close-${idCounter}-${Date.now()}` as DocumentId;
}

function makeModel(title: string): ThreatModel {
	return {
		version: "1.0",
		metadata: { title, author: "", created: "2026-01-01", modified: "2026-01-01", description: "" },
		elements: [
			{
				id: "comp-1",
				name: title,
				type: "web_server",
				trust_zone: "internal",
				description: "",
				technologies: [],
				position: { x: 20, y: 20 },
			},
		],
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [],
	};
}

function manifestEntry(id: DocumentId, title: string, order: number): WorkspaceManifestEntry {
	return {
		id,
		title,
		filePath: null,
		order,
		createdAt: "2026-07-01T00:00:00.000Z",
		updatedAt: "2026-07-02T00:00:00.000Z",
	};
}

/** Put a document in both projections: the durable IndexedDB body and the localStorage manifest. */
async function seedPersistedDocument(title: string, order: number): Promise<DocumentId> {
	const id = nextId();
	const storage = await getWorkspaceStorage();
	await storage.writeDocumentBody(id, serializeThreatModelYaml(makeModel(title)));
	useWorkspaceStore.getState().upsertManifestEntry(manifestEntry(id, title, order));
	return id;
}

beforeEach(() => {
	vi.clearAllMocks();
	adapter.confirmDiscard.mockResolvedValue(true);
	localStorage.clear();
	useDocumentRegistry.setState({ documents: {}, openDocumentIds: [], activeDocumentId: null });
	setActiveStores(createDocumentStores());
	useWorkspaceStore.setState({
		schemaVersion: WORKSPACE_MANIFEST_VERSION,
		documents: [],
		activeDocumentId: null,
		preferences: {},
		persistence: {},
		persistenceAvailable: false,
		unavailableReason: null,
		recoverableDocumentIds: [],
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("closeDocumentById manifest lifecycle (#56)", () => {
	it("drops the closed live document's manifest entry so it cannot resurrect on reload", async () => {
		// Two persisted documents; both hydrated (a fully-explored session). The manifest still lists
		// both until one is closed through the shared boundary.
		const alpha = await seedPersistedDocument("Alpha", 0);
		const bravo = await seedPersistedDocument("Bravo", 1);
		await act(async () => {
			await hydrateDocumentById(alpha, { activate: true });
			await hydrateDocumentById(bravo, { activate: true });
		});

		const { result } = renderHook(() => useFileOperations());
		await act(async () => {
			await result.current.closeDocumentById(alpha);
		});

		// The manifest no longer lists Alpha — a File-menu / palette / keyboard close now removes the
		// entry at the lifecycle boundary, not only the tab strip's close button.
		expect(useWorkspaceStore.getState().documents.map((e) => e.id)).toEqual([bravo]);
		// ...but Alpha's durable body is untouched; recovery/export is #55's job, not a close's.
		const storage = await getWorkspaceStorage();
		expect(await storage.readDocumentBody(alpha)).not.toBeNull();
	});

	it("keeps the manifest entry when a dirty document's close is declined", async () => {
		const alpha = await seedPersistedDocument("Alpha", 0);
		await act(async () => {
			await hydrateDocumentById(alpha, { activate: true });
		});
		// Dirty the hydrated document and decline the discard prompt.
		act(() => {
			useDocumentRegistry.getState().getDocumentStores(alpha)?.model.setState({ isDirty: true });
		});
		adapter.confirmDiscard.mockResolvedValueOnce(false);

		const { result } = renderHook(() => useFileOperations());
		await act(async () => {
			await result.current.closeDocumentById(alpha);
		});

		// Declined: the document stays open and its manifest entry is preserved.
		expect(useDocumentRegistry.getState().documents[alpha]).toBeDefined();
		expect(useWorkspaceStore.getState().documents.map((e) => e.id)).toEqual([alpha]);
	});

	it("activates a restored manifest neighbour when the only hydrated tab closes (post-reload)", async () => {
		// The post-reload state: manifest lists [Alpha, Bravo] but boot restore hydrated only the
		// active Bravo, so the registry holds Bravo alone. Closing Bravo must not drop to a blank
		// scratch view — the full-order D1 neighbour (Alpha) is hydrated and activated instead.
		const alpha = await seedPersistedDocument("Alpha", 0);
		const bravo = await seedPersistedDocument("Bravo", 1);
		useWorkspaceStore.getState().setActiveDocumentId(bravo);
		await act(async () => {
			await hydrateDocumentById(bravo, { activate: true });
		});
		expect(useDocumentRegistry.getState().openDocumentIds).toEqual([bravo]);

		const { result } = renderHook(() => useFileOperations());
		await act(async () => {
			await result.current.closeDocumentById(bravo);
		});

		// Alpha (Bravo's left neighbour in the merged order, since Bravo was rightmost) is now the
		// live, active document, hydrated on demand from its own IndexedDB body.
		const registry = useDocumentRegistry.getState();
		expect(registry.activeDocumentId).toBe(alpha);
		expect(registry.documents[alpha]).toBeDefined();
		expect(registry.documents[alpha].stores.model.getState().model?.metadata.title).toBe("Alpha");
		// Bravo is gone from both the registry and the manifest.
		expect(registry.documents[bravo]).toBeUndefined();
		expect(useWorkspaceStore.getState().documents.map((e) => e.id)).toEqual([alpha]);
		expect(useWorkspaceStore.getState().activeDocumentId).toBe(alpha);
	});

	it("returns to an empty scratch view when the last persisted document closes", async () => {
		const only = await seedPersistedDocument("Only", 0);
		useWorkspaceStore.getState().setActiveDocumentId(only);
		await act(async () => {
			await hydrateDocumentById(only, { activate: true });
		});

		const { result } = renderHook(() => useFileOperations());
		await act(async () => {
			await result.current.closeDocumentById(only);
		});

		const registry = useDocumentRegistry.getState();
		expect(registry.activeDocumentId).toBeNull();
		expect(registry.openDocumentIds).toEqual([]);
		expect(useWorkspaceStore.getState().documents).toEqual([]);
	});
});
