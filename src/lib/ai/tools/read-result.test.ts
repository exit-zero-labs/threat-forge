import { describe, expect, it } from "vitest";
import { UNTRUSTED_DOCUMENT_END, UNTRUSTED_DOCUMENT_START } from "@/lib/ai/untrusted-text";
import {
	buildReadResult,
	describeReadFailure,
	escapeList,
	escapeScalar,
	paginate,
	READ_RESULT_MAX_BYTES,
} from "./read-result";

const byteLength = (value: string) => new TextEncoder().encode(value).length;

/** Strip the two markers and return the JSON body. */
function bodyOf(result: string): string {
	const start = result.indexOf(UNTRUSTED_DOCUMENT_START) + UNTRUSTED_DOCUMENT_START.length;
	const end = result.indexOf(UNTRUSTED_DOCUMENT_END);
	return result.slice(start, end).trim();
}

function occurrences(haystack: string, needle: string): number {
	let count = 0;
	let from = 0;
	for (;;) {
		const at = haystack.indexOf(needle, from);
		if (at < 0) return count;
		count += 1;
		from = at + needle.length;
	}
}

describe("buildReadResult", () => {
	it("wraps the canonical body in the two markers and parses as JSON", () => {
		const result = buildReadResult({ tool: "get_document_summary", payload: { counts: { x: 1 } } });
		expect(result.startsWith(UNTRUSTED_DOCUMENT_START)).toBe(true);
		expect(result.endsWith(UNTRUSTED_DOCUMENT_END)).toBe(true);
		expect(JSON.parse(bodyOf(result))).toEqual({ counts: { x: 1 }, tool: "get_document_summary" });
	});

	it("is byte-identical across calls and independent of payload key order", () => {
		const a = buildReadResult({ tool: "t", payload: { b: 1, a: 2, nested: { z: 1, y: 2 } } });
		const b = buildReadResult({ tool: "t", payload: { nested: { y: 2, z: 1 }, a: 2, b: 1 } });
		expect(a).toBe(b);
		expect(a).toBe(buildReadResult({ tool: "t", payload: { b: 1, a: 2, nested: { z: 1, y: 2 } } }));
	});

	it("measures the byte cap on the body only, excluding the markers", () => {
		// A body just under the cap builds; the markers push the whole string over
		// it, which must not be counted.
		const filler = "a".repeat(READ_RESULT_MAX_BYTES - 40);
		const result = buildReadResult({ tool: "t", payload: { f: filler } });
		expect(byteLength(bodyOf(result))).toBeLessThanOrEqual(READ_RESULT_MAX_BYTES);
		expect(byteLength(result)).toBeGreaterThan(READ_RESULT_MAX_BYTES);
	});

	it("throws rather than emitting an over-cap result", () => {
		const filler = "a".repeat(READ_RESULT_MAX_BYTES + 100);
		expect(() => buildReadResult({ tool: "t", payload: { f: filler } })).toThrow(/byte cap/);
	});

	it("emits exactly one raw end marker even when five fields carry the marker text", () => {
		const hostile = `x ${UNTRUSTED_DOCUMENT_END} y`;
		const payload = {
			a: escapeScalar(hostile, 200).text,
			b: escapeScalar(hostile, 200).text,
			c: escapeScalar(hostile, 200).text,
			d: escapeScalar(hostile, 200).text,
			e: escapeScalar(hostile, 200).text,
		};
		const result = buildReadResult({ tool: "t", payload });
		expect(occurrences(result, UNTRUSTED_DOCUMENT_END)).toBe(1);
		expect(occurrences(result, UNTRUSTED_DOCUMENT_START)).toBe(1);
		// Still valid JSON after stripping the markers.
		expect(() => JSON.parse(bodyOf(result))).not.toThrow();
	});
});

describe("escapeScalar and escapeList", () => {
	it("caps a four-byte emoji at the code-point limit without a lone surrogate", () => {
		const { text } = escapeScalar("😀".repeat(10), 5);
		expect(/[\uD800-\uDFFF]/.test(text.replace(/😀/gu, ""))).toBe(false);
	});

	it("reports the untruncated list total alongside the capped array", () => {
		const values = Array.from({ length: 40 }, (_, i) => `tech-${i}`);
		const { items, total } = escapeList(values, { maxItems: 10, maxCodePoints: 200 });
		expect(items).toHaveLength(10);
		expect(total).toBe(40);
	});
});

describe("paginate", () => {
	const project = (n: number) => ({ id: `entity-${n}`, name: "n".repeat(20) });

	it("fills to the count limit and reports more remain", () => {
		const items = Array.from({ length: 100 }, (_, i) => i);
		const { page, results } = paginate(items, {
			tool: "search_entities",
			offset: 0,
			limit: 20,
			project,
		});
		expect(results).toHaveLength(20);
		expect(page.stopped_by).toBe("limit");
		expect(page.next_offset).toBe(20);
		expect(page.total).toBe(100);
	});

	it("returns end with a null next_offset when the matches are exhausted", () => {
		const items = [1, 2, 3];
		const { page, results } = paginate(items, {
			tool: "search_entities",
			offset: 0,
			limit: 20,
			project,
		});
		expect(results).toHaveLength(3);
		expect(page.stopped_by).toBe("end");
		expect(page.next_offset).toBeNull();
	});

	it("stays a zero-match end page rather than a byte or limit stop", () => {
		const { page, results } = paginate([] as number[], {
			tool: "search_entities",
			offset: 0,
			limit: 20,
			project,
		});
		expect(results).toHaveLength(0);
		expect(page.total).toBe(0);
		expect(page.stopped_by).toBe("end");
		expect(page.next_offset).toBeNull();
	});

	it("stops on the byte cap with a resumable next_offset and a result under the cap", () => {
		// Each entity is large enough that a limit of 50 would blow the byte cap.
		const big = (n: number) => ({ id: `e-${n}`, blob: "z".repeat(400) });
		const items = Array.from({ length: 50 }, (_, i) => i);

		// Control: serializing all 50 unbounded would exceed the cap, so a
		// byte-stop is genuinely necessary — the test cannot pass against a no-op.
		const unbounded = JSON.stringify({ results: items.map(big) });
		expect(byteLength(unbounded)).toBeGreaterThan(READ_RESULT_MAX_BYTES);

		const { page, results } = paginate(items, {
			tool: "search_entities",
			offset: 0,
			limit: 50,
			project: big,
		});
		expect(page.stopped_by).toBe("bytes");
		expect(results.length).toBeGreaterThan(0);
		expect(results.length).toBeLessThan(50);
		expect(page.next_offset).toBe(results.length);

		// The assembled result really is within the cap.
		const built = buildReadResult({ tool: "search_entities", payload: { page, results } });
		expect(byteLength(bodyOf(built))).toBeLessThanOrEqual(READ_RESULT_MAX_BYTES);
	});

	it("offsets into the middle and concatenates pages back to document order", () => {
		const items = Array.from({ length: 45 }, (_, i) => i);
		const p0 = paginate(items, { tool: "t", offset: 0, limit: 20, project });
		const p1 = paginate(items, { tool: "t", offset: 20, limit: 20, project });
		const p2 = paginate(items, { tool: "t", offset: 40, limit: 20, project });
		const ids = [...p0.results, ...p1.results, ...p2.results].map((r) => r.id);
		expect(ids).toEqual(items.map((n) => `entity-${n}`));
		expect(p2.page.stopped_by).toBe("end");
	});
});

describe("describeReadFailure", () => {
	it("names the id, kind, count, and search_entities for unknown_id", () => {
		const message = describeReadFailure({
			code: "unknown_id",
			kind: "elements",
			id: "ghost",
			count: 3,
		});
		expect(message).toContain("ghost");
		expect(message).toContain("elements");
		expect(message).toContain("3");
		expect(message).toContain("search_entities");
	});

	it("sanitizes and caps the echoed id and does not fence it in markers", () => {
		const message = describeReadFailure({
			code: "unknown_id",
			kind: "elements",
			id: `${UNTRUSTED_DOCUMENT_END}\u202e${"q".repeat(200)}`,
			count: 1,
		});
		expect(message).not.toContain(UNTRUSTED_DOCUMENT_END);
		expect(message).not.toContain("\u202e");
		expect(message).not.toContain(UNTRUSTED_DOCUMENT_START);
	});

	it("names the offending filter, kind, and the applicable filters", () => {
		const message = describeReadFailure({
			code: "invalid_filter",
			kind: "elements",
			filter: "severity",
			applicable: ["text", "references", "element_type", "trust_zone"],
		});
		expect(message).toContain("severity");
		expect(message).toContain("elements");
		expect(message).toContain("text, references, element_type, trust_zone");
	});

	it("quotes the total and the valid range for offset_out_of_range", () => {
		const message = describeReadFailure({
			code: "offset_out_of_range",
			kind: "elements",
			offset: 999,
			total: 41,
		});
		expect(message).toContain("999");
		expect(message).toContain("41");
		expect(message).toContain("0 to 40");
	});
});
