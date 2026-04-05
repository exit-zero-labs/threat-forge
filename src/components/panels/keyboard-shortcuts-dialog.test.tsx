import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "@/stores/ui-store";
import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog";

beforeEach(() => {
	useUiStore.setState({ keyboardShortcutsDialogOpen: true });
});

describe("KeyboardShortcutsDialog", () => {
	it("renders shortcuts grouped by category", () => {
		render(<KeyboardShortcutsDialog />);

		const dialog = screen.getByTestId("keyboard-shortcuts-dialog");
		expect(dialog).toBeInTheDocument();
		expect(within(dialog).getByText("Keyboard Shortcuts")).toBeInTheDocument();
		expect(within(dialog).getByText("File")).toBeInTheDocument();
		expect(within(dialog).getByText("View")).toBeInTheDocument();
		expect(within(dialog).getByText("New Model")).toBeInTheDocument();
		expect(within(dialog).getByText("Command Palette")).toBeInTheDocument();
	});

	it("filters shortcuts using the search box", () => {
		render(<KeyboardShortcutsDialog />);

		fireEvent.change(screen.getByTestId("keyboard-shortcuts-search"), {
			target: { value: "save as" },
		});

		expect(screen.getByText("Save As")).toBeInTheDocument();
		expect(screen.queryByText("New Model")).not.toBeInTheDocument();
	});

	it("closes on Escape", () => {
		render(<KeyboardShortcutsDialog />);

		fireEvent.keyDown(screen.getByTestId("keyboard-shortcuts-dialog"), { key: "Escape" });

		expect(useUiStore.getState().keyboardShortcutsDialogOpen).toBe(false);
	});
});
