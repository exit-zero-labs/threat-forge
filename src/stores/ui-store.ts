import { create } from "zustand";
import { applyTheme, getSystemThemeMode, onSystemThemeChange } from "@/lib/themes/apply-theme";
import { DEFAULT_DARK_PRESET, DEFAULT_LIGHT_PRESET, THEME_PRESETS } from "@/lib/themes/presets";
import type { ThemeMode } from "@/types/theme";

export type RightPanelTab = "properties" | "threats" | "ai";

const THEME_STORAGE_KEY = "threatforge-theme";

interface ThemeState {
	/** User-selected theme mode */
	themeMode: ThemeMode;
	/** Active theme preset ID */
	themePresetId: string;
}

interface UiState extends ThemeState {
	/** Whether the left sidebar (component palette) is visible */
	leftPanelOpen: boolean;
	/** Whether the right panel (properties/threats/ai) is visible */
	rightPanelOpen: boolean;
	/** Width of the right panel in pixels */
	rightPanelWidth: number;
	/** Current right panel tab */
	rightPanelTab: RightPanelTab;

	// Actions
	toggleLeftPanel: () => void;
	toggleRightPanel: () => void;
	setRightPanelTab: (tab: RightPanelTab) => void;
	setRightPanelWidth: (width: number) => void;
	setTheme: (mode: ThemeMode, presetId?: string) => void;
}

function loadPersistedTheme(): ThemeState {
	try {
		const raw = localStorage.getItem(THEME_STORAGE_KEY);
		if (raw) {
			const parsed: unknown = JSON.parse(raw);
			if (
				typeof parsed === "object" &&
				parsed !== null &&
				"mode" in parsed &&
				"presetId" in parsed
			) {
				const { mode, presetId } = parsed as { mode: string; presetId: string };
				if (
					(mode === "light" || mode === "dark" || mode === "system") &&
					typeof presetId === "string" &&
					presetId in THEME_PRESETS
				) {
					return { themeMode: mode, themePresetId: presetId };
				}
			}
		}
	} catch {
		// Ignore parse errors, fall through to default
	}
	return { themeMode: "dark", themePresetId: DEFAULT_DARK_PRESET };
}

function persistTheme(mode: ThemeMode, presetId: string): void {
	localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ mode, presetId }));
}

/**
 * Resolve the effective preset ID for "system" mode.
 * If current preset doesn't match the resolved mode, pick the default for that mode.
 */
function resolvePresetForMode(mode: ThemeMode, currentPresetId: string): string {
	const resolvedMode = mode === "system" ? getSystemThemeMode() : mode;
	const currentPreset = THEME_PRESETS[currentPresetId];

	if (currentPreset && currentPreset.mode === resolvedMode) {
		return currentPresetId;
	}

	return resolvedMode === "dark" ? DEFAULT_DARK_PRESET : DEFAULT_LIGHT_PRESET;
}

function applyCurrentTheme(mode: ThemeMode, presetId: string): void {
	const effectivePresetId = resolvePresetForMode(mode, presetId);
	const preset = THEME_PRESETS[effectivePresetId];
	if (preset) {
		applyTheme(preset);
	}
}

const initialTheme = loadPersistedTheme();

export const useUiStore = create<UiState>((set, get) => ({
	leftPanelOpen: true,
	rightPanelOpen: true,
	rightPanelWidth: 320,
	rightPanelTab: "properties",
	themeMode: initialTheme.themeMode,
	themePresetId: initialTheme.themePresetId,

	toggleLeftPanel: () => set((state) => ({ leftPanelOpen: !state.leftPanelOpen })),
	toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
	setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
	setRightPanelWidth: (width) => set({ rightPanelWidth: width }),

	setTheme: (mode, presetId) => {
		const effectivePresetId = presetId ?? resolvePresetForMode(mode, get().themePresetId);
		set({ themeMode: mode, themePresetId: effectivePresetId });
		persistTheme(mode, effectivePresetId);
		applyCurrentTheme(mode, effectivePresetId);
	},
}));

// Apply theme on initial load
applyCurrentTheme(initialTheme.themeMode, initialTheme.themePresetId);

// Listen for system theme changes when mode is "system"
onSystemThemeChange(() => {
	const { themeMode, themePresetId } = useUiStore.getState();
	if (themeMode === "system") {
		applyCurrentTheme(themeMode, themePresetId);
	}
});
