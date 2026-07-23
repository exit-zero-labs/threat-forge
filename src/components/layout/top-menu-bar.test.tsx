import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDocumentRegistry } from "@/stores/document-registry";
import { createDocumentStores, setActiveStores } from "@/stores/document-stores";
import { useModelStore } from "@/stores/model-store";
import type { ThreatModel } from "@/types/threat-model";
import { TopMenuBar } from "./top-menu-bar";

function createTestModel(title: string): ThreatModel {
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
	useDocumentRegistry.setState({ documents: {}, openDocumentIds: [], activeDocumentId: null });
	setActiveStores(createDocumentStores());
});

describe("TopMenuBar title", () => {
	it("shows a Windows path's basename, not the whole backslash path", () => {
		useDocumentRegistry.getState().createDocument({
			model: createTestModel("Metadata Title"),
			filePath: "C:\\models\\payments.thf",
			pendingLayout: null,
		});

		render(<TopMenuBar />);

		expect(screen.getByText("payments")).toBeInTheDocument();
		// The pre-change code split only on "/", leaving the entire backslash path on screen.
		expect(screen.queryByText(/C:\\models/)).not.toBeInTheDocument();
	});

	it("appends an asterisk to the title when the active document is dirty", () => {
		useDocumentRegistry.getState().createDocument({
			model: createTestModel("Draft"),
			filePath: null,
			pendingLayout: null,
		});
		useModelStore.getState().markDirty();

		render(<TopMenuBar />);

		expect(screen.getByText("Draft *")).toBeInTheDocument();
	});
});
