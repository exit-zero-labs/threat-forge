import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserSettings } from "@/types/settings";
import { DEFAULT_USER_SETTINGS } from "@/types/settings";
import type { FileSettings } from "@/types/threat-model";

export type SettingsTab = "general" | "appearance" | "editor" | "ai" | "shortcuts" | "support";

interface SettingsState {
	/** User-level settings persisted to localStorage */
	settings: UserSettings;

	/** File-scoped settings loaded from the current threat model (not persisted to localStorage) */
	fileSettings: FileSettings | null;

	/** Whether the settings dialog is open */
	settingsDialogOpen: boolean;

	/** Tab to show when opening settings dialog (null = default "general") */
	settingsDialogInitialTab: SettingsTab | null;

	/** Whether the keyboard shortcuts cheat sheet is open */
	shortcutsDialogOpen: boolean;

	// Actions
	updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
	resetToDefaults: () => void;
	loadFileSettings: (fileSettings: FileSettings | undefined) => void;
	clearFileSettings: () => void;
	openSettingsDialog: () => void;
	openSettingsDialogAtTab: (tab: SettingsTab) => void;
	closeSettingsDialog: () => void;
	openShortcutsDialog: () => void;
	closeShortcutsDialog: () => void;
}

export const useSettingsStore = create<SettingsState>()(
	persist(
		(set) => ({
			settings: { ...DEFAULT_USER_SETTINGS },
			fileSettings: null,
			settingsDialogOpen: false,
			settingsDialogInitialTab: null,
			shortcutsDialogOpen: false,

			updateSetting: (key, value) =>
				set((state) => ({
					settings: { ...state.settings, [key]: value },
				})),

			resetToDefaults: () => set({ settings: { ...DEFAULT_USER_SETTINGS } }),

			loadFileSettings: (fileSettings) => set({ fileSettings: fileSettings ?? null }),

			clearFileSettings: () => set({ fileSettings: null }),

			openSettingsDialog: () => set({ settingsDialogOpen: true, settingsDialogInitialTab: null }),
			openSettingsDialogAtTab: (tab) =>
				set({ settingsDialogOpen: true, settingsDialogInitialTab: tab }),
			closeSettingsDialog: () => set({ settingsDialogOpen: false, settingsDialogInitialTab: null }),
			openShortcutsDialog: () => set({ shortcutsDialogOpen: true }),
			closeShortcutsDialog: () => set({ shortcutsDialogOpen: false }),
		}),
		{
			name: "threatforge-settings",
			partialize: (state) => ({ settings: state.settings }),
		},
	),
);
