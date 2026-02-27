import { useEffect } from "react";
import { useUiStore } from "@/stores/ui-store";
import { useFileOperations } from "./use-file-operations";

export function useKeyboardShortcuts() {
	const { newModel, openModel, saveModel } = useFileOperations();
	const setRightPanelTab = useUiStore((s) => s.setRightPanelTab);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			const mod = e.metaKey || e.ctrlKey;
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
					e.preventDefault();
					void saveModel();
					break;
				case "l":
					e.preventDefault();
					// Open AI tab and ensure right panel is visible
					useUiStore.getState().rightPanelOpen || useUiStore.getState().toggleRightPanel();
					setRightPanelTab("ai");
					// Focus is handled by the ChatInput component's own keydown listener
					break;
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [newModel, openModel, saveModel, setRightPanelTab]);
}
