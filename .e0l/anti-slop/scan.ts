#!/usr/bin/env bun
/**
 * CLI for the deterministic anti-slop detector.
 *
 *   bun Tooling/anti-slop/scan.ts <file>...
 *
 * Exits non-zero if any scanned file fails the bar, printing one
 * `kind · detail · count` line per finding. Intended for CI over changed prose.
 */

import { readFileSync } from "node:fs";
import { DEFAULT_MIN_SCORE, detectSlop, formatReport, isSlopClean } from "./core";

/**
 * Files that necessarily quote the tells they forbid, and so cannot be scanned by the detector that
 * enforces them. Each entry states why, because a silent exemption list is how a gate rots.
 *
 * This is an explicit allowlist rather than a marker comment on purpose: a per-line escape gets
 * reached for whenever the gate is inconvenient, whereas adding a path here is a reviewable diff.
 */
const EXEMPT: readonly { prefix: string; reason: string }[] = [
	{
		prefix: "docs/first-principles/anti-slop/",
		reason: "the tell catalogues quote every banned phrase by definition",
	},
	{
		prefix: "docs/first-principles/documentation.md",
		reason: "quotes the 'in this document we will' preamble tell as an example",
	},
	{
		prefix: "docs/archive/",
		reason: "retired canon, preserved verbatim and never edited",
	},
	{
		prefix: "Tooling/anti-slop/",
		reason: "the detector's own source and fixtures contain the patterns it matches",
	},
	{
		prefix: "docs/explorations/",
		reason: "agent scratch and idea-stage drafts; not authored prose and not shipped",
	},
];

const exemptionFor = (file: string) => EXEMPT.find((e) => file.startsWith(e.prefix));

const files = process.argv.slice(2);
if (files.length === 0) {
	console.error("usage: bun Tooling/anti-slop/scan.ts <file>...");
	process.exit(2);
}

let failed = 0;
let skipped = 0;

for (const file of files) {
	const exemption = exemptionFor(file);
	if (exemption) {
		skipped += 1;
		console.log(`SKIP  ----  ${file}  (${exemption.reason})`);
		continue;
	}

	const report = detectSlop(readFileSync(file, "utf8"));
	const clean = isSlopClean(report);
	if (!clean) failed += 1;

	console.log(`${clean ? "PASS" : "FAIL"}  ${report.score.toFixed(2)}  ${file}`);
	if (report.findings.length > 0) {
		console.log(
			formatReport(report)
				.split("\n")
				.map((line) => `        ${line}`)
				.join("\n"),
		);
	}
}

const scanned = files.length - skipped;
console.log(
	`\n${scanned} scanned, ${skipped} exempt, ${failed} failed (threshold ${DEFAULT_MIN_SCORE})`,
);
process.exit(failed > 0 ? 1 : 0);
