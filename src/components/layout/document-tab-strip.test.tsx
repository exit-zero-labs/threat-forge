import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentRegistry } from "@/stores/document-registry";
import { createDocumentStores, setActiveStores } from "@/stores/document-stores";
import { useSettingsStore } from "@/stores/settings-store";
import type { DocumentId } from "@/types/document";
import type { ThreatModel } from "@/types/threat-model";
import { DocumentTabStrip } from "./document-tab-strip";

// The strip pulls `newModel`/`closeDocumentById` from the file-operations hook; stub the adapter so
// no real dialog or file I/O runs. Clean documents never reach `confirmDiscard`.
vi.mock("@/lib/adapters/get-file-adapter", () => ({
	getFileAdapter: () =>
		Promise.resolve({
			createNewModel: vi.fn().mockResolvedValue(makeModel("New")),
			confirmDiscard: vi.fn().mockResolvedValue(true),
		}),
}));

function makeModel(title: string): ThreatModel {
	return {
		version: "1.0",
		metadata: { title, author: "", created: "", modified: "", description: "" },
		elements: [],
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [],
	};
}

function open(title: string): DocumentId {
	return useDocumentRegistry.getState().createDocument({
		model: makeModel(title),
		filePath: null,
		pendingLayout: null,
	});
}

/** Create A, B, C — active is C, the last created. */
function openThree(): { a: DocumentId; b: DocumentId; c: DocumentId } {
	return { a: open("A"), b: open("B"), c: open("C") };
}

function tabIds(): string[] {
	return screen.getAllByRole("tab").map((t) => t.id);
}

beforeEach(() => {
	useDocumentRegistry.setState({ documents: {}, openDocumentIds: [], activeDocumentId: null });
	setActiveStores(createDocumentStores());
	useSettingsStore.getState().updateSetting("reduceMotion", false);
	// jsdom does not implement scrollIntoView; give every test a spyable stub.
	Element.prototype.scrollIntoView = vi.fn();
});

describe("DocumentTabStrip structure", () => {
	it("renders the new-document button but no tablist when nothing is open", () => {
		render(<DocumentTabStrip />);
		expect(screen.queryByRole("tablist")).toBeNull();
		expect(screen.getByTestId("btn-new-document")).toBeInTheDocument();
	});

	it("renders one tab per open document in order, with the active one selected", () => {
		const { a, b, c } = openThree();
		render(<DocumentTabStrip />);
		expect(tabIds()).toEqual([`tab-${a}`, `tab-${b}`, `tab-${c}`]);
		const cTab = screen.getByRole("tab", { selected: true });
		expect(cTab.id).toBe(`tab-${c}`);
	});
});

describe("DocumentTabStrip keyboard (D4 manual activation)", () => {
	it("ArrowRight moves focus and the roving tabindex without moving selection", () => {
		openThree();
		render(<DocumentTabStrip />);
		const before = screen.getAllByRole("tab");
		expect(before[2]).toHaveAttribute("aria-selected", "true");
		expect(before[2]).toHaveAttribute("tabindex", "0");

		// C is last, so ArrowRight wraps focus to A. Selection must not follow.
		fireEvent.keyDown(before[2], { key: "ArrowRight" });

		const after = screen.getAllByRole("tab");
		expect(document.activeElement).toBe(after[0]);
		expect(after[0]).toHaveAttribute("tabindex", "0");
		expect(after[2]).toHaveAttribute("aria-selected", "true");
		expect(after[0]).toHaveAttribute("aria-selected", "false");
		// Exactly one tab holds tabindex 0 after navigation.
		expect(after.filter((t) => t.getAttribute("tabindex") === "0")).toHaveLength(1);
	});

	it("Home and End jump focus to the first and last tab", () => {
		openThree();
		render(<DocumentTabStrip />);
		fireEvent.keyDown(screen.getAllByRole("tab")[2], { key: "Home" });
		expect(document.activeElement).toBe(screen.getAllByRole("tab")[0]);
		fireEvent.keyDown(screen.getAllByRole("tab")[0], { key: "End" });
		expect(document.activeElement).toBe(screen.getAllByRole("tab")[2]);
	});

	it("Enter activates the focused tab (manual activation commit)", () => {
		const { a } = openThree();
		render(<DocumentTabStrip />);
		fireEvent.keyDown(screen.getAllByRole("tab")[2], { key: "Home" });
		fireEvent.keyDown(screen.getAllByRole("tab")[0], { key: "Enter" });
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(a);
		expect(screen.getByRole("tab", { selected: true }).id).toBe(`tab-${a}`);
	});

	it("Delete closes the focused active tab and focuses the D1 right-neighbour, never the body", async () => {
		const { b, c } = openThree();
		act(() => {
			useDocumentRegistry.getState().activateDocument(b);
		});
		render(<DocumentTabStrip />);

		fireEvent.keyDown(screen.getAllByRole("tab")[1], { key: "Delete" });

		await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));
		// Closing active B activates its right neighbour C (D1), and focus follows there.
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(c);
		expect(document.activeElement).toBe(screen.getByRole("tab", { selected: true }));
		expect(document.activeElement?.id).toBe(`tab-${c}`);
		expect(document.activeElement).not.toBe(document.body);
	});

	it("moves focus to the new-document button when the last tab is closed", async () => {
		open("Solo");
		render(<DocumentTabStrip />);
		fireEvent.keyDown(screen.getByRole("tab"), { key: "Delete" });
		await waitFor(() => expect(screen.queryByRole("tab")).toBeNull());
		expect(document.activeElement).toBe(screen.getByTestId("btn-new-document"));
	});

	it("honours reduced motion when scrolling the focused tab into view", () => {
		useSettingsStore.getState().updateSetting("reduceMotion", true);
		openThree();
		render(<DocumentTabStrip />);
		const scrollSpy = vi.mocked(Element.prototype.scrollIntoView);
		scrollSpy.mockClear();

		fireEvent.keyDown(screen.getAllByRole("tab")[2], { key: "Home" });

		expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
	});
});

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
 * synthetic drop does not carry `clientX` in this jsdom build; the shared dataTransfer is attached
 * so the handler reads the payload the drag start wrote.
 */
function dropAt(target: Element, dataTransfer: DataTransfer, clientX: number): void {
	const event = new MouseEvent("drop", { bubbles: true, cancelable: true, clientX });
	Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
	fireEvent(target, event);
}

/** jsdom performs no layout, so give each rendered tab a deterministic horizontal box. */
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

describe("DocumentTabStrip reorder and pin (D5)", () => {
	it("drags a tab to the drop position without changing the active document", () => {
		const { a, b, c } = openThree(); // order [A,B,C], active C
		render(<DocumentTabStrip />);
		layoutTabs();

		const dt = makeDataTransfer();
		fireEvent.dragStart(screen.getByTestId(`document-tab-${c}`), { dataTransfer: dt });
		// Drop near the far left, before A's midpoint.
		dropAt(screen.getByRole("tablist"), dt, 10);

		expect(useDocumentRegistry.getState().openDocumentIds).toEqual([c, a, b]);
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(c);
	});

	it("clamps a tab dragged into the pinned block to the head of the unpinned block", () => {
		const { a, b, c } = openThree();
		render(<DocumentTabStrip />);
		act(() => {
			useDocumentRegistry.getState().setDocumentPinned(a, true); // order [A(pinned),B,C]
		});
		layoutTabs();

		const dt = makeDataTransfer();
		fireEvent.dragStart(screen.getByTestId(`document-tab-${c}`), { dataTransfer: dt });
		dropAt(screen.getByRole("tablist"), dt, 10);

		// C cannot cross ahead of pinned A; it lands at the head of the unpinned block.
		expect(useDocumentRegistry.getState().openDocumentIds).toEqual([a, c, b]);
	});

	it("pins a tab to the front and renders it at the compact pinned width", () => {
		const { a, b, c } = openThree();
		render(<DocumentTabStrip />);

		fireEvent.click(screen.getByRole("button", { name: "Pin C" }));

		expect(useDocumentRegistry.getState().openDocumentIds).toEqual([c, a, b]);
		expect(screen.getByTestId(`document-tab-${c}`).className).toContain("max-w-[8rem]");
		expect(screen.getByTestId(`document-tab-${a}`).className).toContain("max-w-[14rem]");
		// Pinning never changes which document is active.
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(c);
	});

	it("moves the focused tab one position with Cmd+Shift+ArrowLeft, keeping focus on it", () => {
		const { a, b, c } = openThree(); // active C holds the roving tabindex
		render(<DocumentTabStrip />);
		const cTab = screen.getByRole("tab", { selected: true });
		cTab.focus();

		fireEvent.keyDown(cTab, { key: "ArrowLeft", metaKey: true, shiftKey: true });

		// Same order change the equivalent drag one slot left would produce.
		expect(useDocumentRegistry.getState().openDocumentIds).toEqual([a, c, b]);
		expect(document.activeElement?.id).toBe(`tab-${c}`);
		// It is a reorder, not an activation.
		expect(useDocumentRegistry.getState().activeDocumentId).toBe(c);
	});
});
