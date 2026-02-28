import { useCallback, useEffect, useRef } from "react";
import { useFileOperations } from "@/hooks/use-file-operations";
import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * Autosave hook — watches model dirty state and auto-saves after a debounce.
 * Only saves if the model has a previously-saved filePath (won't trigger Save As).
 *
 * Reports status via the returned object for status bar display.
 */
export function useAutosave(): AutosaveStatus {
	const isDirty = useModelStore((s) => s.isDirty);
	const filePath = useModelStore((s) => s.filePath);
	const enabled = useSettingsStore((s) => s.settings.autosaveEnabled);
	const intervalSeconds = useSettingsStore((s) => s.settings.autosaveIntervalSeconds);
	const { saveModel } = useFileOperations();

	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const statusRef = useRef<"idle" | "saving" | "saved">("idle");
	const lastSavedRef = useRef<string | null>(null);

	const clearTimer = useCallback(() => {
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	useEffect(() => {
		if (!enabled || !isDirty || !filePath) {
			clearTimer();
			return;
		}

		clearTimer();
		timerRef.current = setTimeout(() => {
			statusRef.current = "saving";
			void saveModel().then(() => {
				statusRef.current = "saved";
				const now = new Date();
				lastSavedRef.current = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
			});
		}, intervalSeconds * 1000);

		return clearTimer;
	}, [enabled, isDirty, filePath, intervalSeconds, saveModel, clearTimer]);

	// Reset status when dirty changes (user edits after an autosave)
	useEffect(() => {
		if (isDirty) {
			statusRef.current = "idle";
		}
	}, [isDirty]);

	return {
		enabled,
		lastSaved: lastSavedRef.current,
	};
}

export interface AutosaveStatus {
	enabled: boolean;
	lastSaved: string | null;
}
