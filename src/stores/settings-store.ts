import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserSettings } from "@/types/settings";
import { DEFAULT_USER_SETTINGS } from "@/types/settings";

interface SettingsState {
	/** User-level settings persisted to localStorage */
	settings: UserSettings;

	/** Whether the settings dialog is open */
	settingsDialogOpen: boolean;

	/** Whether the keyboard shortcuts cheat sheet is open */
	shortcutsDialogOpen: boolean;

	// Actions
	updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
	resetToDefaults: () => void;
	openSettingsDialog: () => void;
	closeSettingsDialog: () => void;
	openShortcutsDialog: () => void;
	closeShortcutsDialog: () => void;
}

export const useSettingsStore = create<SettingsState>()(
	persist(
		(set) => ({
			settings: { ...DEFAULT_USER_SETTINGS },
			settingsDialogOpen: false,
			shortcutsDialogOpen: false,

			updateSetting: (key, value) =>
				set((state) => ({
					settings: { ...state.settings, [key]: value },
				})),

			resetToDefaults: () => set({ settings: { ...DEFAULT_USER_SETTINGS } }),

			openSettingsDialog: () => set({ settingsDialogOpen: true }),
			closeSettingsDialog: () => set({ settingsDialogOpen: false }),
			openShortcutsDialog: () => set({ shortcutsDialogOpen: true }),
			closeShortcutsDialog: () => set({ shortcutsDialogOpen: false }),
		}),
		{
			name: "threatforge-settings",
			partialize: (state) => ({ settings: state.settings }),
		},
	),
);
