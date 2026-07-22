/**
 * Browser transport contract against a stubbed `fetch`.
 *
 * The transport is the only place in the browser build that holds the user's key
 * and decides where a request goes, so the assertions here are about the request
 * it makes, the frames it produces, and how it fails — never about the provider
 * protocol, which the shared mappers own.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProtocolException } from "@/lib/ai/protocol/errors";
import { buildAnthropicRequestBody } from "@/lib/ai/providers/anthropic";
import { buildOpenAiRequestBody } from "@/lib/ai/providers/openai";
import type { SseFrame } from "@/lib/ai/providers/sse";
import { BrowserChatTransport } from "./browser-chat-adapter";
import { BrowserKeychainAdapter } from "./browser-keychain-adapter";
import type { ProviderStreamRequest, TransportCallbacks } from "./chat-adapter";
import { PROVIDER_ENDPOINTS } from "./provider-endpoints";

const ANTHROPIC_KEY = "sk-ant-test-browser-key";

const anthropicRequest: ProviderStreamRequest = {
	provider: "anthropic",
	body: buildAnthropicRequestBody({
		modelId: "claude-sonnet-4-5",
		system: "system prompt",
		messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		tools: [],
		maxOutputTokens: 4096,
	}),
};

const openAiRequest: ProviderStreamRequest = {
	provider: "openai",
	body: buildOpenAiRequestBody({
		modelId: "gpt-5",
		system: "system prompt",
		messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		tools: [],
		maxOutputTokens: 4096,
	}),
};

function recordingCallbacks() {
	return {
		onFrame: vi.fn(),
		onHttpError: vi.fn(),
		onTransportError: vi.fn(),
		onClose: vi.fn(),
	} satisfies TransportCallbacks;
}

/** A finished response body delivered in the caller's chosen chunk boundaries. */
function streamedResponse(chunks: string[], init?: ResponseInit): Response {
	const encoder = new TextEncoder();
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
			controller.close();
		},
	});
	return new Response(body, init);
}

/** A response body that stays open until the test closes or the reader cancels it. */
function openResponse(): {
	response: Response;
	push: (text: string) => void;
	cancelled: () => boolean;
} {
	const encoder = new TextEncoder();
	let wasCancelled = false;
	let sink: ReadableStreamDefaultController<Uint8Array> | undefined;
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			sink = controller;
		},
		cancel() {
			wasCancelled = true;
		},
	});
	return {
		response: new Response(body),
		/** Enqueue more bytes; false once the consumer has let the stream go. */
		push: (text: string): boolean => {
			try {
				sink?.enqueue(encoder.encode(text));
				return true;
			} catch {
				return false;
			}
		},
		cancelled: () => wasCancelled,
	};
}

function fetchArgs(): { url: string; init: RequestInit } {
	const call = vi.mocked(fetch).mock.calls[0];
	expect(call, "fetch must have been called").toBeDefined();
	const [url, init] = call ?? [];
	expect(typeof url).toBe("string");
	expect(init).toBeDefined();
	return { url: String(url), init: init ?? {} };
}

function headerRecord(init: RequestInit): Record<string, string> {
	const headers = init.headers;
	expect(headers, "the transport must send headers").toBeDefined();
	return Object.fromEntries(new Headers(headers).entries());
}

beforeEach(async () => {
	vi.stubGlobal("fetch", vi.fn());
	await new BrowserKeychainAdapter().setKey("anthropic", ANTHROPIC_KEY);
	await new BrowserKeychainAdapter().setKey("openai", "sk-openai-test-browser-key");
});

afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.clear();
});

describe("BrowserChatTransport request building", () => {
	it("posts the mapper body to the table endpoint with the provider's headers", async () => {
		vi.mocked(fetch).mockResolvedValue(streamedResponse(["data: {}\n\n"]));
		const callbacks = recordingCallbacks();

		await new BrowserChatTransport().open(anthropicRequest, callbacks);

		const { url, init } = fetchArgs();
		expect(url).toBe(PROVIDER_ENDPOINTS.anthropic.url);
		expect(init.method).toBe("POST");

		const headers = headerRecord(init);
		expect(headers["x-api-key"]).toBe(ANTHROPIC_KEY);
		expect(headers["anthropic-version"]).toBe("2023-06-01");
		// Anthropic refuses a keyed request from a page context without this opt-in.
		expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
	});

	it("uses bearer auth for the OpenAI endpoint", async () => {
		vi.mocked(fetch).mockResolvedValue(streamedResponse(["data: [DONE]\n\n"]));

		await new BrowserChatTransport().open(openAiRequest, recordingCallbacks());

		const { url, init } = fetchArgs();
		expect(url).toBe(PROVIDER_ENDPOINTS.openai.url);
		expect(headerRecord(init).authorization).toBe("Bearer sk-openai-test-browser-key");
	});

	it.each([
		["anthropic", anthropicRequest],
		["openai", openAiRequest],
	] as const)("asks the %s endpoint for a stream", async (_provider, request) => {
		vi.mocked(fetch).mockResolvedValue(streamedResponse([]));

		await new BrowserChatTransport().open(request, recordingCallbacks());

		// The desktop relay rejects a body that does not set this, so both
		// transports depend on the mappers emitting it.
		expect(JSON.parse(String(fetchArgs().init.body))).toMatchObject({ stream: true });
	});

	it("passes the abort signal to fetch so an in-flight request is torn down", async () => {
		const controller = new AbortController();
		vi.mocked(fetch).mockResolvedValue(streamedResponse([]));

		await new BrowserChatTransport().open(
			anthropicRequest,
			recordingCallbacks(),
			controller.signal,
		);

		expect(fetchArgs().init.signal).toBe(controller.signal);
	});

	it("refuses to send anything when no key is stored", async () => {
		localStorage.clear();
		const callbacks = recordingCallbacks();

		await expect(
			new BrowserChatTransport().open(anthropicRequest, callbacks),
		).rejects.toBeInstanceOf(ProtocolException);

		expect(fetch).not.toHaveBeenCalled();
		expect(callbacks.onClose).not.toHaveBeenCalled();
	});

	it("names the missing key rather than reporting a transport failure", async () => {
		localStorage.clear();

		await expect(
			new BrowserChatTransport().open(anthropicRequest, recordingCallbacks()),
		).rejects.toMatchObject({ error: { code: "no_api_key" } });
	});
});

describe("BrowserChatTransport streaming", () => {
	it("emits one frame per SSE event and closes when the body ends", async () => {
		vi.mocked(fetch).mockResolvedValue(
			streamedResponse([
				'event: content_block_delta\ndata: {"delta":{"text":"hi"}}\n\n',
				"event: message_stop\ndata: {}\n\n",
			]),
		);
		const callbacks = recordingCallbacks();

		await new BrowserChatTransport().open(anthropicRequest, callbacks);

		const frames: SseFrame[] = callbacks.onFrame.mock.calls.map((call) => call[0]);
		expect(frames).toEqual([
			{ event: "content_block_delta", data: '{"delta":{"text":"hi"}}' },
			{ event: "message_stop", data: "{}" },
		]);
		expect(callbacks.onClose).toHaveBeenCalledWith("done");
		expect(callbacks.onTransportError).not.toHaveBeenCalled();
	});

	it("reassembles frames split across chunk boundaries", async () => {
		vi.mocked(fetch).mockResolvedValue(
			streamedResponse(["event: content_bl", 'ock_delta\ndata: {"tex', 't":"split"}\n\n']),
		);
		const callbacks = recordingCallbacks();

		await new BrowserChatTransport().open(anthropicRequest, callbacks);

		expect(callbacks.onFrame.mock.calls.map((call) => call[0])).toEqual([
			{ event: "content_block_delta", data: '{"text":"split"}' },
		]);
	});

	it("fails closed once a stream exceeds the response size budget", async () => {
		// 51 well-formed 1 MiB frames: the framing is valid, so only the total-bytes
		// budget can stop this — the same 50 MiB bound the Rust relay enforces.
		const oneMebibyteFrame = `data: ${"x".repeat(1024 * 1024 - 8)}\n\n`;
		vi.mocked(fetch).mockResolvedValue(
			streamedResponse(Array.from({ length: 51 }, () => oneMebibyteFrame)),
		);
		const callbacks = recordingCallbacks();

		await new BrowserChatTransport().open(anthropicRequest, callbacks);

		expect(callbacks.onClose).not.toHaveBeenCalled();
		expect(callbacks.onTransportError).toHaveBeenCalledWith({
			message: expect.stringContaining("streaming size limit"),
			reason: "responseTooLarge",
		});
	});

	it("fails closed on a stream that never terminates a line", async () => {
		vi.mocked(fetch).mockResolvedValue(streamedResponse(["data: ".concat("x".repeat(1_100_000))]));
		const callbacks = recordingCallbacks();

		await new BrowserChatTransport().open(anthropicRequest, callbacks);

		expect(callbacks.onFrame).not.toHaveBeenCalled();
		expect(callbacks.onClose).not.toHaveBeenCalled();
		expect(callbacks.onTransportError).toHaveBeenCalledWith({
			message: expect.stringContaining("unterminated line"),
			reason: "malformedStream",
		});
	});
});

describe("BrowserChatTransport cancellation", () => {
	it("cancels the reader and closes locally without waiting for the provider", async () => {
		const controller = new AbortController();
		const provider = openResponse();
		vi.mocked(fetch).mockResolvedValue(provider.response);
		const callbacks = recordingCallbacks();

		const open = new BrowserChatTransport().open(anthropicRequest, callbacks, controller.signal);
		provider.push("data: first\n\n");
		await vi.waitFor(() => {
			expect(callbacks.onFrame).toHaveBeenCalledTimes(1);
		});

		controller.abort();
		// The response body is never closed, so resolving proves the transport did
		// not wait for the provider to acknowledge the stop.
		await open;

		expect(provider.cancelled()).toBe(true);
		expect(callbacks.onClose).toHaveBeenCalledWith("cancelled");
		expect(callbacks.onTransportError).not.toHaveBeenCalled();
	});

	it("delivers no frames the provider sent after the signal aborted", async () => {
		const controller = new AbortController();
		const provider = openResponse();
		vi.mocked(fetch).mockResolvedValue(provider.response);
		const callbacks = recordingCallbacks();

		const open = new BrowserChatTransport().open(anthropicRequest, callbacks, controller.signal);
		provider.push("data: before-abort\n\n");
		await vi.waitFor(() => {
			expect(callbacks.onFrame).toHaveBeenCalledTimes(1);
		});

		controller.abort();
		// The reader was released on abort, so the provider has nowhere left to
		// deliver — cancellation stops the stream rather than only muting callbacks.
		expect(provider.push("data: after-abort\n\n")).toBe(false);
		await open;

		expect(callbacks.onFrame.mock.calls.map((call) => call[0])).toEqual([
			{ event: "message", data: "before-abort" },
		]);
	});

	it("reports a fetch aborted before the response as a cancellation, not a network failure", async () => {
		const controller = new AbortController();
		// Reproduces the real `fetch` contract: aborting rejects the in-flight
		// request with the same error class a connection failure would.
		vi.mocked(fetch).mockImplementation(
			(_input, init) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => {
						reject(new DOMException("The operation was aborted.", "AbortError"));
					});
				}),
		);
		const callbacks = recordingCallbacks();

		const open = new BrowserChatTransport().open(anthropicRequest, callbacks, controller.signal);
		await vi.waitFor(() => {
			expect(fetch).toHaveBeenCalledTimes(1);
		});
		controller.abort();
		await open;

		expect(callbacks.onClose).toHaveBeenCalledWith("cancelled");
		expect(callbacks.onTransportError).not.toHaveBeenCalled();
	});
});

describe("BrowserChatTransport failure reporting", () => {
	/** A real OpenAI 401 body: the provider echoes the submitted key back. */
	const OPENAI_401_BODY = JSON.stringify({
		error: {
			message:
				"Incorrect API key provided: sk-proj-AbC123XyZ9. You can find your API key at https://platform.openai.com/account/api-keys",
			type: "invalid_request_error",
			code: "invalid_api_key",
		},
	});

	it("reports an HTTP failure with an authored message and a redacted detail", async () => {
		vi.mocked(fetch).mockResolvedValue(
			streamedResponse([OPENAI_401_BODY], { status: 401, statusText: "Unauthorized" }),
		);
		const callbacks = recordingCallbacks();

		await new BrowserChatTransport().open(openAiRequest, callbacks);

		expect(callbacks.onHttpError).toHaveBeenCalledTimes(1);
		const reported = callbacks.onHttpError.mock.calls[0]?.[0];
		expect(reported?.status).toBe(401);
		expect(reported?.message).toBe(
			"OpenAI API error (401): the API key was rejected — check the key configured for this provider",
		);
		expect(reported?.providerDetail).toContain("[redacted-key]");
		expect(reported?.providerDetail).not.toContain("sk-proj");
		expect(reported?.providerDetail).not.toContain("AbC123XyZ9");
		expect(callbacks.onClose).not.toHaveBeenCalled();
	});

	it("forwards a rate limit's retry-after hint in milliseconds", async () => {
		vi.mocked(fetch).mockResolvedValue(
			streamedResponse(['{"error":{"type":"rate_limit_error"}}'], {
				status: 429,
				headers: { "retry-after": "2" },
			}),
		);
		const callbacks = recordingCallbacks();

		await new BrowserChatTransport().open(anthropicRequest, callbacks);

		expect(callbacks.onHttpError.mock.calls[0]?.[0]).toMatchObject({
			status: 429,
			retryAfterMs: 2000,
		});
	});

	it("clamps a retry-after hint that would park retries indefinitely", async () => {
		vi.mocked(fetch).mockResolvedValue(
			streamedResponse([""], { status: 429, headers: { "retry-after": "18446744073709551615" } }),
		);
		const callbacks = recordingCallbacks();

		await new BrowserChatTransport().open(anthropicRequest, callbacks);

		expect(callbacks.onHttpError.mock.calls[0]?.[0]).toMatchObject({ retryAfterMs: 600_000 });
	});

	it("ignores an unparseable retry-after rather than guessing", async () => {
		vi.mocked(fetch).mockResolvedValue(
			streamedResponse([""], {
				status: 429,
				headers: { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" },
			}),
		);
		const callbacks = recordingCallbacks();

		await new BrowserChatTransport().open(anthropicRequest, callbacks);

		expect(callbacks.onHttpError.mock.calls[0]?.[0]).not.toHaveProperty("retryAfterMs");
	});

	it("omits provider detail when the provider said nothing", async () => {
		vi.mocked(fetch).mockResolvedValue(streamedResponse(["   "], { status: 502 }));
		const callbacks = recordingCallbacks();

		await new BrowserChatTransport().open(anthropicRequest, callbacks);

		expect(callbacks.onHttpError.mock.calls[0]?.[0]).not.toHaveProperty("providerDetail");
	});

	it("reports a connection failure as a retriable network failure without leaking the URL", async () => {
		vi.mocked(fetch).mockRejectedValue(
			new TypeError("fetch failed: https://user:pass@proxy.internal"),
		);
		const callbacks = recordingCallbacks();

		await new BrowserChatTransport().open(anthropicRequest, callbacks);

		expect(callbacks.onTransportError).toHaveBeenCalledTimes(1);
		const failure = callbacks.onTransportError.mock.calls[0]?.[0];
		expect(failure?.reason).toBe("network");
		expect(failure?.message).not.toContain("proxy.internal");
		expect(callbacks.onClose).not.toHaveBeenCalled();
	});
});
