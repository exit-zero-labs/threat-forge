import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/stores/settings-store";
import { DEFAULT_USER_SETTINGS } from "@/types/settings";
import { SettingsDialog } from "./settings-dialog";

beforeEach(() => {
	useSettingsStore.setState({
		settings: { ...DEFAULT_USER_SETTINGS },
		settingsDialogOpen: true,
		settingsDialogInitialTab: null,
		shortcutsDialogOpen: false,
	});
});

describe("SettingsDialog", () => {
	it("renders with General tab active by default", () => {
		render(<SettingsDialog />);

		const dialog = screen.getByTestId("settings-dialog");
		expect(dialog).toBeInTheDocument();
		// General section content should be visible
		expect(screen.getByText("Autosave")).toBeInTheDocument();
		expect(screen.getByText("Confirm before delete")).toBeInTheDocument();
	});

	it("switches to Appearance tab on click", () => {
		render(<SettingsDialog />);

		fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));

		expect(screen.getByText("Show keytips")).toBeInTheDocument();
		expect(screen.getByText("Reduce motion")).toBeInTheDocument();
	});

	it("switches to Editor tab on click", () => {
		render(<SettingsDialog />);

		fireEvent.click(screen.getByRole("button", { name: /Editor/ }));

		expect(screen.getByText("Grid snap")).toBeInTheDocument();
		expect(screen.getByText("Grid size")).toBeInTheDocument();
	});

	it("switches to Shortcuts tab on click", () => {
		render(<SettingsDialog />);

		fireEvent.click(screen.getByRole("button", { name: /Shortcuts/ }));

		expect(screen.getByText("File")).toBeInTheDocument();
		expect(screen.getByText("Edit")).toBeInTheDocument();
	});

	it("opens at AI tab when initialTab is set", () => {
		useSettingsStore.setState({ settingsDialogInitialTab: "ai" });
		render(<SettingsDialog />);

		expect(screen.getByText("Provider")).toBeInTheDocument();
	});

	it("toggles autosave setting via switch", () => {
		render(<SettingsDialog />);

		// Autosave is the first switch on the General tab (default: false)
		const switches = screen.getAllByRole("switch");
		const autosaveSwitch = switches[0];
		expect(autosaveSwitch).toHaveAttribute("aria-checked", "false");

		fireEvent.click(autosaveSwitch);

		expect(useSettingsStore.getState().settings.autosaveEnabled).toBe(true);
		expect(autosaveSwitch).toHaveAttribute("aria-checked", "true");
	});

	it("calls closeSettingsDialog on Escape", () => {
		render(<SettingsDialog />);

		const dialog = screen.getByTestId("settings-dialog");
		fireEvent.keyDown(dialog, { key: "Escape" });

		expect(useSettingsStore.getState().settingsDialogOpen).toBe(false);
	});

	it("resets to defaults when Reset button is clicked", () => {
		// Change a setting first
		useSettingsStore.getState().updateSetting("gridSize", 32);
		expect(useSettingsStore.getState().settings.gridSize).toBe(32);

		render(<SettingsDialog />);

		fireEvent.click(screen.getByText("Reset to defaults"));

		expect(useSettingsStore.getState().settings.gridSize).toBe(DEFAULT_USER_SETTINGS.gridSize);
	});

	it("shows all 5 nav tabs", () => {
		render(<SettingsDialog />);

		const dialog = screen.getByTestId("settings-dialog");
		const nav = within(dialog).getAllByRole("button");
		const tabLabels = nav.map((b) => b.textContent?.trim()).filter(Boolean);

		expect(tabLabels).toContain("General");
		expect(tabLabels).toContain("Appearance");
		expect(tabLabels).toContain("Editor");
		expect(tabLabels).toContain("AI");
		expect(tabLabels).toContain("Shortcuts");
	});
});
