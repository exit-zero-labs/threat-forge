import { sanitizeUntrustedScalar } from "@/lib/ai/untrusted-text";
import type { ThreatModel } from "@/types/threat-model";

const APP_NAME = "Threat Forge";

/**
 * Longest display label kept for a tab, tooltip, menu-bar title, command-palette entry, close
 * prompt, browser document title, or native window title (`#175`). Counted in Unicode code
 * points, not UTF-16 code units, so an astral character (outside the BMP) is never split into a
 * dangling lone surrogate. 200 comfortably fits any realistic filename or metadata title while
 * bounding what a maliciously oversized `.thf` title can push into a DOM attribute, a native
 * tooltip, or the `setTitle` IPC call — mirroring `PROVIDER_DETAIL_MAX_LENGTH` in
 * `src/lib/ai/protocol/errors.ts`, the repo's existing length-cap convention for untrusted text.
 */
export const MAX_DISPLAY_LENGTH = 200;

/**
 * Make arbitrary untrusted text safe to render as a document label or tooltip line: strip control
 * and bidi-override characters, then cap the length at {@link MAX_DISPLAY_LENGTH} code points,
 * appending a visible ellipsis when truncated so the cut is never mistaken for the whole value.
 *
 * This delegates to the shared {@link sanitizeUntrustedScalar} primitive (`#203`) so the display
 * path, the prompt path, and the AI read tools share one sanitizer. It is the single place
 * {@link resolveDisplayTitle} sanitizes a title/basename candidate, and the one a caller must
 * reach for too if it appends more untrusted text (such as a raw file path) after an
 * already-sanitized title — see `document-tab.tsx`'s tooltip, which does exactly that.
 */
export function sanitizeDisplayText(text: string): string {
	return sanitizeUntrustedScalar(text, MAX_DISPLAY_LENGTH).text;
}

/**
 * The name a document shows to the user, resolved from one place so the tab, the window/tab
 * title, and the menu-bar title cannot drift (`#54` D2).
 *
 * The file basename with its extension stripped wins when the document has a path; otherwise the
 * model's metadata title; otherwise the app name. The path is split on both `/` and `\`, so a
 * Windows path resolves to its basename on every platform — which `use-window-title.ts` already
 * did and `top-menu-bar.tsx` did not.
 *
 * The module is named `document-display-title` rather than `document-title` because
 * `use-document-title.ts` already exists for the unrelated marketing routes.
 */
export function documentDisplayTitle(model: ThreatModel | null, filePath: string | null): string {
	return resolveDisplayTitle(model?.metadata.title ?? null, filePath);
}

/**
 * The same title resolution as {@link documentDisplayTitle}, but from a bare cached title rather
 * than a loaded model. Used to label a persisted, un-hydrated tab (`#56`), whose body is not in
 * memory yet: the workspace manifest caches only the `metadata.title` string, so a restored tab
 * resolves its label identically to the hydrated one — path basename first, then the cached
 * title, then the app name — and the two cannot drift when the document is finally hydrated.
 *
 * Every candidate is sanitized with {@link sanitizeDisplayText} before it can win (`#175`): a
 * basename or title that strips down to nothing (for example, a name made entirely of control
 * characters) falls through to the next candidate rather than returning an empty label. The
 * `filePath` and `title` values themselves — used elsewhere for file I/O and `.thf` metadata —
 * are never mutated; only the string returned for display is sanitized.
 */
export function resolveDisplayTitle(title: string | null, filePath: string | null): string {
	if (filePath) {
		const basename = filePath
			.split(/[/\\]/)
			.pop()
			?.replace(/\.[^.]+$/, "");
		if (basename) {
			const safeBasename = sanitizeDisplayText(basename);
			if (safeBasename) return safeBasename;
		}
	}
	if (title) {
		const safeTitle = sanitizeDisplayText(title);
		if (safeTitle) return safeTitle;
	}
	return APP_NAME;
}
