/** Light, dark, or follow system preference */
export type ThemeMode = "light" | "dark" | "system";

/** A complete set of CSS variable overrides for a theme */
export interface ThemeTokens {
	background: string;
	foreground: string;
	card: string;
	"card-foreground": string;
	popover: string;
	"popover-foreground": string;
	primary: string;
	"primary-foreground": string;
	secondary: string;
	"secondary-foreground": string;
	muted: string;
	"muted-foreground": string;
	accent: string;
	"accent-foreground": string;
	destructive: string;
	"destructive-foreground": string;
	border: string;
	input: string;
	ring: string;
	"chart-1": string;
	"chart-2": string;
	"chart-3": string;
	"chart-4": string;
	"chart-5": string;
	sidebar: string;
	"sidebar-foreground": string;
	"sidebar-primary": string;
	"sidebar-primary-foreground": string;
	"sidebar-accent": string;
	"sidebar-accent-foreground": string;
	"sidebar-border": string;
	"sidebar-ring": string;
}

/** A built-in theme preset */
export interface ThemePreset {
	/** Unique identifier, e.g. "midnight", "daylight" */
	id: string;
	/** Display name, e.g. "Midnight", "Daylight" */
	name: string;
	/** Whether this is a light or dark preset */
	mode: "light" | "dark";
	/** CSS variable overrides (oklch values) */
	tokens: ThemeTokens;
}

/** Serializable theme configuration for persistence */
export interface ThemeConfig {
	mode: ThemeMode;
	presetId: string;
}
