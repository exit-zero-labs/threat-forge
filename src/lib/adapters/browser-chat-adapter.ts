import { ProtocolException, redactProviderDetail } from "@/lib/ai/protocol/errors";
import { createSseDecoder, type SseFrame } from "@/lib/ai/providers/sse";
import { buildSystemPrompt } from "@/lib/ai-prompt";
import { userSafeProviderError } from "@/lib/ai-provider-errors";
import type { AiProvider, ChatMessage } from "@/stores/chat-store";
import type { ThreatModel } from "@/types/threat-model";
import { BrowserKeychainAdapter } from "./browser-keychain-adapter";
import type {
	ChatAdapter,
	ChatStreamCallbacks,
	ChatTransport,
	ProviderStreamRequest,
	TransportCallbacks,
} from "./chat-adapter";
import { PROVIDER_ENDPOINTS } from "./provider-endpoints";

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
		const apiKey = await resolveBrowserApiKey(request.provider);
		const endpoint = PROVIDER_ENDPOINTS[request.provider];

		if (signal?.aborted) {
			callbacks.onClose("cancelled");
			return;
		}

		let response: Response;
		try {
			response = await fetch(endpoint.url, {
				method: "POST",
				headers: endpoint.buildHeaders(apiKey),
				body: JSON.stringify(request.body),
				signal,
			});
		} catch {
			// `fetch` rejects for an aborted request and for a connection failure
			// alike, and its rejection reason carries the request URL — which under a
			// configured proxy can hold credentials — so the signal decides which
			// happened and the reason is never surfaced.
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

	// Cancelling the reader resolves a pending `read()` locally, so a stop is not
	// left waiting on a provider that has gone silent.
	const onAbort = (): void => {
		void reader.cancel().catch(() => undefined);
	};
	signal?.addEventListener("abort", onAbort, { once: true });

	try {
		for (;;) {
			let chunk: ReadableStreamReadResult<Uint8Array>;
			try {
				chunk = await reader.read();
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

		// Whether the frame sequence was protocol-complete is the mappers' call;
		// the transport only reports that the body ended.
		callbacks.onClose("done");
	} finally {
		signal?.removeEventListener("abort", onAbort);
		reader.releaseLock();
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
			const chunk = await reader.read();
			if (chunk.done) break;
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
		throw new ProtocolException({
			code: "no_api_key",
			message: `No API key configured for ${provider}. Open AI Settings to add one.`,
		});
	}
	return apiKey;
}

/**
 * Browser chat adapter — direct fetch() to LLM APIs with SSE streaming.
 *
 * @deprecated The string-only chat path. Issue #61 step 10 moves the chat store
 * onto the protocol client over {@link BrowserChatTransport} and deletes this.
 */
export class BrowserChatAdapter implements ChatAdapter {
	async sendMessage(
		provider: AiProvider,
		messages: ChatMessage[],
		model: ThreatModel,
		callbacks: ChatStreamCallbacks,
		modelId: string,
		signal?: AbortSignal,
	): Promise<void> {
		const apiKey = await resolveBrowserApiKey(provider);

		// No native tools yet (issue #61 steps 3–5); the empty list keeps the model
		// on the fenced ` ```actions ` path that #62/#64 will replace.
		const systemPrompt = buildSystemPrompt(model, { tools: [] });

		if (provider === "anthropic") {
			await streamAnthropic(apiKey, systemPrompt, messages, callbacks, modelId, signal);
		} else {
			await streamOpenAI(apiKey, systemPrompt, messages, callbacks, modelId, signal);
		}
	}
}

async function streamAnthropic(
	apiKey: string,
	systemPrompt: string,
	messages: ChatMessage[],
	callbacks: ChatStreamCallbacks,
	modelId: string,
	signal?: AbortSignal,
): Promise<void> {
	const endpoint = PROVIDER_ENDPOINTS.anthropic;
	const response = await fetch(endpoint.url, {
		method: "POST",
		headers: endpoint.buildHeaders(apiKey),
		body: JSON.stringify({
			model: modelId,
			max_tokens: 4096,
			system: systemPrompt,
			messages: messages.map((m) => ({ role: m.role, content: m.content })),
			stream: true,
		}),
		signal,
	});

	if (!response.ok) {
		throw new Error(userSafeProviderError(endpoint.label, response.status));
	}

	await parseSSEStream(response, signal, (event, data) => {
		if (event === "content_block_delta") {
			const parsed = JSON.parse(data) as { delta?: { text?: string } };
			if (parsed.delta?.text) {
				callbacks.onChunk(parsed.delta.text);
			}
		} else if (event === "message_stop") {
			callbacks.onDone();
		} else if (event === "error") {
			const parsed = JSON.parse(data) as { error?: { message?: string } };
			callbacks.onError(parsed.error?.message ?? "Unknown Anthropic error");
		}
	});
}

async function streamOpenAI(
	apiKey: string,
	systemPrompt: string,
	messages: ChatMessage[],
	callbacks: ChatStreamCallbacks,
	modelId: string,
	signal?: AbortSignal,
): Promise<void> {
	const endpoint = PROVIDER_ENDPOINTS.openai;
	const response = await fetch(endpoint.url, {
		method: "POST",
		headers: endpoint.buildHeaders(apiKey),
		body: JSON.stringify({
			model: modelId,
			messages: [
				{ role: "system", content: systemPrompt },
				...messages.map((m) => ({ role: m.role, content: m.content })),
			],
			stream: true,
		}),
		signal,
	});

	if (!response.ok) {
		throw new Error(userSafeProviderError(endpoint.label, response.status));
	}

	await parseSSEStream(response, signal, (_event, data) => {
		if (data === "[DONE]") {
			callbacks.onDone();
			return;
		}

		try {
			const parsed = JSON.parse(data) as {
				choices?: Array<{ delta?: { content?: string } }>;
			};
			const content = parsed.choices?.[0]?.delta?.content;
			if (content) {
				callbacks.onChunk(content);
			}
		} catch {
			// Skip unparseable lines
		}
	});
}

async function parseSSEStream(
	response: Response,
	signal: AbortSignal | undefined,
	onEvent: (event: string, data: string) => void,
): Promise<void> {
	const reader = response.body?.getReader();
	if (!reader) throw new Error("No response body");

	const decoder = createSseDecoder();

	try {
		for (;;) {
			if (signal?.aborted) {
				await reader.cancel();
				return;
			}

			const { done, value } = await reader.read();
			if (done) break;

			for (const frame of decoder.decode(value)) {
				onEvent(frame.event, frame.data);
			}
		}
	} finally {
		reader.releaseLock();
	}
}
