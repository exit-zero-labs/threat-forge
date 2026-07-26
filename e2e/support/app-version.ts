import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The version the app under test reports, read from the same `package.json` that
 * `vite.config.ts` compiles into `__APP_VERSION__`.
 *
 * The What's New overlay suppresses itself only when `threatforge-last-seen-version`
 * matches that build define exactly, so a hard-coded literal here would silently stop
 * suppressing the overlay on the next version bump and block every spec behind a modal.
 */
export const APP_VERSION: string = (
	JSON.parse(
		readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf-8"),
	) as { version: string }
).version;
