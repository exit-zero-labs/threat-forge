/**
 * Bounded, before-first-event retry for a streamed conversation turn.
 *
 * A BYOK turn is a paid round trip, so a transient failure — a `429`, a `5xx`,
 * or a dropped connection before the provider has said anything — is worth one
 * more attempt rather than an immediate error banner. Two constraints make that
 * safe:
 *
 *  1. **Only before the first protocol event of the turn has reached the
 *     consumer.** The retry lives in a transport decorator, so the earliest
 *     signal it can observe is the first frame it forwards to the client. A
 *     frame is at or before the first protocol event the client maps from it, so
 *     committing on the first forwarded frame is never later than "first protocol
 *     event": once any output could have reached the consumer, a replay would
 *     duplicate it, and the decorator refuses to retry. This is the exact reason
 *     the policy is a transport wrapper and not a store-level loop — the store
 *     has already rendered the partial turn by the time it would notice.
 *  2. **Only for failures a retry can fix.** A `429` or `5xx` and a below-HTTP
 *     `network` failure are transient; a `400`/`401`, a `malformedStream`, a
 *     `responseTooLarge`, and every up-front refusal (a missing key, a relay
 *     rejection — the failures `ChatTransport.open` rejects with) are not, and
 *     are surfaced on the first attempt.
 *
 * The decorator is transparent: it forwards exactly one terminal callback per
 * `open()`, the same contract a bare transport honors, so the client and the
 * chat store are unchanged by its presence.
 */

import type {
	ChatTransport,
	ProviderStreamRequest,
	TransportCallbacks,
	TransportFailureReason,
	TransportHttpError,
} from "@/lib/adapters/chat-adapter";

export interface RetryPolicy {
	/** Total attempts including the first. `1` disables retry entirely. */
	maxAttempts: number;
	/** First backoff wait; attempt N waits `baseDelayMs * 2^(N-1)`, capped by `maxDelayMs`. */
	baseDelayMs: number;
	/** Ceiling on a single computed backoff wait. A provider `retry-after` may exceed it. */
	maxDelayMs: number;
}

/**
 * Three attempts with exponential backoff. Conservative on purpose: a BYOK user
 * pays for every attempt, and the failures this retries are transient, so a
 * short bounded sequence recovers a blip without turning a genuine outage into a
 * long, expensive retry storm.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
	maxAttempts: 3,
	baseDelayMs: 500,
	maxDelayMs: 10_000,
};

/**
 * Whether an HTTP status is worth retrying: `429` (rate limited) and any `5xx`
 * (a server-side failure). A `4xx` other than `429` describes the request
 * itself — a bad body, a rejected key, a missing model — and re-sending it
 * unchanged would fail identically, so those are surfaced at once.
 */
export function isRetriableHttpStatus(status: number): boolean {
	return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Whether a below-HTTP failure is worth retrying. Only `network` is: the request
 * did not reach the provider or the connection dropped, which says nothing about
 * the request. A `malformedStream` is a framing or contract violation and a
 * `responseTooLarge` blew a fixed budget — replaying either reproduces it, so
 * neither retries. This mirrors the `TransportFailureReason` contract in
 * `src/lib/adapters/chat-adapter.ts`, which is the single source of that split.
 */
export function isRetriableTransportReason(reason: TransportFailureReason): boolean {
	return reason === "network";
}

/**
 * Absolute ceiling on a honored `retry-after`, so a hostile or misconfigured
 * provider cannot park a retry indefinitely. The transport already clamps the
 * hint, but this chokepoint does not rely on that un-enforced cross-module
 * invariant — it caps the value itself before honoring it.
 */
const MAX_RETRY_AFTER_MS = 10 * 60 * 1000;

/**
 * How long to wait before the retry that follows a given `attempt` (1-based: the
 * wait after the first attempt is computed with `attempt === 1`).
 *
 * A provider `retry-after` hint is honored when present — it is the provider's
 * explicit instruction — but only after being clamped to {@link MAX_RETRY_AFTER_MS},
 * and it is never shortened below the computed backoff. It may still exceed the
 * policy's `maxDelayMs`, since ignoring a legitimate hint would just earn another
 * `429`. Absent a hint, the wait is deterministic exponential backoff with no
 * jitter, so a test can assert the exact schedule.
 */
export function retryDelayMs(attempt: number, policy: RetryPolicy, retryAfterMs?: number): number {
	const backoff = Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs);
	if (retryAfterMs === undefined) return backoff;
	const boundedRetryAfter = Math.min(retryAfterMs, MAX_RETRY_AFTER_MS);
	// Respect the provider's (bounded) wait even when it exceeds `maxDelayMs`; but
	// never wait less than our own backoff.
	return Math.max(boundedRetryAfter, backoff);
}

/**
 * A cancellable sleep. Resolves after `ms`, or immediately once `signal` aborts
 * so the retry loop can turn the stop into a terminal cancellation without
 * waiting out the backoff.
 */
export type DelayFn = (ms: number, signal?: AbortSignal) => Promise<void>;

const realDelay: DelayFn = (ms, signal) =>
	new Promise((resolve) => {
		if (signal?.aborted) {
			resolve();
			return;
		}
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		function onAbort(): void {
			clearTimeout(timer);
			resolve();
		}
		signal?.addEventListener("abort", onAbort, { once: true });
	});

export interface RetryingTransportOptions {
	/**
	 * Injected so a test drives the backoff on a deterministic clock without real
	 * time or fake timers: a test's `delay` resolves at once and records the
	 * requested milliseconds. Defaults to a real, abort-aware `setTimeout`.
	 */
	delay?: DelayFn;
}

/** What one attempt against the inner transport resolved to, for the retry loop. */
interface HeldFailure {
	/** A provider `retry-after` hint, when the held failure was an HTTP error that carried one. */
	retryAfterMs: number | undefined;
}

/**
 * Wrap a transport so a transient, before-first-event failure is retried.
 *
 * The returned transport satisfies {@link ChatTransport} and is drop-in for the
 * platform transport it wraps: `src/lib/adapters/get-chat-transport.ts` wraps the
 * browser and desktop transports with it so both platforms retry identically,
 * and the protocol client drives it unaware that retry is happening.
 */
export function createRetryingTransport(
	inner: ChatTransport,
	policy: RetryPolicy = DEFAULT_RETRY_POLICY,
	options: RetryingTransportOptions = {},
): ChatTransport {
	const delay = options.delay ?? realDelay;

	return {
		async open(
			request: ProviderStreamRequest,
			callbacks: TransportCallbacks,
			signal?: AbortSignal,
		): Promise<void> {
			for (let attempt = 1; ; attempt += 1) {
				const canRetryAgain = attempt < policy.maxAttempts;
				// `undefined` means the attempt reached a terminal outcome that was
				// forwarded to the consumer; a value means it failed retriably before
				// any frame and the decorator held the failure back for a retry.
				let heldFailure: HeldFailure | undefined;
				let committed = false;

				const attemptCallbacks: TransportCallbacks = {
					onFrame: (frame) => {
						// The first forwarded frame commits the turn: any later failure can
						// only be surfaced, never retried, because the consumer may already
						// hold decoded output that a replay would duplicate.
						committed = true;
						callbacks.onFrame(frame);
					},
					onHttpError: (error: TransportHttpError) => {
						if (!committed && canRetryAgain && isRetriableHttpStatus(error.status)) {
							heldFailure = { retryAfterMs: error.retryAfterMs };
							return;
						}
						callbacks.onHttpError(error);
					},
					onTransportError: (failure) => {
						if (!committed && canRetryAgain && isRetriableTransportReason(failure.reason)) {
							heldFailure = { retryAfterMs: undefined };
							return;
						}
						callbacks.onTransportError(failure);
					},
					onClose: (reason) => {
						callbacks.onClose(reason);
					},
				};

				// A rejection is an up-front refusal the contract marks non-retriable, so
				// it propagates to the client unchanged rather than being caught here.
				await inner.open(request, attemptCallbacks, signal);

				if (heldFailure === undefined) return;

				// Held a retriable failure. A stop that arrived during the attempt or the
				// wait ends the turn as a cancellation instead of spending another attempt.
				if (signal?.aborted) {
					callbacks.onClose("cancelled");
					return;
				}
				await delay(retryDelayMs(attempt, policy, heldFailure.retryAfterMs), signal);
				if (signal?.aborted) {
					callbacks.onClose("cancelled");
					return;
				}
			}
		},
	};
}
