import { useEffect } from "react";
import { useFileOperations } from "./use-file-operations";

export function useKeyboardShortcuts() {
	const { newModel, openModel, saveModel } = useFileOperations();

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
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [newModel, openModel, saveModel]);
}
