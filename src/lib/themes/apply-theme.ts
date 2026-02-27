import type { ThemePreset, ThemeTokens } from "@/types/theme";

/**
 * Applies a theme preset by setting CSS custom properties on `document.documentElement`.
 * Tailwind v4's `@theme` block defines `--color-*` variables; overriding them at the root
 * element cascades to all utility classes (`bg-background`, `text-foreground`, etc.).
 */
export function applyTheme(preset: ThemePreset): void {
	const root = document.documentElement;

	// Toggle dark/light class for Tailwind dark variant
	if (preset.mode === "dark") {
		root.classList.add("dark");
		root.classList.remove("light");
	} else {
		root.classList.add("light");
		root.classList.remove("dark");
	}

	// Apply all token overrides as CSS custom properties
	const tokenKeys = Object.keys(preset.tokens) as Array<keyof ThemeTokens>;
	for (const key of tokenKeys) {
		root.style.setProperty(`--color-${key}`, preset.tokens[key]);
	}
}

/**
 * Removes all theme CSS custom property overrides from `document.documentElement`,
 * allowing the `@theme` defaults in styles.css to take effect.
 */
export function clearThemeOverrides(): void {
	const root = document.documentElement;
	const tokenKeys: Array<keyof ThemeTokens> = [
		"background",
		"foreground",
		"card",
		"card-foreground",
		"popover",
		"popover-foreground",
		"primary",
		"primary-foreground",
		"secondary",
		"secondary-foreground",
		"muted",
		"muted-foreground",
		"accent",
		"accent-foreground",
		"destructive",
		"destructive-foreground",
		"border",
		"input",
		"ring",
		"chart-1",
		"chart-2",
		"chart-3",
		"chart-4",
		"chart-5",
		"sidebar",
		"sidebar-foreground",
		"sidebar-primary",
		"sidebar-primary-foreground",
		"sidebar-accent",
		"sidebar-accent-foreground",
		"sidebar-border",
		"sidebar-ring",
	];

	for (const key of tokenKeys) {
		root.style.removeProperty(`--color-${key}`);
	}
}

/**
 * Detect the system color scheme preference.
 * Returns "dark" if the user prefers dark mode, "light" otherwise.
 */
export function getSystemThemeMode(): "light" | "dark" {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Listen for system color scheme changes.
 * Returns a cleanup function to remove the listener.
 */
export function onSystemThemeChange(callback: (mode: "light" | "dark") => void): () => void {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
	const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
	const handler = (event: MediaQueryListEvent) => {
		callback(event.matches ? "dark" : "light");
	};
	mediaQuery.addEventListener("change", handler);
	return () => mediaQuery.removeEventListener("change", handler);
}
