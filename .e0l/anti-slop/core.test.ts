import { describe, expect, test } from "bun:test";
import {
	CORE_BANNED_PHRASES,
	DEFAULT_MIN_SCORE,
	detectSlop,
	emDashDensity,
	isSlopClean,
} from "./core";

const kinds = (text: string, options?: Parameters<typeof detectSlop>[1]) =>
	detectSlop(text, options).findings.map((f) => f.kind);

describe("clean copy", () => {
	const clean =
		"The runner rebuilds from a pinned image on every job. Secrets are injected at start and never written to disk. Rollback restores the previous image tag.";

	test("produces no findings", () => {
		expect(detectSlop(clean).findings).toEqual([]);
	});

	test("scores 1 and passes the bar", () => {
		const report = detectSlop(clean);
		expect(report.score).toBe(1);
		expect(report.hasHardTell).toBe(false);
		expect(isSlopClean(report)).toBe(true);
	});

	test("empty input is clean rather than dividing by zero", () => {
		expect(emDashDensity("")).toBe(0);
		expect(isSlopClean(detectSlop(""))).toBe(true);
	});
});

describe("hard tells fail regardless of score", () => {
	test.each([
		["not just X, it's Y", "It's not just a tool, it's a workflow."],
		["in today's world", "In today's fast-paced world, teams ship faster."],
		["explainer voice", "But here's the thing: the cache was never warm."],
		["forward promise", "We'll come back to that once the schema lands."],
	])("%s disqualifies", (_label, text) => {
		const report = detectSlop(text);
		expect(report.hasHardTell).toBe(true);
		expect(isSlopClean(report)).toBe(false);
	});

	test("a hard tell fails even when the score is otherwise perfect", () => {
		// One short hard tell: penalty 0.18 leaves score 0.82, but the point is that even a text
		// scoring above the threshold would still fail on the hard flag alone.
		const report = detectSlop("We'll come back to that.");
		expect(isSlopClean(report, 0)).toBe(false);
	});
});

describe("scored tells deduct without disqualifying", () => {
	test("a banned phrase deducts 0.06 and is not hard", () => {
		const report = detectSlop("The results were stunning.");
		expect(report.hasHardTell).toBe(false);
		expect(report.score).toBeCloseTo(0.94, 5);
	});

	test("repeat occurrences of one phrase accumulate", () => {
		const report = detectSlop("Moreover it held. Moreover it scaled. Moreover it shipped.");
		const finding = report.findings.find((f) => f.detail === "moreover");
		expect(finding?.count).toBe(3);
		expect(report.score).toBeCloseTo(0.82, 5);
	});

	test("enough scored tells drop below the bar without any hard tell", () => {
		const report = detectSlop(
			"Moreover, the vibrant results were stunning. Furthermore, needless to say, when it comes to scale it is a testament to the team. In conclusion, that being said, at the end of the day it held.",
		);
		expect(report.hasHardTell).toBe(false);
		expect(report.score).toBeLessThan(DEFAULT_MIN_SCORE);
		expect(isSlopClean(report)).toBe(false);
	});

	test("score floors at 0 rather than going negative", () => {
		expect(detectSlop("stunning ".repeat(400)).score).toBe(0);
	});
});

describe("em dash density", () => {
	test("fires above 4 per 1k chars", () => {
		expect(kinds("a—b—c—d—e")).toContain("em_dash_density");
	});

	test("stays quiet for sparse use in long prose", () => {
		const text = `${"The deployment completed without incident. ".repeat(40)}One aside — noted.`;
		expect(kinds(text)).not.toContain("em_dash_density");
	});
});

describe("narrowness guards against false positives", () => {
	test.each([
		["a bare problem statement", "There's a problem with the drainage."],
		["a bare 'it turns out'", "It turns out the cache was cold."],
		["'not just' without the construction", "This is not just about speed."],
	])("%s does not fire", (_label, text) => {
		expect(detectSlop(text).findings).toEqual([]);
	});
});

describe("domain extension", () => {
	const travel = { extraPhrases: ["hidden gem", "nestled"] as const };

	test("extra phrases score like core phrases", () => {
		const report = detectSlop("A hidden gem nestled in the hills.", travel);
		expect(report.findings.map((f) => f.detail).sort()).toEqual(["hidden gem", "nestled"]);
		expect(report.score).toBeCloseTo(0.88, 5);
	});

	test("core detection is unaffected when no options are passed", () => {
		expect(detectSlop("A hidden gem nestled in the hills.").findings).toEqual([]);
	});

	test("a custom pattern marked hard disqualifies", () => {
		const report = detectSlop("The research brief says so.", {
			extraPatterns: [{ label: "process leak", pattern: /\bresearch brief\b/gi, hard: true }],
		});
		expect(report.hasHardTell).toBe(true);
		expect(report.findings[0]?.kind).toBe("custom");
	});

	test("a custom pattern without hard only deducts", () => {
		const report = detectSlop("The research brief says so.", {
			extraPatterns: [{ label: "process leak", pattern: /\bresearch brief\b/gi }],
		});
		expect(report.hasHardTell).toBe(false);
		expect(report.score).toBeCloseTo(0.82, 5);
	});
});

describe("determinism", () => {
	const text = "In today's world, whether you're shipping or not — here's the thing.";

	test("repeated calls return identical reports", () => {
		// Guards the module-level /g regex lastIndex reset: without it, results depend on call order.
		expect(detectSlop(text)).toEqual(detectSlop(text));
		expect(detectSlop(text)).toEqual(detectSlop(text));
	});

	test("no core phrase is a substring of another, which would double-count", () => {
		for (const phrase of CORE_BANNED_PHRASES) {
			const containers = CORE_BANNED_PHRASES.filter((p) => p !== phrase && p.includes(phrase));
			expect(containers).toEqual([]);
		}
	});
});
