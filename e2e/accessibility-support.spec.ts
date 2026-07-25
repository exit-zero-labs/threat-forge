import { expect, test } from "./fixtures";
import {
	type AccessibilityException,
	type AccessibilityViolation,
	filterUnexceptedViolations,
	formatAccessibilityViolations,
	projectAccessibilityEvidence,
} from "./support/accessibility";

/**
 * Discriminating, browser-free unit coverage for `e2e/support/accessibility.ts`'s pure logic
 * (issue #66, D4/step 2): exact-target exception filtering, same-rule/different-target rejection,
 * bounded/privacy-reduced projection, and formatted output. These tests never open a page — they
 * exercise the exported pure functions directly against synthetic, axe-core-shaped fixtures, the
 * same way `scripts/*.test.mjs` unit-tests `summarize-playwright.mjs`'s pure transforms. Playwright
 * is the only test runner configured for `e2e/**`, so `test()` here simply never destructures
 * `page`.
 */

/** Build one minimal, type-valid axe `NodeResult`. */
function makeNode(target: string, overrides?: Partial<AccessibilityViolation["nodes"][number]>) {
	return {
		html: `<div>${target}</div>`,
		target: [target],
		any: [],
		all: [],
		none: [],
		failureSummary: `Fix any of the following:\n  Element ${target} failed.`,
		...overrides,
	};
}

/** Build one minimal, type-valid axe `Result` (a violation). */
function makeViolation(overrides: {
	id: string;
	impact: AccessibilityViolation["impact"];
	helpUrl?: string;
	nodes: AccessibilityViolation["nodes"];
}): AccessibilityViolation {
	return {
		description: `${overrides.id} description`,
		help: `${overrides.id} help`,
		helpUrl: overrides.helpUrl ?? `https://dequeuniversity.com/rules/axe/4.12/${overrides.id}`,
		id: overrides.id,
		impact: overrides.impact,
		tags: ["wcag2aa"],
		nodes: overrides.nodes,
	};
}

test.describe("filterUnexceptedViolations", () => {
	test("removes exactly the node matching both ruleId and exact target", () => {
		const exception: AccessibilityException = {
			ruleId: "color-contrast",
			target: ".mb-3",
			issue: 218,
		};
		const violations = [
			makeViolation({ id: "color-contrast", impact: "serious", nodes: [makeNode(".mb-3")] }),
		];

		const remaining = filterUnexceptedViolations(violations, [exception]);

		expect(remaining).toEqual([]);
	});

	test("does not except a different target under the same rule (rule-ID-only filtering is rejected)", () => {
		const exception: AccessibilityException = {
			ruleId: "color-contrast",
			target: ".mb-3",
			issue: 218,
		};
		const violations = [
			makeViolation({
				id: "color-contrast",
				impact: "serious",
				nodes: [makeNode(".mb-3"), makeNode(".some-other-node")],
			}),
		];

		const remaining = filterUnexceptedViolations(violations, [exception]);

		expect(remaining).toHaveLength(1);
		expect(remaining[0].nodes).toHaveLength(1);
		expect(remaining[0].nodes[0].target).toEqual([".some-other-node"]);
	});

	test("does not except the same target under a different rule", () => {
		const exception: AccessibilityException = {
			ruleId: "color-contrast",
			target: ".mb-3",
			issue: 218,
		};
		const violations = [
			makeViolation({
				id: "scrollable-region-focusable",
				impact: "serious",
				nodes: [makeNode(".mb-3")],
			}),
		];

		const remaining = filterUnexceptedViolations(violations, [exception]);

		expect(remaining).toHaveLength(1);
	});

	test("drops moderate/minor/null-impact violations regardless of exceptions", () => {
		const violations = [
			makeViolation({ id: "region", impact: "moderate", nodes: [makeNode(".x")] }),
			makeViolation({ id: "landmark-one-main", impact: null, nodes: [makeNode(".y")] }),
		];

		expect(filterUnexceptedViolations(violations, [])).toEqual([]);
	});
});

test.describe("formatAccessibilityViolations", () => {
	test("names rule id, impact, target selector(s), and helpUrl", () => {
		const violations = [
			makeViolation({
				id: "color-contrast",
				impact: "serious",
				helpUrl: "https://dequeuniversity.com/rules/axe/4.12/color-contrast",
				nodes: [makeNode(".mb-3"), makeNode(".text-muted-foreground\\/40")],
			}),
		];

		const formatted = formatAccessibilityViolations(violations);

		expect(formatted).toContain("color-contrast");
		expect(formatted).toContain("impact=serious");
		expect(formatted).toContain(".mb-3");
		expect(formatted).toContain(".text-muted-foreground\\/40");
		expect(formatted).toContain("https://dequeuniversity.com/rules/axe/4.12/color-contrast");
	});

	test("reports zero violations as a legible, non-empty string", () => {
		expect(formatAccessibilityViolations([])).toBe("0 accessibility violations.");
	});
});

test.describe("projectAccessibilityEvidence", () => {
	function makeResult(overrides: {
		violations: AccessibilityViolation[];
		url?: string;
	}): Parameters<typeof projectAccessibilityEvidence>[0] {
		return {
			testEngine: { name: "axe-core", version: "4.12.1" },
			testRunner: { name: "axe" },
			testEnvironment: { userAgent: "test", windowWidth: 1280, windowHeight: 720 },
			url: overrides.url ?? "http://localhost:3000/app?token=secret#fragment",
			timestamp: "2026-01-01T00:00:00.000Z",
			toolOptions: {},
			passes: [],
			incomplete: [],
			inapplicable: [],
			violations: overrides.violations,
		} as Parameters<typeof projectAccessibilityEvidence>[0];
	}

	test("strips query and fragment from the recorded URL", () => {
		const evidence = projectAccessibilityEvidence(makeResult({ violations: [] }));

		expect(evidence.url).toBe("http://localhost:3000/app");
	});

	test("strips query data even when the recorded URL is not parseable", () => {
		const evidence = projectAccessibilityEvidence(
			makeResult({ violations: [], url: "not a URL?token=secret#fragment" }),
		);

		expect(evidence.url).toBe("not a URL");
	});

	test("filters to only serious/critical violations and records the engine version", () => {
		const violations = [
			makeViolation({ id: "region", impact: "moderate", nodes: [makeNode(".moderate")] }),
			makeViolation({ id: "color-contrast", impact: "serious", nodes: [makeNode(".mb-3")] }),
		];

		const evidence = projectAccessibilityEvidence(makeResult({ violations }));

		expect(evidence.engine).toBe("axe-core 4.12.1");
		expect(evidence.violations).toHaveLength(1);
		expect(evidence.violations[0].ruleId).toBe("color-contrast");
	});

	test("never includes raw html, passes, incomplete, or inapplicable arrays", () => {
		const violations = [
			makeViolation({
				id: "color-contrast",
				impact: "serious",
				nodes: [makeNode(".mb-3", { html: "<p data-secret='do-not-leak'>text</p>" })],
			}),
		];

		const evidence = projectAccessibilityEvidence(makeResult({ violations }));
		const serialized = JSON.stringify(evidence);

		expect(serialized).not.toContain("do-not-leak");
		expect(evidence).not.toHaveProperty("passes");
		expect(evidence).not.toHaveProperty("incomplete");
		expect(evidence).not.toHaveProperty("inapplicable");
		expect(evidence.violations[0].nodes[0]).not.toHaveProperty("html");
	});

	test("bounds violations at 50 and nodes at 20 per violation, recording truncation counts", () => {
		const manyNodes = Array.from({ length: 25 }, (_, i) => makeNode(`.node-${i}`));
		const manyViolations = Array.from({ length: 55 }, (_, i) =>
			makeViolation({ id: `rule-${i}`, impact: "serious", nodes: [makeNode(`.only-${i}`)] }),
		);
		manyViolations[0] = makeViolation({
			id: "color-contrast",
			impact: "serious",
			nodes: manyNodes,
		});

		const evidence = projectAccessibilityEvidence(makeResult({ violations: manyViolations }));

		expect(evidence.violations).toHaveLength(50);
		expect(evidence.truncatedViolations).toBe(5);
		expect(evidence.violations[0].nodes).toHaveLength(20);
		expect(evidence.violations[0].truncatedNodes).toBe(5);
	});

	test("bounds an oversized failure summary rather than attaching it unbounded", () => {
		const hugeSummary = "x".repeat(10_000);
		const violations = [
			makeViolation({
				id: "color-contrast",
				impact: "serious",
				nodes: [makeNode(".mb-3", { failureSummary: hugeSummary })],
			}),
		];

		const evidence = projectAccessibilityEvidence(makeResult({ violations }));

		expect(evidence.violations[0].nodes[0].failureSummary.length).toBeLessThan(hugeSummary.length);
		expect(evidence.violations[0].nodes[0].failureSummary).toContain("truncated");
	});

	test("bounds selectors and help URLs so one axe field cannot dominate the attachment", () => {
		const oversizedTarget = `.${"x".repeat(5_000)}`;
		const violation = makeViolation({
			id: "color-contrast",
			impact: "serious",
			helpUrl: `https://example.com/${"h".repeat(5_000)}?token=secret`,
			nodes: [makeNode(oversizedTarget)],
		});

		const evidence = projectAccessibilityEvidence(makeResult({ violations: [violation] }));
		const projected = evidence.violations[0];
		expect(projected.helpUrl.length).toBeLessThan(violation.helpUrl.length);
		expect(projected.helpUrl).not.toContain("token=secret");
		expect(projected.nodes[0].target.length).toBeLessThan(oversizedTarget.length);
		expect(projected.nodes[0].target).toContain("truncated");
	});
});
