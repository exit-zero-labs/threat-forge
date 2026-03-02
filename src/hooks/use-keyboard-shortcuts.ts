import { useEffect } from "react";
import { buildLayoutFromModel } from "@/lib/model-layout-utils";
import { useCanvasStore } from "@/stores/canvas-store";
import { useClipboardStore } from "@/stores/clipboard-store";
import { useHistoryStore } from "@/stores/history-store";
import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";
import { useFileOperations } from "./use-file-operations";

export function useKeyboardShortcuts() {
	const { newModel, openModel, saveModel, saveModelAs } = useFileOperations();
	const setRightPanelTab = useUiStore((s) => s.setRightPanelTab);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			const mod = e.metaKey || e.ctrlKey;

			// Non-modifier shortcuts (only when not focused in an input)
			const active = document.activeElement;
			const activeTag = active?.tagName;
			const isInputFocused =
				activeTag === "INPUT" ||
				activeTag === "TEXTAREA" ||
				activeTag === "SELECT" ||
				(active instanceof HTMLElement && active.isContentEditable);

			if (!isInputFocused && !mod) {
				switch (e.key) {
					case "1":
						e.preventDefault();
						useUiStore.getState().rightPanelOpen || useUiStore.getState().toggleRightPanel();
						setRightPanelTab("properties");
						return;
					case "2":
						e.preventDefault();
						useUiStore.getState().rightPanelOpen || useUiStore.getState().toggleRightPanel();
						setRightPanelTab("threats");
						return;
					case "3":
						e.preventDefault();
						useUiStore.getState().rightPanelOpen || useUiStore.getState().toggleRightPanel();
						setRightPanelTab("ai");
						return;
					case "Escape":
						// Close dialogs first, then deselect
						if (useSettingsStore.getState().settingsDialogOpen) {
							useSettingsStore.getState().closeSettingsDialog();
						} else if (useSettingsStore.getState().shortcutsDialogOpen) {
							useSettingsStore.getState().closeShortcutsDialog();
						} else {
							useModelStore.getState().setSelectedElement(null);
							useModelStore.getState().setSelectedThreat(null);
						}
						return;
				}
			}

			if (!mod) return;

			switch (e.key.toLowerCase()) {
				case "n":
					e.preventDefault();
					void newModel();
					break;
				case "o":
					e.preventDefault();
					void openModel();
					break;
				case "s":
					if (e.shiftKey) {
						e.preventDefault();
						void saveModelAs();
					} else {
						e.preventDefault();
						void saveModel();
					}
					break;
				case "z": {
					e.preventDefault();
					const currentModel = useModelStore.getState().model;
					if (!currentModel) break;
					if (e.shiftKey) {
						// Redo (Cmd+Shift+Z)
						const snapshot = useHistoryStore.getState().redo(currentModel);
						if (snapshot) {
							const layout = buildLayoutFromModel(snapshot);
							if (layout) useCanvasStore.getState().setPendingLayout(layout);
							useModelStore.getState().restoreSnapshot(snapshot);
							useCanvasStore.getState().syncFromModel();
						}
					} else {
						// Undo (Cmd+Z)
						const snapshot = useHistoryStore.getState().undo(currentModel);
						if (snapshot) {
							const layout = buildLayoutFromModel(snapshot);
							if (layout) useCanvasStore.getState().setPendingLayout(layout);
							useModelStore.getState().restoreSnapshot(snapshot);
							useCanvasStore.getState().syncFromModel();
						}
					}
					break;
				}
				case "y": {
					// Redo alternative (Cmd+Y)
					e.preventDefault();
					const currentModel = useModelStore.getState().model;
					if (!currentModel) break;
					const snapshot = useHistoryStore.getState().redo(currentModel);
					if (snapshot) {
						const layout = buildLayoutFromModel(snapshot);
						if (layout) useCanvasStore.getState().setPendingLayout(layout);
						useModelStore.getState().restoreSnapshot(snapshot);
						useCanvasStore.getState().syncFromModel();
					}
					break;
				}
				case "l":
					e.preventDefault();
					useUiStore.getState().rightPanelOpen || useUiStore.getState().toggleRightPanel();
					setRightPanelTab("ai");
					break;
				case ",":
					e.preventDefault();
					useSettingsStore.getState().openSettingsDialog();
					break;
				case "/":
					e.preventDefault();
					useSettingsStore.getState().openShortcutsDialog();
					break;
				case "a":
					if (!isInputFocused) {
						e.preventDefault();
						useClipboardStore.getState().selectAll();
					}
					break;
				case "c":
					if (!isInputFocused) {
						e.preventDefault();
						useClipboardStore.getState().copySelected();
					}
					break;
				case "x":
					if (!isInputFocused) {
						e.preventDefault();
						useClipboardStore.getState().cutSelected();
					}
					break;
				case "v":
					if (!isInputFocused) {
						e.preventDefault();
						useClipboardStore.getState().paste();
					}
					break;
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [newModel, openModel, saveModel, saveModelAs, setRightPanelTab]);
}
