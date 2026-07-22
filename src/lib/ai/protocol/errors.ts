/**
 * Closed error taxonomy for the AI conversation protocol.
 *
 * The taxonomy is closed so that every surface consuming the protocol has to
 * decide what each failure means to a user. An open `string` code lets a new
 * provider failure reach the chat panel as raw text, which is how a provider
 * body containing key material ends up on screen — the failure mode
 * `src/lib/ai-provider-errors.ts` and `user_safe_provider_error` in
 * `src-tauri/src/ai/providers.rs` exist to prevent.
 *
 * `cancelled` is present for completeness of the taxonomy, but a user-initiated
 * stop is reported as the terminal `aborted` stream event, not as an error; see
 * `./events.ts`. The code is reserved for a cancellation the user did not ask
 * for, such as a transport closing a stream out from under the client.
 */

/** Every way a protocol turn can fail. */
export type ProtocolErrorCode =
	/** The selected model cannot do what the request asks (for example tool calling). */
	| "unsupported_capability"
	/** No BYOK credential is configured for the selected provider. */
	| "no_api_key"
	/** The provider answered with a non-2xx status that is not rate limiting. */
	| "http_status"
	/** The provider rejected the request for rate or quota reasons. */
	| "rate_limited"
	/** The request never reached the provider, or the connection failed mid-flight. */
	| "transport"
	/** Provider frames arrived but could not be decoded into protocol events. */
	| "malformed_stream"
	/** The conversation cannot be trimmed to fit the model's input window. */
	| "context_overflow"
	/** The stream ended without the client asking it to. */
	| "cancelled";

export interface ProtocolError {
	code: ProtocolErrorCode;
	/**
	 * One sentence that is safe to render, log, and persist. It is authored by
	 * ThreatForge, never copied from a provider response.
	 */
	message: string;
	/**
	 * Provider-supplied context, already redacted and length-capped by whoever
	 * constructed the error. Never key material and never rendered as the primary
	 * message. Absent when the provider said nothing worth keeping.
	 */
	providerDetail?: string;
}

/** Longest provider-supplied detail retained after redaction. */
const PROVIDER_DETAIL_MAX_LENGTH = 200;

/**
 * Provider key tokens (`sk-...`, `sk-ant-...`, `sk-proj-...`). An OpenAI 401
 * body echoes the submitted key back in its `message` field, so provider text
 * must be assumed to contain key material until proven otherwise. The match is
 * case-insensitive: real keys are lowercase, but a proxy or log formatter
 * between here and the provider may not preserve casing.
 */
const KEY_TOKEN_PATTERN = /\bsk-[A-Za-z0-9_-]+/gi;

/**
 * Make provider-supplied text safe to carry as `providerDetail`.
 *
 * Key-shaped tokens are masked before truncation so a cut cannot leave a
 * recognizable key prefix behind, and the result is length-capped so a provider
 * cannot flood the UI or persisted error state. The desktop relay (issue #61
 * step 8) must apply the same rule, in the same mask-then-truncate order, in
 * Rust before frames cross the IPC boundary.
 */
export function redactProviderDetail(detail: string): string {
	const masked = detail.replace(KEY_TOKEN_PATTERN, "[redacted-key]");
	if (masked.length <= PROVIDER_DETAIL_MAX_LENGTH) return masked;
	let end = PROVIDER_DETAIL_MAX_LENGTH;
	const lastKeptCode = masked.charCodeAt(end - 1);
	// Never cut inside a surrogate pair: the detail is documented as safe to
	// persist and serialize, and a lone high surrogate is neither.
	if (lastKeptCode >= 0xd800 && lastKeptCode <= 0xdbff) end -= 1;
	return `${masked.slice(0, end)}…`;
}

/**
 * A thrown carrier for a {@link ProtocolError}.
 *
 * Synchronous protocol failures — request preflight (issue #61 step 3) is the
 * first — throw this rather than a bare `Error` so a caller can branch on
 * `code` instead of parsing a message. The `message` passed to `Error` is the
 * same user-safe sentence, so an uncaught throw still renders acceptably.
 */
export class ProtocolException extends Error {
	readonly error: ProtocolError;

	constructor(error: ProtocolError) {
		super(error.message);
		this.name = "ProtocolException";
		this.error = error;
	}
}
