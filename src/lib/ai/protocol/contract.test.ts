/**
 * Provider-contract corpus, failure modes, and the retry policy.
 *
 * Every case here runs against a deterministic fixture — a hand-authored SSE
 * transcript, no key and no network — driven through the real protocol client
 * and a real transport. The browser path uses a stubbed `fetch` returning
 * `fakeStream`; the desktop path replays the same fixture frames through the real
 * Tauri relay event shape. Because one corpus feeds both transports, an identical
 * `StreamEvent` sequence across them is the transport-neutrality proof, and the
 * shared `EXPECTED_*` sequences across the two providers are the
 * provider-neutrality proof.
 *
 * Assertions check the whole emitted event sequence, never merely that no
 * exception was thrown — a truncated stream that produced a silent `message_stop`
 * would pass a "no throw" check while being exactly the success-shaped failure
 * this corpus exists to catch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserChatTransport } from "@/lib/adapters/browser-chat-adapter";
import { BrowserKeychainAdapter } from "@/lib/adapters/browser-keychain-adapter";
import { TauriChatTransport } from "@/lib/adapters/tauri-chat-adapter";
import type { StreamEvent } from "@/lib/ai/protocol/events";
import type { AiProvider, ProtocolMessage } from "@/lib/ai/protocol/messages";
import type { SseFrame } from "@/lib/ai/providers/sse";
import {
	ANTHROPIC_429_BODY,
	ANTHROPIC_BAD_TOOL_ARGS_STREAM,
	ANTHROPIC_INSTREAM_RATE_LIMIT_STREAM,
	ANTHROPIC_INVALID_JSON_STREAM,
	ANTHROPIC_NOTICE_THEN_TRUNCATED_STREAM,
	ANTHROPIC_ORPHAN_TOOL_INPUT_STREAM,
	ANTHROPIC_TEXT_STREAM,
	ANTHROPIC_TOOL_STREAM,
	ANTHROPIC_TRUNCATED_STREAM,
	ANTHROPIC_UNKNOWN_EVENT_STREAM,
	EXPECTED_BAD_TOOL_ARGS_EVENTS,
	EXPECTED_INSTREAM_RATE_LIMIT_EVENTS,
	EXPECTED_INVALID_JSON_EVENTS,
	EXPECTED_NOTICE_THEN_TRUNCATED_EVENTS,
	EXPECTED_ORPHAN_TOOL_INPUT_EVENTS,
	EXPECTED_TEXT_EVENTS,
	EXPECTED_TOOL_EVENTS,
	EXPECTED_TRUNCATED_EVENTS,
	EXPECTED_UNKNOWN_EVENT_EVENTS,
	FIXTURE_MODEL,
} from "@/lib/ai/providers/test-fixtures/anthropic-fixtures";
import {
	fakeErrorResponse,
	fakeStream,
	replayTauriFrames,
	serializeFrames,
} from "@/lib/ai/providers/test-fixtures/fake-stream";
import {
	EXPECTED_OPENAI_BAD_TOOL_ARGS_EVENTS,
	EXPECTED_OPENAI_INSTREAM_RATE_LIMIT_EVENTS,
	EXPECTED_OPENAI_INVALID_JSON_EVENTS,
	EXPECTED_OPENAI_ORPHAN_FRAGMENT_EVENTS,
	OPENAI_429_BODY,
	OPENAI_BAD_TOOL_ARGS_STREAM,
	OPENAI_INSTREAM_RATE_LIMIT_STREAM,
	OPENAI_INVALID_JSON_STREAM,
	OPENAI_ORPHAN_FRAGMENT_STREAM,
	OPENAI_TEXT_STREAM,
	OPENAI_TOOL_STREAM,
	OPENAI_TRUNCATED_STREAM,
} from "@/lib/ai/providers/test-fixtures/openai-fixtures";
import { AI_MODELS, DEFAULT_ANTHROPIC_MODEL, DEFAULT_OPENAI_MODEL } from "@/lib/ai-models";
import { type ConversationRequest, streamConversation } from "./client";
import {
	createRetryingTransport,
	DEFAULT_RETRY_POLICY,
	isRetriableHttpStatus,
	isRetriableTransportReason,
	type RetryPolicy,
	retryDelayMs,
} from "./retry";

// The desktop transport talks to Tauri; a fake relay stands in for the IPC layer,
// driven with the same fixture frames the browser path decodes off `fetch`.
const relay = vi.hoisted(() => {
	type Handler = (event: { payload: unknown }) => void;
	const handlers = new Map<string, Set<Handler>>();
	const listen = vi.fn(async (name: string, handler: Handler): Promise<() => void> => {
		const registered = handlers.get(name) ?? new Set<Handler>();
		registered.add(handler);
		handlers.set(name, registered);
		return () => registered.delete(handler);
	});
	const invoke = vi.fn(async (_command: string, _args?: unknown): Promise<unknown> => undefined);
	return {
		listen,
		invoke,
		emit(name: string, payload: unknown): void {
			for (const handler of [...(handlers.get(name) ?? [])]) handler({ payload });
		},
		reset(): void {
			handlers.clear();
			listen.mockClear();
			invoke.mockReset();
			invoke.mockResolvedValue(undefined);
		},
	};
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: relay.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: relay.listen }));

const KNOWN_MODEL: Record<AiProvider, string> = {
	anthropic: DEFAULT_ANTHROPIC_MODEL,
	openai: DEFAULT_OPENAI_MODEL,
};

const ANTHROPIC_KEY = "sk-ant-contract-test-key";
const OPENAI_KEY = "sk-proj-contract-test-key";

const userTurn: ProtocolMessage[] = [{ role: "user", content: [{ type: "text", text: "hi" }] }];

function request(provider: AiProvider): ConversationRequest {
	return {
		provider,
		modelId: KNOWN_MODEL[provider],
		system: "system prompt",
		messages: userTurn,
		tools: [],
		maxOutputTokens: 1024,
	};
}

function collect(): { events: StreamEvent[]; onEvent: (event: StreamEvent) => void } {
	const events: StreamEvent[] = [];
	return { events, onEvent: (event) => events.push(event) };
}

/** Every `start_ai_stream` argument the fake relay has been invoked with, in order. */
function startCalls(): Array<{ streamId: string }> {
	return relay.invoke.mock.calls
		.filter((call) => call[0] === "start_ai_stream")
		.map((call) => call[1] as { streamId: string });
}

/** Wait until the desktop transport has invoked `start_ai_stream` at least `n` times. */
async function nthStreamId(n: number): Promise<string> {
	await vi.waitFor(() => {
		expect(startCalls().length).toBeGreaterThanOrEqual(n);
	});
	return startCalls()[n - 1].streamId;
}

/** Run a fixture through the real browser transport with a stubbed `fetch`. */
async function runBrowser(
	provider: AiProvider,
	frames: SseFrame[],
	options: { splitAt?: number[] } = {},
): Promise<StreamEvent[]> {
	vi.mocked(fetch).mockResolvedValue(fakeStream(frames, options));
	const { events, onEvent } = collect();
	await streamConversation(request(provider), new BrowserChatTransport(), { onEvent });
	return events;
}

/** Run a fixture through the real desktop transport, replaying frames over the relay. */
async function runTauri(provider: AiProvider, frames: SseFrame[]): Promise<StreamEvent[]> {
	const { events, onEvent } = collect();
	const open = streamConversation(request(provider), new TauriChatTransport(), { onEvent });
	const streamId = await nthStreamId(1);
	replayTauriFrames(relay, streamId, frames);
	await open;
	return events;
}

/** A response body that stays open until the test pushes to it or the reader cancels it. */
function openResponse(): {
	response: Response;
	push: (text: string) => boolean;
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

/** A `delay` that never waits but records the schedule, for deterministic retry tests. */
function recordingDelay(): { waits: number[]; delay: (ms: number) => Promise<void> } {
	const waits: number[] = [];
	return {
		waits,
		delay: (ms: number) => {
			waits.push(ms);
			return Promise.resolve();
		},
	};
}

const RETRY_POLICY: RetryPolicy = { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 10_000 };

type Runner = (provider: AiProvider, frames: SseFrame[]) => Promise<StreamEvent[]>;
const TRANSPORTS: Array<[string, Runner]> = [
	["browser", runBrowser],
	["desktop", runTauri],
];

beforeEach(async () => {
	relay.reset();
	vi.stubGlobal("fetch", vi.fn());
	await new BrowserKeychainAdapter().setKey("anthropic", ANTHROPIC_KEY);
	await new BrowserKeychainAdapter().setKey("openai", OPENAI_KEY);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	localStorage.clear();
});

describe("provider and transport neutrality", () => {
	it.each(TRANSPORTS)("decodes a complete Anthropic text response on %s", async (_t, run) => {
		expect(await run("anthropic", ANTHROPIC_TEXT_STREAM)).toEqual(EXPECTED_TEXT_EVENTS);
	});

	it.each(TRANSPORTS)("decodes a complete OpenAI text response on %s", async (_t, run) => {
		expect(await run("openai", OPENAI_TEXT_STREAM)).toEqual(EXPECTED_TEXT_EVENTS);
	});

	it.each(TRANSPORTS)("decodes a complete Anthropic tool-call response on %s", async (_t, run) => {
		expect(await run("anthropic", ANTHROPIC_TOOL_STREAM)).toEqual(EXPECTED_TOOL_EVENTS);
	});

	it.each(TRANSPORTS)("decodes a complete OpenAI tool-call response on %s", async (_t, run) => {
		expect(await run("openai", OPENAI_TOOL_STREAM)).toEqual(EXPECTED_TOOL_EVENTS);
	});

	it("tolerates unknown Anthropic event types on both transports", async () => {
		expect(await runBrowser("anthropic", ANTHROPIC_UNKNOWN_EVENT_STREAM)).toEqual(
			EXPECTED_UNKNOWN_EVENT_EVENTS,
		);
		expect(await runTauri("anthropic", ANTHROPIC_UNKNOWN_EVENT_STREAM)).toEqual(
			EXPECTED_UNKNOWN_EVENT_EVENTS,
		);
	});
});

/**
 * Every catalog id reaches the wire unchanged, on both platforms.
 *
 * `buildAnthropicRequestBody`/`buildOpenAiRequestBody` copy `modelId` onto the
 * wire `model` field (issue #61 step 6), and neither transport inspects that
 * field before sending it — the browser transport `JSON.stringify`s
 * `request.body` straight into `fetch`, and the desktop transport hands it to
 * `start_ai_stream` for the Rust relay to forward untouched. Driving the real
 * client and both real transports (fixtures only, no network) is what proves
 * that composed chain for the six ids ThreatForge actually offers, rather than
 * re-asserting the builders' one-line copy in isolation.
 */
describe("catalog model ids reach the wire unchanged on both transports", () => {
	it.each(AI_MODELS)("sends $provider model $id verbatim", async (model) => {
		const textStream = model.provider === "anthropic" ? ANTHROPIC_TEXT_STREAM : OPENAI_TEXT_STREAM;
		const conversationRequest: ConversationRequest = {
			provider: model.provider,
			modelId: model.id,
			system: "system prompt",
			messages: userTurn,
			tools: [],
			maxOutputTokens: 1024,
		};

		vi.mocked(fetch).mockResolvedValue(fakeStream(textStream));
		await streamConversation(conversationRequest, new BrowserChatTransport(), {
			onEvent: () => undefined,
		});
		const browserCall = vi.mocked(fetch).mock.calls[0];
		if (!browserCall) throw new Error("expected the browser transport to call fetch");
		const browserBody = browserCall[1]?.body;
		if (typeof browserBody !== "string") throw new Error("expected a JSON browser request body");
		const parsedBrowserBody: unknown = JSON.parse(browserBody);
		expect(parsedBrowserBody).toMatchObject({ model: model.id });

		const open = streamConversation(conversationRequest, new TauriChatTransport(), {
			onEvent: () => undefined,
		});
		const streamId = await nthStreamId(1);
		replayTauriFrames(relay, streamId, textStream);
		await open;
		const startCall = relay.invoke.mock.calls.find((call) => call[0] === "start_ai_stream");
		if (!startCall) throw new Error("expected the desktop transport to invoke start_ai_stream");
		const desktopArgs = startCall[1];
		if (typeof desktopArgs !== "object" || desktopArgs === null || !("body" in desktopArgs)) {
			throw new Error("expected a desktop request body");
		}
		expect(desktopArgs.body).toMatchObject({ model: model.id });
	});
});

describe("partial streams split at arbitrary byte boundaries (browser)", () => {
	// A short transcript whose text carries multi-byte UTF-8 ("café ☕"), so a
	// byte-offset split lands mid-line, mid-JSON, and mid-multi-byte-sequence.
	const MULTIBYTE_FRAMES: SseFrame[] = [
		{ event: "message_start", data: JSON.stringify({ message: { model: FIXTURE_MODEL } }) },
		{
			event: "content_block_delta",
			data: JSON.stringify({ index: 0, delta: { type: "text_delta", text: "café ☕ review" } }),
		},
		{ event: "message_stop", data: JSON.stringify({ type: "message_stop" }) },
	];
	const MULTIBYTE_EXPECTED: StreamEvent[] = [
		{ type: "message_start", model: FIXTURE_MODEL },
		{ type: "text_delta", text: "café ☕ review" },
		{ type: "message_stop", stopReason: "unknown" },
	];

	it("decodes identically at every interior byte offset", async () => {
		const bytes = new TextEncoder().encode(serializeFrames(MULTIBYTE_FRAMES));
		for (let offset = 1; offset < bytes.length; offset += 1) {
			vi.mocked(fetch).mockResolvedValue(fakeStream(MULTIBYTE_FRAMES, { splitAt: [offset] }));
			const { events, onEvent } = collect();
			await streamConversation(request("anthropic"), new BrowserChatTransport(), { onEvent });
			expect(events, `split at byte offset ${offset}`).toEqual(MULTIBYTE_EXPECTED);
		}
	});

	it("decodes a whole fixture split at several interior offsets at once", async () => {
		const events = await runBrowser("anthropic", ANTHROPIC_TEXT_STREAM, {
			splitAt: [10, 40, 90, 130],
		});
		expect(events).toEqual(EXPECTED_TEXT_EVENTS);
	});
});

describe("truncated stream — ends without a terminal event", () => {
	// The one case the plan calls out by name: a stream that ends with no
	// message_stop must surface `malformed_stream`, never a silent success.
	it.each([
		["browser Anthropic", runBrowser, "anthropic", ANTHROPIC_TRUNCATED_STREAM] as const,
		["desktop Anthropic", runTauri, "anthropic", ANTHROPIC_TRUNCATED_STREAM] as const,
		["browser OpenAI", runBrowser, "openai", OPENAI_TRUNCATED_STREAM] as const,
		["desktop OpenAI", runTauri, "openai", OPENAI_TRUNCATED_STREAM] as const,
	])("reports malformed_stream, not a silent end, on %s", async (_label, run, provider, frames) => {
		const events = await run(provider, frames);
		expect(events).toEqual(EXPECTED_TRUNCATED_EVENTS);
		// Guard the exact failure the plan warns against: the last event must be the
		// malformed_stream error, not a fabricated message_stop.
		expect(events[events.length - 1]).toEqual({
			type: "error",
			error: { code: "malformed_stream", message: expect.stringContaining("ended before") },
		});
		expect(events).not.toContainEqual(expect.objectContaining({ type: "message_stop" }));
	});

	it.each([["browser", runBrowser] as const, ["desktop", runTauri] as const])(
		"still reports truncation after a non-terminal malformed_stream notice on %s",
		async (_t, run) => {
			// A malformed_stream notice is non-terminal (see events.ts). A close with no
			// message_stop after one is still a truncation, so the turn ends with a second,
			// terminal malformed_stream — the notice must not suppress it.
			const events = await run("anthropic", ANTHROPIC_NOTICE_THEN_TRUNCATED_STREAM);
			expect(events).toEqual(EXPECTED_NOTICE_THEN_TRUNCATED_EVENTS);
			expect(events[events.length - 1]).toEqual({
				type: "error",
				error: { code: "malformed_stream", message: expect.stringContaining("ended before") },
			});
		},
	);
});

describe("malformed events are reported without aborting the turn", () => {
	it.each([
		[
			"browser Anthropic invalid JSON",
			runBrowser,
			"anthropic",
			ANTHROPIC_INVALID_JSON_STREAM,
			EXPECTED_INVALID_JSON_EVENTS,
		] as const,
		[
			"desktop Anthropic invalid JSON",
			runTauri,
			"anthropic",
			ANTHROPIC_INVALID_JSON_STREAM,
			EXPECTED_INVALID_JSON_EVENTS,
		] as const,
		[
			"browser OpenAI invalid JSON",
			runBrowser,
			"openai",
			OPENAI_INVALID_JSON_STREAM,
			EXPECTED_OPENAI_INVALID_JSON_EVENTS,
		] as const,
		[
			"desktop OpenAI invalid JSON",
			runTauri,
			"openai",
			OPENAI_INVALID_JSON_STREAM,
			EXPECTED_OPENAI_INVALID_JSON_EVENTS,
		] as const,
		[
			"browser Anthropic bad tool args",
			runBrowser,
			"anthropic",
			ANTHROPIC_BAD_TOOL_ARGS_STREAM,
			EXPECTED_BAD_TOOL_ARGS_EVENTS,
		] as const,
		[
			"desktop Anthropic bad tool args",
			runTauri,
			"anthropic",
			ANTHROPIC_BAD_TOOL_ARGS_STREAM,
			EXPECTED_BAD_TOOL_ARGS_EVENTS,
		] as const,
		[
			"browser OpenAI bad tool args",
			runBrowser,
			"openai",
			OPENAI_BAD_TOOL_ARGS_STREAM,
			EXPECTED_OPENAI_BAD_TOOL_ARGS_EVENTS,
		] as const,
		[
			"browser Anthropic orphan tool input",
			runBrowser,
			"anthropic",
			ANTHROPIC_ORPHAN_TOOL_INPUT_STREAM,
			EXPECTED_ORPHAN_TOOL_INPUT_EVENTS,
		] as const,
		[
			"browser OpenAI orphan tool fragment",
			runBrowser,
			"openai",
			OPENAI_ORPHAN_FRAGMENT_STREAM,
			EXPECTED_OPENAI_ORPHAN_FRAGMENT_EVENTS,
		] as const,
	])(
		"maps %s to a malformed_stream notice and still finishes",
		async (_label, run, provider, frames, expected) => {
			expect(await run(provider, frames)).toEqual(expected);
		},
	);

	it("keeps a hostile stream-supplied tool name out of the authored message", async () => {
		const events = await runBrowser("anthropic", ANTHROPIC_BAD_TOOL_ARGS_STREAM);
		const failure = events.find((event) => event.type === "error");
		if (failure?.type !== "error") throw new Error("expected a malformed_stream error");
		expect(failure.error.message).toBe(
			"A tool call sent arguments that were not valid JSON, so the call was dropped.",
		);
		// The tool name survives only as providerDetail, never inside the message.
		expect(failure.error.providerDetail).toBe("add_element");
	});
});

describe("in-stream rate limit (a provider error event, after text)", () => {
	it.each([
		[
			"browser Anthropic",
			runBrowser,
			"anthropic",
			ANTHROPIC_INSTREAM_RATE_LIMIT_STREAM,
			EXPECTED_INSTREAM_RATE_LIMIT_EVENTS,
		] as const,
		[
			"desktop Anthropic",
			runTauri,
			"anthropic",
			ANTHROPIC_INSTREAM_RATE_LIMIT_STREAM,
			EXPECTED_INSTREAM_RATE_LIMIT_EVENTS,
		] as const,
		[
			"browser OpenAI",
			runBrowser,
			"openai",
			OPENAI_INSTREAM_RATE_LIMIT_STREAM,
			EXPECTED_OPENAI_INSTREAM_RATE_LIMIT_EVENTS,
		] as const,
	])(
		"surfaces a redacted rate_limited error on %s",
		async (_label, run, provider, frames, expected) => {
			const events = await run(provider, frames);
			expect(events).toEqual(expected);
			const failure = events.find((event) => event.type === "error");
			if (failure?.type !== "error") throw new Error("expected a rate_limited error");
			expect(failure.error.providerDetail).toContain("[redacted-key]");
			expect(failure.error.providerDetail).not.toMatch(/sk-(ant|proj)/);
		},
	);
});

describe("HTTP rate limit (a 429 response) carries a retry hint and redacted detail", () => {
	it.each([["anthropic", ANTHROPIC_429_BODY] as const, ["openai", OPENAI_429_BODY] as const])(
		"forwards retryAfterMs into the retry schedule and redacts the %s detail",
		async (provider, body) => {
			// Every attempt is a 429 with a 1-second retry-after, so the turn exhausts
			// its retries and the final rate_limited error is what the consumer sees.
			vi.mocked(fetch).mockImplementation(async () =>
				fakeErrorResponse(body, { status: 429, headers: { "retry-after": "1" } }),
			);
			const { waits, delay } = recordingDelay();
			const { events, onEvent } = collect();

			await streamConversation(
				request(provider),
				createRetryingTransport(new BrowserChatTransport(), RETRY_POLICY, { delay }),
				{ onEvent },
			);

			// The provider's 1-second hint is honored on each retry, never shortened.
			expect(waits).toEqual([1000, 1000]);
			expect(fetch).toHaveBeenCalledTimes(3);
			expect(events).toHaveLength(1);
			const failure = events[0];
			if (failure.type !== "error") throw new Error("expected a rate_limited error");
			expect(failure.error.code).toBe("rate_limited");
			// The canonical 429 fixture bodies embed a key token; it must be redacted.
			expect(failure.error.providerDetail).toContain("[redacted-key]");
			expect(failure.error.providerDetail).not.toContain("RL429SECRET");
			expect(failure.error.providerDetail).not.toMatch(/sk-(ant|proj)/);
		},
	);
});

describe("cancellation is a terminal aborted, with no events afterward", () => {
	it("aborts a browser stream mid-flight and cancels the reader", async () => {
		const controller = new AbortController();
		const provider = openResponse();
		vi.mocked(fetch).mockResolvedValue(provider.response);
		const { events, onEvent } = collect();

		const open = streamConversation(
			request("anthropic"),
			new BrowserChatTransport(),
			{ onEvent },
			controller.signal,
		);
		provider.push(
			'event: content_block_delta\ndata: {"index":0,"delta":{"type":"text_delta","text":"partial"}}\n\n',
		);
		await vi.waitFor(() => {
			expect(events.some((event) => event.type === "text_delta")).toBe(true);
		});

		controller.abort();
		await open;

		expect(events).toEqual([{ type: "text_delta", text: "partial" }, { type: "aborted" }]);
		expect(provider.cancelled()).toBe(true);
		// The reader is released, so the provider has nowhere left to deliver.
		expect(provider.push("data: after-abort\n\n")).toBe(false);
		expect(events).toHaveLength(2);
	});

	it("aborts a desktop stream, cancels the matching id, and drops later frames", async () => {
		const controller = new AbortController();
		const { events, onEvent } = collect();

		const open = streamConversation(
			request("anthropic"),
			new TauriChatTransport(),
			{ onEvent },
			controller.signal,
		);
		const streamId = await nthStreamId(1);
		relay.emit("ai:stream-frame", {
			streamId,
			event: "content_block_delta",
			data: JSON.stringify({ index: 0, delta: { type: "text_delta", text: "partial" } }),
		});

		controller.abort();
		await open;

		expect(events).toEqual([{ type: "text_delta", text: "partial" }, { type: "aborted" }]);
		const cancelCalls = relay.invoke.mock.calls
			.filter((call) => call[0] === "cancel_ai_stream")
			.map((call) => call[1]);
		expect(cancelCalls).toEqual([{ streamId }]);

		// A frame the relay emits after the stop is ignored, not appended.
		relay.emit("ai:stream-frame", { streamId, event: "message", data: "late" });
		expect(events).toHaveLength(2);
	});
});

describe("retry policy predicates and schedule", () => {
	it.each([
		[429, true],
		[500, true],
		[503, true],
		[599, true],
		[400, false],
		[401, false],
		[404, false],
		[200, false],
	])("treats HTTP %i as retriable=%s", (status, retriable) => {
		expect(isRetriableHttpStatus(status)).toBe(retriable);
	});

	it.each([
		["network", true],
		["malformedStream", false],
		["responseTooLarge", false],
	] as const)("treats a %s transport failure as retriable=%s", (reason, retriable) => {
		expect(isRetriableTransportReason(reason)).toBe(retriable);
	});

	it("computes exponential backoff and honors a retry-after floor", () => {
		expect(retryDelayMs(1, RETRY_POLICY)).toBe(500);
		expect(retryDelayMs(2, RETRY_POLICY)).toBe(1000);
		expect(retryDelayMs(3, RETRY_POLICY)).toBe(2000);
		// A retry-after longer than the backoff wins; a shorter one never shortens it.
		expect(retryDelayMs(1, RETRY_POLICY, 5000)).toBe(5000);
		expect(retryDelayMs(3, RETRY_POLICY, 100)).toBe(2000);
	});

	it("caps computed backoff at maxDelayMs while still honoring a larger retry-after", () => {
		const tight: RetryPolicy = { maxAttempts: 10, baseDelayMs: 1000, maxDelayMs: 3000 };
		expect(retryDelayMs(9, tight)).toBe(3000);
		expect(retryDelayMs(9, tight, 60_000)).toBe(60_000);
	});

	it("caps an absurd retry-after so a provider cannot park a retry indefinitely", () => {
		// The chokepoint is self-sufficient: even if a transport failed to clamp the
		// hint, retryDelayMs bounds it to ten minutes rather than honoring it whole.
		expect(retryDelayMs(1, RETRY_POLICY, 999_999_999)).toBe(10 * 60 * 1000);
	});

	it("ships a conservative default policy", () => {
		expect(DEFAULT_RETRY_POLICY.maxAttempts).toBe(3);
	});
});

describe("retry only before the first event, only for transient failures", () => {
	it("retries a 429 that arrives before any event, then succeeds (browser)", async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce(
				fakeErrorResponse('{"type":"error"}', { status: 429, headers: { "retry-after": "2" } }),
			)
			.mockResolvedValueOnce(fakeStream(ANTHROPIC_TEXT_STREAM));
		const { waits, delay } = recordingDelay();
		const { events, onEvent } = collect();

		await streamConversation(
			request("anthropic"),
			createRetryingTransport(new BrowserChatTransport(), RETRY_POLICY, { delay }),
			{ onEvent },
		);

		expect(events).toEqual(EXPECTED_TEXT_EVENTS);
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(waits).toEqual([2000]);
	});

	it("retries a dropped connection before any frame, then succeeds (browser)", async () => {
		const dropped = new ReadableStream<Uint8Array>({
			pull(controller) {
				controller.error(new TypeError("connection reset"));
			},
		});
		vi.mocked(fetch)
			.mockResolvedValueOnce(new Response(dropped))
			.mockResolvedValueOnce(fakeStream(ANTHROPIC_TEXT_STREAM));
		const { waits, delay } = recordingDelay();
		const { events, onEvent } = collect();

		await streamConversation(
			request("anthropic"),
			createRetryingTransport(new BrowserChatTransport(), RETRY_POLICY, { delay }),
			{ onEvent },
		);

		expect(events).toEqual(EXPECTED_TEXT_EVENTS);
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(waits).toEqual([500]);
	});

	it("does NOT retry a failure that arrives after the first text_delta (browser)", async () => {
		// A text frame reaches the consumer, then the connection drops. Replaying would
		// duplicate the text already rendered, so the drop is surfaced, never retried.
		const encoder = new TextEncoder();
		const partialThenDrop = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(
					encoder.encode(
						'event: content_block_delta\ndata: {"index":0,"delta":{"type":"text_delta","text":"partial"}}\n\n',
					),
				);
			},
			pull(controller) {
				controller.error(new TypeError("connection reset"));
			},
		});
		vi.mocked(fetch).mockResolvedValue(new Response(partialThenDrop));
		const { waits, delay } = recordingDelay();
		const { events, onEvent } = collect();

		await streamConversation(
			request("anthropic"),
			createRetryingTransport(new BrowserChatTransport(), RETRY_POLICY, { delay }),
			{ onEvent },
		);

		expect(events).toEqual([
			{ type: "text_delta", text: "partial" },
			{ type: "error", error: { code: "transport", message: expect.any(String) } },
		]);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(waits).toEqual([]);
	});

	it("does NOT retry an in-stream 429 that arrives after text (browser)", async () => {
		// The rate limit is a mapper-level event after a text_delta, so it is committed
		// output: surfaced as a rate_limited error, and the request is made only once.
		vi.mocked(fetch).mockResolvedValue(fakeStream(ANTHROPIC_INSTREAM_RATE_LIMIT_STREAM));
		const { waits, delay } = recordingDelay();
		const { events, onEvent } = collect();

		await streamConversation(
			request("anthropic"),
			createRetryingTransport(new BrowserChatTransport(), RETRY_POLICY, { delay }),
			{ onEvent },
		);

		expect(events).toEqual(EXPECTED_INSTREAM_RATE_LIMIT_EVENTS);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(waits).toEqual([]);
	});

	it.each([400, 401, 403, 404])("does NOT retry a non-retriable %i (browser)", async (status) => {
		vi.mocked(fetch).mockResolvedValue(
			fakeErrorResponse('{"error":{"message":"nope"}}', { status }),
		);
		const { waits, delay } = recordingDelay();
		const { events, onEvent } = collect();

		await streamConversation(
			request("openai"),
			createRetryingTransport(new BrowserChatTransport(), RETRY_POLICY, { delay }),
			{ onEvent },
		);

		expect(fetch).toHaveBeenCalledTimes(1);
		expect(waits).toEqual([]);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ type: "error", error: { code: "http_status" } });
	});

	it("respects the retry bound and then surfaces the failure (browser)", async () => {
		vi.mocked(fetch).mockImplementation(async () =>
			fakeErrorResponse('{"error":{"message":"upstream"}}', { status: 500 }),
		);
		const { waits, delay } = recordingDelay();
		const { events, onEvent } = collect();

		await streamConversation(
			request("openai"),
			createRetryingTransport(new BrowserChatTransport(), RETRY_POLICY, { delay }),
			{ onEvent },
		);

		// Three attempts total (the bound), two backoff waits between them.
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(waits).toEqual([500, 1000]);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ type: "error", error: { code: "http_status" } });
	});

	it("retries a desktop httpError before any frame, then succeeds", async () => {
		const { waits, delay } = recordingDelay();
		const { events, onEvent } = collect();

		const open = streamConversation(
			request("anthropic"),
			createRetryingTransport(new TauriChatTransport(), RETRY_POLICY, { delay }),
			{ onEvent },
		);

		// Attempt 1: the relay closes with a retriable 503 and no frames.
		const firstId = await nthStreamId(1);
		replayTauriFrames(relay, firstId, [], {
			kind: "httpError",
			status: 503,
			message: "temporarily unavailable",
		});

		// Attempt 2: a fresh stream id, replayed to success.
		const secondId = await nthStreamId(2);
		expect(secondId).not.toBe(firstId);
		replayTauriFrames(relay, secondId, ANTHROPIC_TEXT_STREAM);

		await open;

		expect(events).toEqual(EXPECTED_TEXT_EVENTS);
		expect(startCalls()).toHaveLength(2);
		expect(waits).toEqual([500]);
	});
});
