// @vitest-environment node
//
// Deterministic drift detection for the local agent scenario launcher (issue #67):
// `scripts/run-agent-scenario.mjs`'s scenario catalog, the runbook that documents it, and
// `package.json`'s `test:e2e:agent` script must never silently diverge from each other or from
// the real spec files/test titles they claim to run. Every check here reads real file content or
// spawns the real CLI rather than re-asserting the implementation's own hardcoded data back at
// itself — a renamed scenario, a renamed/removed spec file, a retitled test, a real-title/grep
// mismatch, or a moved artifact-manifest path fails one of these tests.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { DEFAULT_MANIFEST_PATH, DEFAULT_REPORT_PATH } from "./build-artifact-manifest.mjs";
import {
	buildGrepPattern,
	buildPlaywrightArgs,
	escapeRegExp,
	parseArgs,
	runScenario,
	SCENARIOS,
} from "./run-agent-scenario.mjs";

const repoRoot = join(import.meta.dirname, "..");
const runbookPath = join(repoRoot, "docs", "runbooks", "running-agent-e2e-scenarios.md");
const packageJsonPath = join(repoRoot, "package.json");
const launcherScriptPath = join(repoRoot, "scripts", "run-agent-scenario.mjs");
const playwrightCli = join(repoRoot, "node_modules", "@playwright", "test", "cli.js");

function readRepoFile(relativePath) {
	return readFileSync(join(repoRoot, relativePath), "utf8");
}

function readIfPresent(relativePath) {
	const fullPath = join(repoRoot, relativePath);
	return existsSync(fullPath) ? readFileSync(fullPath) : null;
}

describe("SCENARIOS catalog stays honest against real spec files", () => {
	for (const [name, scenario] of Object.entries(SCENARIOS)) {
		it(`${name}: every referenced spec file exists`, () => {
			for (const file of scenario.files) {
				expect(existsSync(join(repoRoot, file)), `${file} does not exist`).toBe(true);
			}
		});
	}
});

describe("escapeRegExp / buildGrepPattern", () => {
	it("escapes every regex metacharacter", () => {
		expect(escapeRegExp("a.b*c?d^e$f{g}h(i)j|k[l]m\\n")).toBe(
			"a\\.b\\*c\\?d\\^e\\$f\\{g\\}h\\(i\\)j\\|k\\[l\\]m\\\\n",
		);
	});

	it("a single title is anchored only at the end", () => {
		expect(buildGrepPattern(["hello world"])).toBe("hello world$");
	});

	it("multiple titles become an end-anchored alternation", () => {
		expect(buildGrepPattern(["a", "b, c"])).toBe("(a|b, c)$");
	});

	// Playwright matches `--grep` against the full `<project> <file> <describe...> <test>` path
	// (`Suite._grepTitleWithTags`), not the bare test title — a leading `^` anchor would require
	// reproducing that entire prefix and silently stop matching the moment any of it changed.
	// `buildGrepPattern` deliberately never emits a leading `^` for exactly this reason.
	it("never anchors the start of the pattern", () => {
		expect(buildGrepPattern(["solo"])).not.toMatch(/^\^/);
		expect(buildGrepPattern(["a", "b"])).not.toMatch(/^\^/);
	});
});

describe("parseArgs", () => {
	it("recognizes --list regardless of position", () => {
		expect(parseArgs(["--list"])).toEqual({
			list: true,
			scenario: undefined,
			headless: false,
			errors: [],
		});
	});

	it("reads a bare scenario name with headed as the default", () => {
		expect(parseArgs(["document-creation"])).toEqual({
			list: false,
			scenario: "document-creation",
			headless: false,
			errors: [],
		});
	});

	it("reads --headless alongside a scenario name", () => {
		expect(parseArgs(["threat-analysis", "--headless"])).toEqual({
			list: false,
			scenario: "threat-analysis",
			headless: true,
			errors: [],
		});
	});

	it("reports an absent scenario name as undefined, not a flag", () => {
		expect(parseArgs(["--headless"])).toEqual({
			list: false,
			scenario: undefined,
			headless: true,
			errors: [],
		});
	});

	it("rejects unknown flags, extra scenarios, and --list combinations", () => {
		expect(parseArgs(["document-creation", "--typo"]).errors).toEqual(['Unknown option: "--typo"']);
		expect(parseArgs(["document-creation", "threat-analysis"]).errors).toEqual([
			"Expected one scenario, received: document-creation, threat-analysis",
		]);
		expect(parseArgs(["document-creation", "--list"]).errors).toContain(
			"--list cannot be combined with a scenario or --headless",
		);
	});
});

describe("buildPlaywrightArgs", () => {
	it("defaults to headed with exact grep and one worker", () => {
		expect(buildPlaywrightArgs(SCENARIOS["document-creation"], { headless: false })).toEqual([
			"test",
			"e2e/new-model.spec.ts",
			"--grep",
			buildGrepPattern(SCENARIOS["document-creation"].titles),
			"--workers=1",
			"--headed",
		]);
	});

	describe("runScenario orchestration", () => {
		const execute = (playwrightStatus, manifestStatus) => {
			const events = [];
			const statuses = [playwrightStatus, manifestStatus];
			const status = runScenario(
				"document-creation",
				{ headless: true },
				{
					remove: (target) => events.push({ kind: "remove", target }),
					spawn: (command, args) => {
						events.push({ kind: "spawn", command, args });
						return { status: statuses.shift(), signal: null };
					},
					log: (message) => events.push({ kind: "log", message }),
				},
			);
			return { events, status };
		};

		it("cleans both evidence roots, runs Playwright, then runs the manifest even when Playwright fails", () => {
			const { events, status } = execute(7, 0);
			const removes = events.filter((event) => event.kind === "remove");
			const spawns = events.filter((event) => event.kind === "spawn");

			expect(removes).toHaveLength(2);
			expect(removes[0].target).toMatch(/test-results$/);
			expect(removes[1].target).toMatch(/playwright-report$/);
			expect(spawns).toHaveLength(2);
			expect(spawns[0].args[0]).toMatch(/node_modules[/\\]@playwright[/\\]test[/\\]cli\.js$/);
			expect(spawns[0].args).toContain("--workers=1");
			expect(spawns[1].args).toEqual(["scripts/build-artifact-manifest.mjs"]);
			expect(Math.max(...removes.map((event) => events.indexOf(event)))).toBeLessThan(
				events.indexOf(spawns[0]),
			);
			expect(events.indexOf(spawns[0])).toBeLessThan(events.indexOf(spawns[1]));
			expect(status).toBe(7);
		});

		it("returns the manifest failure when Playwright passes", () => {
			expect(execute(0, 9).status).toBe(9);
		});

		it("returns success only when both subprocesses pass", () => {
			expect(execute(0, 0).status).toBe(0);
		});
	});

	it("omits --headed when --headless is requested", () => {
		expect(buildPlaywrightArgs(SCENARIOS["document-creation"], { headless: true })).toEqual([
			"test",
			"e2e/new-model.spec.ts",
			"--grep",
			buildGrepPattern(SCENARIOS["document-creation"].titles),
			"--workers=1",
		]);
	});

	it("adds an end-anchored --grep alternation for a titled scenario", () => {
		const args = buildPlaywrightArgs(SCENARIOS["import-export"], { headless: true });
		expect(args[0]).toBe("test");
		expect(args[1]).toBe("e2e/workspace-fixtures.spec.ts");
		expect(args[2]).toBe("--grep");
		expect(args[3]).toBe(buildGrepPattern(SCENARIOS["import-export"].titles));
		expect(args[4]).toBe("--workers=1");
	});

	it("rejects an empty title allowlist", () => {
		expect(() => buildGrepPattern([])).toThrow("at least one");
	});
});

describe("each scenario resolves through the real Playwright CLI", () => {
	for (const [name, scenario] of Object.entries(SCENARIOS)) {
		it(`${name}: lists at least one real test with its exact file/title filter`, () => {
			const retainedBefore = {
				json: readIfPresent("test-results/results.json"),
				html: readIfPresent("playwright-report/index.html"),
			};
			const args = [
				...buildPlaywrightArgs(scenario, { headless: true }),
				"--list",
				"--reporter=line",
			];
			const result = spawnSync(process.execPath, [playwrightCli, ...args], {
				cwd: repoRoot,
				encoding: "utf8",
			});
			expect(result.status).toBe(0);
			const listedTitles = result.stdout
				.split("\n")
				.filter((line) => line.includes(" › "))
				.map((line) => line.split(" › ").at(-1)?.trim())
				.filter((title) => title !== undefined);
			expect(listedTitles).toHaveLength(scenario.titles.length);
			expect(new Set(listedTitles)).toEqual(new Set(scenario.titles));
			expect(result.stdout).toMatch(
				new RegExp(`Total: ${scenario.titles.length} tests? in ${scenario.files.length} files?`),
			);
			expect(readIfPresent("test-results/results.json")).toEqual(retainedBefore.json);
			expect(readIfPresent("playwright-report/index.html")).toEqual(retainedBefore.html);
		});
	}
});

describe("run-agent-scenario.mjs CLI", () => {
	it("--list prints every scenario name and description without touching Playwright", () => {
		const result = spawnSync(process.execPath, [launcherScriptPath, "--list"], {
			cwd: repoRoot,
			encoding: "utf8",
		});
		expect(result.status).toBe(0);
		for (const [name, scenario] of Object.entries(SCENARIOS)) {
			expect(result.stdout).toContain(name);
			expect(result.stdout).toContain(scenario.description);
		}
	});

	it("an unknown scenario name fails fast with the catalog, never invoking Playwright", () => {
		const result = spawnSync(process.execPath, [launcherScriptPath, "not-a-real-scenario"], {
			cwd: repoRoot,
			encoding: "utf8",
		});
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('Unknown scenario: "not-a-real-scenario"');
		for (const name of Object.keys(SCENARIOS)) {
			expect(result.stderr).toContain(name);
		}
	});

	for (const inheritedName of ["constructor", "__proto__"]) {
		it(`rejects inherited object key "${inheritedName}" as an unknown scenario`, () => {
			const result = spawnSync(process.execPath, [launcherScriptPath, inheritedName], {
				cwd: repoRoot,
				encoding: "utf8",
			});
			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain(`Unknown scenario: "${inheritedName}"`);
			expect(result.stderr).toContain("Available scenarios:");
			expect(result.stderr).not.toContain("TypeError");
		});
	}

	it("no arguments fails fast with usage", () => {
		const result = spawnSync(process.execPath, [launcherScriptPath], {
			cwd: repoRoot,
			encoding: "utf8",
		});
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("Usage:");
	});
});

describe("cross-file consistency", () => {
	it("package.json's test:e2e:agent script runs this exact launcher", () => {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
		expect(packageJson.scripts["test:e2e:agent"]).toBe("node scripts/run-agent-scenario.mjs");
	});

	it("the runbook documents exactly the same scenario names the launcher implements", () => {
		const runbook = readFileSync(runbookPath, "utf8");
		const catalogSection = runbook.split("## Scenario catalog")[1]?.split("## Starting")[0] ?? "";
		const documentedNames = [...catalogSection.matchAll(/\| `([a-z-]+)` \|/g)].map((m) => m[1]);
		expect(documentedNames.length).toBeGreaterThan(0);
		expect(new Set(documentedNames)).toEqual(new Set(Object.keys(SCENARIOS)));
	});

	it("the runbook maps every scenario to exactly the same spec files", () => {
		const runbook = readFileSync(runbookPath, "utf8");
		const catalogSection = runbook.split("## Scenario catalog")[1]?.split("## Starting")[0] ?? "";
		for (const [name, scenario] of Object.entries(SCENARIOS)) {
			const row = catalogSection.split("\n").find((line) => line.startsWith(`| \`${name}\` |`));
			expect(row, `runbook has no table row for ${name}`).toBeDefined();
			const documentedFiles = [...(row ?? "").matchAll(/`(e2e\/[^`]+\.spec\.ts)`/g)].map(
				(match) => match[1],
			);
			expect(new Set(documentedFiles), name).toEqual(new Set(scenario.files));
		}
	});

	it("the runbook's artifact paths use the manifest builder's exported defaults", () => {
		const runbook = readFileSync(runbookPath, "utf8");
		expect(runbook).toContain(DEFAULT_REPORT_PATH);
		expect(runbook).toContain(DEFAULT_MANIFEST_PATH);
		expect(runbook).toContain("node scripts/build-artifact-manifest.mjs");
	});

	it("the CI E2E job runs Playwright, builds the manifest next, and uploads both report roots", () => {
		const ci = load(readRepoFile(".github/workflows/ci.yml"));
		const steps = ci.jobs.e2e.steps;
		const playwrightIndex = steps.findIndex((step) => step.run === "npx playwright test");
		const manifestIndex = steps.findIndex(
			(step) => step.run === "node scripts/build-artifact-manifest.mjs",
		);
		const uploadIndex = steps.findIndex((step) => step.name === "Upload Playwright report");
		const manifest = steps[manifestIndex];
		const upload = steps[uploadIndex];
		expect(playwrightIndex).toBeGreaterThan(-1);
		expect(manifestIndex).toBeGreaterThan(playwrightIndex);
		expect(uploadIndex).toBeGreaterThan(manifestIndex);
		expect(manifest.if).toBe("always()");
		expect(upload.if).toContain("failure()");
		expect(upload.if).toContain("has-flaky");
		expect(
			upload.with.path
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean),
		).toEqual(["playwright-report/", "test-results/"]);
	});

	it("the runbook is discoverable from README and CONTRIBUTING", () => {
		const runbookRelativePath = "docs/runbooks/running-agent-e2e-scenarios.md";
		expect(existsSync(runbookPath)).toBe(true);
		expect(readRepoFile("README.md")).toContain(runbookRelativePath);
		expect(readRepoFile("CONTRIBUTING.md")).toContain(runbookRelativePath);
	});

	it("the E2E instructions apply to both the launcher and its binding runbook", () => {
		const instructions = readRepoFile(".github/instructions/e2e.instructions.md");
		const frontmatter = instructions.match(/^---\n([\s\S]*?)\n---/);
		expect(frontmatter).not.toBeNull();
		const metadata = load(frontmatter?.[1] ?? "");
		const patterns = metadata.applyTo.split(",").map((pattern) => pattern.trim());
		expect(patterns).toContain("scripts/run-agent-scenario*.mjs");
		expect(patterns).toContain("docs/runbooks/running-agent-e2e-scenarios.md");
	});
});
