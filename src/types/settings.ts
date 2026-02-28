/**
 * Settings type definitions for ThreatForge.
 *
 * User settings persist locally (localStorage) across all files.
 * File settings are stored alongside the threat model.
 */

/** User-level settings that persist across sessions and files */
export interface UserSettings {
	/** Autosave enabled/disabled (default: off) */
	autosaveEnabled: boolean;
	/** Autosave interval in seconds (default: 30) */
	autosaveIntervalSeconds: number;
	/** Show keyboard shortcut keytips on controls */
	keytipsVisible: boolean;
	/** Confirm before deleting elements */
	confirmBeforeDelete: boolean;
	/** Canvas grid snap on/off */
	gridSnap: boolean;
	/** Canvas grid size in pixels */
	gridSize: number;
	/** Reduce motion/animations */
	reduceMotion: boolean;
}

/** File-level settings stored alongside the threat model */
export interface FileSettings {
	/** Diagram-specific grid size override */
	gridSize?: number;
}

/** Keyboard shortcut definition for the shortcuts cheat sheet */
export interface KeyboardShortcut {
	/** Unique key for React list rendering */
	id: string;
	/** Human-readable label */
	label: string;
	/** Key combo for macOS (e.g., "⌘N") */
	macKeys: string;
	/** Key combo for Windows/Linux (e.g., "Ctrl+N") */
	winKeys: string;
	/** Category for grouping in the cheat sheet */
	category: "file" | "edit" | "view" | "canvas";
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
	autosaveEnabled: false,
	autosaveIntervalSeconds: 30,
	keytipsVisible: true,
	confirmBeforeDelete: true,
	gridSnap: true,
	gridSize: 16,
	reduceMotion: false,
};

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
	{
		id: "new",
		label: "New Model",
		macKeys: "⌘N",
		winKeys: "Ctrl+N",
		category: "file",
	},
	{
		id: "open",
		label: "Open Model",
		macKeys: "⌘O",
		winKeys: "Ctrl+O",
		category: "file",
	},
	{
		id: "save",
		label: "Save",
		macKeys: "⌘S",
		winKeys: "Ctrl+S",
		category: "file",
	},
	{
		id: "save-as",
		label: "Save As",
		macKeys: "⌘⇧S",
		winKeys: "Ctrl+Shift+S",
		category: "file",
	},
	{
		id: "settings",
		label: "Open Settings",
		macKeys: "⌘,",
		winKeys: "Ctrl+,",
		category: "view",
	},
	{
		id: "ai-chat",
		label: "Focus AI Chat",
		macKeys: "⌘L",
		winKeys: "Ctrl+L",
		category: "view",
	},
	{
		id: "shortcuts",
		label: "Keyboard Shortcuts",
		macKeys: "⌘/",
		winKeys: "Ctrl+/",
		category: "view",
	},
	{
		id: "tab-properties",
		label: "Properties Tab",
		macKeys: "1",
		winKeys: "1",
		category: "view",
	},
	{
		id: "tab-threats",
		label: "Threats Tab",
		macKeys: "2",
		winKeys: "2",
		category: "view",
	},
	{
		id: "tab-ai",
		label: "AI Tab",
		macKeys: "3",
		winKeys: "3",
		category: "view",
	},
	{
		id: "escape",
		label: "Deselect / Close Dialog",
		macKeys: "Esc",
		winKeys: "Esc",
		category: "canvas",
	},
	{
		id: "delete",
		label: "Delete Selected",
		macKeys: "⌫",
		winKeys: "Delete",
		category: "canvas",
	},
	{
		id: "select-all",
		label: "Select All",
		macKeys: "⌘A",
		winKeys: "Ctrl+A",
		category: "canvas",
	},
];
