import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentRegistry } from "@/stores/document-registry";
import { createDocumentStores, setActiveStores } from "@/stores/document-stores";
import type { DocumentId } from "@/types/document";
import type { ThreatModel } from "@/types/threat-model";

// Boundaries this layout test deliberately does not exercise: the ReactFlow canvas needs real
// layout, and the workspace/update hooks reach IndexedDB and the network. Stubbing them keeps the
// test on what step 5 verifies — the tab strip mount and the tabpanel relationship.
vi.mock("@/components/canvas/canvas", () => ({
	Canvas: () => <div data-testid="canvas-stub" />,
}));
vi.mock("@/hooks/use-workspace-restore", () => ({ useWorkspaceRestore: () => {} }));
vi.mock("@/hooks/use-workspace-persistence", () => ({ useWorkspacePersistence: () => {} }));
vi.mock("@/stores/update-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/update-store")>()),
	checkOnLaunch: () => {},
}));

import { AppLayout } from "./app-layout";

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

beforeEach(() => {
	useDocumentRegistry.setState({ documents: {}, openDocumentIds: [], activeDocumentId: null });
	setActiveStores(createDocumentStores());
});

describe("AppLayout document tabpanel relationship (#54 step 5)", () => {
	it("labels the tabpanel by the selected tab and resolves every tab's aria-controls", () => {
		open("A");
		const b = open("B"); // last created is active

		render(<AppLayout />);

		// The main landmark survives — role and labelling went on the wrapper, not on <main>.
		expect(screen.getByRole("main")).toBeInTheDocument();

		const tabs = screen.getAllByRole("tab");
		expect(tabs).toHaveLength(2);

		const panel = screen.getByRole("tabpanel");
		expect(panel.id).toBe("document-panel");
		const selectedTab = screen.getByRole("tab", { selected: true });
		expect(selectedTab.id).toBe(`tab-${b}`);
		expect(panel).toHaveAttribute("aria-labelledby", selectedTab.id);

		for (const tab of tabs) {
			const controlled = tab.getAttribute("aria-controls");
			expect(controlled).toBe("document-panel");
			if (controlled) expect(document.getElementById(controlled)).toBe(panel);
		}
	});

	it("renders no tablist or tabpanel with zero documents, keeping the new-document button and main landmark", () => {
		render(<AppLayout />);

		expect(screen.queryByRole("tablist")).toBeNull();
		expect(screen.queryByRole("tabpanel")).toBeNull();
		expect(screen.getByTestId("btn-new-document")).toBeInTheDocument();
		expect(screen.getByRole("main")).toBeInTheDocument();
	});
});
