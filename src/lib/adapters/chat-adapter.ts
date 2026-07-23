import { ProtocolException } from "@/lib/ai/protocol/errors";
import type { AnthropicRequestBody } from "@/lib/ai/providers/anthropic";
import type { OpenAiRequestBody } from "@/lib/ai/providers/openai";
import type { SseFrame } from "@/lib/ai/providers/sse";
import type { AiProvider, ChatMessage } from "@/stores/chat-store";
import type { ThreatModel } from "@/types/threat-model";

/**
 * Callbacks for streaming AI chat responses.
 *
 * @deprecated The string-only chat contract. Superseded by {@link ChatTransport}
 * plus the shared decoder and mappers in `src/lib/ai/`; issue #61 step 10 moves
 * `src/stores/chat-store.ts` onto the protocol client and deletes this.
 */
export interface ChatStreamCallbacks {
	onChunk: (text: string) => void;
	onDone: () => void;
	onError: (error: string) => void;
}

/**
 * Adapter interface for AI chat communication.
 *
 * @deprecated Superseded by {@link ChatTransport}, which carries provider events
 * rather than pre-flattened text. Issue #61 step 10 removes this together with
 * its two implementations and `getChatAdapter`.
 */
export interface ChatAdapter {
	/** Send a chat message and stream the response via callbacks. */
	sendMessage(
		provider: AiProvider,
		messages: ChatMessage[],
		model: ThreatModel,
		callbacks: ChatStreamCallbacks,
		modelId: string,
		signal?: AbortSignal,
	): Promise<void>;
}

/**
 * A provider-shaped streaming request body, exactly as one of the mappers in
 * `src/lib/ai/providers/` built it.
 *
 * Discriminating on `provider` keeps a body from being posted to the other
 * provider's endpoint, and both members type `stream` as the literal `true`, so
 * the Rust relay's requirement that every relayed body sets `stream: true`
 * (`validate_body` in `src-tauri/src/ai/providers.rs`) is a compile-time
 * property of this type rather than a runtime hope.
 *
 * A transport serializes this value and never inspects it: request shaping is
 * the mappers' job and decoding is the client's.
 */
export type ProviderStreamRequest =
	| { provider: "anthropic"; body: AnthropicRequestBody }
	| { provider: "openai"; body: OpenAiRequestBody };

/** The provider answered with a non-success HTTP status. */
export interface TransportHttpError {
	status: number;
	/** User-safe sentence authored by ThreatForge; never provider text. */
	message: string;
	/** Provider body after redaction and truncation, when it said anything. */
	providerDetail?: string;
	/** Parsed `retry-after` hint, so a retry policy need not see headers. */
	retryAfterMs?: number;
}

/**
 * Why a stream failed below HTTP. The values mirror `TransportFailureReason` in
 * `src-tauri/src/ai/types.rs` on the wire, so the desktop relay's classification
 * and the browser transport's own reach consumers identically.
 *
 * A retry policy (issue #61 step 11) branches on this discriminator: `network`
 * failures may be retried before the first protocol event, while a framing or
 * size violation never is. Nothing may branch by matching `message` text.
 */
export type TransportFailureReason = "network" | "malformedStream" | "responseTooLarge";

/** The request or stream failed below HTTP. */
export interface TransportFailure {
	/** User-safe sentence authored by ThreatForge; never provider text. */
	message: string;
	reason: TransportFailureReason;
}

/** How a stream that reached no transport-level failure ended. */
export type TransportCloseReason =
	/** The provider closed the response stream. */
	| "done"
	/** The caller's `AbortSignal` stopped it. */
	| "cancelled";

/**
 * Transport callbacks for one stream.
 *
 * Exactly one of `onHttpError`, `onTransportError`, and `onClose` fires per
 * successful `open()`, after which no further callback fires. `onFrame` may fire
 * any number of times before it.
 */
export interface TransportCallbacks {
	/** One SSE frame, undecoded — mapping frames to events is the client's job. */
	onFrame: (frame: SseFrame) => void;
	onHttpError: (error: TransportHttpError) => void;
	onTransportError: (failure: TransportFailure) => void;
	onClose: (reason: TransportCloseReason) => void;
}

/**
 * The only platform-specific interface in the AI stack.
 *
 * Both implementations are transport-only: they carry a provider-shaped body to
 * the provider and relay SSE frames back. Neither knows a provider's event
 * protocol — one shared decoder (`src/lib/ai/providers/sse.ts`) and one shared
 * mapper pair decode frames on both platforms. The single intentional difference
 * between them is where the API key lives and who performs the HTTPS request:
 * the browser transport reads the key from `localStorage` and fetches directly,
 * while the desktop transport hands the body to Rust, which holds the key and
 * owns the endpoint and headers.
 */
export interface ChatTransport {
	/**
	 * Stream one provider request.
	 *
	 * Resolves once the single terminal callback has been delivered. Rejects only
	 * when the stream never started — a missing key or a request the relay
	 * refused up front — in which case no callback fired. Those are local
	 * precondition failures that a retry cannot fix; every failure that a retry
	 * could fix arrives through `onHttpError` or `onTransportError`.
	 *
	 * Aborting `signal` resolves cancellation locally rather than waiting for the
	 * provider or the relay to acknowledge it, so a stop is never delayed by a
	 * connection that has gone silent.
	 */
	open(
		request: ProviderStreamRequest,
		callbacks: TransportCallbacks,
		signal?: AbortSignal,
	): Promise<void>;
}

/**
 * The refusal both transports raise when the selected provider has no stored
 * credential.
 *
 * It lives here rather than in either transport because the code is what
 * consumers branch on — a settings prompt is the only useful response, and a
 * retry never is — and the two platforms discover the same condition in
 * different places: the browser reads `localStorage` before fetching, while
 * desktop learns it from the relay's refusal, since only Rust can see the
 * encrypted store.
 */
export function missingApiKeyError(provider: AiProvider): ProtocolException {
	return new ProtocolException({
		code: "no_api_key",
		message: `No API key configured for ${provider}. Open AI Settings to add one.`,
	});
}
