// @vitest-environment node
//
// This is a Node script, not a DOM module. Pinning the environment keeps the scripts lane
// independent of the app's jsdom setup (mirrors `summarize-playwright.test.mjs`).
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	buildAttachmentEntry,
	buildManifest,
	buildUnavailableManifest,
	classifyAttachment,
	classifyStep,
	flattenSteps,
	INTERACTION_STEP_PREFIXES,
	normalizeAttachmentPath,
	resolveViewportContext,
} from "./build-artifact-manifest.mjs";

const scriptPath = join(import.meta.dirname, "build-artifact-manifest.mjs");

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

/** A context object with sane defaults, overridable per test. */
const makeContext = (overrides = {}) => ({
	repoRoot: "/repo",
	readAttachmentText: () => {
		throw new Error("no reader configured for this test");
	},
	defaultViewport: DEFAULT_VIEWPORT,
	commit: "abc123",
	dirty: false,
	platform: "darwin",
	generatedAt: "2026-07-25T00:00:00.000Z",
	...overrides,
});

describe("classifyStep", () => {
	it("classifies a seed: step as a fixture", () => {
		expect(classifyStep("seed:empty@v1")).toBe("fixture");
	});

	it("classifies each canonical interaction prefix as an interaction", () => {
		const expectedPrefixes = [
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
		expect(INTERACTION_STEP_PREFIXES).toEqual(expectedPrefixes);
		for (const prefix of expectedPrefixes) {
			expect(classifyStep(`${prefix} representative step`), prefix).toBe("interaction");
		}
	});

	it("classifies unrecognized explicit test.step titles as other", () => {
		expect(classifyStep("custom audit step")).toBe("other");
		expect(classifyStep("assertNoSeriousAccessibilityViolations: audit current page")).toBe(
			"other",
		);
	});
});

describe("flattenSteps", () => {
	it("flattens a nested step tree in document order, parent before children", () => {
		const steps = [
			{
				title: "seed:empty@v1",
				duration: 100,
				steps: [{ title: "expect.toBeVisible", duration: 10 }],
			},
			{ title: "openDocument: open foo.thf via the Open dialog", duration: 50 },
		];

		expect(flattenSteps(steps)).toEqual([
			{ title: "seed:empty@v1", kind: "fixture", durationMs: 100, failed: false },
			{ title: "expect.toBeVisible", kind: "other", durationMs: 10, failed: false },
			{
				title: "openDocument: open foo.thf via the Open dialog",
				kind: "interaction",
				durationMs: 50,
				failed: false,
			},
		]);
	});

	it("marks a step failed only when it carries an error", () => {
		const steps = [{ title: "expect.toBeVisible", duration: 5, error: { message: "boom" } }];
		expect(flattenSteps(steps)[0].failed).toBe(true);
	});

	it("tolerates a non-array/malformed steps field instead of throwing", () => {
		expect(flattenSteps(undefined)).toEqual([]);
		expect(flattenSteps([null, 42, { title: "ok", duration: 1 }])).toEqual([
			{ title: "ok", kind: "other", durationMs: 1, failed: false },
		]);
	});
});

describe("classifyAttachment", () => {
	it("classifies each exact-name producer from the confirmed table", () => {
		expect(classifyAttachment("trace", "application/zip")).toBe("trace");
		expect(classifyAttachment("video", "video/webm")).toBe("video");
		expect(classifyAttachment("error-context", "text/markdown")).toBe("dom-snapshot");
		expect(classifyAttachment("artifact-context", "application/json")).toBe("context");
		expect(classifyAttachment("console-log", "text/plain")).toBe("console-log");
		expect(classifyAttachment("accessibility", "application/json")).toBe("accessibility");
		expect(classifyAttachment("diagnostic-capture-error", "text/plain")).toBe(
			"diagnostic-capture-error",
		);
	});

	it("classifies the toHaveScreenshot() diff triad by suffix", () => {
		expect(
			classifyAttachment("canvas-single-element-chromium-darwin-expected.png", "image/png"),
		).toBe("visual-baseline-diff");
		expect(
			classifyAttachment("canvas-single-element-chromium-darwin-actual.png", "image/png"),
		).toBe("visual-baseline-diff");
		expect(classifyAttachment("canvas-single-element-chromium-darwin-diff.png", "image/png")).toBe(
			"visual-baseline-diff",
		);
	});

	it("falls back to screenshot for any other image/* attachment, regardless of name", () => {
		expect(classifyAttachment("screenshot", "image/png")).toBe("screenshot");
		expect(classifyAttachment("screenshot-2", "image/png")).toBe("screenshot");
		expect(classifyAttachment("empty-state", "image/png")).toBe("screenshot");
		expect(classifyAttachment("template-ecommerce-platform", "image/png")).toBe("screenshot");
	});

	it("classifies anything unrecognized as other", () => {
		expect(classifyAttachment("some-third-party-thing", "application/octet-stream")).toBe("other");
	});
});

describe("normalizeAttachmentPath", () => {
	it("normalizes a plain relative path under the repo root", () => {
		expect(normalizeAttachmentPath("/repo", "test-results/foo/trace.zip")).toEqual({
			path: "test-results/foo/trace.zip",
		});
	});

	it("normalizes a POSIX absolute path that stays inside the repo root", () => {
		expect(normalizeAttachmentPath("/repo", "/repo/test-results/foo/trace.zip")).toEqual({
			path: "test-results/foo/trace.zip",
		});
	});

	it("rejects a POSIX absolute path outside the repo root via traversal", () => {
		expect(normalizeAttachmentPath("/repo", "../../etc/passwd")).toEqual({
			path: null,
			externalPathOmitted: true,
		});
	});

	it("accepts a contained POSIX name whose first segment starts with two dots", () => {
		expect(normalizeAttachmentPath("/repo", "/repo/..artifacts/trace.zip")).toEqual({
			path: "..artifacts/trace.zip",
		});
	});

	it("rejects a POSIX absolute path entirely outside the repo root", () => {
		expect(normalizeAttachmentPath("/repo", "/etc/passwd")).toEqual({
			path: null,
			externalPathOmitted: true,
		});
	});

	it("rejects a Windows drive-letter absolute path even on a POSIX host", () => {
		expect(normalizeAttachmentPath("/repo", "C:\\Users\\ci\\test-results\\trace.zip")).toEqual({
			path: null,
			externalPathOmitted: true,
		});
	});

	it("normalizes a Windows absolute path that stays inside a Windows repository root", () => {
		expect(
			normalizeAttachmentPath("C:\\repo", "C:\\repo\\test-results\\attempt\\artifact-context.json"),
		).toEqual({
			path: "test-results/attempt/artifact-context.json",
		});
	});

	it("accepts a contained Windows name whose first segment starts with two dots", () => {
		expect(normalizeAttachmentPath("C:\\repo", "C:\\repo\\..artifacts\\trace.zip")).toEqual({
			path: "..artifacts/trace.zip",
		});
	});

	it("rejects a Windows absolute path outside a Windows repository root", () => {
		expect(normalizeAttachmentPath("C:\\repo", "D:\\outside\\test-results\\trace.zip")).toEqual({
			path: null,
			externalPathOmitted: true,
		});
	});

	it("rejects a Windows UNC path", () => {
		expect(normalizeAttachmentPath("/repo", "\\\\server\\share\\trace.zip")).toEqual({
			path: null,
			externalPathOmitted: true,
		});
	});

	it("rejects the repo root itself (empty relative path) as not a real attachment", () => {
		expect(normalizeAttachmentPath("/repo", "/repo")).toEqual({
			path: null,
			externalPathOmitted: true,
		});
	});
});

describe("buildAttachmentEntry", () => {
	it("marks a body-only attachment inline and computes byteLength from the base64 body", () => {
		const body = Buffer.from("hello world").toString("base64");
		const entry = buildAttachmentEntry(
			{ name: "some-third-party-thing", contentType: "application/octet-stream", body },
			"/repo",
		);
		expect(entry).toEqual({
			name: "some-third-party-thing",
			kind: "other",
			contentType: "application/octet-stream",
			path: null,
			inline: true,
			byteLength: Buffer.byteLength(body, "base64"),
			externalPathOmitted: false,
			fileUnavailable: false,
		});
	});

	it("normalizes a path-backed attachment's path and never marks it inline", () => {
		const entry = buildAttachmentEntry(
			{ name: "trace", contentType: "application/zip", path: "/repo/test-results/x/trace.zip" },
			"/repo",
		);
		expect(entry.inline).toBe(false);
		expect(entry.externalPathOmitted).toBe(false);
		expect(entry.fileUnavailable).toBe(true);
		expect(entry.path).toBe("test-results/x/trace.zip");
		expect(entry.kind).toBe("trace");
	});

	it("emits path: null without externalPathOmitted leaking through for an attachment with neither", () => {
		const entry = buildAttachmentEntry({ name: "trace", contentType: "application/zip" }, "/repo");
		expect(entry).toEqual({
			name: "trace",
			kind: "trace",
			contentType: "application/zip",
			path: null,
			inline: false,
			byteLength: null,
			externalPathOmitted: false,
			fileUnavailable: false,
		});
	});

	it("emits path: null for a path that resolves outside the repository", () => {
		const entry = buildAttachmentEntry(
			{ name: "trace", contentType: "application/zip", path: "/etc/passwd" },
			"/repo",
		);
		expect(entry.path).toBeNull();
		expect(entry.inline).toBe(false);
		expect(entry.externalPathOmitted).toBe(true);
		expect(entry.fileUnavailable).toBe(false);
	});

	it("records a real byteLength for a path-backed attachment that exists on disk", () => {
		const workDir = mkdtempSync(join(tmpdir(), "build-artifact-manifest-attachment-"));
		try {
			writeFileSync(join(workDir, "trace.zip"), "0123456789");
			const entry = buildAttachmentEntry(
				{ name: "trace", contentType: "application/zip", path: "trace.zip" },
				workDir,
			);
			expect(entry.byteLength).toBe(10);
			expect(entry.fileUnavailable).toBe(false);
		} finally {
			rmSync(workDir, { recursive: true, force: true });
		}
	});

	it("records byteLength: null (not a thrown error) for a path-backed attachment missing on disk", () => {
		const entry = buildAttachmentEntry(
			{ name: "trace", contentType: "application/zip", path: "test-results/nowhere/trace.zip" },
			"/repo",
		);
		expect(entry.byteLength).toBeNull();
		expect(entry.fileUnavailable).toBe(true);
	});

	it.skipIf(process.platform === "win32")(
		"omits a repository symlink whose real attachment path escapes the repository",
		() => {
			const repoDir = mkdtempSync(join(tmpdir(), "build-artifact-manifest-repo-"));
			const outsideDir = mkdtempSync(join(tmpdir(), "build-artifact-manifest-outside-"));
			try {
				const outsideFile = join(outsideDir, "secret.txt");
				writeFileSync(outsideFile, "do not expose");
				symlinkSync(outsideFile, join(repoDir, "escape.txt"));
				const entry = buildAttachmentEntry(
					{ name: "artifact-context", contentType: "application/json", path: "escape.txt" },
					repoDir,
				);
				expect(entry.path).toBeNull();
				expect(entry.externalPathOmitted).toBe(true);
				expect(entry.fileUnavailable).toBe(false);
				expect(JSON.stringify(entry)).not.toContain(outsideDir);
			} finally {
				rmSync(repoDir, { recursive: true, force: true });
				rmSync(outsideDir, { recursive: true, force: true });
			}
		},
	);
});

describe("resolveViewportContext", () => {
	it("falls back to the project default when no artifact-context attachment exists for the known project", () => {
		expect(resolveViewportContext([], "chromium", makeContext())).toEqual({
			viewport: DEFAULT_VIEWPORT,
			viewportSource: "project-default",
			artifactErrors: [],
		});
	});

	it("emits viewport: null, unavailable for an absent attachment on an unrecognized project", () => {
		expect(resolveViewportContext([], "webkit", makeContext())).toEqual({
			viewport: null,
			viewportSource: "unavailable",
			artifactErrors: [],
		});
	});

	it("reads the real runtime viewport from a valid path-backed artifact-context attachment", () => {
		const attachments = [
			{ name: "artifact-context", contentType: "application/json", path: "context.json" },
		];
		const context = makeContext({
			readAttachmentText: (safeRelativePath) => {
				expect(safeRelativePath).toBe("context.json");
				return JSON.stringify({ schemaVersion: 1, viewport: { width: 900, height: 700 } });
			},
		});
		expect(resolveViewportContext(attachments, "chromium", context)).toEqual({
			viewport: { width: 900, height: 700 },
			viewportSource: "runtime-attachment",
			artifactErrors: [],
		});
	});

	it("reads a body-only (inline) artifact-context attachment without calling the path reader", () => {
		const body = Buffer.from(
			JSON.stringify({ schemaVersion: 1, viewport: { width: 1024, height: 768 } }),
		).toString("base64");
		const attachments = [{ name: "artifact-context", contentType: "application/json", body }];
		expect(resolveViewportContext(attachments, "chromium", makeContext())).toEqual({
			viewport: { width: 1024, height: 768 },
			viewportSource: "runtime-attachment",
			artifactErrors: [],
		});
	});

	it("records an artifactError instead of falling back to the default when the path is outside the repo", () => {
		const attachments = [
			{ name: "artifact-context", contentType: "application/json", path: "/etc/context.json" },
		];
		const result = resolveViewportContext(attachments, "chromium", makeContext());
		expect(result.viewport).toBeNull();
		expect(result.viewportSource).toBe("unavailable");
		expect(result.artifactErrors).toEqual([
			{
				name: "artifact-context",
				reason: "artifact-context attachment path is outside the repository",
			},
		]);
	});

	it("records an artifactError when the reader throws (missing/unreadable file)", () => {
		const attachments = [
			{ name: "artifact-context", contentType: "application/json", path: "context.json" },
		];
		const context = makeContext({
			readAttachmentText: () => {
				throw new Error("ENOENT: no such file or directory");
			},
		});
		const result = resolveViewportContext(attachments, "chromium", context);
		expect(result.viewport).toBeNull();
		expect(result.viewportSource).toBe("unavailable");
		expect(result.artifactErrors).toEqual([
			{ name: "artifact-context", reason: "artifact-context attachment could not be read" },
		]);
	});

	it("records an artifactError for malformed JSON instead of the project default", () => {
		const attachments = [
			{ name: "artifact-context", contentType: "application/json", path: "context.json" },
		];
		const context = makeContext({ readAttachmentText: () => "{ not json" });
		const result = resolveViewportContext(attachments, "chromium", context);
		expect(result.viewport).toBeNull();
		expect(result.viewportSource).toBe("unavailable");
		expect(result.artifactErrors[0].name).toBe("artifact-context");
		expect(result.artifactErrors[0].reason).toBe("artifact-context is not valid JSON");
	});

	it("records an artifactError for a present-but-shapeless attachment (no viewport field)", () => {
		const attachments = [
			{ name: "artifact-context", contentType: "application/json", path: "context.json" },
		];
		const context = makeContext({ readAttachmentText: () => JSON.stringify({ schemaVersion: 1 }) });
		const result = resolveViewportContext(attachments, "chromium", context);
		expect(result.viewport).toBeNull();
		expect(result.viewportSource).toBe("unavailable");
		expect(result.artifactErrors[0].reason).toContain("usable");
	});

	it("rejects an unsupported artifact-context schema version", () => {
		const attachments = [
			{ name: "artifact-context", contentType: "application/json", path: "context.json" },
		];
		const context = makeContext({
			readAttachmentText: () =>
				JSON.stringify({ schemaVersion: 2, viewport: { width: 900, height: 700 } }),
		});
		const result = resolveViewportContext(attachments, "chromium", context);
		expect(result.viewport).toBeNull();
		expect(result.artifactErrors[0].reason).toContain("schemaVersion 1");
	});

	it("records an artifactError for an artifact-context attachment with neither path nor body", () => {
		const attachments = [{ name: "artifact-context", contentType: "application/json" }];
		const result = resolveViewportContext(attachments, "chromium", makeContext());
		expect(result.viewport).toBeNull();
		expect(result.artifactErrors[0].reason).toContain("neither a path nor a body");
	});

	it("rejects duplicate artifact-context attachments instead of choosing one silently", () => {
		const attachments = [
			{ name: "artifact-context", contentType: "application/json", path: "first.json" },
			{ name: "artifact-context", contentType: "application/json", path: "second.json" },
		];
		const result = resolveViewportContext(attachments, "chromium", makeContext());
		expect(result.viewport).toBeNull();
		expect(result.artifactErrors[0].reason).toContain("multiple artifact-context");
	});

	for (const viewport of [
		{ width: 0, height: 700 },
		{ width: Number.NaN, height: 700 },
		{ width: 900.5, height: 700 },
	]) {
		it(`rejects invalid viewport ${JSON.stringify(viewport)}`, () => {
			const attachments = [
				{ name: "artifact-context", contentType: "application/json", path: "context.json" },
			];
			const context = makeContext({
				readAttachmentText: () => JSON.stringify({ schemaVersion: 1, viewport }),
			});
			const result = resolveViewportContext(attachments, "chromium", context);
			expect(result.viewport).toBeNull();
			expect(result.artifactErrors[0].reason).toContain("usable");
		});
	}
});

describe("buildManifest", () => {
	/**
	 * @param {string} title
	 * @param {string} file
	 * @param {number} line
	 * @param {string} status
	 * @param {unknown[]} results
	 */
	const spec = (title, file, line, status, results) => ({
		title,
		file,
		line,
		tests: [{ status, projectName: "chromium", results }],
	});

	it("rejects a syntactically valid report without a suites array", () => {
		expect(() => buildManifest(null, makeContext())).toThrow("suites array");
		expect(() => buildManifest({}, makeContext())).toThrow("suites array");
	});

	it("accepts a legitimate empty suites array", () => {
		const manifest = buildManifest({ suites: [] }, makeContext());
		expect(manifest.entries).toEqual([]);
		expect(manifest.schemaVersion).toBe(1);
	});

	it("carries the describe trail, location, and per-attempt fields through for a nested suite", () => {
		const report = {
			suites: [
				{
					title: "accessibility-audit.spec.ts",
					file: "accessibility-audit.spec.ts",
					specs: [],
					suites: [
						{
							title: "Accessibility audit",
							specs: [
								spec(
									"pre-model welcome screen has no unexcepted serious/critical violations",
									"accessibility-audit.spec.ts",
									23,
									"expected",
									[
										{
											status: "passed",
											retry: 0,
											duration: 250,
											startTime: "2026-07-25T00:00:00.000Z",
											steps: [],
											attachments: [],
										},
									],
								),
							],
						},
					],
				},
			],
		};

		const manifest = buildManifest(report, makeContext());
		expect(manifest.entries).toHaveLength(1);
		expect(manifest.entries[0]).toMatchObject({
			scenario:
				"Accessibility audit > pre-model welcome screen has no unexcepted serious/critical violations",
			location: "accessibility-audit.spec.ts:23",
			project: "chromium",
			status: "expected",
			attempt: { retry: 0, status: "passed", durationMs: 250 },
			viewport: DEFAULT_VIEWPORT,
			viewportSource: "project-default",
			commit: "abc123",
			dirty: false,
			platform: "darwin",
		});
	});

	it("emits one entry per attempt for a retried (flaky) test", () => {
		const report = {
			suites: [
				{
					title: "x.spec.ts",
					file: "x.spec.ts",
					specs: [
						spec("flaky test", "x.spec.ts", 1, "flaky", [
							{ status: "failed", retry: 0, duration: 100, attachments: [] },
							{ status: "passed", retry: 1, duration: 90, attachments: [] },
						]),
					],
				},
			],
		};

		const manifest = buildManifest(report, makeContext());
		expect(manifest.entries).toHaveLength(2);
		expect(manifest.entries.map((entry) => entry.attempt.retry)).toEqual([0, 1]);
	});

	it("carries a path-backed runtime viewport through to its manifest entry", () => {
		const report = {
			suites: [
				{
					title: "accessibility-audit.spec.ts",
					file: "accessibility-audit.spec.ts",
					specs: [
						spec("responsive state", "accessibility-audit.spec.ts", 51, "expected", [
							{
								status: "passed",
								attachments: [
									{
										name: "artifact-context",
										contentType: "application/json",
										path: "test-results/context.json",
									},
								],
							},
						]),
					],
				},
			],
		};
		const manifest = buildManifest(
			report,
			makeContext({
				readAttachmentText: () =>
					JSON.stringify({ schemaVersion: 1, viewport: { width: 900, height: 700 } }),
			}),
		);

		expect(manifest.entries[0].viewport).toEqual({ width: 900, height: 700 });
		expect(manifest.entries[0].viewportSource).toBe("runtime-attachment");
		expect(manifest.entries[0].artifactErrors).toEqual([]);
	});

	it("propagates commit/dirty/platform from context onto every entry", () => {
		const report = {
			suites: [
				{
					title: "x.spec.ts",
					file: "x.spec.ts",
					specs: [spec("t", "x.spec.ts", 1, "expected", [{ status: "passed", attachments: [] }])],
				},
			],
		};

		const manifest = buildManifest(
			report,
			makeContext({ commit: "deadbeef", dirty: true, platform: "linux" }),
		);
		expect(manifest.commit).toBe("deadbeef");
		expect(manifest.dirty).toBe(true);
		expect(manifest.platform).toBe("linux");
		expect(manifest.entries[0].commit).toBe("deadbeef");
		expect(manifest.entries[0].dirty).toBe(true);
	});
});

describe("buildUnavailableManifest", () => {
	it("produces a valid v1 manifest with empty entries and a top-level error field", () => {
		const manifest = buildUnavailableManifest(makeContext(), "report not found");
		expect(manifest).toEqual({
			schemaVersion: 1,
			generatedAt: "2026-07-25T00:00:00.000Z",
			commit: "abc123",
			dirty: false,
			platform: "darwin",
			defaultViewport: DEFAULT_VIEWPORT,
			entries: [],
			error: "report not found",
		});
	});
});

describe("build-artifact-manifest CLI", () => {
	let workDir = "";

	beforeAll(() => {
		workDir = mkdtempSync(join(tmpdir(), "build-artifact-manifest-cli-"));
	});

	afterAll(() => {
		rmSync(workDir, { recursive: true, force: true });
	});

	const run = (args, env) => {
		const result = spawnSync(process.execPath, [scriptPath, ...args], {
			encoding: "utf8",
			cwd: workDir,
			env: { ...process.env, GITHUB_SHA: "", ...env },
		});
		expect(result.stderr).toBe("");
		expect(result.status).toBe(0);
		return result;
	};

	it("writes a real manifest with entries for a valid report", () => {
		const reportPath = join(workDir, "results.json");
		writeFileSync(
			reportPath,
			JSON.stringify({
				suites: [
					{
						title: "x.spec.ts",
						file: "x.spec.ts",
						specs: [
							{
								title: "t",
								file: "x.spec.ts",
								line: 1,
								tests: [
									{
										status: "expected",
										projectName: "chromium",
										results: [{ status: "passed", retry: 0, duration: 10, attachments: [] }],
									},
								],
							},
						],
					},
				],
			}),
		);

		run([reportPath]);

		const manifest = JSON.parse(
			readFileSync(join(workDir, "test-results/artifact-manifest.json"), "utf8"),
		);
		expect(manifest.schemaVersion).toBe(1);
		expect(manifest.entries).toHaveLength(1);
		expect(manifest.entries[0].scenario).toBe("t");
		expect(manifest.commit).toBeNull();
		expect(manifest.dirty).toBeNull();
		expect(manifest.error).toBeUndefined();
	});

	it("uses GITHUB_SHA for commit when set", () => {
		const reportPath = join(workDir, "results.json");
		writeFileSync(reportPath, JSON.stringify({ suites: [] }));

		run([reportPath], { GITHUB_SHA: "cafef00d" });

		const manifest = JSON.parse(
			readFileSync(join(workDir, "test-results/artifact-manifest.json"), "utf8"),
		);
		expect(manifest.commit).toBe("cafef00d");
	});

	it("still writes a valid v1 manifest and exits 0 when the report file is missing", () => {
		const absentPath = join(workDir, "absent.json");
		run([absentPath]);

		const manifest = JSON.parse(
			readFileSync(join(workDir, "test-results/artifact-manifest.json"), "utf8"),
		);
		expect(manifest.schemaVersion).toBe(1);
		expect(manifest.entries).toEqual([]);
		expect(manifest.error).toBe('Playwright report "absent.json" could not be read');
		expect(manifest.error).not.toContain(workDir);
	});

	for (const externalPath of [
		"C:\\Users\\SENTINEL_HOST\\results.json",
		"\\\\server\\SENTINEL_SHARE\\results.json",
	]) {
		it(`does not leak a cross-host report path: ${externalPath}`, () => {
			run([externalPath]);

			const manifest = JSON.parse(
				readFileSync(join(workDir, "test-results/artifact-manifest.json"), "utf8"),
			);
			expect(manifest.error).toBe('Playwright report "results.json" could not be read');
			expect(manifest.error).not.toContain("SENTINEL");
			expect(manifest.error).not.toContain("\\");
		});
	}

	it("still writes a valid v1 manifest and exits 0 when the report is malformed", () => {
		const reportPath = join(workDir, "malformed.json");
		writeFileSync(reportPath, "{ SENTINEL_SECRET not json");

		run([reportPath]);

		const manifest = JSON.parse(
			readFileSync(join(workDir, "test-results/artifact-manifest.json"), "utf8"),
		);
		expect(manifest.entries).toEqual([]);
		expect(manifest.error).toBe('Playwright report "malformed.json" is not valid JSON');
		expect(manifest.error).not.toContain("SENTINEL_SECRET");
		expect(manifest.error).not.toContain(workDir);
	});

	it("writes an unavailable manifest for valid JSON with no suites array", () => {
		const reportPath = join(workDir, "wrong-shape.json");
		writeFileSync(reportPath, JSON.stringify({ stats: {} }));

		run([reportPath]);

		const manifest = JSON.parse(
			readFileSync(join(workDir, "test-results/artifact-manifest.json"), "utf8"),
		);
		expect(manifest.entries).toEqual([]);
		expect(manifest.error).toBe('Playwright report "wrong-shape.json" has no suites array');
	});
});
