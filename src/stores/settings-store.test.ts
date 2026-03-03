import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_USER_SETTINGS } from "@/types/settings";
import { useSettingsStore } from "./settings-store";

describe("useSettingsStore", () => {
	beforeEach(() => {
		// Reset store to defaults before each test
		useSettingsStore.setState({
			settings: { ...DEFAULT_USER_SETTINGS },
			fileSettings: null,
			settingsDialogOpen: false,
			shortcutsDialogOpen: false,
		});
	});

	it("starts with default settings", () => {
		const { settings } = useSettingsStore.getState();
		expect(settings.autosaveEnabled).toBe(false);
		expect(settings.autosaveIntervalSeconds).toBe(30);
		expect(settings.keytipsVisible).toBe(true);
		expect(settings.confirmBeforeDelete).toBe(true);
		expect(settings.gridSnap).toBe(true);
		expect(settings.gridSize).toBe(16);
		expect(settings.reduceMotion).toBe(false);
		expect(settings.fontSize).toBe("default");
	});

	it("updates a single setting", () => {
		useSettingsStore.getState().updateSetting("autosaveEnabled", true);
		expect(useSettingsStore.getState().settings.autosaveEnabled).toBe(true);
		// Other settings remain unchanged
		expect(useSettingsStore.getState().settings.gridSnap).toBe(true);
	});

	it("updates numeric settings", () => {
		useSettingsStore.getState().updateSetting("autosaveIntervalSeconds", 60);
		expect(useSettingsStore.getState().settings.autosaveIntervalSeconds).toBe(60);
	});

	it("resets all settings to defaults", () => {
		useSettingsStore.getState().updateSetting("autosaveEnabled", true);
		useSettingsStore.getState().updateSetting("gridSize", 32);
		useSettingsStore.getState().updateSetting("keytipsVisible", false);

		useSettingsStore.getState().resetToDefaults();

		const { settings } = useSettingsStore.getState();
		expect(settings.autosaveEnabled).toBe(false);
		expect(settings.gridSize).toBe(16);
		expect(settings.keytipsVisible).toBe(true);
	});

	it("opens and closes settings dialog", () => {
		expect(useSettingsStore.getState().settingsDialogOpen).toBe(false);
		useSettingsStore.getState().openSettingsDialog();
		expect(useSettingsStore.getState().settingsDialogOpen).toBe(true);
		useSettingsStore.getState().closeSettingsDialog();
		expect(useSettingsStore.getState().settingsDialogOpen).toBe(false);
	});

	it("opens and closes shortcuts dialog", () => {
		expect(useSettingsStore.getState().shortcutsDialogOpen).toBe(false);
		useSettingsStore.getState().openShortcutsDialog();
		expect(useSettingsStore.getState().shortcutsDialogOpen).toBe(true);
		useSettingsStore.getState().closeShortcutsDialog();
		expect(useSettingsStore.getState().shortcutsDialogOpen).toBe(false);
	});

	it("preserves other settings when updating one", () => {
		useSettingsStore.getState().updateSetting("autosaveEnabled", true);
		useSettingsStore.getState().updateSetting("gridSize", 32);

		expect(useSettingsStore.getState().settings.autosaveEnabled).toBe(true);
		expect(useSettingsStore.getState().settings.gridSize).toBe(32);
		expect(useSettingsStore.getState().settings.keytipsVisible).toBe(true);
	});

	it("starts with null fileSettings", () => {
		expect(useSettingsStore.getState().fileSettings).toBeNull();
	});

	it("loads file settings from model metadata", () => {
		useSettingsStore.getState().loadFileSettings({
			grid_size: 24,
			default_element_fill: "#3b82f6",
		});
		const { fileSettings } = useSettingsStore.getState();
		expect(fileSettings).not.toBeNull();
		expect(fileSettings?.grid_size).toBe(24);
		expect(fileSettings?.default_element_fill).toBe("#3b82f6");
	});

	it("clears file settings on closeModel", () => {
		useSettingsStore.getState().loadFileSettings({ grid_size: 24 });
		expect(useSettingsStore.getState().fileSettings).not.toBeNull();

		useSettingsStore.getState().clearFileSettings();
		expect(useSettingsStore.getState().fileSettings).toBeNull();
	});

	it("handles undefined file settings gracefully", () => {
		useSettingsStore.getState().loadFileSettings(undefined);
		expect(useSettingsStore.getState().fileSettings).toBeNull();
	});

	it("replaces previous file settings on new load", () => {
		useSettingsStore.getState().loadFileSettings({ grid_size: 24 });
		useSettingsStore.getState().loadFileSettings({
			grid_size: 32,
			default_boundary_fill: "#22c55e",
		});

		const { fileSettings } = useSettingsStore.getState();
		expect(fileSettings?.grid_size).toBe(32);
		expect(fileSettings?.default_boundary_fill).toBe("#22c55e");
		// Previous field not in new load should be absent
		expect(fileSettings?.default_element_fill).toBeUndefined();
	});
});
