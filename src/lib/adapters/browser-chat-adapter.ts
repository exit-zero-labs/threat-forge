import { ProtocolException, redactProviderDetail } from "@/lib/ai/protocol/errors";
import { createSseDecoder, type SseFrame } from "@/lib/ai/providers/sse";
import { userSafeProviderError } from "@/lib/ai-provider-errors";
import type { AiProvider } from "@/stores/chat-store";
import { BrowserKeychainAdapter } from "./browser-keychain-adapter";
import {
	type ChatTransport,
	missingApiKeyError,
	type ProviderStreamRequest,
	type TransportCallbacks,
} from "./chat-adapter";
import { providerEndpoint } from "./provider-endpoints";

/**
 * Total bytes one stream may decode before the transport fails closed. Mirrors
 * `MAX_STREAM_RESPONSE_BYTES` in `src-tauri/src/ai/providers.rs` so a hostile or
 * broken provider is bounded to the same fixed cost on both platforms. A maximal
 * legitimate response stays an order of magnitude under it.
 */
const MAX_STREAM_RESPONSE_BYTES = 50 * 1024 * 1024;

/**
 * How much of a non-success response body is read to source `providerDetail`.
 * Mirrors `MAX_ERROR_BODY_BYTES` in `src-tauri/src/ai/providers.rs`. The
 * retained detail is capped at 200 characters after redaction, so this bound
 * exists only to stop an unbounded read of provider-controlled bytes.
 */
const MAX_ERROR_BODY_BYTES = 16 * 1024;

/** Longest `retry-after` hint forwarded, mirroring `MAX_RETRY_AFTER_MS` in Rust. */
const MAX_RETRY_AFTER_MS = 10 * 60 * 1000;

/**
 * Longest silence tolerated between two chunks of a response body before the
 * stream fails closed. Mirrors the relay's `read_timeout` in
 * `src-tauri/src/ai/providers.rs`.
 *
 * A connection that is accepted and then goes silent leaves `reader.read()`
 * pending forever: no terminal callback fires, and `open()` never settles, so
 * the caller cannot report a failure or clear its pending state. The bound is
 * per-gap rather than per-request because a legitimate stream has no bounded
 * duration, and both providers send data or keep-alives well inside it.
 */
const READ_GAP_TIMEOUT_MS = 300 * 1000;

/**
 * Refuse to follow provider redirects.
 *
 * The fetch spec strips only `Authorization` when a redirect crosses origins,
 * so a 3xx from the provider would re-send Anthropic's `x-api-key` header to
 * whatever host the `Location` names. Neither streaming endpoint legitimately
 * redirects, so the request fails instead — matching the relay's
 * `Policy::none()` in `src-tauri/src/ai/providers.rs`.
 */
const NO_REDIRECT: RequestRedirect = "error";

/**
 * Browser chat transport — a direct `fetch` to the provider with the user's own
 * key, streaming the response through the shared SSE decoder.
 *
 * The desktop counterpart in `./tauri-chat-adapter.ts` relays the identical
 * frames from Rust, so everything downstream of `onFrame` is shared code.
 */
export class BrowserChatTransport implements ChatTransport {
	async open(
		request: ProviderStreamRequest,
		callbacks: TransportCallbacks,
		signal?: AbortSignal,
	): Promise<void> {
		// Check the stop before touching the key store, so an already-aborted
		// request resolves as a cancellation instead of first reporting a missing
		// key — the desktop transport checks its signal first for the same reason,
		// and the two platforms must fail an aborted open() the same way.
		if (signal?.aborted) {
			callbacks.onClose("cancelled");
			return;
		}

		const apiKey = await resolveBrowserApiKey(request.provider);
		const endpoint = providerEndpoint(request.provider);

		let response: Response;
		try {
			response = await fetch(endpoint.url, {
				method: "POST",
				headers: endpoint.buildHeaders(apiKey),
				body: JSON.stringify(request.body),
				redirect: NO_REDIRECT,
				signal,
			});
		} catch {
			// `fetch` rejects for an aborted request, for a refused redirect, and
			// for a connection failure alike, all with an opaque reason that names
			// no cause worth showing, so the signal is what tells a stop apart from
			// a failure.
			if (signal?.aborted) {
				callbacks.onClose("cancelled");
				return;
			}
			callbacks.onTransportError({
				message: `${endpoint.label} request failed: could not connect to the provider.`,
				reason: "network",
			});
			return;
		}

		if (!response.ok) {
			const providerDetail = providerDetailOf(await readCappedText(response));
			callbacks.onHttpError({
				status: response.status,
				message: userSafeProviderError(endpoint.label, response.status),
				...providerDetail,
				...retryAfterOf(response.headers),
			});
			return;
		}

		if (response.body === null) {
			callbacks.onTransportError({
				message: `${endpoint.label} request failed: the provider response could not be read.`,
				reason: "network",
			});
			return;
		}

		await streamResponseBody(response.body, endpoint.label, callbacks, signal);
	}
}

/**
 * Read the response body into frames until it ends, is cancelled, or violates a
 * bound, delivering exactly one terminal callback.
 */
async function streamResponseBody(
	body: ReadableStream<Uint8Array>,
	providerLabel: string,
	callbacks: TransportCallbacks,
	signal: AbortSignal | undefined,
): Promise<void> {
	const reader = body.getReader();
	const decoder = createSseDecoder();
	let decodedBytes = 0;
	let bodyEnded = false;

	// Cancelling the reader resolves a pending `read()` locally, so a stop is not
	// left waiting on a provider that has gone silent.
	const onAbort = (): void => {
		void reader.cancel().catch(() => undefined);
	};
	signal?.addEventListener("abort", onAbort, { once: true });

	try {
		for (;;) {
			let chunk: ReadableStreamReadResult<Uint8Array> | typeof READ_GAP_EXPIRED;
			try {
				chunk = await readWithinGapTimeout(reader);
			} catch {
				// An aborted `fetch` errors its body stream; the signal tells that
				// apart from a genuine mid-stream connection failure.
				if (signal?.aborted) {
					callbacks.onClose("cancelled");
					return;
				}
				callbacks.onTransportError({
					message: `${providerLabel} request failed: the provider response could not be read.`,
					reason: "network",
				});
				return;
			}

			if (chunk === READ_GAP_EXPIRED) {
				// Retriable like any other dropped connection: the provider accepted
				// the request and then stopped speaking, which says nothing about the
				// request itself.
				callbacks.onTransportError({
					message: `${providerLabel} request failed: the request timed out.`,
					reason: "network",
				});
				return;
			}

			if (signal?.aborted) {
				callbacks.onClose("cancelled");
				return;
			}
			if (chunk.done) break;

			decodedBytes += chunk.value.byteLength;
			if (decodedBytes > MAX_STREAM_RESPONSE_BYTES) {
				callbacks.onTransportError({
					message: "The provider response exceeded the streaming size limit.",
					reason: "responseTooLarge",
				});
				return;
			}

			let frames: SseFrame[];
			try {
				frames = decoder.decode(chunk.value);
			} catch (error) {
				// The decoder fails closed on a stream that never terminates a line.
				callbacks.onTransportError({
					message:
						error instanceof ProtocolException
							? error.error.message
							: `${providerLabel} request failed: the provider response could not be decoded.`,
					reason: "malformedStream",
				});
				return;
			}
			for (const frame of frames) {
				callbacks.onFrame(frame);
			}
		}

		bodyEnded = true;
		// Whether the frame sequence was protocol-complete is the mappers' call;
		// the transport only reports that the body ended.
		callbacks.onClose("done");
	} finally {
		signal?.removeEventListener("abort", onAbort);
		// Releasing the lock on a body that has not ended abandons it without
		// closing the underlying connection, which would leave a provider that
		// just blew the byte budget — or went silent — free to keep sending until
		// the stream is collected. Cancelling is what actually stops it.
		if (!bodyEnded) void reader.cancel().catch(() => undefined);
		reader.releaseLock();
	}
}

/** Resolved in place of a chunk when the provider went silent for too long. */
const READ_GAP_EXPIRED = Symbol("read-gap-expired");

/**
 * Read the next chunk, giving up if none arrives within
 * {@link READ_GAP_TIMEOUT_MS}.
 *
 * The losing promise is left to settle on its own: `Promise.race` has already
 * subscribed to the read, so a later rejection is never unhandled, and the
 * caller cancels the reader on this exit, which settles it.
 */
async function readWithinGapTimeout(
	reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ReadableStreamReadResult<Uint8Array> | typeof READ_GAP_EXPIRED> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const expiry = new Promise<typeof READ_GAP_EXPIRED>((resolve) => {
		timer = setTimeout(() => resolve(READ_GAP_EXPIRED), READ_GAP_TIMEOUT_MS);
	});
	try {
		return await Promise.race([reader.read(), expiry]);
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Read at most {@link MAX_ERROR_BODY_BYTES} of a non-success response body.
 *
 * The body is provider-controlled and can be arbitrarily large, so the read is
 * bounded. A mid-read failure truncates the detail rather than losing it: a
 * partial provider explanation is still worth showing, and the response has
 * already failed, so there is no other outcome to report.
 */
async function readCappedText(response: Response): Promise<string> {
	if (response.body === null) return "";
	const reader = response.body.getReader();
	const textDecoder = new TextDecoder();
	let text = "";
	let read = 0;
	try {
		while (read < MAX_ERROR_BODY_BYTES) {
			const chunk = await readWithinGapTimeout(reader);
			// A provider that stalls part-way through the error body must not pend
			// open() forever any more than a stalled success body may — the detail
			// is best-effort, so a gap timeout just returns what arrived. An abort
			// errors the read (the fetch carried the signal) and lands in `catch`.
			if (chunk === READ_GAP_EXPIRED || chunk.done) break;
			const take = chunk.value.subarray(0, MAX_ERROR_BODY_BYTES - read);
			read += take.byteLength;
			text += textDecoder.decode(take, { stream: true });
		}
	} catch {
		return text;
	} finally {
		void reader.cancel().catch(() => undefined);
		reader.releaseLock();
	}
	// Flush whatever the cap cut in half, as U+FFFD rather than as nothing —
	// matching the lossy conversion the Rust relay applies to the same body.
	return text + textDecoder.decode();
}

/**
 * Build the `providerDetail` field, or nothing when the provider said nothing
 * worth keeping. Redaction happens here so no caller can forget it.
 */
function providerDetailOf(rawBody: string): { providerDetail?: string } {
	const detail = redactProviderDetail(rawBody);
	return detail.trim() === "" ? {} : { providerDetail: detail };
}

/**
 * Parse the `retry-after` header's delta-seconds form into clamped
 * milliseconds. Mirrors `parse_retry_after` in `src-tauri/src/ai/providers.rs`,
 * including ignoring the HTTP-date form: both target providers send
 * delta-seconds, and guessing at clock skew is worse than sending no hint.
 */
function retryAfterOf(headers: Headers): { retryAfterMs?: number } {
	const raw = headers.get("retry-after")?.trim();
	// Digits only, so an empty header, a signed value, or a hex literal is not
	// silently reinterpreted by `Number` into a delay nobody sent.
	if (raw === undefined || !/^\d+$/.test(raw)) return {};
	// The header is provider-controlled, so an absurd hint — including one too
	// large to represent exactly — must not be able to park a retry indefinitely.
	return { retryAfterMs: Math.min(Number(raw) * 1000, MAX_RETRY_AFTER_MS) };
}

/**
 * Resolve the browser-stored key for a provider.
 *
 * `BrowserKeychainAdapter` is constructed directly rather than through
 * `getKeychainAdapter`, because reading a key back is a browser-only capability:
 * the shared `KeychainAdapter` interface deliberately does not declare `getKey`,
 * so desktop code cannot ask for one (issue #61 step 9).
 */
async function resolveBrowserApiKey(provider: AiProvider): Promise<string> {
	const apiKey = await new BrowserKeychainAdapter().getKey(provider);
	if (apiKey === null || apiKey === "") {
		throw missingApiKeyError(provider);
	}
	return apiKey;
}
