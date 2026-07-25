// Builds a versioned artifact manifest from a Playwright JSON report — a single, portable index
// of every attachment (trace/video/screenshot/console-log/accessibility/...) across every test
// attempt, so a consumer (a future dashboard, a reviewer script, this repo's own docs) can find
// evidence without re-deriving Playwright's report shape or guessing attachment classification.
//
// Usage:
//   node scripts/build-artifact-manifest.mjs [report-path]
//
// Reads `test-results/results.json` (or the given path) and always writes
// `test-results/artifact-manifest.json` — this script's whole purpose is that file, so unlike
// `summarize-playwright.mjs` (which is a no-op without a GitHub summary/output target) it always
// runs. Not wired into `scripts/ci-local.sh`: like `summarize-playwright.mjs`, it is CI-run-summary
// tooling invoked directly by the workflow; a local contributor runs it manually after
// `npx playwright test` (see `e2e/support/README.md`).
//
// Fail-open, mirroring `summarize-playwright.mjs`'s exact philosophy: if the report is missing or
// unparseable, a valid v1 manifest with `entries: []` and `{ error: "<reason>" }` is still written,
// and the process exits 0 — a missing/corrupt report is a data-availability outcome, not this
// script's bug. Only report reading/parsing is guarded this way; a fault in the transform itself
// (`buildManifest`/its helpers) is an implementation defect and is allowed to throw and fail the
// process. Per-attachment read/classification problems (an unreadable or malformed
// `artifact-context` attachment, an attachment path outside the repository) are themselves
// data-quality outcomes, not transform bugs, and are represented per manifest entry via
// `artifactErrors` / `path: null` rather than failing the whole run.
//
// The report shape is @playwright/test's `JSONReport` (node_modules/playwright/types/
// testReporter.d.ts, Playwright 1.61.1). Fields read: `suites[].specs[].tests[].results[]`
// (recursing through `suites[].suites[]` exactly like `summarize-playwright.mjs`'s
// `collectOutcomes`), each result's `status`, `retry`, `duration`, `startTime`, `steps[]`
// (recursive), and `attachments[]` (`name`, `path?`, `body?`, `contentType`).

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_REPORT_PATH = "test-results/results.json";
export const DEFAULT_MANIFEST_PATH = "test-results/artifact-manifest.json";
const SCHEMA_VERSION = 1;

/** The sole current Playwright project (`playwright.config.ts`'s `devices["Desktop Chrome"]`). */
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
const DEFAULT_PROJECT_NAME = "chromium";

const FIXTURE_STEP_PREFIX = "seed:";

/**
 * The exact, stable `test.step` naming contract `e2e/support/README.md`'s "Conventions for future
 * issues" section commits to (`#65`'s D7 seam) — no new step metadata field is needed to classify
 * these. `assertNoSeriousAccessibilityViolations: ...` (`#66`) is intentionally not listed here: it
 * is an assertion step, not a user interaction, and falls through to `"other"`.
 */
export const INTERACTION_STEP_PREFIXES = [
	"createDocument:",
	"openDocument:",
	"switchToTab:",
	"clickElementByName:",
	"dragElementBy:",
	"connectElements:",
	"editElementName:",
	"saveDocument:",
	"exportHtmlReport:",
	"restoreWorkspace:",
	"waitForLocalSave:",
	"openDocuments:",
];

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

/** @param {unknown} report */
export const isUsableReport = (report) => isRecord(report) && Array.isArray(report.suites);

/**
 * Classifies one `JSONReportTestStep.title` as `fixture` (`e2e/support/workspace-fixtures.ts`'s
 * `seed:` prefix), `interaction` (the canonical `e2e/support/interactions.ts` prefixes above), or
 * `other` (any unrecognized explicit user step) — a pure
 * string-prefix check, matching `#65`'s naming seam exactly.
 *
 * @param {string} title
 * @returns {"fixture" | "interaction" | "other"}
 */
export const classifyStep = (title) => {
	if (title.startsWith(FIXTURE_STEP_PREFIX)) return "fixture";
	if (INTERACTION_STEP_PREFIXES.some((prefix) => title.startsWith(prefix))) return "interaction";
	return "other";
};

/**
 * Flattens one `JSONReportTestStep` tree into a flat list in document order: each step (container
 * or leaf) becomes its own entry, parent immediately before its own children, matching how the
 * HTML report and trace viewer render nesting.
 *
 * @param {unknown[]} steps
 * @returns {{ title: string; kind: "fixture" | "interaction" | "other"; durationMs: number; failed: boolean }[]}
 */
export const flattenSteps = (steps) => {
	/** @type {{ title: string; kind: "fixture" | "interaction" | "other"; durationMs: number; failed: boolean }[]} */
	const flat = [];
	for (const step of toArray(steps)) {
		if (!isRecord(step)) continue;
		const title = toText(step.title);
		flat.push({
			title,
			kind: classifyStep(title),
			durationMs: typeof step.duration === "number" ? step.duration : 0,
			failed: step.error !== undefined && step.error !== null,
		});
		flat.push(...flattenSteps(step.steps));
	}
	return flat;
};

/**
 * The name/contentType classifier table confirmed against `node_modules/playwright/lib/` and
 * `#66`'s own `base.ts`/`accessibility.ts` attachments — no pattern here is guessed. Checked in
 * order: exact-name producers first, then the `toHaveScreenshot()` diff triad by suffix, then a
 * generic `image/*` fallback (`#66`'s manually-triggered `screenshot-templates.spec.ts` attaches
 * `"empty-state"`/`"template-<id>"`, which are ordinary `image/png` screenshots under a different
 * name — D9 — so they must fall into the same `"screenshot"` bucket as a plain failure screenshot
 * without a new name-specific rule).
 *
 * @param {string} name
 * @param {string} contentType
 * @returns {"trace" | "video" | "screenshot" | "visual-baseline-diff" | "dom-snapshot" | "context" | "console-log" | "accessibility" | "diagnostic-capture-error" | "other"}
 */
export const classifyAttachment = (name, contentType) => {
	if (name === "trace") return "trace";
	if (name === "video") return "video";
	if (name === "error-context") return "dom-snapshot";
	if (name === "artifact-context") return "context";
	if (name === "console-log") return "console-log";
	if (name === "accessibility") return "accessibility";
	if (name === "diagnostic-capture-error") return "diagnostic-capture-error";
	const extension = path.extname(name);
	const stem = extension.length > 0 ? name.slice(0, -extension.length) : name;
	if (
		contentType.startsWith("image/") &&
		(stem.endsWith("-expected") || stem.endsWith("-actual") || stem.endsWith("-diff"))
	) {
		return "visual-baseline-diff";
	}
	if (contentType.startsWith("image/")) return "screenshot";
	return "other";
};

/** A Windows drive-letter (`C:\...`) or UNC (`\\server\share`) absolute path. */
const WINDOWS_ABSOLUTE_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\)/;
const escapesRoot = (relative, separator, isAbsolute) =>
	relative === ".." || relative.startsWith(`..${separator}`) || isAbsolute(relative);

/**
 * Normalizes a reporter-supplied attachment path to a portable, repository-relative, forward-slash
 * path — never a host runner/worktree absolute path (issue #66, D6). A Windows-style absolute path
 * is handled with `path.win32`: accepted when both it and a Windows repository root resolve to the
 * same contained tree, rejected when seen from an unrelated/POSIX root or a different drive/share.
 * Any path that normalizes outside `repoRoot` — including via `../` traversal — is rejected:
 * only `{ path: null, externalPathOmitted: true }` is emitted, never the raw host path.
 *
 * @param {string} repoRoot
 * @param {string} rawPath
 * @returns {{ path: string } | { path: null; externalPathOmitted: true }}
 */
export const normalizeAttachmentPath = (repoRoot, rawPath) => {
	if (WINDOWS_ABSOLUTE_PATH.test(rawPath)) {
		if (!WINDOWS_ABSOLUTE_PATH.test(repoRoot)) {
			return { path: null, externalPathOmitted: true };
		}
		const resolved = path.win32.resolve(rawPath);
		const relative = path.win32.relative(path.win32.resolve(repoRoot), resolved);
		if (relative === "" || escapesRoot(relative, "\\", path.win32.isAbsolute)) {
			return { path: null, externalPathOmitted: true };
		}
		return { path: relative.split("\\").join("/") };
	}
	const resolved = path.resolve(repoRoot, rawPath);
	const relative = path.relative(repoRoot, resolved);
	if (relative === "" || escapesRoot(relative, path.sep, path.isAbsolute)) {
		return { path: null, externalPathOmitted: true };
	}
	return { path: relative.split(path.sep).join("/") };
};

/**
 * Resolve one existing repository-relative attachment through symlinks and reject it if the real
 * path escapes the real repository root.
 *
 * @param {string} repoRoot
 * @param {string} safeRelativePath
 * @returns {{ kind: "contained"; path: string } | { kind: "missing" } | { kind: "external" }}
 */
const resolveContainedExistingPath = (repoRoot, safeRelativePath) => {
	let realRoot;
	try {
		realRoot = realpathSync(repoRoot);
	} catch {
		return { kind: "missing" };
	}
	let realFile;
	try {
		realFile = realpathSync(path.resolve(repoRoot, safeRelativePath));
	} catch {
		return { kind: "missing" };
	}
	const relative = path.relative(realRoot, realFile);
	if (relative === "" || escapesRoot(relative, path.sep, path.isAbsolute)) {
		return { kind: "external" };
	}
	return { kind: "contained", path: realFile };
};

/**
 * @param {Record<string, unknown>} attachment
 * @param {string} repoRoot
 * @returns {{ name: string; kind: ReturnType<typeof classifyAttachment>; contentType: string; path: string | null; inline: boolean; byteLength: number | null; externalPathOmitted: boolean; fileUnavailable: boolean }}
 */
export const buildAttachmentEntry = (attachment, repoRoot) => {
	const name = toText(attachment.name);
	const contentType = toText(attachment.contentType);
	const kind = classifyAttachment(name, contentType);
	const hasBody = typeof attachment.body === "string";
	const rawPath = typeof attachment.path === "string" ? attachment.path : null;

	if (hasBody) {
		// Third-party/body-only attachments (issue #66, D6): the evidence lives inside
		// `results.json` itself, so a reader needs `byteLength` to know that rather than looking
		// for a file on disk that was never written.
		return {
			name,
			kind,
			contentType,
			path: null,
			inline: true,
			byteLength: Buffer.byteLength(/** @type {string} */ (attachment.body), "base64"),
			externalPathOmitted: false,
			fileUnavailable: false,
		};
	}

	if (rawPath === null) {
		return {
			name,
			kind,
			contentType,
			path: null,
			inline: false,
			byteLength: null,
			externalPathOmitted: false,
			fileUnavailable: false,
		};
	}

	const normalized = normalizeAttachmentPath(repoRoot, rawPath);
	if (normalized.path === null) {
		return {
			name,
			kind,
			contentType,
			path: null,
			inline: false,
			byteLength: null,
			externalPathOmitted: true,
			fileUnavailable: false,
		};
	}

	let byteLength = null;
	let fileUnavailable = false;
	const resolution = resolveContainedExistingPath(repoRoot, normalized.path);
	if (resolution.kind === "external") {
		return {
			name,
			kind,
			contentType,
			path: null,
			inline: false,
			byteLength: null,
			externalPathOmitted: true,
			fileUnavailable: false,
		};
	}
	if (resolution.kind === "missing") {
		fileUnavailable = true;
	} else {
		try {
			byteLength = statSync(resolution.path).size;
		} catch {
			fileUnavailable = true;
		}
	}

	return {
		name,
		kind,
		contentType,
		path: normalized.path,
		inline: false,
		byteLength,
		externalPathOmitted: false,
		fileUnavailable,
	};
};

/**
 * Resolves the runtime viewport context for one test result (issue #66, D6). Prefers the
 * `"artifact-context"` attachment `e2e/support/base.ts` attaches on every attempt
 * (`viewportSource: "runtime-attachment"`) so a test that calls `page.setViewportSize` — like the
 * 900×700 responsive audit — manifests its real viewport, not a guessed default. Falls back to the
 * known current project's default only when no such attachment exists at all; an unrecognized
 * future project gets `viewport: null` rather than a fabricated size. A present-but-broken
 * attachment (unreadable file, malformed JSON, no usable `viewport` field) is recorded through
 * `artifactErrors` and also resolves to `viewport: null` — it must never silently fall back to the
 * project default, which would misrepresent a real (if unreadable) runtime context as a guess.
 *
 * @param {Record<string, unknown>[]} attachments Raw report attachment records for one result.
 * @param {string} projectName
 * @param {{ repoRoot: string; readAttachmentText: (safeRelativePath: string) => string; defaultViewport: { width: number; height: number } }} context
 * @returns {{ viewport: { width: number; height: number } | null; viewportSource: "runtime-attachment" | "project-default" | "unavailable"; artifactErrors: { name: string; reason: string }[] }}
 */
export const resolveViewportContext = (attachments, projectName, context) => {
	const artifactContexts = attachments.filter(
		(attachment) => attachment.name === "artifact-context",
	);
	const artifactContext = artifactContexts[0];

	if (!artifactContext) {
		if (projectName === DEFAULT_PROJECT_NAME) {
			return {
				viewport: context.defaultViewport,
				viewportSource: "project-default",
				artifactErrors: [],
			};
		}
		return { viewport: null, viewportSource: "unavailable", artifactErrors: [] };
	}

	/** @param {string} reason */
	const unavailable = (reason) => ({
		viewport: null,
		viewportSource: /** @type {const} */ ("unavailable"),
		artifactErrors: [{ name: "artifact-context", reason }],
	});
	if (artifactContexts.length > 1) {
		return unavailable("multiple artifact-context attachments were recorded for one attempt");
	}

	let rawText;
	if (typeof artifactContext.body === "string") {
		rawText = Buffer.from(artifactContext.body, "base64").toString("utf8");
	} else if (typeof artifactContext.path === "string") {
		const normalized = normalizeAttachmentPath(context.repoRoot, artifactContext.path);
		if (normalized.path === null) {
			return unavailable("artifact-context attachment path is outside the repository");
		}
		try {
			rawText = context.readAttachmentText(normalized.path);
		} catch {
			return unavailable("artifact-context attachment could not be read");
		}
	} else {
		return unavailable("artifact-context attachment has neither a path nor a body");
	}

	/** @type {unknown} */
	let parsed;
	try {
		parsed = JSON.parse(rawText);
	} catch {
		return unavailable("artifact-context is not valid JSON");
	}

	if (
		!isRecord(parsed) ||
		parsed.schemaVersion !== SCHEMA_VERSION ||
		!isRecord(parsed.viewport) ||
		typeof parsed.viewport.width !== "number" ||
		typeof parsed.viewport.height !== "number" ||
		!Number.isFinite(parsed.viewport.width) ||
		!Number.isFinite(parsed.viewport.height) ||
		!Number.isInteger(parsed.viewport.width) ||
		!Number.isInteger(parsed.viewport.height) ||
		parsed.viewport.width <= 0 ||
		parsed.viewport.height <= 0
	) {
		return unavailable(
			"artifact-context must have schemaVersion 1 and a usable { viewport: { width, height } } field",
		);
	}

	return {
		viewport: { width: parsed.viewport.width, height: parsed.viewport.height },
		viewportSource: "runtime-attachment",
		artifactErrors: [],
	};
};

/**
 * Collects one manifest entry per `JSONReportTestResult` (one entry per attempt), carrying the
 * enclosing `describe` titles down exactly like `summarize-playwright.mjs`'s `collectOutcomes`.
 *
 * @param {Record<string, unknown>} suite
 * @param {string[]} describeTrail
 * @param {{ repoRoot: string; readAttachmentText: (safeRelativePath: string) => string; defaultViewport: { width: number; height: number }; commit: string | null; dirty: boolean | null; platform: string }} context
 * @returns {unknown[]}
 */
const collectEntries = (suite, describeTrail, context) => {
	const entries = [];

	for (const spec of toArray(suite.specs)) {
		if (!isRecord(spec)) continue;

		const scenario = [...describeTrail, toText(spec.title)].filter(Boolean).join(" > ");
		const line = typeof spec.line === "number" ? `:${spec.line}` : "";
		const location = `${toText(spec.file)}${line}`;

		for (const test of toArray(spec.tests)) {
			if (!isRecord(test)) continue;
			const projectName = toText(test.projectName);
			const status = toText(test.status);

			for (const result of toArray(test.results)) {
				if (!isRecord(result)) continue;

				const rawAttachments = toArray(result.attachments).filter(isRecord);
				const { viewport, viewportSource, artifactErrors } = resolveViewportContext(
					rawAttachments,
					projectName,
					context,
				);

				entries.push({
					scenario,
					location,
					project: projectName,
					status,
					attempt: {
						retry: typeof result.retry === "number" ? result.retry : 0,
						status: toText(result.status),
						durationMs: typeof result.duration === "number" ? result.duration : 0,
						startTime: toText(result.startTime),
					},
					steps: flattenSteps(result.steps),
					attachments: rawAttachments.map((attachment) =>
						buildAttachmentEntry(attachment, context.repoRoot),
					),
					platform: context.platform,
					viewport,
					viewportSource,
					artifactErrors,
					commit: context.commit,
					dirty: context.dirty,
				});
			}
		}
	}

	for (const childSuite of toArray(suite.suites)) {
		if (isRecord(childSuite)) {
			entries.push(
				...collectEntries(childSuite, [...describeTrail, toText(childSuite.title)], context),
			);
		}
	}

	return entries;
};

/**
 * Deterministic transform: parsed `results.json` (untrusted shape) plus injected run-level context
 * in, a complete v1 manifest object out. Filesystem/git/OS dependencies are pushed into `context`
 * by `main()`, so every entry is exercisable with an in-memory `readAttachmentText`.
 *
 * @param {unknown} report
 * @param {{ repoRoot: string; readAttachmentText: (safeRelativePath: string) => string; defaultViewport: { width: number; height: number }; commit: string | null; dirty: boolean | null; platform: string; generatedAt: string }} context
 * @returns {object}
 */
export const buildManifest = (report, context) => {
	if (!isUsableReport(report)) {
		throw new Error("Playwright report must be an object with a suites array");
	}
	const entries = report.suites
		.filter(isRecord)
		.flatMap((fileSuite) => collectEntries(fileSuite, [], context));

	return {
		schemaVersion: SCHEMA_VERSION,
		generatedAt: context.generatedAt,
		commit: context.commit,
		dirty: context.dirty,
		platform: context.platform,
		defaultViewport: context.defaultViewport,
		entries,
	};
};

/**
 * @param {{ commit: string | null; dirty: boolean | null; platform: string; defaultViewport: { width: number; height: number }; generatedAt: string }} context
 * @param {string} reason
 * @returns {object}
 */
export const buildUnavailableManifest = (context, reason) => ({
	schemaVersion: SCHEMA_VERSION,
	generatedAt: context.generatedAt,
	commit: context.commit,
	dirty: context.dirty,
	platform: context.platform,
	defaultViewport: context.defaultViewport,
	entries: [],
	error: reason,
});

/**
 * Repository-rooted text reader for production use: only ever called with a path
 * `normalizeAttachmentPath` has already proven stays inside `repoRoot`.
 *
 * @param {string} repoRoot
 * @returns {(safeRelativePath: string) => string}
 */
const createRepoAttachmentReader = (repoRoot) => (safeRelativePath) => {
	const resolution = resolveContainedExistingPath(repoRoot, safeRelativePath);
	if (resolution.kind !== "contained") {
		throw new Error("attachment path is unavailable or outside the repository");
	}
	return readFileSync(resolution.path, "utf8");
};

/**
 * @param {string} repoRoot
 * @returns {string | null}
 */
const readCommit = (repoRoot) => {
	if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
	try {
		// stderr is explicitly discarded (not inherited): a non-repository checkout is expected to
		// print `fatal: not a git repository` here, and that must not leak onto this script's own
		// stderr — only the caught exception (informational, non-fatal) matters.
		return execFileSync("git", ["rev-parse", "HEAD"], {
			cwd: repoRoot,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		// Informational only: an unavailable git binary/non-repository checkout must not stop the
		// manifest from being generated.
		return null;
	}
};

/**
 * @param {string} repoRoot
 * @returns {boolean | null}
 */
const readDirty = (repoRoot) => {
	try {
		return (
			execFileSync("git", ["status", "--porcelain"], {
				cwd: repoRoot,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			}).trim().length > 0
		);
	} catch {
		return null;
	}
};

const reportLabel = (repoRoot, reportPath) => {
	const normalized = normalizeAttachmentPath(repoRoot, reportPath);
	if (normalized.path !== null) return normalized.path;
	const basename = (
		WINDOWS_ABSOLUTE_PATH.test(reportPath)
			? path.win32.basename(reportPath)
			: path.basename(reportPath)
	).slice(0, 200);
	return basename.length > 0 ? basename : "external-report";
};

const main = () => {
	const args = process.argv.slice(2);
	const reportPath = args.find((arg) => !arg.startsWith("--")) ?? DEFAULT_REPORT_PATH;
	const repoRoot = process.cwd();

	const runContext = {
		repoRoot,
		readAttachmentText: createRepoAttachmentReader(repoRoot),
		defaultViewport: DEFAULT_VIEWPORT,
		commit: readCommit(repoRoot),
		dirty: readDirty(repoRoot),
		platform: os.platform(),
		generatedAt: new Date().toISOString(),
	};

	// Only reading and parsing the report itself is guarded: a fault inside buildManifest or its
	// helpers is this script's bug, and reporting it as an unusable report would blame the file for
	// a code fault instead.
	const label = reportLabel(repoRoot, reportPath);
	let rawReport;
	try {
		rawReport = readFileSync(reportPath, "utf8");
	} catch {
		const manifest = buildUnavailableManifest(
			runContext,
			`Playwright report "${label}" could not be read`,
		);
		mkdirSync(path.dirname(DEFAULT_MANIFEST_PATH), { recursive: true });
		writeFileSync(DEFAULT_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
		return;
	}
	let report;
	try {
		report = JSON.parse(rawReport);
	} catch {
		const manifest = buildUnavailableManifest(
			runContext,
			`Playwright report "${label}" is not valid JSON`,
		);
		mkdirSync(path.dirname(DEFAULT_MANIFEST_PATH), { recursive: true });
		writeFileSync(DEFAULT_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
		return;
	}
	if (!isUsableReport(report)) {
		const manifest = buildUnavailableManifest(
			runContext,
			`Playwright report "${label}" has no suites array`,
		);
		mkdirSync(path.dirname(DEFAULT_MANIFEST_PATH), { recursive: true });
		writeFileSync(DEFAULT_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
		return;
	}

	const manifest = buildManifest(report, runContext);
	mkdirSync(path.dirname(DEFAULT_MANIFEST_PATH), { recursive: true });
	writeFileSync(DEFAULT_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
