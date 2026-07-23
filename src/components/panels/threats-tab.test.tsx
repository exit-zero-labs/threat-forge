import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "@/lib/platform";
import { createDocumentStores, setActiveStores } from "@/stores/document-stores";
import { useModelStore } from "@/stores/model-store";
import type { Threat, ThreatModel } from "@/types/threat-model";
import { ThreatsTab } from "./threats-tab";

vi.mock("@/lib/platform", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/platform")>();
	return {
		...actual,
		copyTextToClipboard: vi.fn(),
	};
});

const mockedCopyTextToClipboard = vi.mocked(copyTextToClipboard);

function makeModel(threats: Threat[]): ThreatModel {
	return {
		version: "1.0",
		metadata: {
			title: "Test Model",
			author: "Test Author",
			created: "2026-03-15",
			modified: "2026-03-15",
			description: "",
		},
		elements: [
			{
				id: "api-gateway",
				type: "process",
				name: "API Gateway",
				trust_zone: "internal",
				description: "",
				technologies: [],
			},
		],
		data_flows: [],
		trust_boundaries: [],
		threats,
		diagrams: [],
	};
}

const threatWithMitigation: Threat = {
	id: "threat-1",
	title: "SQL Injection on payment queries",
	category: "Tampering",
	element: "api-gateway",
	severity: "high",
	description: "Unsanitized input reaches the payment query builder.",
	mitigation: {
		status: "mitigated",
		description: "Parameterized queries via ORM",
	},
};

beforeEach(() => {
	setActiveStores(createDocumentStores());
	mockedCopyTextToClipboard.mockReset();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("ThreatsTab context menu", () => {
	it("exposes a Copy as YAML action on right-click and copies only that threat's YAML", async () => {
		useModelStore.setState({ model: makeModel([threatWithMitigation]) });
		mockedCopyTextToClipboard.mockResolvedValue(undefined);

		render(<ThreatsTab />);

		fireEvent.contextMenu(screen.getByText("SQL Injection on payment queries"));

		const menuItem = await screen.findByText("Copy as YAML");
		fireEvent.click(menuItem);

		expect(mockedCopyTextToClipboard).toHaveBeenCalledExactlyOnceWith(
			`- id: threat-1
  title: SQL Injection on payment queries
  category: Tampering
  element: api-gateway
  severity: high
  description: Unsanitized input reaches the payment query builder.
  mitigation:
    status: mitigated
    description: Parameterized queries via ORM
`,
		);
	});

	it("does not expose Copy as YAML before a right-click", () => {
		useModelStore.setState({ model: makeModel([threatWithMitigation]) });

		render(<ThreatsTab />);

		expect(screen.queryByText("Copy as YAML")).not.toBeInTheDocument();
	});

	it("preserves the native context menu for editable threat fields", () => {
		useModelStore.setState({
			model: makeModel([threatWithMitigation]),
			selectedThreatId: threatWithMitigation.id,
		});

		render(<ThreatsTab />);

		fireEvent.contextMenu(screen.getByRole("textbox", { name: "Title" }));

		expect(screen.queryByText("Copy as YAML")).not.toBeInTheDocument();
	});

	it("closes the menu and leaves other threats' clipboard payload untouched when copying one of several", async () => {
		const other: Threat = {
			id: "threat-2",
			title: "Unrelated threat",
			category: "Spoofing",
			severity: "low",
			description: "Some other threat description",
		};
		useModelStore.setState({ model: makeModel([threatWithMitigation, other]) });
		mockedCopyTextToClipboard.mockResolvedValue(undefined);

		render(<ThreatsTab />);

		fireEvent.contextMenu(screen.getByText("Unrelated threat"));
		fireEvent.click(await screen.findByText("Copy as YAML"));

		expect(mockedCopyTextToClipboard).toHaveBeenCalledExactlyOnceWith(
			expect.stringContaining("id: threat-2"),
		);
		expect(mockedCopyTextToClipboard.mock.calls[0][0]).not.toContain("threat-1");
		// Menu closes after the action fires.
		expect(screen.queryByText("Copy as YAML")).not.toBeInTheDocument();
	});

	it("surfaces a clipboard failure with window.alert instead of swallowing it", async () => {
		useModelStore.setState({ model: makeModel([threatWithMitigation]) });
		mockedCopyTextToClipboard.mockRejectedValue(new Error("Clipboard write was denied"));
		const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

		render(<ThreatsTab />);

		fireEvent.contextMenu(screen.getByText("SQL Injection on payment queries"));
		fireEvent.click(await screen.findByText("Copy as YAML"));

		await vi.waitFor(() => {
			expect(alertSpy).toHaveBeenCalledExactlyOnceWith(
				"Copy failed. Check clipboard permissions and try again.",
			);
		});

		alertSpy.mockRestore();
	});
});
