import { describe, expect, it } from "vitest";
import { sanitizeDisplayText } from "@/lib/document-display-title";
import {
	escapeDocumentText,
	sanitizeUntrustedScalar,
	UNTRUSTED_DOCUMENT_END,
} from "./untrusted-text";

describe("escapeDocumentText", () => {
	it("escapes backslash before angle brackets so an escape cannot disguise a bracket", () => {
		// Backslash must be doubled first; otherwise `\<` in the source could be
		// read as an escaped bracket rather than a literal backslash + bracket.
		expect(escapeDocumentText("a\\<b>")).toBe("a\\\\\\<b\\>");
	});

	it("neutralizes literal end-marker text so it can never close the fence", () => {
		const escaped = escapeDocumentText(UNTRUSTED_DOCUMENT_END);
		expect(escaped).not.toContain(UNTRUSTED_DOCUMENT_END);
		// Every bracket is backslash-escaped, so no two raw brackets are adjacent —
		// the marker needs `>>>` / `<<<` runs that can no longer occur.
		expect(escaped).not.toMatch(/<</);
		expect(escaped).not.toMatch(/>>/);
	});

	it("coerces non-string input rather than throwing", () => {
		expect(escapeDocumentText(42)).toBe("42");
		expect(escapeDocumentText(true)).toBe("true");
	});
});

describe("sanitizeUntrustedScalar", () => {
	it("strips C0, C1, and bidi-formatting code points", () => {
		const hostile = "a\u0000b\u007fc\u202ed\u2066e\u200ff";
		const { text, truncated } = sanitizeUntrustedScalar(hostile, 200);
		expect(text).toBe("abcdef");
		expect(truncated).toBe(false);
	});

	it("caps at the code-point limit with a trailing ellipsis and a truncated flag", () => {
		const { text, truncated } = sanitizeUntrustedScalar("x".repeat(300), 200);
		expect(Array.from(text)).toHaveLength(200);
		expect(text.endsWith("\u2026")).toBe(true);
		expect(truncated).toBe(true);
	});

	it("does not truncate a value exactly at the cap", () => {
		const { text, truncated } = sanitizeUntrustedScalar("y".repeat(200), 200);
		expect(text).toBe("y".repeat(200));
		expect(truncated).toBe(false);
	});

	it("counts code points, never splitting an astral character into a lone surrogate", () => {
		// Each 😀 is two UTF-16 units; a UTF-16-unit cap would split the 5th.
		const { text } = sanitizeUntrustedScalar("😀".repeat(10), 5);
		// 5 code points: 4 emoji + the ellipsis, never a dangling surrogate.
		expect(Array.from(text)).toHaveLength(5);
		for (const ch of Array.from(text).slice(0, 4)) expect(ch).toBe("😀");
		expect(text.endsWith("\u2026")).toBe(true);
		// No lone surrogate survived the slice.
		expect(/[\uD800-\uDFFF]/.test(text.replace(/😀/gu, ""))).toBe(false);
	});
});

describe("sanitizeUntrustedScalar and sanitizeDisplayText agree", () => {
	// The extraction's whole point: display and tool-result text run one sanitizer.
	const corpus = [
		"plain title",
		"😀 astral 😀",
		"bidi \u202eoverride\u202c here",
		"lone \u0007 control",
		"z".repeat(300),
		"",
	];

	it("produces identical text at the 200-code-point display cap for every corpus entry", () => {
		for (const input of corpus) {
			expect(sanitizeUntrustedScalar(input, 200).text).toBe(sanitizeDisplayText(input));
		}
	});
});
