import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { z } from "zod";
import { ProtocolException } from "@/lib/ai/protocol/errors";
import { buildSystemPrompt } from "@/lib/ai-prompt";
import type { AiProvider, ChatMessage } from "@/stores/chat-store";
import type { ThreatModel } from "@/types/threat-model";
import type {
	ChatAdapter,
	ChatStreamCallbacks,
	ChatTransport,
	ProviderStreamRequest,
	TransportCallbacks,
} from "./chat-adapter";

/** Emitted once per SSE frame the Rust relay split out of the provider stream. */
const STREAM_FRAME_EVENT = "ai:stream-frame";
/** Emitted exactly once per accepted stream, carrying its terminal outcome. */
const STREAM_CLOSED_EVENT = "ai:stream-closed";

/**
 * Wire contracts for the two relay events, mirroring `StreamFramePayload` and
 * `StreamClosedPayload` in `src-tauri/src/ai/types.rs`.
 *
 * Tauri event payloads arrive as `unknown`, so they are narrowed here rather
 * than asserted: a payload that does not match this shape means the Rust and
 * TypeScript sides of the IPC contract have diverged, which the transport
 * reports instead of decoding a stream whose frames it may be dropping.
 */
const streamFramePayloadSchema = z.object({
	streamId: z.string(),
	event: z.string(),
	data: z.string(),
});

const streamOutcomeSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("done") }),
	z.object({ kind: z.literal("cancelled") }),
	z.object({
		kind: z.literal("httpError"),
		status: z.number().int(),
		message: z.string(),
		providerDetail: z.string().optional(),
		retryAfterMs: z.number().optional(),
	}),
	z.object({
		kind: z.literal("transportError"),
		message: z.string(),
		reason: z.enum(["network", "malformedStream", "responseTooLarge"]),
	}),
]);

const streamClosedPayloadSchema = z.object({
	streamId: z.string(),
	outcome: streamOutcomeSchema,
});

/** Reported when a relay event does not match the IPC contract above. */
const RELAY_CONTRACT_VIOLATION =
	"The desktop AI relay sent an event this build could not decode, so the response was stopped.";

/** Reported when `start_ai_stream` was rejected without an error string. */
const RELAY_START_FAILED = "The desktop AI relay refused to start the request.";

interface Deferred {
	promise: Promise<void>;
	resolve: () => void;
}

function createDeferred(): Deferred {
	let resolve: () => void = () => undefined;
	const promise = new Promise<void>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
}

/**
 * Desktop chat transport — a bridge over the Rust relay in
 * `src-tauri/src/ai/providers.rs`.
 *
 * Rust holds the API key and owns the endpoint and auth headers; this side
 * supplies only the provider, the mapper-built body, and a stream id, then
 * forwards the relayed SSE frames untouched. The frames are identical to the
 * ones the browser transport reads off `fetch`, so a single shared decoder and
 * mapper pair serve both platforms.
 */
export class TauriChatTransport implements ChatTransport {
	async open(
		request: ProviderStreamRequest,
		callbacks: TransportCallbacks,
		signal?: AbortSignal,
	): Promise<void> {
		if (signal?.aborted) {
			callbacks.onClose("cancelled");
			return;
		}

		// A fresh id per stream, never a reused one: the relay emits
		// `ai:stream-closed` before removing its registry entry, so restarting with
		// the previous id can lose the race and be rejected as a duplicate.
		const streamId = crypto.randomUUID();
		const terminal = createDeferred();
		const unlisteners: UnlistenFn[] = [];
		let settled = false;
		let relayStarted = false;
		let startError: unknown;
		let startRejected = false;

		/** Deliver this stream's single terminal result and stop waiting. */
		const settle = (deliver: () => void): void => {
			if (settled) return;
			settled = true;
			deliver();
			terminal.resolve();
		};

		/**
		 * Fail this stream on a relay event that does not match the IPC contract.
		 *
		 * Such an event carries no usable stream id, so it cannot be attributed and
		 * cannot be filtered out. Failing closed is the safe reading: the
		 * alternative is to drop it, and a dropped frame produces a truncated answer
		 * that is indistinguishable from a complete one.
		 */
		const failOnContractViolation = (): void => {
			settle(() => {
				callbacks.onTransportError({
					message: RELAY_CONTRACT_VIOLATION,
					// Not `network`: a contract mismatch is a build-level divergence, and
					// the retry policy must never retry it.
					reason: "malformedStream",
				});
			});
		};

		const onAbort = (): void => {
			if (relayStarted) {
				// Best effort: the relay only observes its cancel flag when the next
				// chunk arrives.
				void invoke("cancel_ai_stream", { streamId }).catch(() => undefined);
			}
			// Cancellation resolves here rather than on `ai:stream-closed`. A stream
			// on a connection that has gone silent only closes at the relay's read
			// timeout — up to 300 seconds — and a user's stop must not wait for that.
			settle(() => callbacks.onClose("cancelled"));
		};
		signal?.addEventListener("abort", onAbort, { once: true });

		try {
			// Both subscriptions are registered before the relay starts so no frame
			// can be emitted into a window where nobody is listening.
			unlisteners.push(
				await listen<unknown>(STREAM_FRAME_EVENT, (event) => {
					if (settled) return;
					const payload = streamFramePayloadSchema.safeParse(event.payload);
					if (!payload.success) {
						failOnContractViolation();
						return;
					}
					// Several streams can be live at once, and every one of them sees
					// every relay event: anything not addressed to this stream is not
					// this stream's to decode.
					if (payload.data.streamId !== streamId) return;
					callbacks.onFrame({ event: payload.data.event, data: payload.data.data });
				}),
			);

			unlisteners.push(
				await listen<unknown>(STREAM_CLOSED_EVENT, (event) => {
					if (settled) return;
					const payload = streamClosedPayloadSchema.safeParse(event.payload);
					if (!payload.success) {
						failOnContractViolation();
						return;
					}
					if (payload.data.streamId !== streamId) return;
					const outcome = payload.data.outcome;
					settle(() => {
						switch (outcome.kind) {
							case "done":
								callbacks.onClose("done");
								return;
							case "cancelled":
								callbacks.onClose("cancelled");
								return;
							case "httpError":
								callbacks.onHttpError({
									status: outcome.status,
									message: outcome.message,
									providerDetail: outcome.providerDetail,
									retryAfterMs: outcome.retryAfterMs,
								});
								return;
							case "transportError":
								callbacks.onTransportError({
									message: outcome.message,
									reason: outcome.reason,
								});
						}
					});
				}),
			);

			// The signal may have aborted while the subscriptions were registering.
			if (settled) return;

			relayStarted = true;
			void invoke("start_ai_stream", {
				provider: request.provider,
				body: request.body,
				streamId,
			}).then(
				() => {
					// The relay emits `ai:stream-closed` before the command returns, so
					// the terminal event is already in flight. Nothing to do here.
				},
				(error: unknown) => {
					// A rejection means the request was refused before any stream
					// existed, so no `ai:stream-closed` will follow and the wait below
					// has to be released by hand.
					settle(() => {
						startRejected = true;
						startError = error;
					});
				},
			);

			await terminal.promise;

			if (startRejected) {
				throw new ProtocolException({
					code: "transport",
					// Every `Err` this command returns is a sentence authored in Rust —
					// an invalid body, a missing stored key, a duplicate stream id — so
					// it is safe to show and more useful than a generic failure.
					message: typeof startError === "string" ? startError : RELAY_START_FAILED,
				});
			}
		} finally {
			signal?.removeEventListener("abort", onAbort);
			for (const unlisten of unlisteners) {
				unlisten();
			}
		}
	}
}

/**
 * Desktop chat adapter — the string-only chat path.
 *
 * @deprecated Superseded by {@link TauriChatTransport}. This path is already
 * inert: issue #61 step 8 replaced the `send_chat_message` command and the
 * `ai:stream-chunk`/`-done`/`-error` events with the relay, so the invoke below
 * has nothing to reach. It stays only because `src/stores/chat-store.ts` still
 * imports the adapter interface, and step 10 deletes both together with the
 * `cancel_chat_stream` command this is the last caller of.
 */
export class TauriChatAdapter implements ChatAdapter {
	async sendMessage(
		provider: AiProvider,
		messages: ChatMessage[],
		model: ThreatModel,
		callbacks: ChatStreamCallbacks,
		modelId: string,
		signal?: AbortSignal,
	): Promise<void> {
		const unlisteners: (() => void)[] = [];

		// Listen for abort signal to cancel the stream on the Rust side
		const onAbort = () => {
			void invoke("cancel_chat_stream").catch(() => {});
		};
		if (signal) {
			signal.addEventListener("abort", onAbort, { once: true });
		}

		try {
			const unlisten1 = await listen<{ text: string }>("ai:stream-chunk", (event) => {
				callbacks.onChunk(event.payload.text);
			});
			unlisteners.push(unlisten1);

			const donePromise = new Promise<void>((resolve, reject) => {
				listen("ai:stream-done", () => {
					resolve();
				}).then((unlisten) => unlisteners.push(unlisten));

				listen<{ error: string }>("ai:stream-error", (event) => {
					reject(new Error(event.payload.error));
				}).then((unlisten) => unlisteners.push(unlisten));
			});

			const ipcMessages = messages.map((m) => ({
				role: m.role,
				content: m.content,
			}));

			// The prompt is built here, not in Rust: issue #61 step 5 made TypeScript
			// the sole prompt owner and dropped the `ThreatModel` from the command, so
			// the model is no longer serialized across the IPC boundary on every turn.
			// No native tools yet, so the empty list keeps the fenced ` ```actions ` path.
			const systemPrompt = buildSystemPrompt(model, { tools: [] });

			await invoke("send_chat_message", {
				provider,
				messages: ipcMessages,
				systemPrompt,
				modelId,
			});

			await donePromise;

			if (!signal?.aborted) {
				callbacks.onDone();
			}
		} catch (err) {
			// Don't treat abort as an error
			if (signal?.aborted) return;
			const errorMessage = err instanceof Error ? err.message : String(err);
			callbacks.onError(errorMessage);
			throw err;
		} finally {
			if (signal) {
				signal.removeEventListener("abort", onAbort);
			}
			for (const unlisten of unlisteners) {
				unlisten();
			}
		}
	}
}
