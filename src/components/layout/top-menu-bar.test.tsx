import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDocumentRegistry } from "@/stores/document-registry";
import { createDocumentStores, setActiveStores } from "@/stores/document-stores";
import { useModelStore } from "@/stores/model-store";
import type { ThreatModel } from "@/types/threat-model";
import { TopMenuBar } from "./top-menu-bar";

function createTestModel(title: string, overrides: Partial<ThreatModel> = {}): ThreatModel {
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
		...overrides,
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

	it("strips a bidi override from a hostile metadata title (#175)", () => {
		useDocumentRegistry.getState().createDocument({
			model: createTestModel("Evil\u202Etitle"),
			filePath: null,
			pendingLayout: null,
		});

		render(<TopMenuBar />);

		expect(screen.getByText("Eviltitle")).toBeInTheDocument();
		expect(screen.queryByText(/\u202E/)).not.toBeInTheDocument();
	});
});

describe("TopMenuBar canvas count badge", () => {
	it("shows component, data-flow, and identified / mitigated threat totals", () => {
		const registry = useDocumentRegistry.getState();
		const model = createTestModel("Overview", {
			elements: Array.from({ length: 2 }, (_, index) => ({
				id: `component-${index + 1}`,
				type: "process",
				name: `Component ${index + 1}`,
				trust_zone: "",
				description: "",
				technologies: [],
			})),
			data_flows: [
				{
					id: "flow-1",
					name: "Request",
					from: "component-1",
					to: "component-2",
					protocol: "HTTPS",
					data: [],
					authenticated: true,
				},
			],
			threats: [
				{
					id: "threat-1",
					title: "Mitigated threat",
					category: "Spoofing",
					severity: "high",
					description: "",
					mitigation: { status: "mitigated", description: "Fixed" },
				},
				{
					id: "threat-2",
					title: "Accepted threat",
					category: "Tampering",
					severity: "medium",
					description: "",
					mitigation: { status: "accepted", description: "Risk accepted" },
				},
				{
					id: "threat-3",
					title: "Open threat",
					category: "Repudiation",
					severity: "low",
					description: "",
				},
			],
		});
		const overviewId = registry.createDocument({
			model,
			filePath: null,
			pendingLayout: null,
		});

		render(<TopMenuBar />);

		const badge = screen.getByRole("region", {
			name: "Canvas summary: 2 components, 1 data flow, 3 identified threats, 1 mitigated threat",
		});
		expect(badge).toHaveTextContent("Components 2");
		expect(badge).toHaveTextContent("Data flows 1");
		expect(badge).toHaveTextContent("Threats 3 / 1");

		act(() => {
			registry.createDocument({
				model: createTestModel("Empty"),
				filePath: null,
				pendingLayout: null,
			});
		});
		expect(screen.getByTestId("canvas-count-badge")).toHaveTextContent(
			"Components 0Data flows 0Threats 0 / 0",
		);

		act(() => {
			registry.activateDocument(overviewId);
		});
		expect(screen.getByTestId("canvas-count-badge")).toHaveTextContent(
			"Components 2Data flows 1Threats 3 / 1",
		);
	});
});
