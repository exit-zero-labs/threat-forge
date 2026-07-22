/**
 * Classifies a failed `CI` job as a GitHub-hosted macOS runner infrastructure fault or as a
 * genuine build/test failure, for `.github/workflows/ci-infra-rerun.yml`.
 *
 * The classifier fails closed. It reports `rerun: true` only for the macOS build job when the
 * job log contains one of the literal signatures below, each of which was read off a real
 * failed run of this repository. Everything else — a non-macOS job, a macOS job with no
 * signature, an unreadable or empty log, a malformed entry — is reported as a genuine failure
 * and left red for a human. Misclassifying a real break as infrastructure and silently
 * rerunning it is the failure mode this script exists to prevent, so an uncertain input must
 * never produce a rerun.
 *
 * When executed directly it reads a `{ runUrl, failedJobs }` payload on stdin and writes the
 * decision, a step-summary block, and a `::notice::` body as JSON on stdout.
 */

import { fileURLToPath } from "node:url";

/** The name `ci.yml`'s build matrix renders for the macOS leg. A matrix relabel fails closed. */
export const MACOS_BUILD_JOB_NAME = "Build (macos-latest)";

/** Longest job or step label echoed into the step summary. */
const MAX_LABEL_LENGTH = 120;

/**
 * Literal log strings that identify a macOS runner infrastructure fault.
 *
 * Every entry is verbatim text from a real failed run of this repository, recorded with the
 * run and job it came from. Ordered most specific first so the reported signature is the most
 * informative one when several match. `requiresFailingStep` narrows a signature to the step
 * whose stderr produces it.
 */
export const INFRA_SIGNATURES = [
	// Cargo's global-cache housekeeping against a faulting runner volume, in
	// run 29839961163 attempt 1, job 88667317118 (`Build (macos-latest)`):
	//   warning: failed to save last-use data
	//   Caused by:
	//     Error code 1034: disk I/O error
	// Listed ahead of the bare `disk I/O error` form so the recorded evidence is the specific
	// SQLite code rather than the generic line.
	{ literal: "Error code 1034: disk I/O error" },

	// rustup failing to write a downloaded toolchain component to the runner volume, in
	// run 29839964901, job 88669598130 (`Build (macos-latest)`), which failed at the
	// `dtolnay/rust-toolchain` step before any project code compiled:
	//   error: component download failed for clippy-aarch64-apple-darwin:
	//     unable to sync download to disk: Input/output error (os error 5)
	// Scoped to that step so the same text appearing elsewhere in a build log cannot qualify.
	{
		literal: "unable to sync download to disk: Input/output error",
		requiresFailingStep: "dtolnay/rust-toolchain",
	},

	// Vite/rollup reading an untouched `node_modules` file off the runner volume, in
	// run 29839961163 attempt 1, job 88667317118:
	//   [commonjs--resolver] Could not load .../lucide-react/dist/esm/icons/axis-3d.js:
	//     EILSEQ: illegal byte sequence, read
	{ literal: "EILSEQ: illegal byte sequence" },

	// The same volume fault surfacing as a failed process spawn during post-job cleanup of
	// run 29839961163 attempt 1, job 88667317118:
	//   Error: spawn EILSEQ
	{ literal: "spawn EILSEQ" },

	// The generic form of the cargo cache fault above, which also appears without the
	// `Error code 1034:` prefix in run 29839961163 attempt 1, job 88667317118.
	{ literal: "disk I/O error" },
];

function asText(value) {
	return typeof value === "string" ? value : "";
}

/**
 * Classifies one failed job.
 *
 * @param {{ jobName?: unknown, stepName?: unknown, logText?: unknown }} failedJob
 * @returns {{ rerun: boolean, signature: string | null }}
 */
export function classifyFailure({ jobName, stepName, logText } = {}) {
	if (asText(jobName) !== MACOS_BUILD_JOB_NAME) {
		return { rerun: false, signature: null };
	}

	const log = asText(logText);
	const failingStep = asText(stepName);

	for (const signature of INFRA_SIGNATURES) {
		if (signature.requiresFailingStep && !failingStep.includes(signature.requiresFailingStep)) {
			continue;
		}
		if (log.includes(signature.literal)) {
			return { rerun: true, signature: signature.literal };
		}
	}

	return { rerun: false, signature: null };
}

/**
 * Classifies every failed job in a run. A rerun requires at least one failed job and *all* of
 * them to be macOS infrastructure faults, so one genuine failure anywhere leaves the run red.
 *
 * @param {unknown} failedJobs
 * @returns {{ rerun: boolean, jobs: Array<{ jobName: string, stepName: string, rerun: boolean, signature: string | null }> }}
 */
export function classifyRun(failedJobs) {
	if (!Array.isArray(failedJobs) || failedJobs.length === 0) {
		return { rerun: false, jobs: [] };
	}

	const jobs = failedJobs.map((failedJob) => {
		const entry = typeof failedJob === "object" && failedJob !== null ? failedJob : {};
		const { rerun, signature } = classifyFailure(entry);
		return {
			jobName: asText(entry.jobName),
			stepName: asText(entry.stepName),
			rerun,
			signature,
		};
	});

	return { rerun: jobs.every((job) => job.rerun), jobs };
}

/**
 * Strips control and format characters, Markdown table delimiters, and code-span backticks
 * from a label before it is echoed. Job and step names come from the workflow file of the run
 * that failed, which on a fork pull request is contributor-controlled, so they are never
 * written to the step summary or to this workflow's stdout verbatim.
 */
function sanitizeLabel(value) {
	const cleaned = asText(value)
		.replace(/\p{C}/gu, " ")
		.replace(/[`|]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	if (cleaned === "") {
		return "(unknown)";
	}
	return cleaned.length > MAX_LABEL_LENGTH ? `${cleaned.slice(0, MAX_LABEL_LENGTH - 1)}…` : cleaned;
}

/**
 * Renders the audit trail for a decision: a Markdown block for `$GITHUB_STEP_SUMMARY` and a
 * single-line `::notice::` body. Both outcomes render, so the mechanism is never silent.
 *
 * @param {{ decision: ReturnType<typeof classifyRun>, runUrl?: unknown }} input
 * @returns {{ summary: string, notice: string }}
 */
export function formatDecision({ decision, runUrl }) {
	const url = asText(runUrl).trim();
	const failedJobCount = decision.jobs.length;
	const matchedSignatures = [
		...new Set(decision.jobs.map((job) => job.signature).filter((signature) => signature !== null)),
	];

	const lines = [
		"## macOS infrastructure auto-rerun",
		"",
		`- Original run: ${url === "" ? "(unknown)" : url}`,
		`- Failed jobs inspected: ${failedJobCount}`,
		`- Decision: ${
			decision.rerun
				? "**rerun the failed jobs once** — every failed job matched a known macOS runner infrastructure signature"
				: "**no rerun** — the failure is left red for human review"
		}`,
		"",
	];

	if (failedJobCount === 0) {
		lines.push("The run reported no failed jobs, so there is nothing to classify.");
	} else {
		lines.push(
			"| Failed job | Failing step | Classification | Matched signature |",
			"| --- | --- | --- | --- |",
		);
		for (const job of decision.jobs) {
			const classification = job.rerun ? "macOS infrastructure" : "genuine failure";
			const signature = job.signature === null ? "—" : `\`${job.signature}\``;
			const cells = [
				`\`${sanitizeLabel(job.jobName)}\``,
				`\`${sanitizeLabel(job.stepName)}\``,
				classification,
				signature,
			];
			lines.push(`| ${cells.join(" | ")} |`);
		}
	}

	let notice;
	if (decision.rerun) {
		notice = `Rerunning ${failedJobCount} failed job(s) once as a macOS infrastructure flake. Matched: ${matchedSignatures.join("; ")}.`;
	} else if (failedJobCount === 0) {
		notice = "No rerun: the run reported no failed jobs to classify.";
	} else {
		notice = `No rerun: ${failedJobCount} failed job(s) did not all classify as macOS infrastructure. The run stays red for human review.`;
	}

	return { summary: `${lines.join("\n")}\n`, notice };
}

async function readStdin() {
	const chunks = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString("utf8");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const raw = await readStdin();
	let payload;
	try {
		payload = JSON.parse(raw);
	} catch {
		console.error("ci-classify-infra-failure: stdin is not valid JSON");
		process.exit(1);
	}

	const decision = classifyRun(payload?.failedJobs);
	const { summary, notice } = formatDecision({ decision, runUrl: payload?.runUrl });
	process.stdout.write(`${JSON.stringify({ ...decision, summary, notice }, null, 2)}\n`);
}
