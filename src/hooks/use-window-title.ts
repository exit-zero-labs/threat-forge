import { useEffect, useRef } from "react";
import { isTauri } from "@/lib/platform";
import { useModelStore } from "@/stores/model-store";

/**
 * Keeps the window/tab title in sync with the current file state.
 *
 * Format:
 * - No file open:    "Threat Forge"
 * - File open:       "Threat Forge - {basename without extension}"
 * - Unsaved changes: "Threat Forge - {basename without extension} *"
 * - New model:       "Threat Forge - {model title}"
 */
export function useWindowTitle(): void {
	const model = useModelStore((s) => s.model);
	const filePath = useModelStore((s) => s.filePath);
	const isDirty = useModelStore((s) => s.isDirty);

	// Counter to cancel stale async title updates
	const titleVersionRef = useRef(0);

	useEffect(() => {
		const APP_NAME = "Threat Forge";

		let title = APP_NAME;
		if (model) {
			const name = filePath
				? (filePath
						.split(/[/\\]/)
						.pop()
						?.replace(/\.[^.]+$/, "") ?? model.metadata.title)
				: model.metadata.title;
			title = `${APP_NAME} - ${name}`;
			if (isDirty) {
				title += " *";
			}
		}

		// Update browser tab title (synchronous — always correct)
		document.title = title;

		// Update native window title in Tauri with staleness check
		if (isTauri()) {
			const version = ++titleVersionRef.current;
			void setNativeTitle(title, version, titleVersionRef);
		}
	}, [model, filePath, isDirty]);
}

async function setNativeTitle(
	title: string,
	version: number,
	versionRef: React.RefObject<number>,
): Promise<void> {
	try {
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		// Skip if a newer title update was issued while we were awaiting
		if (versionRef.current !== version) return;
		await getCurrentWindow().setTitle(title);
	} catch {
		// Silently ignore if window API is unavailable
	}
}
