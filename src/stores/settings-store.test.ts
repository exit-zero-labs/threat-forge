import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_USER_SETTINGS } from "@/types/settings";
import { useSettingsStore } from "./settings-store";

describe("useSettingsStore", () => {
	beforeEach(() => {
		// Reset store to defaults before each test
		useSettingsStore.setState({
			settings: { ...DEFAULT_USER_SETTINGS },
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
});
