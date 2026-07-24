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

const ELLIPSIS = "\u2026";

/**
 * C0 controls (`U+0000–001F`), C1 controls (`U+007F–009F`), and the bidirectional-formatting
 * characters (`U+061C`, `U+202A–202E`, `U+2066–2069`, `U+200E`, `U+200F`) that can visually
 * spoof a label — for example a right-to-left override making `cod.exe.gpj` render as
 * `jpg.exe.doc` (`#175`, surfaced by the `#54` security preflight in PR #174).
 */
function isUnsafeDisplayCodePoint(value: string): boolean {
	const codePoint = value.codePointAt(0);
	if (codePoint === undefined) return false;
	return (
		codePoint <= 0x001f ||
		(codePoint >= 0x007f && codePoint <= 0x009f) ||
		codePoint === 0x061c ||
		codePoint === 0x200e ||
		codePoint === 0x200f ||
		(codePoint >= 0x202a && codePoint <= 0x202e) ||
		(codePoint >= 0x2066 && codePoint <= 0x2069)
	);
}

/**
 * Make arbitrary untrusted text safe to render as a document label or tooltip line: strip control
 * and bidi-override characters, then cap the length at {@link MAX_DISPLAY_LENGTH} code points,
 * appending a visible ellipsis when truncated so the cut is never mistaken for the whole value.
 *
 * This is the single place {@link resolveDisplayTitle} sanitizes a title/basename candidate, and
 * the one a caller must reach for too if it appends more untrusted text (such as a raw file path)
 * after an already-sanitized title — see `document-tab.tsx`'s tooltip, which does exactly that.
 */
export function sanitizeDisplayText(text: string): string {
	const codePoints = Array.from(text).filter((value) => !isUnsafeDisplayCodePoint(value));
	if (codePoints.length <= MAX_DISPLAY_LENGTH) return codePoints.join("");
	return `${codePoints.slice(0, MAX_DISPLAY_LENGTH - 1).join("")}${ELLIPSIS}`;
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
