/**
 * Command registry for the Cmd+K command palette.
 * Each command has an id, label, category, optional shortcut, and action callback.
 */

import { getAllComponents } from "@/lib/component-library";
import { useCanvasStore } from "@/stores/canvas-store";
import { useClipboardStore } from "@/stores/clipboard-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";

export interface Command {
	id: string;
	label: string;
	category: "file" | "view" | "canvas" | "navigate" | "settings" | "component";
	/** Optional keyboard shortcut hint displayed in the palette */
	shortcut?: string;
	/** Callback executed when the command is selected */
	action: () => void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** Format a shortcut for display: use symbols on Mac, text on others */
function fmt(mac: string, win: string): string {
	return isMac ? mac : win;
}

/** Compute the center of the visible canvas area in flow coordinates. */
function getViewportCenter(): { x: number; y: number } {
	const vp = useCanvasStore.getState().viewport;
	const w = window.innerWidth;
	const h = window.innerHeight;
	return {
		x: (-vp.x + w / 2) / vp.zoom,
		y: (-vp.y + h / 2) / vp.zoom,
	};
}

/**
 * Build the full command list.
 * Each call returns a fresh array since actions close over current store state.
 */
export function buildCommands(deps: {
	newModel: () => void;
	openModel: () => void;
	saveModel: () => void;
	saveModelAs: () => void;
	hasModel: boolean;
}): Command[] {
	const commands: Command[] = [
		// File commands
		{
			id: "file:new",
			label: "New Model",
			category: "file",
			shortcut: fmt("\u2318N", "Ctrl+N"),
			action: deps.newModel,
		},
		{
			id: "file:open",
			label: "Open Model",
			category: "file",
			shortcut: fmt("\u2318O", "Ctrl+O"),
			action: deps.openModel,
		},
		{
			id: "file:save",
			label: "Save",
			category: "file",
			shortcut: fmt("\u2318S", "Ctrl+S"),
			action: deps.saveModel,
		},
		{
			id: "file:save-as",
			label: "Save As\u2026",
			category: "file",
			shortcut: fmt("\u2318\u21e7S", "Ctrl+Shift+S"),
			action: deps.saveModelAs,
		},

		// View commands
		{
			id: "view:toggle-left-panel",
			label: "Toggle Left Panel",
			category: "view",
			shortcut: fmt("\u2318B", "Ctrl+B"),
			action: () => useUiStore.getState().toggleLeftPanel(),
		},
		{
			id: "view:toggle-right-panel",
			label: "Toggle Right Panel",
			category: "view",
			shortcut: fmt("\u2318I", "Ctrl+I"),
			action: () => useUiStore.getState().toggleRightPanel(),
		},
		{
			id: "view:fit-view",
			label: "Fit to View",
			category: "view",
			shortcut: fmt("\u23180", "Ctrl+0"),
			action: () => useCanvasStore.getState().rfFitView?.(),
		},
		{
			id: "view:zoom-in",
			label: "Zoom In",
			category: "view",
			shortcut: "+",
			action: () => useCanvasStore.getState().rfZoomIn?.(),
		},
		{
			id: "view:zoom-out",
			label: "Zoom Out",
			category: "view",
			shortcut: "\u2212",
			action: () => useCanvasStore.getState().rfZoomOut?.(),
		},

		// Navigate commands
		{
			id: "navigate:properties",
			label: "Go to Properties",
			category: "navigate",
			shortcut: "1",
			action: () => {
				if (!useUiStore.getState().rightPanelOpen) useUiStore.getState().toggleRightPanel();
				useUiStore.getState().setRightPanelTab("properties");
			},
		},
		{
			id: "navigate:threats",
			label: "Go to Threats",
			category: "navigate",
			shortcut: "2",
			action: () => {
				if (!useUiStore.getState().rightPanelOpen) useUiStore.getState().toggleRightPanel();
				useUiStore.getState().setRightPanelTab("threats");
			},
		},
		{
			id: "navigate:ai",
			label: "Go to AI Chat",
			category: "navigate",
			shortcut: fmt("\u2318L", "Ctrl+L"),
			action: () => {
				if (!useUiStore.getState().rightPanelOpen) useUiStore.getState().toggleRightPanel();
				useUiStore.getState().setRightPanelTab("ai");
			},
		},

		// Canvas commands
		{
			id: "canvas:select-all",
			label: "Select All",
			category: "canvas",
			shortcut: fmt("\u2318A", "Ctrl+A"),
			action: () => useClipboardStore.getState().selectAll(),
		},
		{
			id: "canvas:lock-unlock",
			label: "Lock / Unlock Canvas",
			category: "canvas",
			shortcut: fmt("\u2318\u21e7L", "Ctrl+Shift+L"),
			action: () => useUiStore.getState().toggleCanvasLock(),
		},

		// Settings commands
		{
			id: "settings:open",
			label: "Open Settings",
			category: "settings",
			shortcut: fmt("\u2318,", "Ctrl+,"),
			action: () => useSettingsStore.getState().openSettingsDialog(),
		},
	];

	// Component placement commands — only available when a model is open
	if (deps.hasModel) {
		for (const comp of getAllComponents()) {
			commands.push({
				id: `component:${comp.id}`,
				label: `Add ${comp.label}`,
				category: "component",
				action: () => {
					const position = getViewportCenter();
					useCanvasStore.getState().addElement(comp.id, position, {
						icon: comp.icon,
						name: comp.label,
					});
				},
			});
		}
	}

	return commands;
}

/**
 * Simple fuzzy search: check if all characters of the query appear in order in the target.
 */
export function fuzzyMatch(query: string, target: string): boolean {
	const q = query.toLowerCase();
	const t = target.toLowerCase();
	let qi = 0;
	for (let ti = 0; ti < t.length && qi < q.length; ti++) {
		if (t[ti] === q[qi]) qi++;
	}
	return qi === q.length;
}

/**
 * Filter and score commands by a search query. Returns matched commands sorted by relevance.
 */
export function searchCommands(commands: Command[], query: string): Command[] {
	if (!query.trim()) return commands;
	return commands.filter((cmd) => fuzzyMatch(query, cmd.label) || fuzzyMatch(query, cmd.id));
}
