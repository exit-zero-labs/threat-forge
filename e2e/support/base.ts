import { writeFile } from "node:fs/promises";
import { test as base, type ConsoleMessage, type Page, type Request } from "@playwright/test";
import { projectAccessibilityEvidence, scanAccessibility } from "./accessibility";

/**
 * Failure-aware Playwright base (issue #65, D4).
 *
 * Every spec built on {@link failureAwareTest} fails if the page emits a `console.error`,
 * `console.warning`, `pageerror` (uncaught exception/unhandled rejection), or `requestfailed`
 * event that is not explicitly allowlisted. The violation policy ignores `console.log`/`info`/
 * `debug`, while the independent bounded diagnostic transcript records every level.
 *
 * The default allowlist is empty. A test that deliberately triggers a fully understood, safe
 * condition (the one production `console.warn` in `reportWriteFailure`) opts in narrowly with
 * `test.use({ allowedBrowserEvents: [{ channel, pattern }] })`, scoped to that test or describe
 * block — never by widening this file's default or allowing the same message on another channel.
 */

/** One disallowed console/pageerror/requestfailed event captured for a test. */
interface FailurePolicyViolation {
	channel: "console.error" | "console.warning" | "pageerror" | "requestfailed";
	message: string;
}

interface AllowedBrowserEvent {
	channel: FailurePolicyViolation["channel"];
	pattern: RegExp;
}

/** Render the aggregated diagnostic so a reader can see every offending channel and message. */
function formatViolations(violations: readonly FailurePolicyViolation[]): string {
	const lines = violations.map(
		(violation, index) => `  ${index + 1}. [${violation.channel}] ${violation.message}`,
	);
	return [
		`${violations.length} disallowed console/page/network event(s) were captured during this test:`,
		...lines,
		"Fix the source, or — only for a fully understood, deliberately-triggered condition — add a",
		"channel-scoped, anchored test.use({ allowedBrowserEvents: [...] }) exception.",
	].join("\n");
}

/** Render a failed network request as a stable, greppable string. */
function describeRequestFailure(request: Request): string {
	return `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "failed"}`;
}

/**
 * Bounded, best-effort console transcript (issue #66, D3). Every message the page emits (`log`,
 * `info`, `debug`, `warning`, `error`) is rendered and appended as it arrives; the transcript never
 * grows past 300 lines or 20,000 characters. A single oversized message/location is truncated
 * against the remaining budget at collection time so it cannot itself blow past the bound in one
 * shot, and once the rolling window is full the oldest lines are evicted to admit newer ones —
 * `droppedEntries` counts every eviction so the rendered transcript can say so explicitly.
 */
const CONSOLE_TRANSCRIPT_MAX_ENTRIES = 300;
const CONSOLE_TRANSCRIPT_MAX_CHARS = 20_000;
const CONSOLE_LOCATION_MAX_CHARS = 1_000;

/** Strip query and fragment from a URL for transcript/attachment privacy (D3/D4). */
export function stripQueryAndFragment(url: string): string {
	const queryIndex = url.indexOf("?");
	const fragmentIndex = url.indexOf("#");
	const cutIndex = [queryIndex, fragmentIndex]
		.filter((index) => index >= 0)
		.sort((a, b) => a - b)[0];
	return cutIndex === undefined ? url : url.slice(0, cutIndex);
}

export class BoundedConsoleTranscript {
	private readonly lines: string[] = [];
	droppedEntries = 0;
	truncatedMessages = 0;

	private bodyLength(): number {
		return (
			this.lines.reduce((total, line) => total + line.length, 0) +
			Math.max(0, this.lines.length - 1)
		);
	}

	add(
		type: string,
		text: string,
		location: { url: string; lineNumber: number; columnNumber: number },
	): void {
		const url = stripQueryAndFragment(location.url).slice(0, CONSOLE_LOCATION_MAX_CHARS);
		const prefix = `[${type}] `;
		const suffix = ` (${url}:${location.lineNumber}:${location.columnNumber})`;
		const textBudget = Math.max(
			0,
			CONSOLE_TRANSCRIPT_MAX_CHARS - prefix.length - suffix.length - 1,
		);
		const isTruncated = text.length > textBudget;
		if (isTruncated) this.truncatedMessages += 1;
		const line = `${prefix}${text.slice(0, textBudget)}${isTruncated ? "…" : ""}${suffix}`;

		this.lines.push(line);

		while (
			this.lines.length > CONSOLE_TRANSCRIPT_MAX_ENTRIES ||
			(this.bodyLength() > CONSOLE_TRANSCRIPT_MAX_CHARS && this.lines.length > 1)
		) {
			this.lines.shift();
			this.droppedEntries += 1;
		}
	}

	render(): string {
		const headers: string[] = [];
		if (this.droppedEntries > 0) {
			headers.push(`… ${this.droppedEntries} earlier entries truncated`);
		}
		if (this.truncatedMessages > 0) {
			headers.push(`… ${this.truncatedMessages} oversized messages truncated`);
		}
		const header = headers.join("\n");
		const separator = header.length > 0 && this.lines.length > 0 ? "\n" : "";
		const bodyBudget = Math.max(0, CONSOLE_TRANSCRIPT_MAX_CHARS - header.length - separator.length);
		const body = this.lines.join("\n");
		return `${header}${separator}${bodyBudget === 0 ? "" : body.slice(-bodyBudget)}`;
	}
}

const ACCESSIBILITY_SCAN_TIMEOUT_MS = 5000;

/** Capture diagnostics for any non-pass, expected-status mismatch, or pending browser violation. */
export function shouldCaptureDiagnostics(
	status: string | undefined,
	expectedStatus: string,
	violationCount: number,
): boolean {
	return status !== "passed" || status !== expectedStatus || violationCount > 0;
}

/**
 * Tier-1 best-effort accessibility scan (D4), bounded so a slow/stuck axe run never meaningfully
 * lengthens a failing attempt's teardown. `Promise.race` does not cancel the underlying scan, so a
 * no-op rejection handler is attached to the original promise before racing it — this consumes a
 * later page-close rejection that would otherwise surface as an unhandled promise rejection once
 * the timeout has already won the race.
 */
async function scanAccessibilityBounded(page: Page): ReturnType<typeof scanAccessibility> {
	const scanPromise = scanAccessibility(page);
	scanPromise.catch(() => {});

	let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<never>((_resolve, reject) => {
		timeoutHandle = setTimeout(() => {
			reject(new Error(`accessibility scan timed out after ${ACCESSIBILITY_SCAN_TIMEOUT_MS}ms`));
		}, ACCESSIBILITY_SCAN_TIMEOUT_MS);
	});

	try {
		return await Promise.race([scanPromise, timeoutPromise]);
	} finally {
		clearTimeout(timeoutHandle);
	}
}

/** Cap a diagnostic-capture error message at 2,000 characters with no stack trace (D3). */
function boundedDiagnosticErrorMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.slice(0, 2000);
}

export const failureAwareTest = base.extend<{
	allowedBrowserEvents: AllowedBrowserEvent[];
}>({
	allowedBrowserEvents: [[], { option: true }],
	page: async ({ page, allowedBrowserEvents }, use, testInfo) => {
		const violations: FailurePolicyViolation[] = [];
		const isAllowed = (violation: FailurePolicyViolation) =>
			allowedBrowserEvents.some(({ channel, pattern }) => {
				if (channel !== violation.channel) return false;
				pattern.lastIndex = 0;
				return pattern.test(violation.message);
			});
		const record = (violation: FailurePolicyViolation) => {
			if (!isAllowed(violation)) violations.push(violation);
		};

		const onConsole = (msg: ConsoleMessage) => {
			const type = msg.type();
			if (type !== "error" && type !== "warning") return;
			record({
				channel: type === "error" ? "console.error" : "console.warning",
				message: msg.text(),
			});
		};

		const onPageError = (error: Error) => {
			record({ channel: "pageerror", message: error.message });
		};

		const onRequestFailed = (request: Request) => {
			record({ channel: "requestfailed", message: describeRequestFailure(request) });
		};

		// Second, independent console listener (D3): records every message type into the bounded
		// transcript. This is diagnostic-only and never feeds the violation policy above.
		const consoleTranscript = new BoundedConsoleTranscript();
		const onConsoleTranscript = (msg: ConsoleMessage) => {
			consoleTranscript.add(msg.type(), msg.text(), msg.location());
		};

		page.on("console", onConsole);
		page.on("console", onConsoleTranscript);
		page.on("pageerror", onPageError);
		page.on("requestfailed", onRequestFailed);

		await use(page);

		page.off("console", onConsole);
		page.off("console", onConsoleTranscript);
		page.off("pageerror", onPageError);
		page.off("requestfailed", onRequestFailed);

		// Authoritative per-attempt runtime viewport context (D3.1): unconditional, every attempt.
		// A write/attach failure here is a real manifest-contract failure and is allowed to fail the
		// test — it is deliberately not wrapped in the diagnostic-capture-error fallback below.
		const artifactContextPath = testInfo.outputPath("artifact-context.json");
		await writeFile(
			artifactContextPath,
			JSON.stringify({ schemaVersion: 1, viewport: page.viewportSize() }),
		);
		await testInfo.attach("artifact-context", {
			path: artifactContextPath,
			contentType: "application/json",
		});

		const shouldCapture = shouldCaptureDiagnostics(
			testInfo.status,
			testInfo.expectedStatus,
			violations.length,
		);
		if (shouldCapture) {
			const diagnosticErrors: { stage: string; message: string }[] = [];

			try {
				const consoleLogPath = testInfo.outputPath("console-log.txt");
				await writeFile(consoleLogPath, consoleTranscript.render());
				await testInfo.attach("console-log", { path: consoleLogPath, contentType: "text/plain" });
			} catch (error) {
				diagnosticErrors.push({
					stage: "console-log",
					message: boundedDiagnosticErrorMessage(error),
				});
			}

			try {
				const result = await scanAccessibilityBounded(page);
				const accessibilityPath = testInfo.outputPath("accessibility.json");
				await writeFile(accessibilityPath, JSON.stringify(projectAccessibilityEvidence(result)));
				await testInfo.attach("accessibility", {
					path: accessibilityPath,
					contentType: "application/json",
				});
			} catch (error) {
				diagnosticErrors.push({
					stage: "accessibility",
					message: boundedDiagnosticErrorMessage(error),
				});
			}

			if (diagnosticErrors.length > 0) {
				try {
					const rendered = diagnosticErrors
						.map((entry) => `[${entry.stage}] ${entry.message}`)
						.join("\n");
					const diagnosticErrorPath = testInfo.outputPath("diagnostic-capture-error.txt");
					await writeFile(diagnosticErrorPath, rendered);
					await testInfo.attach("diagnostic-capture-error", {
						path: diagnosticErrorPath,
						contentType: "text/plain",
					});
				} catch {
					// No further attachment path exists once this final write itself fails; keep the
					// original test outcome authoritative and never mask it with a secondary error.
					console.error("Failed to attach E2E diagnostic capture errors");
				}
			}
		}

		if (violations.length > 0) {
			throw new Error(formatViolations(violations));
		}
	},
});

export { expect } from "@playwright/test";

/** Fixed instant used by every versioned workspace fixture. */
export const DETERMINISTIC_FIXTURE_TIME = "2026-01-01T00:00:00.000Z";

/**
 * Anchor the page clock to a fixed instant (D3). `Date.now()`/`new Date()` become deterministic
 * without freezing timers or `requestAnimationFrame` — real interaction timing (React state
 * commits, debounce timers) continues to work normally. Every versioned workspace seed calls this
 * before `page.goto`: even an otherwise-empty document records model/session/manifest timestamps,
 * so selectively fixing only template dates would leave fixture state nondeterministic.
 */
export async function installDeterministicClock(
	page: Page,
	iso = DETERMINISTIC_FIXTURE_TIME,
): Promise<void> {
	await page.clock.install({ time: new Date(iso) });
}
