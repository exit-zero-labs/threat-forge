/**
 * The one AI conversation client both platforms drive.
 *
 * `streamConversation` runs the whole turn in order — request preflight
 * (issue #61 step 3), context budgeting (step 4), provider request mapping
 * (steps 6–7), the platform transport (steps 8–9), and stream decoding — and
 * emits nothing but the `StreamEvent` vocabulary (step 1). A consumer never sees
 * a provider payload, a transport callback, or an HTTP status: it sees text
 * deltas, tool calls, usage, a stop reason, protocol errors, and cancellation.
 *
 * Two invariants this module owns:
 *
 *  1. **Cancellation is a terminal `aborted` event, never an error.** A stop
 *     keeps whatever text already arrived; it must not surface as a failure
 *     banner. Every other failure — preflight, budgeting, HTTP, transport, a
 *     malformed frame — is an `error` event carrying a user-safe, authored
 *     message.
 *  2. **A consumer callback is isolated from the transport.** The browser
 *     transport calls `onFrame` synchronously inside its read loop, so a throw
 *     from the consumer would otherwise reject `transport.open()` and, with it,
 *     `streamConversation` — while the desktop transport, dispatching frames
 *     from a Tauri event listener, would not. Dispatching every event through a
 *     guarded sink makes the two platforms behave identically: a consumer throw
 *     is surfaced on a fresh task (never swallowed) and never tears the stream
 *     down. This is the layer that owns consumer dispatch, which is why step 9
 *     deferred the fix here.
 */

import type {
	ChatTransport,
	ProviderStreamRequest,
	TransportCallbacks,
	TransportFailure,
	TransportHttpError,
} from "@/lib/adapters/chat-adapter";
import {
	buildAnthropicRequestBody,
	createAnthropicStreamMapper,
} from "@/lib/ai/providers/anthropic";
import { buildOpenAiRequestBody, createOpenAiStreamMapper } from "@/lib/ai/providers/openai";
import type { SseFrame } from "@/lib/ai/providers/sse";
import { resolveCapabilities } from "@/lib/ai-models";
import { budgetMessages } from "./budget";
import { type ProtocolError, ProtocolException } from "./errors";
import type { ErrorEvent, StreamEvent } from "./events";
import type { AiProvider, ProtocolMessage } from "./messages";
import { type ProviderChatRequest, preflightRequest } from "./request";
import type { AdvertisedTool } from "./tools";

/**
 * Everything one streamed turn needs, stated provider-neutrally.
 *
 * The client turns this into a provider-shaped body itself, so no caller ever
 * assembles one. `tools` is empty for today's fenced path; a non-empty list
 * makes the turn require native tool calling, which preflight enforces.
 */
export interface ConversationRequest {
	provider: AiProvider;
	/** Model id from settings, which may be stale; preflight decides what that means. */
	modelId: string;
	/** The composed system prompt for this turn. */
	system: string;
	/** Full conversation history; the client budgets it before sending. */
	messages: readonly ProtocolMessage[];
	/** Tools advertised this turn. Empty keeps the model on the fenced path. */
	tools: readonly AdvertisedTool[];
	/** Cap on the model's answer, also the tokens budgeting reserves. */
	maxOutputTokens: number;
}

/**
 * The consumer's window onto a turn.
 *
 * `onEvent` receives the protocol event stream. `onConsumerError` is the seam
 * that keeps a throwing `onEvent` from rejecting the stream: it defaults to a
 * fresh-task rethrow so the failure still reaches the environment's unhandled
 * error handling, and a test injects a spy to observe isolation deterministically.
 */
export interface StreamConversationHandlers {
	onEvent: (event: StreamEvent) => void;
	onConsumerError?: (error: unknown) => void;
}

/** The subset of a stream mapper the client consumes; both providers satisfy it. */
interface StreamMapper {
	mapFrame(frame: SseFrame): StreamEvent[];
}

/**
 * Surface a consumer's failure without letting it reject the stream or the
 * transport. Rethrowing on a fresh macrotask hands the error to the
 * environment's unhandled-error handling (the dev console, a test's error
 * reporter) rather than swallowing it — isolation is not suppression.
 */
function rethrowConsumerErrorOnFreshTask(error: unknown): void {
	setTimeout(() => {
		throw error;
	}, 0);
}

/** An HTTP failure is `rate_limited` only for 429; every other status is `http_status`. */
function httpErrorToProtocolError(error: TransportHttpError): ProtocolError {
	const mapped: ProtocolError = {
		code: error.status === 429 ? "rate_limited" : "http_status",
		message: error.message,
	};
	if (error.providerDetail !== undefined) {
		mapped.providerDetail = error.providerDetail;
	}
	return mapped;
}

/**
 * A below-HTTP failure maps by its `reason`, never by matching its message: a
 * framing violation is `malformed_stream`, and a dropped connection or a
 * response too large is `transport`.
 */
function transportFailureToProtocolError(failure: TransportFailure): ProtocolError {
	return {
		code: failure.reason === "malformedStream" ? "malformed_stream" : "transport",
		message: failure.message,
	};
}

/**
 * Wrap a synchronous protocol failure as an `error` event. A
 * {@link ProtocolException} already carries a user-safe {@link ProtocolError};
 * anything else is an unexpected bug and gets a generic authored sentence rather
 * than a raw internal message.
 */
function errorEventFrom(error: unknown): ErrorEvent {
	if (error instanceof ProtocolException) {
		return { type: "error", error: error.error };
	}
	return {
		type: "error",
		error: { code: "transport", message: "The AI request could not be completed." },
	};
}

/** Build the provider-shaped stream request and its matching mapper together. */
function buildProviderStream(
	provider: AiProvider,
	request: ProviderChatRequest,
): { streamRequest: ProviderStreamRequest; mapper: StreamMapper } {
	if (provider === "anthropic") {
		return {
			streamRequest: { provider: "anthropic", body: buildAnthropicRequestBody(request) },
			mapper: createAnthropicStreamMapper(),
		};
	}
	return {
		streamRequest: { provider: "openai", body: buildOpenAiRequestBody(request) },
		mapper: createOpenAiStreamMapper(),
	};
}

/**
 * Run one AI conversation turn to a terminal event.
 *
 * Resolves once the turn has ended — normally, by cancellation, or by a failure
 * — after the terminal event has been dispatched. It never rejects for an
 * expected protocol failure: preflight, budgeting, HTTP, transport, and
 * up-front transport refusals (a missing key) all arrive as `error` events, and
 * a stop arrives as `aborted`. A consumer therefore needs no `try`/`catch`
 * around it for protocol outcomes.
 */
export async function streamConversation(
	request: ConversationRequest,
	transport: ChatTransport,
	handlers: StreamConversationHandlers,
	signal?: AbortSignal,
): Promise<void> {
	const reportConsumerError = handlers.onConsumerError ?? rethrowConsumerErrorOnFreshTask;

	// The one place a consumer callback runs. Isolating it here is what makes the
	// two transports fail a throwing consumer identically (see the module doc).
	const dispatch = (event: StreamEvent): void => {
		try {
			handlers.onEvent(event);
		} catch (error) {
			reportConsumerError(error);
		}
	};

	// An already-stopped turn resolves as a cancellation without touching the
	// network, matching how both transports treat a pre-aborted signal.
	if (signal?.aborted) {
		dispatch({ type: "aborted" });
		return;
	}

	try {
		preflightRequest({
			provider: request.provider,
			modelId: request.modelId,
			tools: request.tools,
		});
	} catch (error) {
		dispatch(errorEventFrom(error));
		return;
	}

	// Budget only against a known model's window. An unknown model has no window
	// to budget against; preflight already allowed it for text, so the full
	// history is sent and any provider-side overflow returns as a typed error.
	const resolution = resolveCapabilities(request.provider, request.modelId);
	let messages = request.messages;
	if (resolution.known) {
		const budget = budgetMessages(request.messages, {
			maxInputTokens: resolution.capabilities.maxInputTokens,
			reserveOutputTokens: request.maxOutputTokens,
		});
		if (!budget.ok) {
			dispatch({ type: "error", error: budget.error });
			return;
		}
		messages = budget.messages;
	}

	const providerRequest: ProviderChatRequest = {
		modelId: request.modelId,
		system: request.system,
		messages,
		tools: request.tools,
		maxOutputTokens: request.maxOutputTokens,
	};
	const { streamRequest, mapper } = buildProviderStream(request.provider, providerRequest);

	// Whether the mapper produced a terminal event before the stream closed. A
	// normal `done` close after a `message_stop` (or after a provider error the
	// mapper already reported) is complete; a `done` close with neither is a
	// truncated response, which must not pass as a silent success (see `onClose`).
	let sawTerminalEvent = false;

	const callbacks: TransportCallbacks = {
		onFrame: (frame) => {
			// Mappers are total (they report undecodable frames as `malformed_stream`
			// events rather than throwing), so only the consumer dispatch below can
			// throw, and only it is isolated.
			for (const event of mapper.mapFrame(frame)) {
				// A `malformed_stream` error is a non-terminal notice scoped to one bad
				// frame (see `events.ts`); the turn continues, so it must not count as
				// the terminal event. Only a `message_stop` or a terminal provider error
				// ends the turn.
				if (
					event.type === "message_stop" ||
					(event.type === "error" && event.error.code !== "malformed_stream")
				) {
					sawTerminalEvent = true;
				}
				dispatch(event);
			}
		},
		onHttpError: (error) => dispatch({ type: "error", error: httpErrorToProtocolError(error) }),
		onTransportError: (failure) =>
			dispatch({ type: "error", error: transportFailureToProtocolError(failure) }),
		onClose: (reason) => {
			// Cancellation has no in-band frame, so the client is what turns it into
			// the terminal `aborted` event.
			if (reason === "cancelled") {
				dispatch({ type: "aborted" });
				return;
			}
			// A `done` close means the provider closed the body. If the mapper never
			// reported a terminal event, the stream ended before it was complete: a
			// truncated answer that renders as a finished one is a success-shaped
			// failure, so it surfaces as `malformed_stream` rather than nothing.
			if (!sawTerminalEvent) {
				dispatch({
					type: "error",
					error: {
						code: "malformed_stream",
						message: "The AI response ended before it was complete. Please try again.",
					},
				});
			}
		},
	};

	try {
		await transport.open(streamRequest, callbacks, signal);
	} catch (error) {
		// `ChatTransport.open` rejects only when the stream never started — a
		// missing key or a relay refusal — so no callback fired and this is the
		// turn's single terminal event.
		dispatch(errorEventFrom(error));
	}
}
