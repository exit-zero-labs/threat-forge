/**
 * Desktop transport contract against a fake relay.
 *
 * The tests drive the real `ai:stream-frame` / `ai:stream-closed` payload shapes
 * from `src-tauri/src/ai/types.rs`; only the Tauri IPC boundary itself is
 * replaced. Stream identity, cancellation timing, and subscription teardown are
 * the properties that cannot be observed from the Rust side alone.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ProtocolException } from "@/lib/ai/protocol/errors";
import { buildAnthropicRequestBody } from "@/lib/ai/providers/anthropic";
import { buildOpenAiRequestBody } from "@/lib/ai/providers/openai";
import rustRelaySource from "../../../src-tauri/src/ai/providers.rs?raw";
import {
	missingApiKeyError,
	type ProviderStreamRequest,
	type TransportCallbacks,
} from "./chat-adapter";
import { TauriChatTransport } from "./tauri-chat-adapter";

/**
 * The refusal `start_ai_stream` returns when no key is stored, restated here
 * rather than imported so that this file agrees with both sides independently:
 * the drift test below reads it out of the Rust source, and the behavior test
 * feeds it to the transport, so a change to either side fails one of them.
 */
const RUST_NO_API_KEY_REFUSAL =
	"no API key is configured for this provider — add one in AI Settings";

const relay = vi.hoisted(() => {
	type Handler = (event: { payload: unknown }) => void;

	const handlers = new Map<string, Set<Handler>>();
	const unlistenedEvents: string[] = [];

	const listen = vi.fn(async (name: string, handler: Handler): Promise<() => void> => {
		const registered = handlers.get(name) ?? new Set<Handler>();
		registered.add(handler);
		handlers.set(name, registered);
		return () => {
			unlistenedEvents.push(name);
			registered.delete(handler);
		};
	});

	const invoke = vi.fn(async (_command: string, _args?: unknown): Promise<unknown> => undefined);

	return {
		listen,
		invoke,
		unlistenedEvents,
		/** Deliver a relay event to every current subscriber, as Tauri would. */
		emit(name: string, payload: unknown): void {
			for (const handler of [...(handlers.get(name) ?? [])]) {
				handler({ payload });
			}
		},
		liveSubscriptions(): number {
			let total = 0;
			for (const registered of handlers.values()) total += registered.size;
			return total;
		},
		reset(): void {
			handlers.clear();
			unlistenedEvents.length = 0;
			listen.mockClear();
			invoke.mockReset();
			invoke.mockResolvedValue(undefined);
		},
	};
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: relay.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: relay.listen }));

const FRAME_EVENT = "ai:stream-frame";
const CLOSED_EVENT = "ai:stream-closed";

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

/** The argument shape `start_ai_stream` is documented to accept. */
const startArgsSchema = z.object({
	provider: z.enum(["anthropic", "openai"]),
	// The relay rejects any body that does not ask for a stream, so this literal
	// is part of the contract rather than an incidental field.
	body: z.object({ model: z.string().min(1), stream: z.literal(true) }),
	streamId: z.string().min(1),
});

const cancelArgsSchema = z.object({ streamId: z.string().min(1) });

function recordingCallbacks() {
	return {
		onFrame: vi.fn(),
		onHttpError: vi.fn(),
		onTransportError: vi.fn(),
		onClose: vi.fn(),
	} satisfies TransportCallbacks;
}

function invocations(command: string): unknown[] {
	return relay.invoke.mock.calls.filter((call) => call[0] === command).map((call) => call[1]);
}

/**
 * Start a stream and wait until the relay has been invoked, returning the stream
 * id the transport generated.
 */
async function startStream(
	request: ProviderStreamRequest = anthropicRequest,
	signal?: AbortSignal,
): Promise<{
	open: Promise<void>;
	callbacks: ReturnType<typeof recordingCallbacks>;
	streamId: string;
}> {
	const callbacks = recordingCallbacks();
	const open = new TauriChatTransport().open(request, callbacks, signal);
	await vi.waitFor(() => {
		expect(invocations("start_ai_stream")).toHaveLength(1);
	});
	const args = startArgsSchema.parse(invocations("start_ai_stream")[0]);
	return { open, callbacks, streamId: args.streamId };
}

beforeEach(() => {
	relay.reset();
});

describe("TauriChatTransport stream identity", () => {
	it("ignores frames addressed to another stream", async () => {
		const { open, callbacks, streamId } = await startStream();

		relay.emit(FRAME_EVENT, { streamId: "some-other-stream", event: "message", data: "foreign" });
		relay.emit(FRAME_EVENT, { streamId, event: "content_block_delta", data: '{"mine":true}' });

		relay.emit(CLOSED_EVENT, { streamId, outcome: { kind: "done" } });
		await open;

		expect(callbacks.onFrame).toHaveBeenCalledTimes(1);
		expect(callbacks.onFrame).toHaveBeenCalledWith({
			event: "content_block_delta",
			data: '{"mine":true}',
		});
	});

	it("does not close on another stream's terminal event", async () => {
		const { open, callbacks, streamId } = await startStream();

		relay.emit(CLOSED_EVENT, {
			streamId: "some-other-stream",
			outcome: { kind: "httpError", status: 401, message: "not mine" },
		});
		relay.emit(FRAME_EVENT, { streamId, event: "message", data: "still streaming" });

		expect(callbacks.onClose).not.toHaveBeenCalled();
		expect(callbacks.onHttpError).not.toHaveBeenCalled();
		expect(callbacks.onFrame).toHaveBeenCalledTimes(1);

		relay.emit(CLOSED_EVENT, { streamId, outcome: { kind: "done" } });
		await open;
		expect(callbacks.onClose).toHaveBeenCalledWith("done");
	});

	it("gives every stream a fresh id rather than reusing one", async () => {
		const first = await startStream();
		relay.emit(CLOSED_EVENT, { streamId: first.streamId, outcome: { kind: "done" } });
		await first.open;

		relay.invoke.mockClear();
		const second = await startStream();
		relay.emit(CLOSED_EVENT, { streamId: second.streamId, outcome: { kind: "done" } });
		await second.open;

		// The relay emits `ai:stream-closed` before it frees the registry entry, so a
		// reused id can race the removal and be refused as a duplicate.
		expect(second.streamId).not.toBe(first.streamId);
		expect(first.streamId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
	});

	it("ignores frames that arrive after the stream closed", async () => {
		const { open, callbacks, streamId } = await startStream();
		relay.emit(CLOSED_EVENT, { streamId, outcome: { kind: "done" } });
		await open;

		relay.emit(FRAME_EVENT, { streamId, event: "message", data: "late" });

		expect(callbacks.onFrame).not.toHaveBeenCalled();
		expect(callbacks.onClose).toHaveBeenCalledTimes(1);
	});
});

describe("TauriChatTransport cancellation", () => {
	it("cancels the matching stream id and resolves without waiting for the relay", async () => {
		const controller = new AbortController();
		const { open, callbacks, streamId } = await startStream(anthropicRequest, controller.signal);

		controller.abort();
		await open;

		expect(cancelArgsSchema.parse(invocations("cancel_ai_stream")[0])).toEqual({ streamId });
		expect(callbacks.onClose).toHaveBeenCalledWith("cancelled");
		// The relay only observes its cancel flag when the next chunk arrives, so a
		// silent connection closes at the read timeout — up to 300 seconds. Awaiting
		// `ai:stream-closed` here would hold the stop control open for that long.
		expect(relay.liveSubscriptions()).toBe(0);
	});

	it("ignores the relay's own cancelled event once cancellation resolved locally", async () => {
		const controller = new AbortController();
		const { open, callbacks, streamId } = await startStream(anthropicRequest, controller.signal);

		controller.abort();
		await open;
		relay.emit(CLOSED_EVENT, { streamId, outcome: { kind: "cancelled" } });

		expect(callbacks.onClose).toHaveBeenCalledTimes(1);
	});

	it("does not start a stream at all when the signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort();
		const callbacks = recordingCallbacks();

		await new TauriChatTransport().open(anthropicRequest, callbacks, controller.signal);

		expect(relay.invoke).not.toHaveBeenCalled();
		expect(callbacks.onClose).toHaveBeenCalledWith("cancelled");
	});
});

describe("TauriChatTransport teardown", () => {
	it.each([
		["a completed stream", { kind: "done" }],
		["a relay-side cancellation", { kind: "cancelled" }],
		[
			"an HTTP failure",
			{ kind: "httpError", status: 429, message: "rate limited", retryAfterMs: 2000 },
		],
		["a transport failure", { kind: "transportError", message: "no route", reason: "network" }],
	])("unsubscribes after %s", async (_case, outcome) => {
		const { open, streamId } = await startStream();
		expect(relay.liveSubscriptions()).toBe(2);

		relay.emit(CLOSED_EVENT, { streamId, outcome });
		await open;

		expect(relay.liveSubscriptions()).toBe(0);
		expect(relay.unlistenedEvents).toEqual(expect.arrayContaining([FRAME_EVENT, CLOSED_EVENT]));
	});

	it("unsubscribes after a cancellation", async () => {
		const controller = new AbortController();
		const { open } = await startStream(anthropicRequest, controller.signal);
		controller.abort();
		await open;

		expect(relay.liveSubscriptions()).toBe(0);
	});

	it("unsubscribes after the relay refuses to start the stream", async () => {
		relay.invoke.mockRejectedValue("a stream with this id is already running");
		const callbacks = recordingCallbacks();

		await expect(new TauriChatTransport().open(anthropicRequest, callbacks)).rejects.toBeInstanceOf(
			ProtocolException,
		);

		expect(relay.liveSubscriptions()).toBe(0);
		expect(relay.unlistenedEvents).toEqual(expect.arrayContaining([FRAME_EVENT, CLOSED_EVENT]));
	});
});

describe("TauriChatTransport outcome mapping", () => {
	it("carries an HTTP failure's status, redacted detail, and retry hint", async () => {
		const { open, callbacks, streamId } = await startStream();

		relay.emit(CLOSED_EVENT, {
			streamId,
			outcome: {
				kind: "httpError",
				status: 429,
				message: "Anthropic API error (429): the rate limit or quota was exceeded",
				providerDetail: "rate_limit_error: [redacted-key]",
				retryAfterMs: 2000,
			},
		});
		await open;

		expect(callbacks.onHttpError).toHaveBeenCalledWith({
			status: 429,
			message: "Anthropic API error (429): the rate limit or quota was exceeded",
			providerDetail: "rate_limit_error: [redacted-key]",
			retryAfterMs: 2000,
		});
		expect(callbacks.onClose).not.toHaveBeenCalled();
	});

	it.each(["network", "malformedStream", "responseTooLarge"] as const)(
		"passes the %s failure reason through instead of a message to match on",
		async (reason) => {
			const { open, callbacks, streamId } = await startStream();

			relay.emit(CLOSED_EVENT, {
				streamId,
				outcome: { kind: "transportError", message: "the request failed", reason },
			});
			await open;

			expect(callbacks.onTransportError).toHaveBeenCalledWith({
				message: "the request failed",
				reason,
			});
		},
	);

	it("reports the relay's authored reason when the stream is refused up front", async () => {
		relay.invoke.mockRejectedValue("the AI request body must set `stream` to true");
		const callbacks = recordingCallbacks();

		const open = new TauriChatTransport().open(anthropicRequest, callbacks);

		await expect(open).rejects.toMatchObject({
			error: { code: "transport", message: "the AI request body must set `stream` to true" },
		});
		// A refused request never became a stream, so no terminal callback is owed.
		expect(callbacks.onClose).not.toHaveBeenCalled();
		expect(callbacks.onTransportError).not.toHaveBeenCalled();
	});
});

describe("TauriChatTransport missing-key refusal", () => {
	it("raises the same no_api_key code the browser transport raises", async () => {
		relay.invoke.mockRejectedValue(RUST_NO_API_KEY_REFUSAL);

		const open = new TauriChatTransport().open(anthropicRequest, recordingCallbacks());

		// A consumer branching on `no_api_key` — to open AI Settings rather than
		// offer a retry — must reach the same decision on both platforms.
		await expect(open).rejects.toMatchObject({
			error: missingApiKeyError("anthropic").error,
		});
		await expect(open).rejects.toMatchObject({ error: { code: "no_api_key" } });
	});

	it("names the provider the user has to configure", async () => {
		relay.invoke.mockRejectedValue(RUST_NO_API_KEY_REFUSAL);

		await expect(
			new TauriChatTransport().open(openAiRequest, recordingCallbacks()),
		).rejects.toMatchObject({ error: { message: expect.stringContaining("openai") } });
	});

	it("leaves every other relay refusal on the transport code", async () => {
		// Only the missing key is actionable; a body the relay rejected is a build
		// defect, and telling the user to add a key they have would be a dead end.
		relay.invoke.mockRejectedValue("the stored API key could not be read");

		await expect(
			new TauriChatTransport().open(anthropicRequest, recordingCallbacks()),
		).rejects.toMatchObject({ error: { code: "transport" } });
	});

	it("matches the sentence the Rust relay actually returns", () => {
		// Read from disk rather than restated, so the day `RelayError::NoApiKey` is
		// reworded this fails here instead of silently downgrading every desktop
		// missing-key failure to `transport`.
		expect(rustRelaySource).toContain(`#[error("${RUST_NO_API_KEY_REFUSAL}")]`);
	});
});

describe("TauriChatTransport IPC narrowing", () => {
	it("fails closed on a frame payload that does not match the relay contract", async () => {
		const { open, callbacks } = await startStream();

		relay.emit(FRAME_EVENT, { streamId: 42, event: "message" });
		await open;

		expect(callbacks.onFrame).not.toHaveBeenCalled();
		expect(callbacks.onTransportError).toHaveBeenCalledWith({
			message: expect.stringContaining("could not decode"),
			// Never `network`: a contract mismatch is not something a retry can fix.
			reason: "malformedStream",
		});
	});

	it("fails closed on an outcome kind this build does not know", async () => {
		const { open, callbacks, streamId } = await startStream();

		relay.emit(CLOSED_EVENT, { streamId, outcome: { kind: "somethingNew" } });
		await open;

		expect(callbacks.onClose).not.toHaveBeenCalled();
		expect(callbacks.onTransportError).toHaveBeenCalledWith({
			message: expect.stringContaining("could not decode"),
			reason: "malformedStream",
		});
	});

	it("leaves a malformed event addressed to another stream to that stream", async () => {
		const { open, callbacks, streamId } = await startStream();

		// Both name a different stream and violate the rest of the contract. Every
		// live stream sees them, so deciding addressing after shape would let one
		// broken payload tear down every conversation in the window at once.
		relay.emit(FRAME_EVENT, { streamId: "some-other-stream", event: 42, data: "x" });
		relay.emit(CLOSED_EVENT, {
			streamId: "some-other-stream",
			outcome: { kind: "somethingNew" },
		});

		expect(callbacks.onTransportError).not.toHaveBeenCalled();
		expect(callbacks.onClose).not.toHaveBeenCalled();

		relay.emit(CLOSED_EVENT, { streamId, outcome: { kind: "done" } });
		await open;
		expect(callbacks.onClose).toHaveBeenCalledWith("done");
	});

	it("still fails closed on a malformed event addressed to this stream", async () => {
		const { open, callbacks, streamId } = await startStream();

		relay.emit(FRAME_EVENT, { streamId, event: 42, data: "x" });
		await open;

		expect(callbacks.onFrame).not.toHaveBeenCalled();
		expect(callbacks.onTransportError).toHaveBeenCalledWith({
			message: expect.stringContaining("could not decode"),
			reason: "malformedStream",
		});
	});
});

describe("TauriChatTransport consumer failures", () => {
	it("settles and unsubscribes even when a terminal callback throws", async () => {
		const { open, callbacks, streamId } = await startStream();
		callbacks.onClose.mockImplementation(() => {
			throw new Error("the consumer blew up");
		});

		// Tauri dispatches event handlers synchronously, as the fake relay does, so
		// the throw surfaces at the emit rather than being swallowed.
		expect(() => relay.emit(CLOSED_EVENT, { streamId, outcome: { kind: "done" } })).toThrow(
			"the consumer blew up",
		);

		// Without settling in a `finally`, `open()` would stay pending forever and
		// the teardown below would never run, leaking both subscriptions per stream.
		await expect(open).resolves.toBeUndefined();
		expect(relay.liveSubscriptions()).toBe(0);
	});
});

describe("TauriChatTransport request forwarding", () => {
	it.each([
		["anthropic", anthropicRequest],
		["openai", openAiRequest],
	] as const)("hands the relay the %s body with streaming enabled", async (provider, request) => {
		const { open, streamId } = await startStream(request);

		const args = startArgsSchema.parse(invocations("start_ai_stream")[0]);
		expect(args.provider).toBe(provider);
		expect(args.streamId).toBe(streamId);

		relay.emit(CLOSED_EVENT, { streamId, outcome: { kind: "done" } });
		await open;
	});

	it("never sends a URL, a header, or key material to the relay", async () => {
		const { open, streamId } = await startStream();

		const serialized = JSON.stringify(invocations("start_ai_stream")[0]);
		expect(serialized).not.toContain("https://");
		expect(serialized).not.toContain("x-api-key");
		expect(serialized).not.toContain("Authorization");
		expect(serialized).not.toContain("sk-");

		relay.emit(CLOSED_EVENT, { streamId, outcome: { kind: "done" } });
		await open;
	});
});
