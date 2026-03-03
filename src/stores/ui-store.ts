import { create } from "zustand";
import { applyTheme, getSystemThemeMode, onSystemThemeChange } from "@/lib/themes/apply-theme";
import { DEFAULT_DARK_PRESET, DEFAULT_LIGHT_PRESET, THEME_PRESETS } from "@/lib/themes/presets";
import type { ThemeMode } from "@/types/theme";

export type RightPanelTab = "properties" | "threats" | "ai";

const THEME_STORAGE_KEY = "threatforge-theme";

interface ThemeState {
	/** User-selected theme mode */
	themeMode: ThemeMode;
	/** Active preset ID for light mode */
	lightPresetId: string;
	/** Active preset ID for dark mode */
	darkPresetId: string;
}

const PANEL_WIDTHS_KEY = "threatforge-panel-widths";

const LEFT_PANEL_MIN = 180;
const LEFT_PANEL_MAX = 400;
const LEFT_PANEL_DEFAULT = 224;
const RIGHT_PANEL_MIN = 260;
const RIGHT_PANEL_MAX = 500;
const RIGHT_PANEL_DEFAULT = 320;

function loadPersistedPanelWidths(): { left: number; right: number } {
	try {
		const raw = localStorage.getItem(PANEL_WIDTHS_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as { left?: number; right?: number };
			return {
				left: Math.max(LEFT_PANEL_MIN, Math.min(LEFT_PANEL_MAX, parsed.left ?? LEFT_PANEL_DEFAULT)),
				right: Math.max(
					RIGHT_PANEL_MIN,
					Math.min(RIGHT_PANEL_MAX, parsed.right ?? RIGHT_PANEL_DEFAULT),
				),
			};
		}
	} catch {
		// Ignore parse errors
	}
	return { left: LEFT_PANEL_DEFAULT, right: RIGHT_PANEL_DEFAULT };
}

function persistPanelWidths(left: number, right: number): void {
	localStorage.setItem(PANEL_WIDTHS_KEY, JSON.stringify({ left, right }));
}

interface UiState extends ThemeState {
	/** Whether the left sidebar (component palette) is visible */
	leftPanelOpen: boolean;
	/** Width of the left panel in pixels */
	leftPanelWidth: number;
	/** Whether the right panel (properties/threats/ai) is visible */
	rightPanelOpen: boolean;
	/** Width of the right panel in pixels */
	rightPanelWidth: number;
	/** Current right panel tab */
	rightPanelTab: RightPanelTab;
	/** Whether the canvas is locked (prevents editing) */
	canvasLocked: boolean;
	/** Whether the command palette (Cmd+K) is open */
	commandPaletteOpen: boolean;

	// Actions
	toggleLeftPanel: () => void;
	toggleRightPanel: () => void;
	setRightPanelTab: (tab: RightPanelTab) => void;
	setLeftPanelWidth: (width: number) => void;
	setRightPanelWidth: (width: number) => void;
	setTheme: (mode: ThemeMode, presetId?: string) => void;
	/** Get the effective preset ID for the currently resolved mode */
	getEffectivePresetId: () => string;
	toggleCanvasLock: () => void;
	openCommandPalette: () => void;
	closeCommandPalette: () => void;
}

function loadPersistedTheme(): ThemeState {
	try {
		const raw = localStorage.getItem(THEME_STORAGE_KEY);
		if (raw) {
			const parsed: unknown = JSON.parse(raw);
			if (typeof parsed !== "object" || parsed === null) {
				return defaultThemeState();
			}

			const obj = parsed as Record<string, unknown>;
			const mode = obj.mode as string | undefined;
			if (mode !== "light" && mode !== "dark" && mode !== "system") {
				return defaultThemeState();
			}

			// New format: { mode, lightPresetId, darkPresetId }
			if ("lightPresetId" in obj && "darkPresetId" in obj) {
				const lightId = obj.lightPresetId as string;
				const darkId = obj.darkPresetId as string;
				return {
					themeMode: mode,
					lightPresetId: lightId in THEME_PRESETS ? lightId : DEFAULT_LIGHT_PRESET,
					darkPresetId: darkId in THEME_PRESETS ? darkId : DEFAULT_DARK_PRESET,
				};
			}

			// Legacy format migration: { mode, presetId }
			if ("presetId" in obj) {
				const presetId = obj.presetId as string;
				const preset = THEME_PRESETS[presetId];
				if (preset) {
					return {
						themeMode: mode,
						lightPresetId: preset.mode === "light" ? presetId : DEFAULT_LIGHT_PRESET,
						darkPresetId: preset.mode === "dark" ? presetId : DEFAULT_DARK_PRESET,
					};
				}
			}
		}
	} catch {
		// Ignore parse errors, fall through to default
	}
	return defaultThemeState();
}

function defaultThemeState(): ThemeState {
	return {
		themeMode: "system",
		lightPresetId: DEFAULT_LIGHT_PRESET,
		darkPresetId: DEFAULT_DARK_PRESET,
	};
}

function persistTheme(state: ThemeState): void {
	localStorage.setItem(
		THEME_STORAGE_KEY,
		JSON.stringify({
			mode: state.themeMode,
			lightPresetId: state.lightPresetId,
			darkPresetId: state.darkPresetId,
		}),
	);
}

/** Get the effective preset ID for the resolved mode. */
function resolveEffectivePresetId(state: ThemeState): string {
	const resolvedMode = state.themeMode === "system" ? getSystemThemeMode() : state.themeMode;
	return resolvedMode === "dark" ? state.darkPresetId : state.lightPresetId;
}

function applyCurrentTheme(state: ThemeState): void {
	const effectivePresetId = resolveEffectivePresetId(state);
	const preset = THEME_PRESETS[effectivePresetId];
	if (preset) {
		applyTheme(preset);
	}
}

const initialTheme = loadPersistedTheme();
const initialPanelWidths = loadPersistedPanelWidths();

export const useUiStore = create<UiState>((set, get) => ({
	leftPanelOpen: true,
	leftPanelWidth: initialPanelWidths.left,
	rightPanelOpen: true,
	rightPanelWidth: initialPanelWidths.right,
	rightPanelTab: "properties",
	canvasLocked: false,
	commandPaletteOpen: false,
	themeMode: initialTheme.themeMode,
	lightPresetId: initialTheme.lightPresetId,
	darkPresetId: initialTheme.darkPresetId,

	toggleLeftPanel: () => set((state) => ({ leftPanelOpen: !state.leftPanelOpen })),
	toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
	setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
	setLeftPanelWidth: (width) => {
		const clamped = Math.max(LEFT_PANEL_MIN, Math.min(LEFT_PANEL_MAX, width));
		set({ leftPanelWidth: clamped });
		persistPanelWidths(clamped, get().rightPanelWidth);
	},
	setRightPanelWidth: (width) => {
		const clamped = Math.max(RIGHT_PANEL_MIN, Math.min(RIGHT_PANEL_MAX, width));
		set({ rightPanelWidth: clamped });
		persistPanelWidths(get().leftPanelWidth, clamped);
	},
	toggleCanvasLock: () => set((state) => ({ canvasLocked: !state.canvasLocked })),
	openCommandPalette: () => set({ commandPaletteOpen: true }),
	closeCommandPalette: () => set({ commandPaletteOpen: false }),

	setTheme: (mode, presetId) => {
		const current = get();
		let { lightPresetId, darkPresetId } = current;

		// If a preset is specified, assign it to the correct slot
		if (presetId) {
			const preset = THEME_PRESETS[presetId];
			if (preset) {
				if (preset.mode === "dark") darkPresetId = presetId;
				else lightPresetId = presetId;
			}
		}

		const newState: ThemeState = { themeMode: mode, lightPresetId, darkPresetId };
		set(newState);
		persistTheme(newState);
		applyCurrentTheme(newState);
	},
	getEffectivePresetId: () => resolveEffectivePresetId(get()),
}));

// Apply theme on initial load
applyCurrentTheme(initialTheme);

// Listen for system theme changes when mode is "system"
onSystemThemeChange(() => {
	const state = useUiStore.getState();
	if (state.themeMode === "system") {
		applyCurrentTheme(state);
	}
});
