import { useEffect } from "react";
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
			const activeTag = document.activeElement?.tagName;
			const isInputFocused =
				activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT";

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
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [newModel, openModel, saveModel, saveModelAs, setRightPanelTab]);
}
