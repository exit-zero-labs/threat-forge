/**
 * Protocol client orchestration, terminal semantics, and consumer isolation.
 *
 * The client composes preflight, budgeting, provider mapping, a transport, and
 * the shared decoder into one `StreamEvent` stream. These tests assert the
 * composition — that a scripted set of provider frames becomes the right events,
 * that a stop is a terminal `aborted` and never an error, that failures become
 * `error` events, and — the inherited step-9 obligation — that a throwing
 * consumer callback never rejects the stream or the transport on either platform.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserChatTransport } from "@/lib/adapters/browser-chat-adapter";
import { BrowserKeychainAdapter } from "@/lib/adapters/browser-keychain-adapter";
import type {
	ChatTransport,
	ProviderStreamRequest,
	TransportCallbacks,
} from "@/lib/adapters/chat-adapter";
import { TauriChatTransport } from "@/lib/adapters/tauri-chat-adapter";
import { type ConversationRequest, streamConversation } from "./client";
import { ProtocolException } from "./errors";
import type { StreamEvent } from "./events";
import type { ProtocolMessage } from "./messages";
import type { AdvertisedTool } from "./tools";

// The desktop transport talks to Tauri; a fake relay stands in for the IPC layer.
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

const KNOWN_MODEL = "claude-sonnet-4-20250514";

const userTurn: ProtocolMessage[] = [{ role: "user", content: [{ type: "text", text: "hi" }] }];

function anthropicRequest(overrides: Partial<ConversationRequest> = {}): ConversationRequest {
	return {
		provider: "anthropic",
		modelId: KNOWN_MODEL,
		system: "system prompt",
		messages: userTurn,
		tools: [],
		maxOutputTokens: 1024,
		...overrides,
	};
}

/** A minimal advertised tool; the client only needs its identity and schema. */
const sampleTool: AdvertisedTool = {
	name: "add_element",
	description: "Add an element.",
	jsonSchema: () => ({ type: "object", properties: {}, additionalProperties: false }),
};

/** A transport whose `open` replays a caller-scripted callback sequence. */
function scriptedTransport(script: (callbacks: TransportCallbacks) => void): ChatTransport {
	return {
		async open(_request: ProviderStreamRequest, callbacks: TransportCallbacks) {
			script(callbacks);
		},
	};
}

function collect(): { events: StreamEvent[]; onEvent: (event: StreamEvent) => void } {
	const events: StreamEvent[] = [];
	return { events, onEvent: (event) => events.push(event) };
}

/** A finished response body delivered as one chunk, for the browser transport. */
function streamedResponse(body: string): Response {
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(body));
			controller.close();
		},
	});
	return new Response(stream);
}

const TEXT_FRAME = `event: content_block_delta\ndata: ${JSON.stringify({
	index: 0,
	delta: { type: "text_delta", text: "hi" },
})}\n\n`;

beforeEach(() => {
	relay.reset();
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	localStorage.clear();
});

describe("streamConversation orchestration", () => {
	it("maps a scripted Anthropic frame sequence to the protocol event stream", async () => {
		const { events, onEvent } = collect();

		await streamConversation(
			anthropicRequest(),
			scriptedTransport((cb) => {
				cb.onFrame({
					event: "message_start",
					data: JSON.stringify({ message: { model: KNOWN_MODEL, usage: { input_tokens: 3 } } }),
				});
				cb.onFrame({
					event: "content_block_delta",
					data: JSON.stringify({ index: 0, delta: { type: "text_delta", text: "hello" } }),
				});
				cb.onFrame({
					event: "message_delta",
					data: JSON.stringify({ delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } }),
				});
				cb.onFrame({ event: "message_stop", data: "{}" });
				cb.onClose("done");
			}),
			{ onEvent },
		);

		expect(events).toEqual([
			{ type: "message_start", model: KNOWN_MODEL },
			{ type: "text_delta", text: "hello" },
			{ type: "usage", usage: { inputTokens: 3, outputTokens: 5 } },
			{ type: "message_stop", stopReason: "end_turn" },
		]);
	});

	it("decodes a streamed tool call into start, input, and complete events", async () => {
		const { events, onEvent } = collect();

		await streamConversation(
			anthropicRequest({ tools: [sampleTool] }),
			scriptedTransport((cb) => {
				cb.onFrame({
					event: "content_block_start",
					data: JSON.stringify({
						index: 0,
						content_block: { type: "tool_use", id: "toolu_1", name: "add_element" },
					}),
				});
				cb.onFrame({
					event: "content_block_delta",
					data: JSON.stringify({
						index: 0,
						delta: { type: "input_json_delta", partial_json: '{"action":"add_element"}' },
					}),
				});
				cb.onFrame({ event: "content_block_stop", data: JSON.stringify({ index: 0 }) });
				// A real tool-call turn still ends with a stop reason and message_stop;
				// omitting them would trip truncation detection (see the truncation test).
				cb.onFrame({
					event: "message_delta",
					data: JSON.stringify({ delta: { stop_reason: "tool_use" } }),
				});
				cb.onFrame({ event: "message_stop", data: "{}" });
				cb.onClose("done");
			}),
			{ onEvent },
		);

		expect(events).toEqual([
			{ type: "tool_call_start", id: "toolu_1", name: "add_element" },
			{ type: "tool_call_input_delta", id: "toolu_1", partialJson: '{"action":"add_element"}' },
			{
				type: "tool_call_complete",
				id: "toolu_1",
				name: "add_element",
				input: { action: "add_element" },
			},
			{ type: "message_stop", stopReason: "tool_use" },
		]);
	});

	it("surfaces a done close with no terminal event as malformed_stream, not a silent end", async () => {
		// A stream that delivers text and then closes without a message_stop is
		// truncated. Presenting it as a finished answer would be a success-shaped
		// failure indistinguishable from a complete but short response.
		const { events, onEvent } = collect();

		await streamConversation(
			anthropicRequest(),
			scriptedTransport((cb) => {
				cb.onFrame({
					event: "content_block_delta",
					data: JSON.stringify({ index: 0, delta: { type: "text_delta", text: "half a th" } }),
				});
				cb.onClose("done");
			}),
			{ onEvent },
		);

		expect(events).toEqual([
			{ type: "text_delta", text: "half a th" },
			{
				type: "error",
				error: { code: "malformed_stream", message: expect.stringContaining("ended before") },
			},
		]);
	});

	it("does not flag a done close as truncated when the provider already reported an error", async () => {
		// An in-stream provider error is itself terminal; a truncation notice on top
		// of it would be a second, redundant failure for the same turn.
		const { events, onEvent } = collect();

		await streamConversation(
			anthropicRequest(),
			scriptedTransport((cb) => {
				cb.onFrame({
					event: "error",
					data: JSON.stringify({ error: { type: "overloaded_error", message: "Overloaded" } }),
				});
				cb.onClose("done");
			}),
			{ onEvent },
		);

		expect(events).toEqual([
			{
				type: "error",
				error: {
					code: "http_status",
					message: "Anthropic reported an error while streaming the response.",
					providerDetail: "overloaded_error: Overloaded",
				},
			},
		]);
	});
});

describe("streamConversation preflight", () => {
	it("refuses tools on an unknown model without touching the transport", async () => {
		const open = vi.fn();
		const { events, onEvent } = collect();

		await streamConversation(
			anthropicRequest({ modelId: "made-up-model", tools: [sampleTool] }),
			{ open },
			{ onEvent },
		);

		expect(open).not.toHaveBeenCalled();
		expect(events).toEqual([
			{
				type: "error",
				error: {
					code: "unsupported_capability",
					message: expect.stringContaining("not recognized"),
				},
			},
		]);
	});
});

describe("streamConversation terminal semantics", () => {
	it("resolves an already-stopped turn as a terminal aborted event, never an error", async () => {
		const controller = new AbortController();
		controller.abort();
		const open = vi.fn();
		const { events, onEvent } = collect();

		await streamConversation(anthropicRequest(), { open }, { onEvent }, controller.signal);

		expect(open).not.toHaveBeenCalled();
		expect(events).toEqual([{ type: "aborted" }]);
	});

	it("turns a transport cancellation into aborted and keeps any earlier events", async () => {
		const { events, onEvent } = collect();

		await streamConversation(
			anthropicRequest(),
			scriptedTransport((cb) => {
				cb.onFrame({
					event: "content_block_delta",
					data: JSON.stringify({ index: 0, delta: { type: "text_delta", text: "partial" } }),
				});
				cb.onClose("cancelled");
			}),
			{ onEvent },
		);

		expect(events).toEqual([{ type: "text_delta", text: "partial" }, { type: "aborted" }]);
		expect(events).not.toContainEqual(expect.objectContaining({ type: "error" }));
	});

	it("maps a 429 to a rate_limited error and other statuses to http_status", async () => {
		const rate = collect();
		await streamConversation(
			anthropicRequest(),
			scriptedTransport((cb) =>
				cb.onHttpError({ status: 429, message: "slow down", providerDetail: "detail" }),
			),
			{ onEvent: rate.onEvent },
		);
		expect(rate.events).toEqual([
			{
				type: "error",
				error: { code: "rate_limited", message: "slow down", providerDetail: "detail" },
			},
		]);

		const server = collect();
		await streamConversation(
			anthropicRequest(),
			scriptedTransport((cb) => cb.onHttpError({ status: 500, message: "server error" })),
			{ onEvent: server.onEvent },
		);
		expect(server.events).toEqual([
			{ type: "error", error: { code: "http_status", message: "server error" } },
		]);
	});

	it("maps a transport failure by reason, not by matching its message", async () => {
		const { events, onEvent } = collect();

		await streamConversation(
			anthropicRequest(),
			scriptedTransport((cb) =>
				cb.onTransportError({ message: "bad frame", reason: "malformedStream" }),
			),
			{ onEvent },
		);

		expect(events).toEqual([
			{ type: "error", error: { code: "malformed_stream", message: "bad frame" } },
		]);
	});

	it("reports an up-front transport refusal (missing key) as an error event and resolves", async () => {
		const { events, onEvent } = collect();
		const refusing: ChatTransport = {
			open: () =>
				Promise.reject(
					new ProtocolException({
						code: "no_api_key",
						message: "No API key configured for anthropic. Open AI Settings to add one.",
					}),
				),
		};

		await expect(
			streamConversation(anthropicRequest(), refusing, { onEvent }),
		).resolves.toBeUndefined();

		expect(events).toEqual([
			{
				type: "error",
				error: {
					code: "no_api_key",
					message: "No API key configured for anthropic. Open AI Settings to add one.",
				},
			},
		]);
	});
});

describe("streamConversation consumer isolation", () => {
	it("reports a throwing consumer instead of rejecting, using the injected sink", async () => {
		const onConsumerError = vi.fn();
		let delivered = 0;

		await expect(
			streamConversation(
				anthropicRequest(),
				scriptedTransport((cb) => {
					cb.onFrame({
						event: "content_block_delta",
						data: JSON.stringify({ index: 0, delta: { type: "text_delta", text: "hi" } }),
					});
					cb.onClose("done");
				}),
				{
					onEvent: () => {
						delivered += 1;
						throw new Error("consumer boom");
					},
					onConsumerError,
				},
			),
		).resolves.toBeUndefined();

		expect(delivered).toBeGreaterThan(0);
		expect(onConsumerError).toHaveBeenCalledWith(expect.any(Error));
	});

	it("surfaces a throwing consumer on a fresh task when no sink is given", async () => {
		vi.useFakeTimers();
		const boom = new Error("consumer boom");

		await streamConversation(
			anthropicRequest(),
			scriptedTransport((cb) => {
				cb.onFrame({
					event: "content_block_delta",
					data: JSON.stringify({ index: 0, delta: { type: "text_delta", text: "hi" } }),
				});
				cb.onClose("done");
			}),
			{
				onEvent: () => {
					throw boom;
				},
			},
		);

		// The failure is neither swallowed nor allowed to reject the stream: it is
		// rethrown on a later task, where the environment's error handling sees it.
		expect(() => vi.runAllTimers()).toThrow("consumer boom");
	});

	it("does not reject when a consumer throws on the browser transport", async () => {
		vi.stubGlobal("fetch", vi.fn());
		await new BrowserKeychainAdapter().setKey("anthropic", "sk-ant-isolation-test");
		vi.mocked(fetch).mockResolvedValue(streamedResponse(TEXT_FRAME));
		const onConsumerError = vi.fn();
		let delivered = 0;

		await expect(
			streamConversation(anthropicRequest(), new BrowserChatTransport(), {
				onEvent: () => {
					delivered += 1;
					throw new Error("consumer boom");
				},
				onConsumerError,
			}),
		).resolves.toBeUndefined();

		expect(delivered).toBeGreaterThan(0);
		expect(onConsumerError).toHaveBeenCalledWith(expect.any(Error));
	});

	it("does not reject when a consumer throws on the desktop transport", async () => {
		const onConsumerError = vi.fn();
		let delivered = 0;

		const open = streamConversation(anthropicRequest(), new TauriChatTransport(), {
			onEvent: () => {
				delivered += 1;
				throw new Error("consumer boom");
			},
			onConsumerError,
		});

		await vi.waitFor(() => {
			expect(relay.invoke.mock.calls.some((call) => call[0] === "start_ai_stream")).toBe(true);
		});
		const startArgs = relay.invoke.mock.calls.find((call) => call[0] === "start_ai_stream")?.[1] as
			| { streamId: string }
			| undefined;
		if (!startArgs) throw new Error("start_ai_stream was not invoked");
		const { streamId } = startArgs;

		// The frame maps to a text_delta the consumer throws on. Without isolation
		// the throw would propagate through the Tauri event listener; here the client
		// catches it, so the emit does not throw and the stream still closes cleanly.
		expect(() =>
			relay.emit("ai:stream-frame", {
				streamId,
				event: "content_block_delta",
				data: JSON.stringify({ index: 0, delta: { type: "text_delta", text: "hi" } }),
			}),
		).not.toThrow();
		relay.emit("ai:stream-closed", { streamId, outcome: { kind: "done" } });

		await expect(open).resolves.toBeUndefined();
		expect(delivered).toBeGreaterThan(0);
		expect(onConsumerError).toHaveBeenCalledWith(expect.any(Error));
	});
});
