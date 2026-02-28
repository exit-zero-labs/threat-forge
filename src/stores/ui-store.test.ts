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
			themeMode: "dark",
			themePresetId: "midnight",
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
		it("has default dark theme", () => {
			const state = useUiStore.getState();
			expect(state.themeMode).toBe("dark");
			expect(state.themePresetId).toBe("midnight");
		});

		it("sets theme mode and preset", () => {
			useUiStore.getState().setTheme("light", "daylight");
			const state = useUiStore.getState();
			expect(state.themeMode).toBe("light");
			expect(state.themePresetId).toBe("daylight");
		});

		it("persists theme to localStorage", () => {
			useUiStore.getState().setTheme("light", "daylight");
			const stored = localStorage.getItem(THEME_STORAGE_KEY);
			expect(stored).toBeTruthy();
			const parsed = JSON.parse(stored as string);
			expect(parsed.mode).toBe("light");
			expect(parsed.presetId).toBe("daylight");
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

		it("uses default preset when switching mode without specifying preset", () => {
			useUiStore.getState().setTheme("light");
			const state = useUiStore.getState();
			expect(state.themeMode).toBe("light");
			// Should pick a light preset
			expect(state.themePresetId).toBe("daylight");
		});
	});
});
