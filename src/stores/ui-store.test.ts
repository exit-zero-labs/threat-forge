import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./ui-store";

const THEME_STORAGE_KEY = "threatforge-theme";

describe("useUiStore", () => {
	beforeEach(() => {
		// Reset store state before each test
		localStorage.removeItem(THEME_STORAGE_KEY);
		document.documentElement.removeAttribute("style");
		document.documentElement.classList.remove("dark", "light");
		useUiStore.setState({
			leftPanelOpen: true,
			rightPanelOpen: true,
			rightPanelWidth: 320,
			rightPanelTab: "properties",
			themeMode: "system",
			lightPresetId: "daylight",
			darkPresetId: "midnight",
		});
	});

	afterEach(() => {
		localStorage.removeItem(THEME_STORAGE_KEY);
		document.documentElement.removeAttribute("style");
		document.documentElement.classList.remove("dark", "light");
	});

	it("starts with both panels open", () => {
		const state = useUiStore.getState();
		expect(state.leftPanelOpen).toBe(true);
		expect(state.rightPanelOpen).toBe(true);
	});

	it("toggles left panel", () => {
		useUiStore.getState().toggleLeftPanel();
		expect(useUiStore.getState().leftPanelOpen).toBe(false);
		useUiStore.getState().toggleLeftPanel();
		expect(useUiStore.getState().leftPanelOpen).toBe(true);
	});

	it("toggles right panel", () => {
		useUiStore.getState().toggleRightPanel();
		expect(useUiStore.getState().rightPanelOpen).toBe(false);
	});

	it("changes right panel tab", () => {
		useUiStore.getState().setRightPanelTab("threats");
		expect(useUiStore.getState().rightPanelTab).toBe("threats");
	});

	it("updates right panel width", () => {
		useUiStore.getState().setRightPanelWidth(400);
		expect(useUiStore.getState().rightPanelWidth).toBe(400);
	});

	describe("theme management", () => {
		it("has default system theme", () => {
			const state = useUiStore.getState();
			expect(state.themeMode).toBe("system");
			expect(state.darkPresetId).toBe("midnight");
			expect(state.lightPresetId).toBe("daylight");
		});

		it("sets dark preset when selecting a dark theme", () => {
			useUiStore.getState().setTheme("dark", "nord");
			const state = useUiStore.getState();
			expect(state.themeMode).toBe("dark");
			expect(state.darkPresetId).toBe("nord");
			expect(state.lightPresetId).toBe("daylight"); // unchanged
		});

		it("sets light preset when selecting a light theme", () => {
			useUiStore.getState().setTheme("light", "warm-sand");
			const state = useUiStore.getState();
			expect(state.themeMode).toBe("light");
			expect(state.lightPresetId).toBe("warm-sand");
			expect(state.darkPresetId).toBe("midnight"); // unchanged
		});

		it("persists theme to localStorage with new format", () => {
			useUiStore.getState().setTheme("light", "warm-sand");
			const stored = localStorage.getItem(THEME_STORAGE_KEY);
			expect(stored).toBeTruthy();
			const parsed = JSON.parse(stored as string);
			expect(parsed.mode).toBe("light");
			expect(parsed.lightPresetId).toBe("warm-sand");
			expect(parsed.darkPresetId).toBe("midnight");
		});

		it("applies CSS variables when setting theme", () => {
			useUiStore.getState().setTheme("light", "daylight");
			const bgValue = document.documentElement.style.getPropertyValue("--color-background");
			expect(bgValue).toBeTruthy();
		});

		it("toggles dark/light class on html element", () => {
			useUiStore.getState().setTheme("dark", "midnight");
			expect(document.documentElement.classList.contains("dark")).toBe(true);

			useUiStore.getState().setTheme("light", "daylight");
			expect(document.documentElement.classList.contains("light")).toBe(true);
			expect(document.documentElement.classList.contains("dark")).toBe(false);
		});

		it("switches to system mode", () => {
			useUiStore.getState().setTheme("system");
			expect(useUiStore.getState().themeMode).toBe("system");
		});

		it("preserves both presets when switching mode without specifying preset", () => {
			useUiStore.getState().setTheme("dark", "nord");
			useUiStore.getState().setTheme("light", "warm-sand");
			// Now switch back to dark without specifying a preset
			useUiStore.getState().setTheme("dark");
			const state = useUiStore.getState();
			expect(state.themeMode).toBe("dark");
			expect(state.darkPresetId).toBe("nord"); // preserved
			expect(state.lightPresetId).toBe("warm-sand"); // preserved
		});
	});
});
