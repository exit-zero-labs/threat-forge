import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/stores/settings-store";
import { useUpdateStore } from "@/stores/update-store";
import { DEFAULT_USER_SETTINGS } from "@/types/settings";
import { SettingsDialog } from "./settings-dialog";

beforeEach(() => {
	useSettingsStore.setState({
		settings: { ...DEFAULT_USER_SETTINGS },
		settingsDialogOpen: true,
		settingsDialogInitialTab: null,
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

	it("shows canvas settings in Appearance tab", () => {
		render(<SettingsDialog />);

		fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));

		expect(screen.getByText("Grid snap")).toBeInTheDocument();
		expect(screen.getByText("Grid size")).toBeInTheDocument();
		expect(screen.getByText("Show minimap")).toBeInTheDocument();
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

	it("shows all nav tabs (no Editor or Shortcuts tab)", () => {
		render(<SettingsDialog />);

		const dialog = screen.getByTestId("settings-dialog");
		const nav = within(dialog).getAllByRole("button");
		const tabLabels = nav.map((b) => b.textContent?.trim()).filter(Boolean);

		expect(tabLabels).toContain("General");
		expect(tabLabels).toContain("Appearance");
		expect(tabLabels).toContain("AI");
		expect(tabLabels).not.toContain("Editor");
		expect(tabLabels).not.toContain("Shortcuts");
	});

	describe("Updates section after a failed check", () => {
		beforeEach(() => {
			useUpdateStore.setState({
				isChecking: false,
				isInstalling: false,
				updateAvailable: null,
				lastCheckTime: Date.now(),
				skippedVersion: null,
				dismissed: false,
				installError: null,
				checkError: "Could not fetch a valid release JSON",
			});
		});

		function openUpdates(): void {
			render(<SettingsDialog />);
			fireEvent.click(screen.getByRole("button", { name: /Updates/ }));
		}

		it("does not also claim the version is current", () => {
			openUpdates();

			// A check that errored found nothing because it never completed. Saying both at once
			// is how the privacy page came to describe an updater that works (#259).
			expect(screen.getByText(/Last attempt failed/)).toBeInTheDocument();
			expect(screen.queryByText(/running the latest version/)).not.toBeInTheDocument();
		});

		it("does not promise signature verification that no release carries", () => {
			openUpdates();

			expect(screen.queryByText(/verified with a cryptographic signature/)).not.toBeInTheDocument();
			expect(screen.getByText(/releases are not signed yet/)).toBeInTheDocument();
		});
	});
});
