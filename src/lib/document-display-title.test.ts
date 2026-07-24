import { describe, expect, it } from "vitest";
import type { ThreatModel } from "@/types/threat-model";
import {
	documentDisplayTitle,
	MAX_DISPLAY_LENGTH,
	resolveDisplayTitle,
	sanitizeDisplayText,
} from "./document-display-title";

function makeModel(title: string): ThreatModel {
	return {
		version: "1.0",
		metadata: { title, author: "", created: "", modified: "", description: "" },
		elements: [],
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [],
	};
}

describe("documentDisplayTitle", () => {
	it("uses the POSIX file basename without its extension", () => {
		expect(documentDisplayTitle(makeModel("Ignored"), "/home/jane/payments.thf")).toBe("payments");
	});

	it("resolves a Windows path to its basename on every platform", () => {
		// The discriminating case: a naive `split('/')` leaves the whole backslash path intact.
		expect(documentDisplayTitle(makeModel("Ignored"), "C:\\models\\payments.thf")).toBe("payments");
	});

	it("falls back to the model metadata title when there is no path", () => {
		expect(documentDisplayTitle(makeModel("Untitled Threat Model"), null)).toBe(
			"Untitled Threat Model",
		);
	});

	it("falls back to the app name when there is neither a path nor a model", () => {
		expect(documentDisplayTitle(null, null)).toBe("Threat Forge");
	});

	it("prefers the basename over the metadata title when both exist", () => {
		expect(documentDisplayTitle(makeModel("Metadata Title"), "/tmp/on-disk-name.thf")).toBe(
			"on-disk-name",
		);
	});
});

describe("resolveDisplayTitle (cached-title path for un-hydrated tabs, #56)", () => {
	it("resolves a cached manifest title identically to a hydrated model", () => {
		// A restored tab has only the cached title string, not a model; it must land on the same
		// label the hydrated tab would show, so the two cannot drift when the body finally loads.
		expect(resolveDisplayTitle("Untitled Threat Model", null)).toBe(
			documentDisplayTitle(makeModel("Untitled Threat Model"), null),
		);
		expect(resolveDisplayTitle("Ignored", "/home/jane/payments.thf")).toBe("payments");
	});

	it("falls back to the app name when a persisted document cached no title and has no path", () => {
		expect(resolveDisplayTitle(null, null)).toBe("Threat Forge");
	});

	it("sanitizes a cached title the same way documentDisplayTitle sanitizes a model title (#175)", () => {
		const hostileTitle = "Evil\u202Eexe.gpj";
		expect(resolveDisplayTitle(hostileTitle, null)).toBe(
			documentDisplayTitle(makeModel(hostileTitle), null),
		);
	});
});

describe("sanitizeDisplayText (#175)", () => {
	it("strips every C0 control character (U+0000\u2013U+001F)", () => {
		const withControls = `A\u0000B\u0001C\u001FD`;
		expect(sanitizeDisplayText(withControls)).toBe("ABCD");
	});

	it("strips every C1 control character (U+007F\u2013U+009F)", () => {
		const withControls = `A\u007FB\u0080C\u009FD`;
		expect(sanitizeDisplayText(withControls)).toBe("ABCD");
	});

	it("strips the bidi embedding/override range (U+202A\u2013U+202E)", () => {
		const withBidi = "A\u202AB\u202BC\u202CD\u202DE\u202EF";
		expect(sanitizeDisplayText(withBidi)).toBe("ABCDEF");
	});

	it("strips the bidi isolate range (U+2066\u2013U+2069)", () => {
		const withIsolates = "A\u2066B\u2067C\u2068D\u2069E";
		expect(sanitizeDisplayText(withIsolates)).toBe("ABCDE");
	});

	it("strips the LRM/RLM marks (U+200E, U+200F)", () => {
		expect(sanitizeDisplayText("A\u200EB\u200FC")).toBe("ABC");
	});

	it("strips the Arabic Letter Mark (U+061C)", () => {
		expect(sanitizeDisplayText("A\u061CB")).toBe("AB");
	});

	it("strips mixed control and bidi characters wherever they appear, keeping the rest intact", () => {
		// A right-to-left override followed by a reversed extension spoofs a document as a
		// different file type (the classic `cod.exe\u202Egpj` -> visually "cod.exe.jpg" attack).
		const spoofed = "invoice\u202Efdp.exe";
		expect(sanitizeDisplayText(spoofed)).toBe("invoicefdp.exe");
		const withTab = "quarterly\treport\n2026";
		expect(sanitizeDisplayText(withTab)).toBe("quarterlyreport2026");
	});

	it("caps very long text at MAX_DISPLAY_LENGTH code points with a visible ellipsis", () => {
		const long = "a".repeat(MAX_DISPLAY_LENGTH + 500);
		const result = sanitizeDisplayText(long);
		expect(Array.from(result)).toHaveLength(MAX_DISPLAY_LENGTH);
		expect(result.endsWith("\u2026")).toBe(true);
		expect(result.startsWith("a".repeat(MAX_DISPLAY_LENGTH - 1))).toBe(true);
	});

	it("leaves text at exactly MAX_DISPLAY_LENGTH untouched (no ellipsis, no truncation)", () => {
		const exact = "a".repeat(MAX_DISPLAY_LENGTH);
		expect(sanitizeDisplayText(exact)).toBe(exact);
	});

	it("truncates text one code point over the boundary", () => {
		const overByOne = "a".repeat(MAX_DISPLAY_LENGTH + 1);
		const result = sanitizeDisplayText(overByOne);
		expect(Array.from(result)).toHaveLength(MAX_DISPLAY_LENGTH);
		expect(result).toBe(`${"a".repeat(MAX_DISPLAY_LENGTH - 1)}\u2026`);
	});

	it("counts astral (surrogate-pair) code points as one unit and never splits a pair", () => {
		// U+1F600 GRINNING FACE is a surrogate pair in UTF-16 (two code units, one code point).
		const emoji = "\u{1F600}";
		const long = emoji.repeat(MAX_DISPLAY_LENGTH + 10);
		const result = sanitizeDisplayText(long);
		expect(Array.from(result)).toHaveLength(MAX_DISPLAY_LENGTH);
		// Every retained code unit pair is a complete surrogate pair, and the string ends in the
		// plain ellipsis character, not a dangling lone surrogate.
		expect(result.endsWith("\u2026")).toBe(true);
		const withoutEllipsis = result.slice(0, -1);
		expect(withoutEllipsis).toBe(emoji.repeat(MAX_DISPLAY_LENGTH - 1));
		expect(Array.from(withoutEllipsis).every((cp) => cp === emoji)).toBe(true);
	});

	it("returns an empty string when the input is entirely control/bidi characters", () => {
		expect(sanitizeDisplayText("\u0000\u202E\u200F\u007F")).toBe("");
	});
});

describe("resolveDisplayTitle sanitization fallthrough (#175)", () => {
	it("falls through a basename that strips to nothing to the metadata title", () => {
		// The whole basename (before the extension) is control/bidi characters.
		expect(resolveDisplayTitle("Safe Title", "/tmp/\u0000\u202E.thf")).toBe("Safe Title");
	});

	it("falls through a basename and a title that both strip to nothing to the app name", () => {
		expect(resolveDisplayTitle("\u202E\u200F", "/tmp/\u0000\u0001.thf")).toBe("Threat Forge");
	});

	it("strips a bidi override hidden in a malicious POSIX basename", () => {
		// Renders visually as something like "cod.exe.jpg" while the real extension is `.exe`.
		const hostilePath = "/home/jane/invoice\u202Egpj.exe.thf";
		expect(resolveDisplayTitle(null, hostilePath)).toBe("invoicegpj.exe");
	});

	it("strips a bidi override hidden in a malicious Windows basename", () => {
		const hostilePath = "C:\\Users\\jane\\invoice\u202Egpj.exe.thf";
		expect(resolveDisplayTitle(null, hostilePath)).toBe("invoicegpj.exe");
	});

	it("caps an oversized metadata title used as the display label", () => {
		const longTitle = "T".repeat(MAX_DISPLAY_LENGTH + 50);
		const result = resolveDisplayTitle(longTitle, null);
		expect(Array.from(result)).toHaveLength(MAX_DISPLAY_LENGTH);
		expect(result.endsWith("\u2026")).toBe(true);
	});

	it("caps an oversized file basename used as the display label", () => {
		const longName = `${"n".repeat(MAX_DISPLAY_LENGTH + 50)}.thf`;
		const result = resolveDisplayTitle(null, `/tmp/${longName}`);
		expect(Array.from(result)).toHaveLength(MAX_DISPLAY_LENGTH);
		expect(result.endsWith("\u2026")).toBe(true);
	});
});
