import { test as base, type ConsoleMessage, type Page, type Request } from "@playwright/test";

/**
 * Failure-aware Playwright base (issue #65, D4).
 *
 * Every spec built on {@link failureAwareTest} fails if the page emits a `console.error`,
 * `console.warning`, `pageerror` (uncaught exception/unhandled rejection), or `requestfailed`
 * event that is not explicitly allowlisted. `console.log`/`info`/`debug` are not observed at
 * all — ordinary Vite HMR and React DevTools chatter needs no exception because it never
 * reaches `warning` severity (measured directly against the running dev server; see the plan's
 * "Console/network noise baseline").
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

export const failureAwareTest = base.extend<{
	allowedBrowserEvents: AllowedBrowserEvent[];
}>({
	allowedBrowserEvents: [[], { option: true }],
	page: async ({ page, allowedBrowserEvents }, use) => {
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

		page.on("console", onConsole);
		page.on("pageerror", onPageError);
		page.on("requestfailed", onRequestFailed);

		await use(page);

		page.off("console", onConsole);
		page.off("pageerror", onPageError);
		page.off("requestfailed", onRequestFailed);

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
