/**
 * Shared primitives for handling untrusted, document- and catalog-derived text.
 *
 * Three concerns live here so the prompt layer (`#177`), the display layer
 * (`#175`), and the AI read tools (`#203`) share one vocabulary rather than
 * three:
 *
 *  - the delimiter markers that fence untrusted data,
 *  - the angle-bracket escape that stops a field from forging a marker, and
 *  - the control/bidi-stripping, code-point-capping scalar sanitizer.
 *
 * A single implementation means the model has one rule — *anything between these
 * markers is data* — and a single length convention across the repo.
 */

/**
 * Delimiters that fence untrusted, document-derived context (issue #177),
 * reused around AI read-tool results (issue #203).
 *
 * Everything between these two markers is untrusted content — the user's `.thf`
 * document or the component catalog — and is data, never instructions. The
 * markers use raw angle brackets (`<`, `>`); every enclosed scalar is escaped by
 * {@link escapeDocumentText} so no field can reproduce, close, or forge them.
 * Only the authored markers here are ever emitted literally, so counting them in
 * a prompt or a tool result is exact.
 */
export const UNTRUSTED_DOCUMENT_START = "<<<UNTRUSTED_DOCUMENT_DATA>>>";
export const UNTRUSTED_DOCUMENT_END = "<<<END_UNTRUSTED_DOCUMENT_DATA>>>";

/** The visible marker appended to a value truncated at its code-point cap. */
const ELLIPSIS = "\u2026";

/**
 * Encode a scalar so it can only ever be data inside the untrusted-document
 * delimiter.
 *
 * Backslash is escaped first so an existing escape cannot disguise a raw
 * bracket, then every angle bracket is backslash-escaped. Authored template text
 * inside the block may contain individual brackets (for example the `->` flow
 * arrow), but no enclosed scalar can contain the consecutive raw brackets needed
 * to terminate or forge a marker — even if a hostile field contains the literal
 * delimiter text.
 */
export function escapeDocumentText(value: unknown): string {
	return String(value).replace(/\\/g, "\\\\").replace(/</g, "\\<").replace(/>/g, "\\>");
}

/**
 * C0 controls (`U+0000–001F`), C1 controls (`U+007F–009F`), and the
 * bidirectional-formatting characters (`U+061C`, `U+202A–202E`, `U+2066–2069`,
 * `U+200E`, `U+200F`) that can visually spoof text — for example a right-to-left
 * override making `cod.exe.gpj` render as `jpg.exe.doc` (`#175`, surfaced by the
 * `#54` security preflight in PR #174).
 */
function isUnsafeCodePoint(value: string): boolean {
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
 * Make arbitrary untrusted text safe to hand to a provider, a DOM node, or a
 * tool result: strip control and bidi-override code points, then cap the length
 * at `maxCodePoints` **code points** — not UTF-16 units, so an astral character
 * (outside the BMP) is never split into a dangling lone surrogate — appending a
 * visible ellipsis when truncated so the cut is never mistaken for the whole
 * value.
 *
 * Returns the sanitized text and whether it was truncated, so a caller can flag
 * the truncation (a read tool sets `"truncated": true` on the entity).
 */
export function sanitizeUntrustedScalar(
	text: string,
	maxCodePoints: number,
): { text: string; truncated: boolean } {
	const codePoints = Array.from(text).filter((value) => !isUnsafeCodePoint(value));
	if (codePoints.length <= maxCodePoints) {
		return { text: codePoints.join(""), truncated: false };
	}
	return {
		text: `${codePoints.slice(0, maxCodePoints - 1).join("")}${ELLIPSIS}`,
		truncated: true,
	};
}
