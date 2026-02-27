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
