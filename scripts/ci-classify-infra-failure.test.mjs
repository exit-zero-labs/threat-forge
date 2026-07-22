import { describe, expect, it } from "vitest";
import {
	classifyFailure,
	classifyRun,
	formatDecision,
	INFRA_SIGNATURES,
	MACOS_BUILD_JOB_NAME,
} from "./ci-classify-infra-failure.mjs";

// Infrastructure fixtures are verbatim excerpts of this repository's own failed runs, fetched
// with `gh api /repos/exit-zero-labs/threat-forge/actions/jobs/<id>/logs`. Timestamp prefixes
// and ANSI escapes are kept so the tests exercise raw log text rather than a cleaned-up form.

/** run 29839961163 attempt 1, job 88667317118 — cargo global cache on `Build (macos-latest)`. */
const CARGO_CACHE_DISK_IO_LOG = `2026-07-21T14:43:27.3042160Z warning: failed to save last-use data
2026-07-21T14:43:27.3054660Z This may prevent cargo from accurately tracking what is being used in its global cache.
2026-07-21T14:43:27.3056760Z disk I/O error
2026-07-21T14:43:27.3057200Z Caused by:
2026-07-21T14:43:27.3057970Z   Error code 1034: disk I/O error
2026-07-21T14:43:28.4807570Z warning: failed to auto-clean cache data
`;

/** Same job, the vite/rollup read that actually failed the `Build Tauri app` step. */
const VITE_EILSEQ_LOG = `2026-07-21T14:44:14.8835860Z [31m✗[39m Build failed in 35.91s
2026-07-21T14:44:14.8838440Z [31merror during build:
2026-07-21T14:44:14.8840590Z [31m[commonjs--resolver] Could not load /Users/runner/work/threat-forge/threat-forge/node_modules/lucide-react/dist/esm/icons/axis-3d.js: EILSEQ: illegal byte sequence, read[31m
2026-07-21T14:44:14.8841660Z     at async readFileHandle (node:internal/fs/promises:555:24)
2026-07-21T14:44:14.9338560Z beforeBuildCommand \`npm run build\` failed with exit code 1
`;

/** Same job, the post-job cleanup step for `actions/checkout`. */
const CLEANUP_SPAWN_EILSEQ_LOG = `2026-07-21T14:44:15.0260060Z Post job cleanup.
2026-07-21T14:44:15.2946750Z node:internal/child_process:441
2026-07-21T14:44:15.2951650Z Error: spawn EILSEQ
2026-07-21T14:44:15.2961950Z   errno: -92,
2026-07-21T14:44:15.2962890Z   code: 'EILSEQ',
`;

/** run 29839964901, job 88669598130 — the `dtolnay/rust-toolchain` step on macOS. */
const RUSTUP_DOWNLOAD_LOG = `2026-07-21T14:51:23.9075890Z info: syncing channel updates for stable-aarch64-apple-darwin
2026-07-21T14:51:24.1939730Z info: downloading 5 components
2026-07-21T14:51:24.2950720Z info: rolling back changes
2026-07-21T14:51:24.3157070Z error: component download failed for clippy-aarch64-apple-darwin: unable to sync download to disk: Input/output error (os error 5)
2026-07-21T14:51:24.3206270Z ##[error]Process completed with exit code 1.
`;

const RUSTUP_STEP_NAME = "Run dtolnay/rust-toolchain@2c7215f132e9ebf062739d9130488b56d53c060c";

// Genuine-failure fixtures. The first three are verbatim from real failed runs of this
// repository; each must stay red no matter which platform produced it.

/** run 29848071247, job 88693780475 — `Rust tests` failing to compile. */
const RUST_COMPILE_ERROR_LOG = `2026-07-21T16:23:03.4016506Z    Compiling quick-xml v0.41.0
2026-07-21T16:23:07.8708869Z error[E0432]: unresolved import \`rand::RngCore\`
2026-07-21T16:23:07.8709717Z  --> src/ai/keychain.rs:8:5
2026-07-21T16:23:07.8712631Z   |     ^^^^^^^^^^^^^ no \`RngCore\` in the root
2026-07-21T16:23:08.1467955Z error[E0599]: no method named \`fill_bytes\` found for struct \`ThreadRng\` in the current scope
2026-07-21T16:23:09.0486619Z error: could not compile \`threat-forge\` (lib) due to 3 previous errors
2026-07-21T16:23:09.0846521Z ##[error]Process completed with exit code 101.
`;

/** run 29844573892, job 88681878749 — `Clippy lint` promoting a lint to an error. */
const CLIPPY_DENY_WARNINGS_LOG = `2026-07-21T15:36:18.4537614Z    Compiling threat-forge v0.2.0 (/home/runner/work/threat-forge/threat-forge/src-tauri)
2026-07-21T15:36:23.6641840Z error: use of deprecated associated function \`aes_gcm::aead::hybrid_array::Array::<T, U>::from_slice\`: use \`TryFrom\` instead
2026-07-21T15:36:23.6643148Z    --> src/ai/keychain.rs:136:28
2026-07-21T15:36:23.6646711Z     = note: \`-D deprecated\` implied by \`-D warnings\`
2026-07-21T15:36:23.6647474Z     = help: to override \`-D warnings\` add \`#[allow(deprecated)]\`
2026-07-21T15:36:25.0773480Z error: could not compile \`threat-forge\` (lib) due to 2 previous errors
2026-07-21T15:36:25.1121359Z ##[error]Process completed with exit code 101.
`;

/** Captured by running a deliberately failing assertion through this repository's Vitest 4. */
const VITEST_ASSERTION_LOG = `2026-07-21T18:02:41.7549574Z ⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
2026-07-21T18:02:41.7552775Z  FAIL  src/lib/threat-rules.test.ts > generates one threat per rule
2026-07-21T18:02:41.7559692Z AssertionError: expected 4 to be 5 // Object.is equality
2026-07-21T18:02:41.7610078Z - Expected
2026-07-21T18:02:41.7611042Z + Received
2026-07-21T18:02:41.7624199Z  Test Files  1 failed | 49 passed (50)
`;

// Constructed, not sourced: macOS signing is disabled in `release.yml` (the Apple secrets are
// commented out) and `ci.yml` never signs, so this repository has no real notarization log.
// It still has to stay red — a rejected identity is a configuration break, not a runner fault.
const NOTARIZATION_REJECTION_LOG = `2026-07-21T20:11:04.1000000Z     Signing /Users/runner/work/threat-forge/threat-forge/src-tauri/target/release/bundle/macos/ThreatForge.app
2026-07-21T20:11:05.2000000Z error: failed to bundle project: Failed to sign app: Command 'codesign' failed with exit code 1
2026-07-21T20:11:05.2100000Z ThreatForge.app: errSecInternalComponent
2026-07-21T20:11:06.3000000Z ##[error]Process completed with exit code 1.
`;

// Near misses for the allowlist: the generic vocabulary of a failing build, plus strings that
// look like the signatures without being them.
const NEAR_MISS_LOG = `2026-07-21T20:30:00.0000000Z error: build failed
2026-07-21T20:30:00.1000000Z disk IO error while writing the bundle
2026-07-21T20:30:00.2000000Z EILSEQ
2026-07-21T20:30:00.3000000Z Error code 1035: constraint failed
2026-07-21T20:30:00.4000000Z ##[error]Process completed with exit code 1.
`;

function macosBuild(logText, stepName = "Build Tauri app") {
	return { jobName: MACOS_BUILD_JOB_NAME, stepName, logText };
}

describe("classifyFailure on macOS runner infrastructure faults", () => {
	it("reruns a cargo cache disk I/O fault and reports the specific SQLite code", () => {
		expect(classifyFailure(macosBuild(CARGO_CACHE_DISK_IO_LOG))).toEqual({
			rerun: true,
			signature: "Error code 1034: disk I/O error",
		});
	});

	it("reruns an EILSEQ read of node_modules through the surrounding ANSI escapes", () => {
		expect(classifyFailure(macosBuild(VITE_EILSEQ_LOG))).toEqual({
			rerun: true,
			signature: "EILSEQ: illegal byte sequence",
		});
	});

	it("reruns an EILSEQ spawn failure raised during post-job cleanup", () => {
		expect(
			classifyFailure(macosBuild(CLEANUP_SPAWN_EILSEQ_LOG, "Post Run actions/checkout@3d3c42e5")),
		).toEqual({ rerun: true, signature: "spawn EILSEQ" });
	});

	it("reruns a rustup component download that could not be written to the runner disk", () => {
		expect(classifyFailure(macosBuild(RUSTUP_DOWNLOAD_LOG, RUSTUP_STEP_NAME))).toEqual({
			rerun: true,
			signature: "unable to sync download to disk: Input/output error",
		});
	});

	it("matches every literal in the allowlist, so no signature is unreachable", () => {
		for (const signature of INFRA_SIGNATURES) {
			const stepName = signature.requiresFailingStep ?? "Build Tauri app";
			expect(classifyFailure(macosBuild(`prefix ${signature.literal} suffix`, stepName))).toEqual({
				rerun: true,
				signature: signature.literal,
			});
		}
	});
});

describe("classifyFailure leaves genuine failures red", () => {
	it("does not rerun a Rust compile error", () => {
		expect(classifyFailure(macosBuild(RUST_COMPILE_ERROR_LOG))).toEqual({
			rerun: false,
			signature: null,
		});
	});

	it("does not rerun a Clippy lint promoted to an error by -D warnings", () => {
		expect(classifyFailure(macosBuild(CLIPPY_DENY_WARNINGS_LOG))).toEqual({
			rerun: false,
			signature: null,
		});
	});

	it("does not rerun a failing test assertion", () => {
		expect(classifyFailure(macosBuild(VITEST_ASSERTION_LOG))).toEqual({
			rerun: false,
			signature: null,
		});
	});

	it("does not rerun a code signing failure caused by configuration", () => {
		expect(classifyFailure(macosBuild(NOTARIZATION_REJECTION_LOG))).toEqual({
			rerun: false,
			signature: null,
		});
	});

	it("does not rerun on generic failure vocabulary or near-miss signature text", () => {
		expect(classifyFailure(macosBuild(NEAR_MISS_LOG))).toEqual({
			rerun: false,
			signature: null,
		});
	});

	it("does not rerun the rustup fault when a different step failed", () => {
		expect(classifyFailure(macosBuild(RUSTUP_DOWNLOAD_LOG, "Build Tauri app"))).toEqual({
			rerun: false,
			signature: null,
		});
	});

	// The scenario this veto exists for: cargo's global cache is restored from actions/cache
	// with restore-keys, so a corrupted cache database emits `disk I/O error` as a warning on
	// every macOS run until the cache is evicted. Without the veto, every genuine break during
	// that window would be classified as infrastructure and rerun. Scoping by failing step
	// cannot help, because a real compile break fails in the same step as the warning.
	it("stays red when a real compile error accompanies an infrastructure warning", () => {
		const both = [
			"warning: failed to save last-use data",
			"Caused by:",
			"  Error code 1034: disk I/O error",
			"error[E0432]: unresolved import `rand::RngCore`",
			"error: could not compile `threat-forge` (lib) due to 1 previous error",
		].join("\n");

		expect(classifyFailure(macosBuild(both, "Build Tauri app"))).toEqual({
			rerun: false,
			signature: null,
		});
	});

	it("stays red when a failing test accompanies an infrastructure warning", () => {
		const both = ["  Error code 1034: disk I/O error", "test result: FAILED. 1 failed"].join("\n");

		expect(classifyFailure(macosBuild(both, "Build Tauri app"))).toEqual({
			rerun: false,
			signature: null,
		});
	});

	it("stays red when a type error accompanies an infrastructure warning", () => {
		const both = [
			"EILSEQ: illegal byte sequence",
			"src/app.ts(9,1): error TS2304: Cannot find name",
		].join("\n");

		expect(classifyFailure(macosBuild(both, "Build web app"))).toEqual({
			rerun: false,
			signature: null,
		});
	});
});

describe("classifyFailure defaults to a genuine failure when the input is unusable", () => {
	it("does not rerun on an empty log", () => {
		expect(classifyFailure(macosBuild(""))).toEqual({ rerun: false, signature: null });
	});

	it("does not rerun when the log could not be fetched", () => {
		expect(classifyFailure(macosBuild(undefined))).toEqual({ rerun: false, signature: null });
		expect(classifyFailure(macosBuild(null))).toEqual({ rerun: false, signature: null });
	});

	it("does not rerun when no job details were supplied at all", () => {
		expect(classifyFailure()).toEqual({ rerun: false, signature: null });
		expect(classifyFailure({})).toEqual({ rerun: false, signature: null });
	});
});

describe("classifyFailure scopes reruns to the macOS build job", () => {
	it.each(["Build (ubuntu-latest)", "Build (windows-latest)", "Lint", "Test", "E2E Tests"])(
		"does not rerun %s even when it carries an infrastructure signature",
		(jobName) => {
			expect(
				classifyFailure({
					jobName,
					stepName: "Build Tauri app",
					logText: `${CARGO_CACHE_DISK_IO_LOG}${VITE_EILSEQ_LOG}`,
				}),
			).toEqual({ rerun: false, signature: null });
		},
	);

	it("does not rerun an unrecognised macOS runner label", () => {
		expect(
			classifyFailure({
				jobName: "Build (macos-15)",
				stepName: "Build Tauri app",
				logText: VITE_EILSEQ_LOG,
			}),
		).toEqual({ rerun: false, signature: null });
	});
});

describe("classifyRun requires every failed job to be infrastructure", () => {
	it("reruns when the only failed job is a macOS infrastructure fault", () => {
		const decision = classifyRun([macosBuild(VITE_EILSEQ_LOG)]);

		expect(decision.rerun).toBe(true);
		expect(decision.jobs).toEqual([
			{
				jobName: MACOS_BUILD_JOB_NAME,
				stepName: "Build Tauri app",
				rerun: true,
				signature: "EILSEQ: illegal byte sequence",
			},
		]);
	});

	it("reruns when both macOS failure modes appear in the same run", () => {
		const decision = classifyRun([
			macosBuild(CARGO_CACHE_DISK_IO_LOG),
			macosBuild(RUSTUP_DOWNLOAD_LOG, RUSTUP_STEP_NAME),
		]);

		expect(decision.rerun).toBe(true);
		expect(decision.jobs.map((job) => job.signature)).toEqual([
			"Error code 1034: disk I/O error",
			"unable to sync download to disk: Input/output error",
		]);
	});

	it("does not rerun when a genuine break accompanies a macOS infrastructure fault", () => {
		const decision = classifyRun([
			macosBuild(VITE_EILSEQ_LOG),
			{
				jobName: "Build (windows-latest)",
				stepName: "Build Tauri app",
				logText: RUST_COMPILE_ERROR_LOG,
			},
		]);

		expect(decision.rerun).toBe(false);
		expect(decision.jobs.map((job) => job.rerun)).toEqual([true, false]);
	});

	it("does not rerun a lone genuine macOS build break", () => {
		expect(classifyRun([macosBuild(RUST_COMPILE_ERROR_LOG)]).rerun).toBe(false);
	});

	it("does not rerun when no failed jobs were reported", () => {
		expect(classifyRun([])).toEqual({ rerun: false, jobs: [] });
	});

	it("does not rerun when the failed-job list is not an array", () => {
		expect(classifyRun(undefined)).toEqual({ rerun: false, jobs: [] });
		expect(classifyRun({ jobName: MACOS_BUILD_JOB_NAME })).toEqual({ rerun: false, jobs: [] });
	});

	it("does not rerun when an entry is missing", () => {
		expect(classifyRun([macosBuild(VITE_EILSEQ_LOG), null]).rerun).toBe(false);
	});
});

describe("formatDecision records the decision for a human reviewer", () => {
	const runUrl = "https://github.com/exit-zero-labs/threat-forge/actions/runs/29839961163";

	it("names the run, the job, and the matched signature when it reruns", () => {
		const decision = classifyRun([macosBuild(VITE_EILSEQ_LOG)]);
		const { summary, notice } = formatDecision({ decision, runUrl });

		expect(summary).toContain(runUrl);
		expect(summary).toContain(MACOS_BUILD_JOB_NAME);
		expect(summary).toContain("Build Tauri app");
		expect(summary).toContain("EILSEQ: illegal byte sequence");
		expect(summary).toContain("rerun the failed jobs once");
		expect(notice).toContain("Rerunning 1 failed job(s)");
		expect(notice).toContain("EILSEQ: illegal byte sequence");
	});

	it("states that the run was left red when it does not rerun", () => {
		const decision = classifyRun([macosBuild(RUST_COMPILE_ERROR_LOG)]);
		const { summary, notice } = formatDecision({ decision, runUrl });

		expect(summary).toContain("**no rerun**");
		expect(summary).toContain("genuine failure");
		expect(notice).toContain("stays red for human review");
	});

	it("says the job list was unreadable rather than asserting the run was clean", () => {
		// This workflow only runs because a run concluded `failure`, so an empty list is far
		// more likely an unreadable jobs response than a genuinely clean run. Claiming the
		// latter would put something false in the audit trail.
		const { summary, notice } = formatDecision({ decision: classifyRun([]), runUrl });

		expect(summary).toContain("No failed jobs could be read");
		expect(summary).toContain("rather than that the run was clean");
		expect(summary).not.toContain("| Failed job |");
		expect(notice).toBe(
			"No rerun: no failed jobs could be read for this run, so nothing was classified.",
		);
	});

	it("neutralises job names that could break out of the summary or emit a workflow command", () => {
		const decision = classifyRun([
			{
				jobName: "Build (macos-latest)\n::error::injected|`x`",
				stepName: "Build Tauri app\r::set-output name=rerun::true",
				logText: VITE_EILSEQ_LOG,
			},
		]);
		const { summary, notice } = formatDecision({ decision, runUrl });

		expect(summary.split("\n").filter((line) => line.startsWith("| `"))).toHaveLength(1);
		expect(summary).not.toContain("\n::error::");
		expect(summary).not.toContain("injected|");
		expect(notice).not.toContain("\n");
		expect(notice).not.toContain("::set-output");
	});

	it("strips non-whitespace control and bidirectional format characters from labels", () => {
		const decision = classifyRun([
			{
				// A NUL and a right-to-left override survive a whitespace-only filter, and can
				// truncate or visually reorder the job name a reviewer reads in the summary.
				jobName: "Build \u0000(macos-\u202Elatest)",
				stepName: "Build\u200BTauri app",
				logText: VITE_EILSEQ_LOG,
			},
		]);
		const { summary } = formatDecision({ decision, runUrl });

		expect(summary).not.toContain("\u0000");
		expect(summary).not.toContain("\u202E");
		expect(summary).not.toContain("\u200B");
		expect(summary).toContain("`Build (macos- latest)`");
		expect(summary).toContain("`Build Tauri app`");
	});
});
