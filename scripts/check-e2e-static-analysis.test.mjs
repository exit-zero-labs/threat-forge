// @vitest-environment node
//
// Deterministic probe (issue #215) proving the canonical Biome project check and the
// dedicated E2E TypeScript project (`tsconfig.e2e.json`) actually fail closed on an
// intentional violation, rather than asserting on the two config files' own text — a config
// can `include` a path and still not catch anything if a rule is misconfigured or the project
// reference is broken, so only running the real CLI against real file content proves the gate.
//
// E2E probe files live briefly under `e2e/__static-analysis-probe__/`, inside both canonical
// E2E gates. The browser-project isolation probe lives under `src/__static-analysis-probe__/`,
// inside the real production TypeScript project. This exercises the exact configs run by
// `ci:local`/CI rather than duplicated copies that could drift. `afterEach` removes both
// directories unconditionally, and every violation has a clean-project control so a failing
// assertion cannot be mistaken for a harness that is always red regardless of content.

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..");
const probeDir = join(repoRoot, "e2e", "__static-analysis-probe__");
const appProbeDir = join(repoRoot, "src", "__static-analysis-probe__");
const biomeScript = join(repoRoot, "node_modules", "@biomejs", "biome", "bin", "biome");
const tscScript = join(repoRoot, "node_modules", "typescript", "bin", "tsc");

function runBiomeCheck() {
	return spawnSync(process.execPath, [biomeScript, "check", "."], {
		cwd: repoRoot,
		encoding: "utf8",
	});
}

function runE2eTypeCheck() {
	return spawnSync(process.execPath, [tscScript, "--noEmit", "-p", "tsconfig.e2e.json"], {
		cwd: repoRoot,
		encoding: "utf8",
	});
}

function runAppTypeCheck() {
	return spawnSync(process.execPath, [tscScript, "--noEmit", "-p", "tsconfig.json"], {
		cwd: repoRoot,
		encoding: "utf8",
	});
}

function writeProbeFile(directory, name, content) {
	mkdirSync(directory, { recursive: true });
	writeFileSync(join(directory, name), content);
}

afterEach(() => {
	rmSync(probeDir, { recursive: true, force: true });
	rmSync(appProbeDir, { recursive: true, force: true });
});

describe("Biome canonical project check covers e2e/", () => {
	it("passes on a clean e2e-shaped probe file", () => {
		writeProbeFile(probeDir, "clean.ts", 'export const probeValue = "ok";\n');

		const result = runBiomeCheck();

		expect(result.status).toBe(0);
	});

	it("fails on an intentional unused-import violation under e2e/", () => {
		writeProbeFile(
			probeDir,
			"bad-lint.ts",
			'import { readFileSync } from "node:fs";\n\nexport function unusedProbeExport(): void {}\n',
		);

		const result = runBiomeCheck();

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("__static-analysis-probe__/bad-lint.ts");
		expect(result.stderr).toContain("lint/correctness/noUnusedImports");
	});
});

describe("E2E TypeScript project (tsconfig.e2e.json)", () => {
	it("passes on the real E2E sources, including Node-typed `process.platform`", () => {
		const result = runE2eTypeCheck();

		expect(result.status).toBe(0);
		expect(result.stdout).toBe("");
	});

	it("fails on an intentional type error under e2e/", () => {
		writeProbeFile(
			probeDir,
			"bad-type.ts",
			'export const badTypeProbe: number = "not-a-number";\n',
		);

		const result = runE2eTypeCheck();

		expect(result.status).not.toBe(0);
		expect(result.stdout).toContain("__static-analysis-probe__/bad-type.ts");
		expect(result.stdout).toContain("TS2322");
	});
});

describe("production browser TypeScript project remains Node-free", () => {
	it("passes on the real production sources", () => {
		const result = runAppTypeCheck();

		expect(result.status).toBe(0);
		expect(result.stdout).toBe("");
	});

	it("rejects an accidental Node global under src/", () => {
		writeProbeFile(
			appProbeDir,
			"bad-node-global.ts",
			"export const leakedNodeGlobal = process.platform;\n",
		);

		const result = runAppTypeCheck();

		expect(result.status).not.toBe(0);
		expect(result.stdout).toContain("__static-analysis-probe__/bad-node-global.ts");
		expect(result.stdout).toContain("TS2591");
	});
});
