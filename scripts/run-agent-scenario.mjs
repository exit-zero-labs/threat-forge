// Launches one named, deterministic browser E2E scenario for local agent inspection (issue #67).
//
// Usage:
//   node scripts/run-agent-scenario.mjs --list             # print the scenario catalog
//   node scripts/run-agent-scenario.mjs <scenario>          # headed local run (default)
//   node scripts/run-agent-scenario.mjs <scenario> --headless
//
// Also invocable via the documented npm script (see docs/runbooks/running-agent-e2e-scenarios.md):
//   npm run test:e2e:agent -- --list
//   npm run test:e2e:agent -- <scenario>
//
// Every scenario below is a real spec file — optionally narrowed to an exact allowlist of test
// titles — built on the same #65 fixtures/helpers (`e2e/support/workspace-fixtures.ts`,
// `e2e/support/interactions.ts`) that CI runs, and the same `playwright.config.ts` project/
// webServer CI itself uses (chromium against `npm run dev:web` on port 3000). This script never
// launches the desktop Tauri shell (`npm run tauri dev`) — browser mode is the only mode the #65/
// #66/#67 fixtures and artifact layout exist for; desktop E2E is issue #68's separate scope.
//
// No new fixture, helper, or artifact mechanism is introduced: this invokes the repository-pinned
// Playwright CLI directly (never `npx` network fallback) with
// `test <files> [--grep <pattern>] [--headed]`, followed by the exact
// `node scripts/build-artifact-manifest.mjs` step CI runs. A local run therefore leaves the same
// `test-results/results.json`, `test-results/artifact-manifest.json`, and `playwright-report/`
// layout as CI.

import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const PLAYWRIGHT_CLI = path.join(REPO_ROOT, "node_modules", "@playwright", "test", "cli.js");

/**
 * One outcome-oriented scenario per critical flow named in issue #67's acceptance criteria,
 * mapped to the existing spec file(s)/test title(s) that already exercise it. `titles` is an
 * exact-match allowlist turned into an anchored `--grep` alternation, so adding/removing a test
 * never silently changes a scenario's contract.
 *
 * @typedef {{ description: string; files: string[]; titles: string[] }} Scenario
 * @type {Record<string, Scenario>}
 */
export const SCENARIOS = {
	"document-creation": {
		description: "Create a new, empty document from both the empty-state and toolbar affordances.",
		files: ["e2e/new-model.spec.ts"],
		titles: [
			"creates new model via empty state button",
			"creates new model via toolbar button",
			"shows palette and right panel after creation",
		],
	},
	"multi-tab-restore": {
		description:
			"Open several documents, reload, and confirm every tab is restored in persisted order with the correct tab active.",
		files: ["e2e/browser-restore.spec.ts"],
		titles: [
			"a document's edit survives a page reload and returns as content, not a reset",
			"reload restores every open tab in persisted order and hydrates an inactive one on demand",
			"reload honors the active-document choice over creation order",
		],
	},
	"import-export": {
		description:
			"Open a large committed .thf file and a malformed one through the real Open dialog, then create, edit, save, export, and restore a document end to end.",
		files: ["e2e/workspace-fixtures.spec.ts"],
		titles: [
			"seedLargeWorkspace renders 150 elements and 100 flows within 5000ms",
			"seedMalformedWorkspace surfaces the complete parse-failure alert and leaves the canvas unchanged",
			"shared interaction helpers execute real create, switch, edit, drag, connect, save, export, and restore workflows",
		],
	},
	"threat-analysis": {
		description: "Run STRIDE analysis against a modeled document and copy a generated threat.",
		files: ["e2e/stride-analysis.spec.ts"],
		titles: [
			"STRIDE button is disabled with no elements",
			"generates threats and copies one as YAML",
		],
	},
	"native-ai-tools": {
		description:
			"Exercise the bounded AI tool loop (approve, deny, stop, undo) with an obviously-fake local key and canned SSE fixture — no real credential or provider request leaves the machine.",
		files: ["e2e/ai-tool-loop.spec.ts"],
		titles: [
			"approving a tool call adds the element to the canvas",
			"stopping while a call is pending leaves the canvas unchanged",
			"denying a call keeps the canvas unchanged and continues the turn",
			"undoing the turn removes the applied element in one step",
		],
	},
	"release-smoke": {
		description:
			"The browser-available subset of docs/runbooks/releasing-a-version.md's smoke checklist: create, save a .thf download, run STRIDE analysis, and confirm AI-panel availability/settings. Desktop-only steps remain issue #68's scope.",
		files: [
			"e2e/new-model.spec.ts",
			"e2e/save-reopen.spec.ts",
			"e2e/stride-analysis.spec.ts",
			"e2e/ai-chat.spec.ts",
		],
		titles: [
			"creates new model via empty state button",
			"creates new model via toolbar button",
			"shows palette and right panel after creation",
			"save triggers a YAML download with model data",
			"model state includes all added elements",
			"saved YAML preserves element names after editing",
			"STRIDE button is disabled with no elements",
			"generates threats and copies one as YAML",
			"AI tab shows no API key message",
			"settings gear in AI tab opens settings dialog at AI section",
		],
	},
	"visual-evidence": {
		description:
			"Capture the empty state and all six templates as path-backed Playwright screenshot attachments for manual visual review; this is evidence capture, not a visual-quality pass/fail gate.",
		files: ["e2e/screenshot-templates.spec.ts"],
		titles: [
			"screenshot empty state",
			"screenshot template: ecommerce-platform",
			"screenshot template: cloud-microservices",
			"screenshot template: mobile-banking",
			"screenshot template: saas-platform",
			"screenshot template: iot-smart-building",
			"screenshot template: healthcare-system",
		],
	},
};

/** Escape every regex metacharacter in `text` so it matches only as a literal string. */
export function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a Playwright `--grep` pattern that matches exactly the given full test titles, anchored
 * at the end. Playwright matches `--grep` against the joined `<project> <file> <describe...>
 * <test>` path (`Suite._grepTitleWithTags`, `node_modules/playwright/lib/common/index.js`), not
 * the bare test title, so a leading `^` anchor would have to also reproduce that project/file/
 * describe prefix and silently break the moment any of it changed. Anchoring only the end is
 * sufficient to require each alternative to be this exact title with no extra trailing text, and
 * the file argument already scopes the match to one spec file.
 *
 * @param {string[]} titles
 * @returns {string}
 */
export function buildGrepPattern(titles) {
	if (titles.length === 0) throw new Error("A titled scenario must allow at least one test title");
	const escaped = titles.map(escapeRegExp);
	return escaped.length === 1 ? `${escaped[0]}$` : `(${escaped.join("|")})$`;
}

/**
 * @param {string[]} argv
 * @returns {{ list: boolean; scenario: string | undefined; headless: boolean; errors: string[] }}
 */
export function parseArgs(argv) {
	const supportedFlags = new Set(["--list", "--headless"]);
	const unknownFlags = argv.filter((arg) => arg.startsWith("--") && !supportedFlags.has(arg));
	const positionals = argv.filter((arg) => !arg.startsWith("--"));
	const list = argv.includes("--list");
	const headless = argv.includes("--headless");
	const errors = unknownFlags.map((flag) => `Unknown option: "${flag}"`);
	if (positionals.length > 1)
		errors.push(`Expected one scenario, received: ${positionals.join(", ")}`);
	if (list && (headless || positionals.length > 0)) {
		errors.push("--list cannot be combined with a scenario or --headless");
	}
	return { list, scenario: positionals[0], headless, errors };
}

function printUsage() {
	console.error("Usage: node scripts/run-agent-scenario.mjs <scenario> [--headless]");
	console.error("       node scripts/run-agent-scenario.mjs --list");
	console.error("\nAvailable scenarios:");
	for (const [name, scenario] of Object.entries(SCENARIOS)) {
		console.error(`  ${name} — ${scenario.description}`);
	}
}

function printCatalog() {
	for (const [name, scenario] of Object.entries(SCENARIOS)) {
		console.log(`${name}\n  ${scenario.description}\n  files: ${scenario.files.join(", ")}`);
	}
}

/**
 * @param {Scenario} scenario
 * @param {{ headless: boolean }} opts
 * @returns {string[]}
 */
export function buildPlaywrightArgs(scenario, opts) {
	const args = ["test", ...scenario.files];
	args.push("--grep", buildGrepPattern(scenario.titles), "--workers=1");
	if (!opts.headless) args.push("--headed");
	return args;
}

/**
 * Execute one already-validated scenario. Dependencies are injectable so orchestration order,
 * cleanup, manifest-on-failure, and exit-code precedence are testable without launching a browser.
 *
 * @param {string} scenarioName
 * @param {{ headless: boolean }} opts
 * @param {{
 *   spawn?: typeof spawnSync;
 *   remove?: typeof rmSync;
 *   log?: (message: string) => void;
 * }} [deps]
 * @returns {number}
 */
export function runScenario(scenarioName, opts, deps = {}) {
	const spawn = deps.spawn ?? spawnSync;
	const remove = deps.remove ?? rmSync;
	const log = deps.log ?? ((message) => console.error(message));
	if (!Object.hasOwn(SCENARIOS, scenarioName)) {
		throw new Error(`Unknown scenario: ${scenarioName}`);
	}
	const scenario = SCENARIOS[scenarioName];
	const playwrightArgs = buildPlaywrightArgs(scenario, { headless: opts.headless });

	log(`▸ Running scenario "${scenarioName}": ${scenario.description}`);
	log(`▸ node node_modules/@playwright/test/cli.js ${playwrightArgs.join(" ")}`);
	remove(path.join(REPO_ROOT, "test-results"), { recursive: true, force: true });
	remove(path.join(REPO_ROOT, "playwright-report"), { recursive: true, force: true });
	const playwrightResult = spawn(process.execPath, [PLAYWRIGHT_CLI, ...playwrightArgs], {
		cwd: REPO_ROOT,
		stdio: "inherit",
	});
	if (playwrightResult.error) {
		log(`Playwright could not start: ${playwrightResult.error.message}`);
	}
	if (playwrightResult.signal) {
		log(`Playwright terminated by signal: ${playwrightResult.signal}`);
	}

	// Mirrors CI's `if: always()` manifest step whether the scenario passed, failed, or did not start.
	log("▸ node scripts/build-artifact-manifest.mjs");
	const manifestResult = spawn(process.execPath, ["scripts/build-artifact-manifest.mjs"], {
		cwd: REPO_ROOT,
		stdio: "inherit",
	});
	if (manifestResult.error) {
		log(`Artifact manifest could not start: ${manifestResult.error.message}`);
	}
	if (manifestResult.signal) {
		log(`Artifact manifest terminated by signal: ${manifestResult.signal}`);
	}

	const playwrightStatus = playwrightResult.status ?? 1;
	const manifestStatus = manifestResult.status ?? 1;
	return playwrightStatus !== 0 ? playwrightStatus : manifestStatus;
}

function main() {
	const parsed = parseArgs(process.argv.slice(2));

	if (parsed.errors.length > 0) {
		for (const error of parsed.errors) console.error(error);
		printUsage();
		process.exit(1);
	}

	if (parsed.list) {
		printCatalog();
		return;
	}

	if (!parsed.scenario || !Object.hasOwn(SCENARIOS, parsed.scenario)) {
		if (parsed.scenario) console.error(`Unknown scenario: "${parsed.scenario}"\n`);
		printUsage();
		process.exit(1);
	}

	process.exit(runScenario(parsed.scenario, { headless: parsed.headless }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
