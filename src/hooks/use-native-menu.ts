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
 * Open a .thf file by path (used for file association / open-with).
 * Calls the Rust open_threat_model command directly with the given path.
 */
async function openFileByPath(filePath: string) {
	const { invoke } = await import("@tauri-apps/api/core");
	const model = await invoke<import("@/types/threat-model").ThreatModel>("open_threat_model", {
		path: filePath,
	});

	const layout = buildLayoutFromModel(model);
	if (layout) useCanvasStore.getState().setPendingLayout(layout);
	useModelStore.getState().setModel(model, filePath);
	useHistoryStore.getState().clear();
	useSettingsStore.getState().loadFileSettings(model.metadata.settings);
}

/**
 * Listens to native Tauri menu events and dispatches them to the appropriate store actions.
 * Also listens for file-association open events.
 * No-op in web builds where Tauri APIs are unavailable.
 */
export function useNativeMenu() {
	const { newModel, openModel, importModel, saveModel, saveModelAs, closeModel, exportAsHtml } =
		useFileOperations();

	useEffect(() => {
		if (!isTauri()) return;

		let unlistenMenu: (() => void) | undefined;
		let unlistenFile: (() => void) | undefined;

		async function setup() {
			const { listen } = await import("@tauri-apps/api/event");

			// Listen for file-association open events (double-click .thf in Finder/Explorer)
			unlistenFile = await listen<string>("open-file", (event) => {
				void openFileByPath(event.payload);
			});

			unlistenMenu = await listen<string>("menu-action", (event) => {
				const action = event.payload;

				switch (action) {
					// File
					case "file-new":
						void newModel();
						break;
					case "file-open":
						void openModel();
						break;
					case "file-import":
						void importModel();
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
					case "file-export-html":
						void exportAsHtml();
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
					case "edit-copy":
					case "edit-paste":
					case "edit-select-all": {
						// When an input/textarea has focus, perform native text
						// operations instead of canvas clipboard actions. The Tauri
						// native menu intercepts the keystroke at the OS level, so
						// the webview never sees the keydown — we trigger text ops
						// manually here.
						const el = document.activeElement;
						const isText =
							el instanceof HTMLInputElement ||
							el instanceof HTMLTextAreaElement ||
							(el instanceof HTMLElement && el.isContentEditable);

						if (isText) {
							if (action === "edit-select-all") {
								if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
									el.select();
								} else {
									document.execCommand("selectAll");
								}
							} else if (action === "edit-copy") {
								document.execCommand("copy");
							} else if (action === "edit-cut") {
								document.execCommand("cut");
							} else if (action === "edit-paste") {
								document.execCommand("paste");
							}
						} else {
							if (action === "edit-select-all") {
								useClipboardStore.getState().selectAll();
							} else if (action === "edit-copy") {
								useClipboardStore.getState().copySelected();
							} else if (action === "edit-cut") {
								useClipboardStore.getState().cutSelected();
							} else if (action === "edit-paste") {
								useClipboardStore.getState().paste();
							}
						}
						break;
					}
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
			unlistenMenu?.();
			unlistenFile?.();
		};
	}, [newModel, openModel, importModel, saveModel, saveModelAs, closeModel, exportAsHtml]);
}
