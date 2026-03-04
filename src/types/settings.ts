/**
 * Settings type definitions for ThreatForge.
 *
 * User settings persist locally (localStorage) across all files.
 * File settings are stored alongside the threat model.
 */

/** Font size preference for the application UI */
export type FontSize = "small" | "default" | "large";

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
	/** Show minimap on canvas */
	minimapVisible: boolean;
	/** Author name for edit tracking */
	authorName: string;
	/** Author email for edit tracking */
	authorEmail: string;
	/** UI font size preference */
	fontSize: FontSize;
	/** Selected Anthropic model ID */
	aiModelAnthropic: string;
	/** Selected OpenAI model ID */
	aiModelOpenai: string;
}

/** File-level settings stored alongside the threat model (re-exported from threat-model.ts) */
export type { FileSettings } from "./threat-model";

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
	minimapVisible: true,
	authorName: "",
	authorEmail: "",
	fontSize: "default",
	aiModelAnthropic: "claude-sonnet-4-20250514",
	aiModelOpenai: "gpt-4o",
};

/** Mapping from font size preference to CSS font-size value on <html> */
export const FONT_SIZE_PX: Record<FontSize, number> = {
	small: 14,
	default: 16,
	large: 18,
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
		id: "export-html",
		label: "Export HTML Report",
		macKeys: "⌘⇧E",
		winKeys: "Ctrl+Shift+E",
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
		id: "undo",
		label: "Undo",
		macKeys: "\u2318Z",
		winKeys: "Ctrl+Z",
		category: "edit",
	},
	{
		id: "redo",
		label: "Redo",
		macKeys: "\u2318\u21e7Z",
		winKeys: "Ctrl+Shift+Z",
		category: "edit",
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
		id: "copy",
		label: "Copy",
		macKeys: "⌘C",
		winKeys: "Ctrl+C",
		category: "edit",
	},
	{
		id: "cut",
		label: "Cut",
		macKeys: "⌘X",
		winKeys: "Ctrl+X",
		category: "edit",
	},
	{
		id: "paste",
		label: "Paste",
		macKeys: "⌘V",
		winKeys: "Ctrl+V",
		category: "edit",
	},
	{
		id: "select-all",
		label: "Select All",
		macKeys: "⌘A",
		winKeys: "Ctrl+A",
		category: "canvas",
	},
	{
		id: "toggle-left-panel",
		label: "Toggle Left Panel",
		macKeys: "⌘B",
		winKeys: "Ctrl+B",
		category: "view",
	},
	{
		id: "toggle-right-panel",
		label: "Toggle Right Panel",
		macKeys: "⌘I",
		winKeys: "Ctrl+I",
		category: "view",
	},
	{
		id: "open-ai-tab",
		label: "Open AI Tab",
		macKeys: "⌘⇧I",
		winKeys: "Ctrl+Shift+I",
		category: "view",
	},
	{
		id: "fit-view",
		label: "Fit to View",
		macKeys: "⌘0",
		winKeys: "Ctrl+0",
		category: "canvas",
	},
	{
		id: "zoom-in",
		label: "Zoom In",
		macKeys: "⌘= / +",
		winKeys: "Ctrl+= / +",
		category: "canvas",
	},
	{
		id: "zoom-out",
		label: "Zoom Out",
		macKeys: "⌘- / -",
		winKeys: "Ctrl+- / -",
		category: "canvas",
	},
	{
		id: "nudge",
		label: "Nudge Selected",
		macKeys: "↑↓←→",
		winKeys: "↑↓←→",
		category: "canvas",
	},
	{
		id: "canvas-lock",
		label: "Lock/Unlock Canvas",
		macKeys: "⌘⇧L",
		winKeys: "Ctrl+Shift+L",
		category: "canvas",
	},
	{
		id: "command-palette",
		label: "Command Palette",
		macKeys: "⌘K",
		winKeys: "Ctrl+K",
		category: "view",
	},
	{
		id: "alt-drag-duplicate",
		label: "Alt+Drag Duplicate",
		macKeys: "⌥+Drag",
		winKeys: "Alt+Drag",
		category: "canvas",
	},
];
