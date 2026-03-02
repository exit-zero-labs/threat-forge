/**
 * Platform detection for Tauri vs browser environments.
 *
 * Used by adapter factories to select the correct implementation at runtime.
 * Tauri injects `window.__TAURI_INTERNALS__` in its webview — if present,
 * we're running inside the desktop app. Otherwise, we're in a plain browser.
 */
export function isTauri(): boolean {
	return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Open a URL in the user's default browser.
 *
 * In Tauri, `window.open()` is blocked by the webview sandbox.
 * Uses the `@tauri-apps/plugin-opener` when running in Tauri,
 * falls back to `window.open()` in browser builds.
 */
export async function openExternalUrl(url: string): Promise<void> {
	if (isTauri()) {
		const { openUrl } = await import("@tauri-apps/plugin-opener");
		await openUrl(url);
	} else {
		window.open(url, "_blank", "noopener,noreferrer");
	}
}
