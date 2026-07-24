import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDocumentStores, type DocumentStores } from "@/stores/document-stores";
import type { DocumentId } from "@/types/document";
import type { ThreatModel } from "@/types/threat-model";
import { DocumentTab, RestoredDocumentTab } from "./document-tab";

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

/** A standalone document bundle seeded with a model, independent of the registry facade. */
function seedBundle(title: string, filePath: string | null): DocumentStores {
	const stores = createDocumentStores();
	stores.model.getState().setModel(makeModel(title), filePath);
	return stores;
}

const noop = {
	onActivate: vi.fn(),
	onClose: vi.fn(),
	onPin: vi.fn(),
};

describe("DocumentTab", () => {
	it("reads title and dirty state from its own document's store, not the active facade", () => {
		const aStores = seedBundle("Alpha", null);
		const bStores = seedBundle("Beta", null);
		const a = "doc-a" as DocumentId;
		const b = "doc-b" as DocumentId;

		render(
			<>
				<DocumentTab documentId={a} stores={aStores} selected focused pinned={false} {...noop} />
				<DocumentTab
					documentId={b}
					stores={bStores}
					selected={false}
					focused={false}
					pinned={false}
					{...noop}
				/>
			</>,
		);

		// Neither document is dirty yet.
		expect(screen.queryByRole("tab", { name: /unsaved changes/ })).toBeNull();

		// Make document B dirty through B's OWN store while A is the selected/active tab. A tab that
		// read `useModelStore` (the active facade) would show the change on A's tab and fail here.
		act(() => {
			bStores.model.getState().markDirty();
		});

		const dirtyTab = screen.getByRole("tab", { name: /unsaved changes/ });
		expect(dirtyTab).toHaveAttribute("id", "tab-doc-b");
		expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("id", "tab-doc-a");
	});

	it("exposes APG tab semantics and the roving tabindex when focused", () => {
		const stores = seedBundle("Alpha", "/alpha.thf");
		render(
			<DocumentTab
				documentId={"doc-a" as DocumentId}
				stores={stores}
				selected
				focused
				pinned={false}
				{...noop}
			/>,
		);

		const tab = screen.getByRole("tab");
		expect(tab).toHaveAttribute("aria-selected", "true");
		expect(tab).toHaveAttribute("aria-controls", "document-panel");
		expect(tab).toHaveAttribute("id", "tab-doc-a");
		expect(tab).toHaveAttribute("tabindex", "0");
	});

	it("gives an unfocused tab tabindex -1 so the tablist stays a single tab stop", () => {
		const stores = seedBundle("Alpha", null);
		render(
			<DocumentTab
				documentId={"doc-a" as DocumentId}
				stores={stores}
				selected
				focused={false}
				pinned={false}
				{...noop}
			/>,
		);
		expect(screen.getByRole("tab")).toHaveAttribute("tabindex", "-1");
	});

	it("renders the close control as a non-tab-stop button that names the document", () => {
		const stores = seedBundle("Payments", null);
		const onClose = vi.fn();
		render(
			<DocumentTab
				documentId={"doc-p" as DocumentId}
				stores={stores}
				selected
				focused
				pinned={false}
				{...noop}
				onClose={onClose}
			/>,
		);

		const close = screen.getByRole("button", { name: "Close Payments" });
		expect(close).toHaveAttribute("tabindex", "-1");

		fireEvent.click(close);
		expect(onClose).toHaveBeenCalledWith("doc-p");
	});

	it("activates on tab click, but a close click closes without also activating", () => {
		const stores = seedBundle("Alpha", null);
		const onActivate = vi.fn();
		const onClose = vi.fn();
		render(
			<DocumentTab
				documentId={"doc-a" as DocumentId}
				stores={stores}
				selected={false}
				focused={false}
				pinned={false}
				onActivate={onActivate}
				onClose={onClose}
				onPin={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole("tab"));
		expect(onActivate).toHaveBeenCalledWith("doc-a");

		onActivate.mockClear();
		fireEvent.click(screen.getByRole("button", { name: "Close Alpha" }));
		expect(onClose).toHaveBeenCalledWith("doc-a");
		expect(onActivate).not.toHaveBeenCalled();
	});

	it("names a pinned tab as pinned and offers an unpin control", () => {
		const stores = seedBundle("Alpha", null);
		const onPin = vi.fn();
		render(
			<DocumentTab
				documentId={"doc-a" as DocumentId}
				stores={stores}
				selected={false}
				focused={false}
				pinned
				onActivate={vi.fn()}
				onClose={vi.fn()}
				onPin={onPin}
			/>,
		);

		expect(screen.getByRole("tab", { name: /pinned/ })).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Unpin Alpha" }));
		expect(onPin).toHaveBeenCalledWith("doc-a", false);
	});
});

describe("RestoredDocumentTab (un-hydrated, #56)", () => {
	it("labels itself from the manifest title with no store bundle and is never dirty", () => {
		render(
			<RestoredDocumentTab
				documentId={"doc-r" as DocumentId}
				title="Cached Title"
				filePath={null}
				selected={false}
				focused={false}
				{...noop}
			/>,
		);

		// It renders the same APG tab structure as a hydrated tab, from the cached title alone.
		const tab = screen.getByRole("tab", { name: "Cached Title" });
		expect(tab).toHaveAttribute("id", "tab-doc-r");
		expect(tab).toHaveAttribute("aria-controls", "document-panel");
		// A persisted document has no in-memory edits, so it can never show unsaved changes.
		expect(screen.queryByRole("tab", { name: /unsaved changes/ })).toBeNull();
		expect(screen.queryByRole("tab", { name: /pinned/ })).toBeNull();
	});

	it("prefers the path basename over the cached title, matching a hydrated tab", () => {
		render(
			<RestoredDocumentTab
				documentId={"doc-r" as DocumentId}
				title="Metadata Title"
				filePath="/models/payments.thf"
				selected
				focused
				{...noop}
			/>,
		);
		expect(screen.getByRole("tab", { name: "payments" })).toBeInTheDocument();
	});

	it("activates and closes through the same callbacks the strip drives for a live tab", () => {
		const onActivate = vi.fn();
		const onClose = vi.fn();
		render(
			<RestoredDocumentTab
				documentId={"doc-r" as DocumentId}
				title="Restore Me"
				filePath={null}
				selected={false}
				focused={false}
				onActivate={onActivate}
				onClose={onClose}
				onPin={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole("tab"));
		expect(onActivate).toHaveBeenCalledWith("doc-r");

		fireEvent.click(screen.getByRole("button", { name: "Close Restore Me" }));
		expect(onClose).toHaveBeenCalledWith("doc-r");
	});
});
