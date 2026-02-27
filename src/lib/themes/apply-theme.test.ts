import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	applyTheme,
	clearThemeOverrides,
	getSystemThemeMode,
	onSystemThemeChange,
} from "./apply-theme";
import { daylight, midnight } from "./presets";

describe("applyTheme", () => {
	beforeEach(() => {
		// Clean up inline styles on documentElement
		document.documentElement.removeAttribute("style");
		document.documentElement.classList.remove("dark", "light");
	});

	afterEach(() => {
		document.documentElement.removeAttribute("style");
		document.documentElement.classList.remove("dark", "light");
	});

	it("sets dark class for dark presets", () => {
		applyTheme(midnight);
		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(document.documentElement.classList.contains("light")).toBe(false);
	});

	it("sets light class for light presets", () => {
		applyTheme(daylight);
		expect(document.documentElement.classList.contains("light")).toBe(true);
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("removes opposing class when switching modes", () => {
		applyTheme(midnight);
		expect(document.documentElement.classList.contains("dark")).toBe(true);

		applyTheme(daylight);
		expect(document.documentElement.classList.contains("light")).toBe(true);
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("sets CSS custom properties for all theme tokens on documentElement", () => {
		applyTheme(midnight);
		const style = document.documentElement.style;

		expect(style.getPropertyValue("--color-background")).toBe(midnight.tokens.background);
		expect(style.getPropertyValue("--color-foreground")).toBe(midnight.tokens.foreground);
		expect(style.getPropertyValue("--color-card")).toBe(midnight.tokens.card);
		expect(style.getPropertyValue("--color-primary")).toBe(midnight.tokens.primary);
		expect(style.getPropertyValue("--color-border")).toBe(midnight.tokens.border);
		expect(style.getPropertyValue("--color-sidebar")).toBe(midnight.tokens.sidebar);
	});

	it("sets CSS custom properties for light theme", () => {
		applyTheme(daylight);
		const style = document.documentElement.style;

		expect(style.getPropertyValue("--color-background")).toBe(daylight.tokens.background);
		expect(style.getPropertyValue("--color-foreground")).toBe(daylight.tokens.foreground);
	});
});

describe("clearThemeOverrides", () => {
	it("removes all theme CSS custom properties", () => {
		applyTheme(midnight);
		expect(document.documentElement.style.getPropertyValue("--color-background")).toBeTruthy();

		clearThemeOverrides();
		expect(document.documentElement.style.getPropertyValue("--color-background")).toBe("");
		expect(document.documentElement.style.getPropertyValue("--color-foreground")).toBe("");
		expect(document.documentElement.style.getPropertyValue("--color-sidebar")).toBe("");
	});
});

describe("getSystemThemeMode", () => {
	it("returns a valid mode", () => {
		const mode = getSystemThemeMode();
		expect(["light", "dark"]).toContain(mode);
	});
});

describe("onSystemThemeChange", () => {
	it("returns a cleanup function", () => {
		const cleanup = onSystemThemeChange(vi.fn());
		expect(typeof cleanup).toBe("function");
		cleanup();
	});
});
