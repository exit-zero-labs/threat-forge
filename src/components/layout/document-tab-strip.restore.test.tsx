import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { hydrateDocumentById } from "@/hooks/use-workspace-restore";
import { getWorkspaceStorage } from "@/lib/persistence/get-workspace-storage";
import { IndexeddbWorkspaceStorage } from "@/lib/persistence/indexeddb-workspace-storage";
import {
	WORKSPACE_MANIFEST_VERSION,
	type WorkspaceManifestEntry,
	WorkspaceStorageError,
} from "@/lib/persistence/types";
import { serializeThreatModelYaml } from "@/lib/thf-yaml";
import { useDocumentRegistry } from "@/stores/document-registry";
import { createDocumentStores, setActiveStores } from "@/stores/document-stores";
import { useSettingsStore } from "@/stores/settings-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { DocumentId } from "@/types/document";
import type { ThreatModel } from "@/types/threat-model";
import { DocumentTabStrip } from "./document-tab-strip";

// Only the file/storage boundaries are mocked. The registry, the workspace manifest store, and the
// real on-demand hydration path (`hydrateDocumentById` against fake-indexeddb) all run for real —
// the behavior under test is the manifest→registry rendering seam, so mocking it away would prove
// nothing.
vi.mock("@/lib/adapters/get-file-adapter", () => ({
	getFileAdapter: () =>
		Promise.resolve({
			createNewModel: vi.fn(),
			confirmDiscard: vi.fn().mockResolvedValue(true),
		}),
}));

let idCounter = 0;
function nextId(): DocumentId {
	idCounter += 1;
	return `doc-strip-${idCounter}-${Date.now()}` as DocumentId;
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

/** Serialized bodies keyed by id, so a deferred-read mock can resolve with the real stored text. */
const seededBodies = new Map<DocumentId, string>();

/** Put a document in both projections: the durable IndexedDB body and the localStorage manifest. */
async function seedPersistedDocument(title: string, order: number): Promise<DocumentId> {
	const id = nextId();
	const thf = serializeThreatModelYaml(makeModel(title));
	const storage = await getWorkspaceStorage();
	await storage.writeDocumentBody(id, thf);
	seededBodies.set(id, thf);
	useWorkspaceStore.getState().upsertManifestEntry(manifestEntry(id, title, order));
	return id;
}

/**
 * Replace `readDocumentBody` with a deferred read so a test can control exactly when each body
 * resolves — the deterministic stand-in for the real-timing hydration races. Returns a `resolve`
 * that flushes the pending read for one id with its real seeded body.
 */
function deferReads(): { resolve: (id: DocumentId) => Promise<void> } {
	const pending = new Map<DocumentId, () => void>();
	vi.spyOn(IndexeddbWorkspaceStorage.prototype, "readDocumentBody").mockImplementation(
		(id: DocumentId) =>
			new Promise<string | null>((resolveRead) => {
				pending.set(id, () => resolveRead(seededBodies.get(id) ?? null));
			}),
	);
	return {
		resolve: async (id: DocumentId) => {
			// The read is only registered once hydration awaits past `getWorkspaceStorage`, so wait for
			// it to be in flight before flushing it — this makes the race deterministic, not timed.
			await waitFor(() => expect(pending.has(id)).toBe(true));
			await act(async () => {
				pending.get(id)?.();
				await flushAsync();
			});
		},
	};
}

/** Let every queued microtask (and the current macrotask) drain, so async chains settle. */
async function flushAsync(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

/** A minimal DataTransfer that round-trips typed payloads, shared between dragStart and drop. */
function makeDataTransfer(): DataTransfer {
	const store = new Map<string, string>();
	return {
		setData(type: string, value: string) {
			store.set(type, value);
		},
		getData(type: string) {
			return store.get(type) ?? "";
		},
		get types() {
			return Array.from(store.keys());
		},
		dropEffect: "none",
		effectAllowed: "none",
	} as unknown as DataTransfer;
}

/**
 * Dispatch a `drop` at a horizontal position. Built from a MouseEvent because testing-library's
 * synthetic drop does not carry `clientX` in this jsdom build.
 */
function dropAt(target: Element, dataTransfer: DataTransfer, clientX: number): void {
	const event = new MouseEvent("drop", { bubbles: true, cancelable: true, clientX });
	Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
	fireEvent(target, event);
}

/** jsdom performs no layout, so give each rendered tab a deterministic 100px-wide horizontal box. */
function layoutTabs(): void {
	screen.getAllByRole("tab").forEach((tab, i) => {
		tab.getBoundingClientRect = () =>
			({
				left: i * 100,
				right: i * 100 + 100,
				width: 100,
				top: 0,
				bottom: 36,
				height: 36,
				x: i * 100,
				y: 0,
				toJSON: () => ({}),
			}) as DOMRect;
	});
}

beforeEach(() => {
	localStorage.clear();
	seededBodies.clear();
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
	useSettingsStore.getState().updateSetting("reduceMotion", true);
	Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("DocumentTabStrip restore seam (#56)", () => {
	it("renders a persisted-but-un-hydrated sibling as a tab in manifest order", async () => {
		// The post-reload state: both documents are in the manifest but only the active one was
		// hydrated by boot restore. The other must still appear as a tab.
		const alpha = await seedPersistedDocument("Alpha", 0);
		const bravo = await seedPersistedDocument("Bravo", 1);
		useWorkspaceStore.getState().setActiveDocumentId(bravo);
		await act(async () => {
			await hydrateDocumentById(bravo, { activate: true });
		});

		render(<DocumentTabStrip />);

		const tabs = screen.getAllByRole("tab");
		expect(tabs.map((t) => t.id)).toEqual([`tab-${alpha}`, `tab-${bravo}`]);
		// The un-hydrated Alpha renders from the manifest — no registry session exists for it.
		expect(screen.getByRole("tab", { name: "Alpha" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { selected: true }).id).toBe(`tab-${bravo}`);
		expect(useDocumentRegistry.getState().documents[alpha]).toBeUndefined();
	});

	it("hydrates a restored tab on click, selecting it only after its own body loads", async () => {
		const alpha = await seedPersistedDocument("Alpha", 0);
		const bravo = await seedPersistedDocument("Bravo", 1);
		useWorkspaceStore.getState().setActiveDocumentId(bravo);
		await act(async () => {
			await hydrateDocumentById(bravo, { activate: true });
		});
		const read = vi.spyOn(IndexeddbWorkspaceStorage.prototype, "readDocumentBody");

		render(<DocumentTabStrip />);
		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: "Alpha" }));
			await waitFor(() => expect(useDocumentRegistry.getState().activeDocumentId).toBe(alpha));
		});

		// Alpha's own body was read once and hydrated; it is now the active, live document.
		expect(read).toHaveBeenCalledWith(alpha);
		expect(useDocumentRegistry.getState().documents[alpha]).toBeDefined();
		expect(
			useDocumentRegistry.getState().documents[alpha].stores.model.getState().model?.metadata.title,
		).toBe("Alpha");
		expect(screen.getByRole("tab", { selected: true }).id).toBe(`tab-${alpha}`);
	});

	it("keeps the persisted tab order when a restored tab is hydrated instead of jumping it to the end", async () => {
		// The exact reload regression the E2E caught: hydration appends to the registry, so a
		// naive strip would re-sort the just-opened tab to the end. Alpha must stay at index 0.
		const alpha = await seedPersistedDocument("Alpha", 0);
		const bravo = await seedPersistedDocument("Bravo", 1);
		useWorkspaceStore.getState().setActiveDocumentId(bravo);
		await act(async () => {
			await hydrateDocumentById(bravo, { activate: true });
		});

		render(<DocumentTabStrip />);
		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: "Alpha" }));
			await waitFor(() => expect(useDocumentRegistry.getState().activeDocumentId).toBe(alpha));
		});

		// Order is unchanged: Alpha is still the first tab even though it hydrated after Bravo.
		expect(screen.getAllByRole("tab").map((t) => t.id)).toEqual([`tab-${alpha}`, `tab-${bravo}`]);
		expect(useDocumentRegistry.getState().openDocumentIds).toEqual([alpha, bravo]);
	});

	it("keeps a restored tab unselected and opens no blank document when its body fails to load", async () => {
		const alpha = await seedPersistedDocument("Alpha", 0);
		const bravo = await seedPersistedDocument("Bravo", 1);
		useWorkspaceStore.getState().setActiveDocumentId(bravo);
		await act(async () => {
			await hydrateDocumentById(bravo, { activate: true });
		});
		vi.spyOn(IndexeddbWorkspaceStorage.prototype, "readDocumentBody").mockRejectedValue(
			new WorkspaceStorageError("corrupt", "A stored document is missing its current revision."),
		);

		render(<DocumentTabStrip />);
		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: "Alpha" }));
			await waitFor(() =>
				expect(useWorkspaceStore.getState().persistence[alpha]?.status).toBe("corrupt"),
			);
		});

		// Fail-visible: the active document is unchanged, Alpha never entered the registry, and the
		// active tab is still Bravo — not a blank success-shaped document.
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(bravo);
		expect(useDocumentRegistry.getState().documents[alpha]).toBeUndefined();
		expect(screen.getByRole("tab", { selected: true }).id).toBe(`tab-${bravo}`);
	});

	it("closing a restored tab drops its manifest entry but retains the IndexedDB body for #55", async () => {
		const alpha = await seedPersistedDocument("Alpha", 0);
		const bravo = await seedPersistedDocument("Bravo", 1);
		useWorkspaceStore.getState().setActiveDocumentId(bravo);
		await act(async () => {
			await hydrateDocumentById(bravo, { activate: true });
		});
		const deleteDoc = vi.spyOn(IndexeddbWorkspaceStorage.prototype, "deleteDocument");

		render(<DocumentTabStrip />);
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Close Alpha" }));
			await waitFor(() =>
				expect(useWorkspaceStore.getState().documents.map((e) => e.id)).not.toContain(alpha),
			);
		});

		// The manifest no longer lists Alpha, so a reload will not resurrect it...
		expect(useWorkspaceStore.getState().documents.map((e) => e.id)).toEqual([bravo]);
		// ...but its durable body is untouched — recovery/export is #55's job, not a close.
		expect(deleteDoc).not.toHaveBeenCalled();
		const storage = await getWorkspaceStorage();
		expect(await storage.readDocumentBody(alpha)).not.toBeNull();
	});

	it("persists a live reorder onto the manifest order so it survives a reload", async () => {
		const alpha = await seedPersistedDocument("Alpha", 0);
		const bravo = await seedPersistedDocument("Bravo", 1);
		await act(async () => {
			await hydrateDocumentById(alpha, { activate: true });
			await hydrateDocumentById(bravo, { activate: true });
		});
		expect(useDocumentRegistry.getState().openDocumentIds).toEqual([alpha, bravo]);

		render(<DocumentTabStrip />);
		// Move the focused active Bravo one slot left with the keyboard reorder chord.
		const bravoTab = screen.getByRole("tab", { name: "Bravo" });
		act(() => bravoTab.focus());
		fireEvent.keyDown(bravoTab, { key: "ArrowLeft", metaKey: true, shiftKey: true });

		expect(useDocumentRegistry.getState().openDocumentIds).toEqual([bravo, alpha]);
		// The manifest projection followed the reorder, so the persisted order is now [Bravo, Alpha].
		expect(useWorkspaceStore.getState().documents.map((e) => e.id)).toEqual([bravo, alpha]);
	});

	it("shows exactly one selected and one focusable tab on first paint while the active body is still reading (#56 finding 1)", async () => {
		// The pre-hydration first paint: the manifest lists both tabs and points at Bravo as active,
		// but Bravo's body is still being read, so the registry has no active document yet. The strip
		// must fall back to the persisted active pointer so the tablist is immediately interactive
		// (WAI-ARIA needs exactly one selected tab and exactly one roving tabindex) — the bug was
		// every tab rendering aria-selected=false / tabindex=-1 with no focusable tab.
		const alpha = await seedPersistedDocument("Alpha", 0);
		const bravo = await seedPersistedDocument("Bravo", 1);
		useWorkspaceStore.getState().setActiveDocumentId(bravo);
		const reads = deferReads();

		// Kick off boot hydration of the active document but do not resolve its read yet.
		let hydration!: Promise<boolean>;
		await act(async () => {
			hydration = hydrateDocumentById(bravo, { activate: true });
			await flushAsync();
		});
		render(<DocumentTabStrip />);

		// First paint, read still pending: no registry active document exists.
		expect(useDocumentRegistry.getState().activeDocumentId).toBeNull();
		const selected = screen
			.getAllByRole("tab")
			.filter((t) => t.getAttribute("aria-selected") === "true");
		const focusable = screen.getAllByRole("tab").filter((t) => t.getAttribute("tabindex") === "0");
		expect(selected.map((t) => t.id)).toEqual([`tab-${bravo}`]);
		expect(focusable.map((t) => t.id)).toEqual([`tab-${bravo}`]);
		// Alpha is present but neither selected nor focusable.
		const alphaTab = screen.getByRole("tab", { name: "Alpha" });
		expect(alphaTab.id).toBe(`tab-${alpha}`);
		expect(alphaTab.getAttribute("aria-selected")).toBe("false");
		expect(alphaTab.getAttribute("tabindex")).toBe("-1");

		// Once the read resolves, the registry pointer takes over and selection is unchanged.
		await reads.resolve(bravo);
		await act(async () => {
			await hydration;
		});
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(bravo);
		expect(screen.getByRole("tab", { selected: true }).id).toBe(`tab-${bravo}`);
	});

	it("selects the first manifest tab on first paint when stale metadata has no active pointer", async () => {
		const alpha = await seedPersistedDocument("Alpha", 0);
		await seedPersistedDocument("Bravo", 1);

		render(<DocumentTabStrip />);

		expect(screen.getByRole("tab", { selected: true }).id).toBe(`tab-${alpha}`);
		expect(screen.getByRole("tab", { selected: true })).toHaveAttribute("tabindex", "0");
	});

	it("lets the last activation win when restored tabs are clicked in quick succession (#56 finding 2)", async () => {
		// Three restored tabs, none hydrated. The user clicks Alpha then Charlie in quick succession
		// while both reads are in flight. If Alpha's read resolves last, a naive untracked activation
		// would make Alpha active — but the last request (Charlie) must win.
		const alpha = await seedPersistedDocument("Alpha", 0);
		const bravo = await seedPersistedDocument("Bravo", 1);
		const charlie = await seedPersistedDocument("Charlie", 2);
		useWorkspaceStore.getState().setActiveDocumentId(bravo);
		await act(async () => {
			await hydrateDocumentById(bravo, { activate: true });
		});
		const reads = deferReads();

		render(<DocumentTabStrip />);
		act(() => {
			fireEvent.click(screen.getByRole("tab", { name: "Alpha" }));
			fireEvent.click(screen.getByRole("tab", { name: "Charlie" }));
		});

		// Resolve the older request (Alpha) last, so timing alone would favour it.
		await reads.resolve(charlie);
		await reads.resolve(alpha);
		await waitFor(() => expect(useDocumentRegistry.getState().activeDocumentId).toBe(charlie));

		// Charlie (the last click) is active even though Alpha's read resolved afterwards. Alpha was
		// still hydrated in the background — a superseded read is not discarded — but it is not active.
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(charlie);
		expect(useDocumentRegistry.getState().documents[alpha]).toBeDefined();
		expect(screen.getByRole("tab", { selected: true }).id).toBe(`tab-${charlie}`);
	});

	it("does not resurrect a restored tab that was closed while its body was being read (#56 finding 2)", async () => {
		const alpha = await seedPersistedDocument("Alpha", 0);
		const bravo = await seedPersistedDocument("Bravo", 1);
		useWorkspaceStore.getState().setActiveDocumentId(bravo);
		await act(async () => {
			await hydrateDocumentById(bravo, { activate: true });
		});
		const reads = deferReads();

		render(<DocumentTabStrip />);
		// Click Alpha (starts its read), then close Alpha before that read resolves.
		act(() => {
			fireEvent.click(screen.getByRole("tab", { name: "Alpha" }));
		});
		act(() => {
			fireEvent.click(screen.getByRole("button", { name: "Close Alpha" }));
		});
		expect(useWorkspaceStore.getState().documents.map((e) => e.id)).toEqual([bravo]);

		// Now the in-flight read resolves. Alpha's manifest entry is gone, so it must NOT be added
		// back to the registry or activated — closing a tab mid-hydration cannot resurrect it.
		await reads.resolve(alpha);
		await act(async () => {
			await Promise.resolve();
		});
		expect(useDocumentRegistry.getState().documents[alpha]).toBeUndefined();
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(bravo);
		expect(screen.queryByRole("tab", { name: "Alpha" })).toBeNull();
	});

	it("activates a restored neighbour when the only hydrated tab is closed via its close button (#56 finding 4)", async () => {
		// Post-reload: manifest [Alpha, Bravo], only Bravo hydrated. Closing Bravo with its close
		// button must land on the restored Alpha, not an empty scratch view.
		const alpha = await seedPersistedDocument("Alpha", 0);
		const bravo = await seedPersistedDocument("Bravo", 1);
		useWorkspaceStore.getState().setActiveDocumentId(bravo);
		await act(async () => {
			await hydrateDocumentById(bravo, { activate: true });
		});
		expect(useDocumentRegistry.getState().openDocumentIds).toEqual([bravo]);

		render(<DocumentTabStrip />);
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Close Bravo" }));
			await waitFor(() => expect(useDocumentRegistry.getState().activeDocumentId).toBe(alpha));
		});

		const registry = useDocumentRegistry.getState();
		expect(registry.documents[alpha]).toBeDefined();
		expect(registry.documents[alpha].stores.model.getState().model?.metadata.title).toBe("Alpha");
		expect(useWorkspaceStore.getState().documents.map((e) => e.id)).toEqual([alpha]);
		expect(screen.getByRole("tab", { selected: true }).id).toBe(`tab-${alpha}`);
	});

	it("renders a restored tab as non-draggable and hydrates it before a keyboard reorder (#56 finding 7)", async () => {
		const alpha = await seedPersistedDocument("Alpha", 0);
		const bravo = await seedPersistedDocument("Bravo", 1);
		useWorkspaceStore.getState().setActiveDocumentId(bravo);
		await act(async () => {
			await hydrateDocumentById(bravo, { activate: true });
		});

		render(<DocumentTabStrip />);
		// The un-hydrated Alpha tab offers no pointer drag (it would have no live session to move).
		const alphaWrapper = screen.getByTestId(`document-tab-${alpha}`);
		expect(alphaWrapper.getAttribute("draggable")).toBe("false");
		// The hydrated Bravo tab is draggable.
		expect(screen.getByTestId(`document-tab-${bravo}`).getAttribute("draggable")).toBe("true");

		// Keyboard reorder on the un-hydrated Alpha hydrates it first, then performs the move — the
		// control is never a silent no-op. Move the roving focus to Alpha with the arrow key first
		// (DOM focus alone does not move the tablist's roving tabindex).
		act(() => screen.getByRole("tab", { name: "Bravo" }).focus());
		fireEvent.keyDown(screen.getByRole("tab", { name: "Bravo" }), { key: "ArrowLeft" });
		expect(document.activeElement?.id).toBe(`tab-${alpha}`);

		await act(async () => {
			fireEvent.keyDown(screen.getByRole("tab", { name: "Alpha" }), {
				key: "ArrowRight",
				metaKey: true,
				shiftKey: true,
			});
			await waitFor(() =>
				expect(useDocumentRegistry.getState().openDocumentIds).toEqual([bravo, alpha]),
			);
		});
		expect(useDocumentRegistry.getState().documents[alpha]).toBeDefined();
		expect(useWorkspaceStore.getState().documents.map((e) => e.id)).toEqual([bravo, alpha]);
	});

	it("moves a restored keyboard target by one *visible* position across un-hydrated siblings (#56 corrective: visible-order reorder)", async () => {
		// The 3-tab discriminator the old 2-tab test could not catch: manifest [Alpha, Bravo, Charlie]
		// with only the active Charlie hydrated. Moving the restored Alpha one visible position right
		// must yield [Bravo, Alpha, Charlie] — not the registry-only `registryIndex + delta` result
		// [Bravo, Charlie, Alpha], which skips the un-hydrated Bravo lying between the live tabs.
		const alpha = await seedPersistedDocument("Alpha", 0);
		const bravo = await seedPersistedDocument("Bravo", 1);
		const charlie = await seedPersistedDocument("Charlie", 2);
		useWorkspaceStore.getState().setActiveDocumentId(charlie);
		await act(async () => {
			await hydrateDocumentById(charlie, { activate: true });
		});
		expect(useDocumentRegistry.getState().openDocumentIds).toEqual([charlie]);

		render(<DocumentTabStrip />);
		expect(screen.getAllByRole("tab").map((t) => t.id)).toEqual([
			`tab-${alpha}`,
			`tab-${bravo}`,
			`tab-${charlie}`,
		]);

		// Roving focus starts on the active Charlie; Home moves it to the restored Alpha (tab 0).
		act(() => screen.getByRole("tab", { name: "Charlie" }).focus());
		fireEvent.keyDown(screen.getByRole("tab", { name: "Charlie" }), { key: "Home" });
		expect(document.activeElement?.id).toBe(`tab-${alpha}`);

		await act(async () => {
			fireEvent.keyDown(screen.getByRole("tab", { name: "Alpha" }), {
				key: "ArrowRight",
				metaKey: true,
				shiftKey: true,
			});
			await waitFor(() =>
				expect(screen.getAllByRole("tab").map((t) => t.id)).toEqual([
					`tab-${bravo}`,
					`tab-${alpha}`,
					`tab-${charlie}`,
				]),
			);
		});

		// Exactly one visible position moved, projected coherently into both stores.
		expect(useWorkspaceStore.getState().documents.map((e) => e.id)).toEqual([
			bravo,
			alpha,
			charlie,
		]);
		expect(useDocumentRegistry.getState().documents[alpha]).toBeDefined();
	});

	it("drops a hydrated tab at its *visible* slot across an un-hydrated sibling (#56 corrective: visible-order reorder)", async () => {
		// Pointer-drag counterpart of the same defect: Alpha and Charlie are hydrated with the
		// un-hydrated Bravo between them in the visible order. Dragging Alpha past Bravo's midpoint
		// must land it at visible slot 1 ([Bravo, Alpha, Charlie]); measuring only the registry tabs
		// [Alpha, Charlie] would misplace the drop because it never accounts for Bravo's visible box.
		const alpha = await seedPersistedDocument("Alpha", 0);
		const bravo = await seedPersistedDocument("Bravo", 1);
		const charlie = await seedPersistedDocument("Charlie", 2);
		useWorkspaceStore.getState().setActiveDocumentId(charlie);
		await act(async () => {
			await hydrateDocumentById(charlie, { activate: true });
			await hydrateDocumentById(alpha, { activate: false });
		});
		expect(useDocumentRegistry.getState().documents[bravo]).toBeUndefined();

		render(<DocumentTabStrip />);
		expect(screen.getAllByRole("tab").map((t) => t.id)).toEqual([
			`tab-${alpha}`,
			`tab-${bravo}`,
			`tab-${charlie}`,
		]);
		layoutTabs();

		const dt = makeDataTransfer();
		fireEvent.dragStart(screen.getByTestId(`document-tab-${alpha}`), { dataTransfer: dt });
		// x=160 is past Bravo's midpoint (150) but before Charlie's (250): visible slot 1.
		await act(async () => {
			dropAt(screen.getByRole("tablist"), dt, 160);
			await flushAsync();
		});

		expect(screen.getAllByRole("tab").map((t) => t.id)).toEqual([
			`tab-${bravo}`,
			`tab-${alpha}`,
			`tab-${charlie}`,
		]);
		expect(useWorkspaceStore.getState().documents.map((e) => e.id)).toEqual([
			bravo,
			alpha,
			charlie,
		]);
		// A reorder never changes which document is active.
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(charlie);
	});

	it("closing the selected boot tab before it hydrates activates the full-order neighbour and does not resurrect it (#56 corrective: close boot tab)", async () => {
		// Before boot hydration resolves, the persisted-active Alpha renders selected but is not in
		// the registry. Closing it must supersede that pending activation, drop its manifest entry
		// (retaining its IndexedDB body), hydrate+activate its full-order neighbour Bravo, and refuse
		// to let the late boot read resurrect Alpha.
		const alpha = await seedPersistedDocument("Alpha", 0);
		const bravo = await seedPersistedDocument("Bravo", 1);
		useWorkspaceStore.getState().setActiveDocumentId(alpha);

		// Defer only Alpha's boot read; the neighbour Bravo reads its real seeded body immediately.
		let resolveAlphaRead!: () => void;
		const readSpy = vi
			.spyOn(IndexeddbWorkspaceStorage.prototype, "readDocumentBody")
			.mockImplementation((id) => {
				if (id === alpha) {
					return new Promise<string | null>((resolve) => {
						resolveAlphaRead = () => resolve(seededBodies.get(alpha) ?? null);
					});
				}
				return Promise.resolve(seededBodies.get(id) ?? null);
			});

		// Kick off boot hydration of the active Alpha but do not resolve its read yet.
		let bootHydration!: Promise<boolean>;
		await act(async () => {
			bootHydration = hydrateDocumentById(alpha, { activate: true });
			await flushAsync();
		});

		render(<DocumentTabStrip />);
		// First paint: Alpha is selected via the persisted pointer even though it is not hydrated.
		expect(useDocumentRegistry.getState().activeDocumentId).toBeNull();
		expect(screen.getByRole("tab", { selected: true }).id).toBe(`tab-${alpha}`);

		// Close Alpha while its boot read is still pending; Bravo (its right neighbour) hydrates.
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Close Alpha" }));
			await waitFor(() => expect(useDocumentRegistry.getState().activeDocumentId).toBe(bravo));
		});

		// Bravo is now the live, active, focused document; Alpha's manifest entry is gone.
		expect(useWorkspaceStore.getState().documents.map((e) => e.id)).toEqual([bravo]);
		expect(useDocumentRegistry.getState().documents[bravo]).toBeDefined();
		expect(useWorkspaceStore.getState().activeDocumentId).toBe(bravo);
		expect(screen.getByRole("tab", { selected: true }).id).toBe(`tab-${bravo}`);
		expect(document.activeElement?.id).toBe(`tab-${bravo}`);

		// The late boot read for Alpha now resolves — it must NOT resurrect Alpha.
		await act(async () => {
			resolveAlphaRead();
			expect(await bootHydration).toBe(false);
		});
		expect(useDocumentRegistry.getState().documents[alpha]).toBeUndefined();
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(bravo);
		expect(screen.queryByRole("tab", { name: "Alpha" })).toBeNull();
		// Alpha's durable body is retained for #55 (read through the real storage, not the deferral).
		readSpy.mockRestore();
		const storage = await getWorkspaceStorage();
		expect(await storage.readDocumentBody(alpha)).not.toBeNull();
	});
});
