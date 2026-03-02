import { useEffect } from "react";
import { buildLayoutFromModel } from "@/lib/model-layout-utils";
import { isTauri } from "@/lib/platform";
import { useCanvasStore } from "@/stores/canvas-store";
import { useClipboardStore } from "@/stores/clipboard-store";
import { useHistoryStore } from "@/stores/history-store";
import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";
import { useFileOperations } from "./use-file-operations";

/**
 * Listens to native Tauri menu events and dispatches them to the appropriate store actions.
 * No-op in web builds where Tauri APIs are unavailable.
 */
export function useNativeMenu() {
	const { newModel, openModel, saveModel, saveModelAs, closeModel } = useFileOperations();

	useEffect(() => {
		if (!isTauri()) return;

		let unlisten: (() => void) | undefined;

		async function setup() {
			const { listen } = await import("@tauri-apps/api/event");

			unlisten = await listen<string>("menu-action", (event) => {
				const action = event.payload;

				switch (action) {
					// File
					case "file-new":
						void newModel();
						break;
					case "file-open":
						void openModel();
						break;
					case "file-save":
						void saveModel();
						break;
					case "file-save-as":
						void saveModelAs();
						break;
					case "file-close":
						void closeModel();
						break;

					// Edit
					case "edit-undo": {
						const currentModel = useModelStore.getState().model;
						if (!currentModel) break;
						const snapshot = useHistoryStore.getState().undo(currentModel);
						if (snapshot) {
							const layout = buildLayoutFromModel(snapshot);
							if (layout) useCanvasStore.getState().setPendingLayout(layout);
							useModelStore.getState().restoreSnapshot(snapshot);
							useCanvasStore.getState().syncFromModel();
						}
						break;
					}
					case "edit-redo": {
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
					case "edit-cut":
						useClipboardStore.getState().cutSelected();
						break;
					case "edit-copy":
						useClipboardStore.getState().copySelected();
						break;
					case "edit-paste":
						useClipboardStore.getState().paste();
						break;
					case "edit-select-all":
						useClipboardStore.getState().selectAll();
						break;
					case "edit-delete":
						useCanvasStore.getState().deleteSelected();
						break;

					// View
					case "view-toggle-palette":
						useUiStore.getState().toggleLeftPanel();
						break;
					case "view-toggle-panel":
						useUiStore.getState().toggleRightPanel();
						break;
					case "view-zoom-in":
						useCanvasStore.getState().rfZoomIn?.();
						break;
					case "view-zoom-out":
						useCanvasStore.getState().rfZoomOut?.();
						break;
					case "view-fit":
						useCanvasStore.getState().rfFitView?.();
						break;
					case "view-command-palette":
						useUiStore.getState().openCommandPalette();
						break;

					// Help
					case "help-shortcuts":
						useSettingsStore.getState().openShortcutsDialog();
						break;
					case "help-guides":
						// Handled via a frontend event — guide picker is a React component
						window.dispatchEvent(new CustomEvent("open-guide-picker"));
						break;
					case "help-about":
						// Simple alert for now
						break;
				}
			});
		}

		void setup();

		return () => {
			unlisten?.();
		};
	}, [newModel, openModel, saveModel, saveModelAs, closeModel]);
}
