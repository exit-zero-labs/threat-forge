import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test } from "@playwright/test";

/**
 * Accessibility scanning, exceptions, and privacy-reduced evidence (issue #66, D4).
 *
 * `@axe-core/playwright` is a devDependency only, never imported from `src/`. Two tiers consume
 * this module:
 *
 * 1. **Tier 1 (universal, best-effort)** — `e2e/support/base.ts`'s teardown calls
 *    {@link scanAccessibility} and {@link projectAccessibilityEvidence} on every non-passing
 *    attempt, bounded by its own timeout. It never throws on a violation.
 * 2. **Tier 2 (explicit, opt-in, actionable)** — {@link assertNoSeriousAccessibilityViolations} is
 *    called directly by `e2e/accessibility-audit.spec.ts` and is the only thing in this module
 *    that can fail a test.
 */

/** The real return type of `AxeBuilder#analyze`, derived from the imported class rather than a
 * guessed internal export path. */
export type AxeAnalyzeResult = Awaited<ReturnType<AxeBuilder["analyze"]>>;

/** One violation entry as reported by axe-core, before any exception filtering. */
export type AccessibilityViolation = AxeAnalyzeResult["violations"][number];

/** One violation node, before any exception filtering. */
type AccessibilityViolationNode = AccessibilityViolation["nodes"][number];

/**
 * Run an axe-core scan against the current page. This is the sole AxeBuilder integration point;
 * extend its options when scoped scanning gains a real caller instead of constructing AxeBuilder
 * in another module.
 */
export function scanAccessibility(
	page: Page,
	opts?: { tags?: string[] },
): Promise<AxeAnalyzeResult> {
	return new AxeBuilder({ page }).withTags(opts?.tags ?? ["wcag2a", "wcag2aa"]).analyze();
}

/** The exact normalized axe target selector this module matches exceptions against everywhere. */
function normalizeTarget(node: AccessibilityViolationNode): string {
	return node.target.join(" > ");
}

/**
 * Render one line per violation, naming its rule id, impact, every node's normalized target
 * selector, and its `helpUrl` — mirrors `base.ts`'s `formatViolations` style so a failure or
 * attachment is actionable without opening a second tool.
 */
export function formatAccessibilityViolations(
	violations: readonly AccessibilityViolation[],
): string {
	if (violations.length === 0) {
		return "0 accessibility violations.";
	}
	const lines = violations.map((violation, index) => {
		const targets = violation.nodes.map(normalizeTarget).join(", ");
		return (
			`  ${index + 1}. [${violation.id}] impact=${violation.impact ?? "unknown"} ` +
			`target(s): ${targets} — ${violation.helpUrl}`
		);
	});
	return [
		`${violations.length} serious/critical accessibility violation(s) were found:`,
		...lines,
	].join("\n");
}

/** One confirmed pre-existing violation node, exempted from the tier-2 gate. */
export interface AccessibilityException {
	/** The exact axe rule id, e.g. `"color-contrast"`. Never matched alone — see {@link
	 * assertNoSeriousAccessibilityViolations}, which also requires an exact `target` match. */
	readonly ruleId: string;
	/** The exact normalized target selector (`node.target.join(" > ")`) for one confirmed node. */
	readonly target: string;
	/** The tracking issue that owns fixing this violation. */
	readonly issue: number;
}

/**
 * Confirmed pre-existing violations, found by direct probing against the installed axe-core
 * 4.12.1 engine (issue #66, D5) — re-run after `@axe-core/playwright` installation, not carried
 * over from the plan's earlier 4.10.2 probe. Each entry is one exact node target, never a whole
 * rule id: a new node under the same rule elsewhere still fails.
 *
 * - `color-contrast` (serious): the pre-model welcome screen's de-emphasized caption text, using
 *   Tailwind `text-muted-foreground/60` and `/40` opacity utilities — a deliberate low-emphasis
 *   design choice that fails strict WCAG AA contrast by construction. Tracked by #218.
 * - `scrollable-region-focusable` (serious): the component palette's scrollable list, present in
 *   every document state. Tracked by #219.
 * - `aria-required-children` (critical): the document tab strip's `role="tablist"` container,
 *   whose actual `role="tab"` children are one level deeper than axe-core expects, alongside
 *   sibling close/pin buttons per this repo's deliberate tab-accessibility design
 *   (`docs/knowledge/architecture.md`'s D4 section). Whether this is a genuine WCAG failure or an
 *   axe-core limitation with this specific manual-activation APG pattern is an open question,
 *   recorded on its tracking issue rather than resolved here. Tracked by #220.
 */
export const KNOWN_ACCESSIBILITY_EXCEPTIONS: readonly AccessibilityException[] = [
	{ ruleId: "color-contrast", target: ".mb-3", issue: 218 },
	{
		ruleId: "color-contrast",
		target: ".bottom-0 > .text-muted-foreground\\/60:nth-child(1)",
		issue: 218,
	},
	{ ruleId: "color-contrast", target: ".hover\\:text-muted-foreground", issue: 218 },
	{ ruleId: "color-contrast", target: ".text-muted-foreground\\/40", issue: 218 },
	{
		ruleId: "scrollable-region-focusable",
		target: ".overflow-y-auto.p-2.flex-1",
		issue: 219,
	},
	{ ruleId: "aria-required-children", target: ".overscroll-x-contain", issue: 220 },
];

/** True impact levels this gate ever acts on; `moderate`/`minor`/`null` are out of scope. */
function isGatedImpact(impact: AccessibilityViolation["impact"]): boolean {
	return impact === "serious" || impact === "critical";
}

/**
 * Pure filtering core of the tier-2 gate, extracted so exact-target/same-rule exception behavior
 * is directly unit-testable without a real page or axe scan. Keeps only `serious`/`critical`
 * violations, removes exactly the nodes matching both an exception's `ruleId` *and* its exact
 * normalized `target`, and drops a violation entirely only once every one of its nodes is
 * excepted. A rule-ID-only match is never sufficient — an excepted rule with an unexcepted target
 * elsewhere still fails.
 */
export function filterUnexceptedViolations(
	violations: readonly AccessibilityViolation[],
	allow: readonly AccessibilityException[],
): AccessibilityViolation[] {
	return violations
		.filter((violation) => isGatedImpact(violation.impact))
		.map((violation) => {
			const nodes = violation.nodes.filter((node) => {
				const target = normalizeTarget(node);
				return !allow.some(
					(exception) => exception.ruleId === violation.id && exception.target === target,
				);
			});
			return { ...violation, nodes };
		})
		.filter((violation) => violation.nodes.length > 0);
}

/**
 * Explicit, opt-in, tier-2 accessibility assertion (D4). Scans the current page and throws
 * {@link formatAccessibilityViolations}'s rendering of whatever {@link filterUnexceptedViolations}
 * leaves unexcepted.
 */
export async function assertNoSeriousAccessibilityViolations(
	page: Page,
	opts?: { tags?: string[]; allow?: readonly AccessibilityException[] },
): Promise<void> {
	await test.step("assertNoSeriousAccessibilityViolations: audit current page", async () => {
		const allow = opts?.allow ?? KNOWN_ACCESSIBILITY_EXCEPTIONS;
		const result = await scanAccessibility(page, { tags: opts?.tags });
		const remaining = filterUnexceptedViolations(result.violations, allow);

		if (remaining.length > 0) {
			throw new Error(formatAccessibilityViolations(remaining));
		}
	});
}

/** Bounds enforced on the tier-1 privacy-reduced accessibility attachment (D4/D11). */
const MAX_PROJECTED_VIOLATIONS = 50;
const MAX_PROJECTED_NODES_PER_VIOLATION = 20;
const MAX_URL_CHARS = 2_000;
const MAX_TARGET_CHARS = 1_000;
/** A `failureSummary` can be a multi-line paragraph; bounded so one verbose node cannot dominate
 * the attachment. Not specified as an exact number by the plan — chosen conservatively generous,
 * matching this repo's "bounded, not unbounded" convention elsewhere in this module. */
const MAX_FAILURE_SUMMARY_CHARS = 500;

interface ProjectedAccessibilityNode {
	target: string;
	impact: AccessibilityViolation["impact"];
	failureSummary: string;
}

interface ProjectedAccessibilityViolation {
	ruleId: string;
	impact: AccessibilityViolation["impact"];
	helpUrl: string;
	nodes: ProjectedAccessibilityNode[];
	truncatedNodes: number;
}

/** Privacy-reduced, bounded attachment payload — never the raw axe result (D4). */
export interface AccessibilityEvidence {
	schemaVersion: 1;
	engine: string;
	url: string;
	timestamp: string;
	violations: ProjectedAccessibilityViolation[];
	truncatedViolations: number;
}

function truncateFailureSummary(failureSummary: string | undefined): string {
	const text = failureSummary ?? "";
	return text.length > MAX_FAILURE_SUMMARY_CHARS
		? `${text.slice(0, MAX_FAILURE_SUMMARY_CHARS)}… truncated`
		: text;
}

function truncateText(text: string, maxChars: number): string {
	return text.length > maxChars ? `${text.slice(0, maxChars)}… truncated` : text;
}

/** Strip query/fragment from a URL string without exposing them when parsing fails. */
function stripQueryAndFragment(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.search = "";
		parsed.hash = "";
		return parsed.toString();
	} catch {
		const queryIndex = url.indexOf("?");
		const fragmentIndex = url.indexOf("#");
		const cutIndex = [queryIndex, fragmentIndex]
			.filter((index) => index >= 0)
			.sort((a, b) => a - b)[0];
		return cutIndex === undefined ? url : url.slice(0, cutIndex);
	}
}

/**
 * Reduce a full axe result to a bounded, privacy-safe projection: engine version, query/fragment-
 * stripped URL, timestamp, and at most {@link MAX_PROJECTED_VIOLATIONS} serious/critical
 * violations, each with at most {@link MAX_PROJECTED_NODES_PER_VIOLATION} nodes carrying only a
 * normalized target, impact, and bounded failure summary. Raw `html`, `passes`, `incomplete`, and
 * `inapplicable` are never included.
 */
export function projectAccessibilityEvidence(result: AxeAnalyzeResult): AccessibilityEvidence {
	const gated = result.violations.filter((violation) => isGatedImpact(violation.impact));
	const kept = gated.slice(0, MAX_PROJECTED_VIOLATIONS);

	return {
		schemaVersion: 1,
		engine: `axe-core ${result.testEngine.version}`,
		url: truncateText(stripQueryAndFragment(result.url), MAX_URL_CHARS),
		timestamp: truncateText(result.timestamp, MAX_URL_CHARS),
		truncatedViolations: gated.length - kept.length,
		violations: kept.map((violation) => {
			const keptNodes = violation.nodes.slice(0, MAX_PROJECTED_NODES_PER_VIOLATION);
			return {
				ruleId: violation.id,
				impact: violation.impact,
				helpUrl: truncateText(stripQueryAndFragment(violation.helpUrl), MAX_URL_CHARS),
				truncatedNodes: violation.nodes.length - keptNodes.length,
				nodes: keptNodes.map((node) => ({
					target: truncateText(normalizeTarget(node), MAX_TARGET_CHARS),
					impact: node.impact ?? violation.impact,
					failureSummary: truncateFailureSummary(node.failureSummary),
				})),
			};
		}),
	};
}
