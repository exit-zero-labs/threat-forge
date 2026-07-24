// Summarizes a Playwright JSON report into the GitHub Actions run summary and exposes a
// `has-flaky` step output for the workflow to gate diagnostic-artifact upload on.
//
// Playwright retries failed tests in CI (playwright.config.ts), so a test that fails once
// and passes on retry is reported as flaky and does not fail the run. Without this summary
// those retried passes — and the specs skipped on CI — are invisible outside the HTML report,
// which is only uploaded on failure. The `has-flaky` output lets the workflow upload that
// report for a flaky-but-green run too, without re-parsing the JSON report in shell — this
// script stays the only place that reads the report shape.
//
// Usage:
//   node scripts/summarize-playwright.mjs [report-path] [--stdout]
//
// Writes Markdown to $GITHUB_STEP_SUMMARY when that variable is set, and `has-flaky=true` or
// `has-flaky=false` to $GITHUB_OUTPUT when that variable is set. Without either, the script is
// a no-op unless --stdout is passed, which prints the same Markdown for local inspection.
// Summary rendering stays advisory. Writing the workflow output fails closed: if GitHub cannot
// receive the flaky signal, the step fails and the workflow's `failure()` upload path retains the
// diagnostic bundle instead of silently losing it.
//
// The report shape is @playwright/test's `JSONReport` (node_modules/playwright/types/
// testReporter.d.ts). Fields read here: `stats.duration`; `suites[].specs[].tests[].status`
// ("expected" | "unexpected" | "flaky" | "skipped"); `results[].status` (to separate a
// timeout from an assertion failure); `results.length` (attempts); each spec's `title`,
// `file`, and `line`; and top-level `errors`, which is the only signal that a run died
// before any test could report.

import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REPORT_PATH = "test-results/results.json";
const HEADING = "## Playwright E2E";

/**
 * One test entry: a spec resolved for one Playwright project.
 *
 * @typedef {object} TestOutcome
 * @property {string} status Playwright's verdict: `expected`, `unexpected`, `flaky`, `skipped`.
 * @property {string} title Full title including enclosing `describe` blocks.
 * @property {string} location `file:line` exactly as Playwright reported it.
 * @property {number} retries Attempts after the first one.
 * @property {boolean} timedOut Whether the final attempt hit the test timeout.
 */

/**
 * Counts plus the detail needed to act on a non-green run. `failed` excludes timeouts so
 * every test lands in exactly one bucket.
 *
 * @typedef {object} PlaywrightSummary
 * @property {number} passed
 * @property {number} failed
 * @property {number} timedOut
 * @property {number} flaky
 * @property {number} skipped
 * @property {number} other Statuses this script does not know, so counts stay additive
 *   if a Playwright upgrade widens the union.
 * @property {number} runErrors Failures that killed the run before any test could report,
 *   such as a `webServer` that never started or a spec that failed to import.
 * @property {number | null} durationMs
 * @property {TestOutcome[]} flakyTests
 * @property {TestOutcome[]} failedTests Includes timed-out tests.
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
const toArray = (value) => (Array.isArray(value) ? value : []);

/**
 * @param {unknown} value
 * @returns {string}
 */
const toText = (value) => (typeof value === "string" ? value : "");

/**
 * Collects every test entry under one suite, carrying the enclosing `describe` titles down.
 * Callers start the trail empty for a file-level suite, whose title duplicates the file path
 * already shown in the location column.
 *
 * @param {Record<string, unknown>} suite
 * @param {string[]} describeTrail
 * @returns {TestOutcome[]}
 */
const collectOutcomes = (suite, describeTrail) => {
	/** @type {TestOutcome[]} */
	const outcomes = [];

	for (const spec of toArray(suite.specs)) {
		if (!isRecord(spec)) {
			continue;
		}

		const title = [...describeTrail, toText(spec.title)].filter(Boolean).join(" > ");
		const line = typeof spec.line === "number" ? `:${spec.line}` : "";
		const location = `${toText(spec.file)}${line}`;

		for (const test of toArray(spec.tests)) {
			if (!isRecord(test)) {
				continue;
			}

			const attempts = toArray(test.results);
			const lastAttempt = attempts[attempts.length - 1];
			outcomes.push({
				status: toText(test.status),
				title,
				location,
				retries: Math.max(0, attempts.length - 1),
				timedOut: isRecord(lastAttempt) && lastAttempt.status === "timedOut",
			});
		}
	}

	for (const childSuite of toArray(suite.suites)) {
		if (isRecord(childSuite)) {
			outcomes.push(...collectOutcomes(childSuite, [...describeTrail, toText(childSuite.title)]));
		}
	}

	return outcomes;
};

/**
 * Reduces a parsed Playwright JSON report to the outcomes worth reporting. Counts are derived
 * from the suite tree rather than `report.stats` because the per-test detail is needed anyway
 * and `stats` has no timeout breakdown.
 *
 * @param {unknown} report Parsed `results.json`, not yet trusted to have any shape.
 * @returns {PlaywrightSummary}
 */
export const summarizeReport = (report) => {
	/** @type {PlaywrightSummary} */
	const summary = {
		passed: 0,
		failed: 0,
		timedOut: 0,
		flaky: 0,
		skipped: 0,
		other: 0,
		runErrors: 0,
		durationMs: null,
		flakyTests: [],
		failedTests: [],
	};

	if (!isRecord(report)) {
		return summary;
	}

	const stats = isRecord(report.stats) ? report.stats : {};
	if (typeof stats.duration === "number" && Number.isFinite(stats.duration)) {
		summary.durationMs = stats.duration;
	}

	// A run that dies before any test executes reports zero tests and a non-empty
	// `errors`. Counting these is what stops a red job from summarizing as
	// "No tests were reported."
	summary.runErrors = toArray(report.errors).length;

	for (const fileSuite of toArray(report.suites)) {
		if (!isRecord(fileSuite)) {
			continue;
		}

		for (const outcome of collectOutcomes(fileSuite, [])) {
			if (outcome.status === "expected") {
				summary.passed += 1;
			} else if (outcome.status === "flaky") {
				summary.flaky += 1;
				summary.flakyTests.push(outcome);
			} else if (outcome.status === "skipped") {
				summary.skipped += 1;
			} else if (outcome.status === "unexpected") {
				if (outcome.timedOut) {
					summary.timedOut += 1;
				} else {
					summary.failed += 1;
				}
				summary.failedTests.push(outcome);
			} else {
				// A status this script does not know. Counting it keeps the buckets
				// additive if a Playwright upgrade widens the union, rather than
				// silently under-reporting the total.
				summary.other += 1;
			}
		}
	}

	return summary;
};

/**
 * @param {number} durationMs
 * @returns {string}
 */
const formatDuration = (durationMs) => {
	if (durationMs < 1000) {
		return `${Math.round(durationMs)}ms`;
	}
	if (durationMs < 60_000) {
		return `${(durationMs / 1000).toFixed(1)}s`;
	}
	const totalSeconds = Math.round(durationMs / 1000);
	return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
};

/**
 * Test titles are free text and a `|` in one would break the surrounding Markdown table.
 *
 * @param {string} cell
 * @returns {string}
 */
const escapeCell = (cell) => cell.replaceAll("|", "\\|");

/**
 * The two leading columns both detail tables share: what failed and where to find it.
 *
 * @param {TestOutcome} outcome
 * @returns {string}
 */
const identityCells = (outcome) => `${escapeCell(outcome.title)} | \`${outcome.location}\``;

/**
 * @param {PlaywrightSummary} summary
 * @returns {string}
 */
const formatCounts = (summary) => {
	const parts = [
		[summary.passed, "passed"],
		[summary.failed, "failed"],
		[summary.timedOut, "timed out"],
		[summary.flaky, "flaky"],
		[summary.skipped, "skipped"],
		[summary.other, "other"],
	]
		.filter(([count]) => count > 0)
		.map(([count, label]) => `${count} ${label}`);

	if (parts.length === 0) {
		return summary.runErrors > 0 ? "No tests ran." : "No tests were reported.";
	}

	const duration = summary.durationMs === null ? "" : ` in ${formatDuration(summary.durationMs)}`;
	return `${parts.join(", ")}${duration}.`;
};

/**
 * The run-level error line. Without it a run that died before any test executed —
 * a `webServer` that never started, a spec that failed to import — summarizes as
 * "No tests were reported" on a red job, which is the blind spot this whole
 * summary exists to close. The messages themselves stay in the HTML report:
 * they are multi-line stack traces that would swamp the summary.
 *
 * @param {number} runErrors
 * @returns {string}
 */
const formatRunErrors = (runErrors) => {
	const noun = runErrors === 1 ? "error" : "errors";
	return `⚠️ ${runErrors} run-level ${noun} before any test could report — see the uploaded HTML report.`;
};

/**
 * Renders the run summary: one line when nothing needs attention, plus tables naming the
 * flaky and failed tests when something does.
 *
 * @param {PlaywrightSummary} summary
 * @returns {string}
 */
export const renderSummary = (summary) => {
	const sections = [HEADING, formatCounts(summary)];

	if (summary.runErrors > 0) {
		sections.push(formatRunErrors(summary.runErrors));
	}

	if (summary.flakyTests.length > 0) {
		sections.push(
			"### Flaky (passed after retry)",
			[
				"| Test | Location | Retries |",
				"| --- | --- | --- |",
				...summary.flakyTests.map(
					(outcome) => `| ${identityCells(outcome)} | ${outcome.retries} |`,
				),
			].join("\n"),
		);
	}

	if (summary.failedTests.length > 0) {
		sections.push(
			"### Failed",
			[
				"| Test | Location | Outcome | Retries |",
				"| --- | --- | --- | --- |",
				...summary.failedTests.map(
					(outcome) =>
						`| ${identityCells(outcome)} | ${outcome.timedOut ? "timed out" : "failed"} | ${outcome.retries} |`,
				),
			].join("\n"),
		);
	}

	return `${sections.join("\n\n")}\n`;
};

/**
 * @param {string} reportPath
 * @param {unknown} error
 * @returns {string}
 */
const renderUnavailable = (reportPath, error) => {
	const reason = error instanceof Error ? error.message : String(error);
	return `${HEADING}\n\nNo usable JSON report at \`${reportPath}\`: ${reason}\n`;
};

const main = () => {
	const args = process.argv.slice(2);
	const reportPath = args.find((arg) => !arg.startsWith("--")) ?? DEFAULT_REPORT_PATH;
	const summaryPath = process.env.GITHUB_STEP_SUMMARY;
	const outputPath = process.env.GITHUB_OUTPUT;

	if (!summaryPath && !outputPath && !args.includes("--stdout")) {
		return;
	}

	// Only reading and parsing are guarded: a fault inside summarizeReport or
	// renderSummary is this script's bug, and reporting it as an unusable report
	// would blame the file for a code fault.
	let report;
	try {
		report = JSON.parse(readFileSync(reportPath, "utf8"));
	} catch (error) {
		writeSummary(renderUnavailable(reportPath, error));
		// The report couldn't be read, so whether any test was flaky is unknown rather
		// than false. This still defaults to "no upload" on an otherwise green job — a
		// job that failed for another reason is covered by the workflow's own
		// `failure()` check, which does not depend on this output.
		writeHasFlakyOutput(false);
		return;
	}

	const summary = summarizeReport(report);
	writeSummary(renderSummary(summary));
	writeHasFlakyOutput(summary.flaky > 0);
};

/**
 * @param {string} markdown
 * @returns {void}
 */
const writeSummary = (markdown) => {
	const summaryPath = process.env.GITHUB_STEP_SUMMARY;

	try {
		if (summaryPath) {
			appendFileSync(summaryPath, markdown);
		} else {
			process.stdout.write(markdown);
		}
	} catch (error) {
		// The summary is advisory; a write failure must not turn the E2E job red.
		const reason = error instanceof Error ? error.message : String(error);
		process.stdout.write(`::warning::Playwright run summary could not be written: ${reason}\n`);
	}
};

/**
 * Writes the `has-flaky` step output the workflow reads to decide whether to upload the
 * Playwright diagnostic bundle for an otherwise-green run. This is the only place that
 * derives the value, so the workflow never re-parses the JSON report in shell.
 *
 * @param {boolean} hasFlaky
 * @returns {void}
 */
const writeHasFlakyOutput = (hasFlaky) => {
	const outputPath = process.env.GITHUB_OUTPUT;
	if (!outputPath) {
		return;
	}
	// Unlike the Markdown summary, this output controls evidence retention. Let a write error fail
	// the step: the following upload step's `failure()` branch then preserves the bundle.
	appendFileSync(outputPath, `has-flaky=${hasFlaky}\n`);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
