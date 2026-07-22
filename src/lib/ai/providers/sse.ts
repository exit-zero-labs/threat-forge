/**
 * Byte-level server-sent-events decoder shared by both stream transports.
 *
 * The browser transport feeds it raw `fetch` body chunks; the desktop relay
 * (issue #61 step 8) will perform equivalent framing in Rust before frames
 * cross the IPC boundary, so this module is the single TypeScript place where
 * provider bytes become frames. Network chunks can split anywhere — mid-line,
 * mid-JSON, and mid-UTF-8-sequence — so decoding is stateful and a frame is
 * emitted only once its `data:` line is complete.
 *
 * The framing is ported from the previous in-adapter parser
 * (`src/lib/adapters/browser-chat-adapter.ts`) and keeps two of its
 * simplifications the full SSE grammar does not share, both safe against the
 * two official endpoints this protocol targets: each `data:` line dispatches
 * one frame immediately rather than accumulating multi-line data until a blank
 * line (Anthropic and OpenAI emit exactly one `data:` line per event), and
 * field prefixes require the space after the colon (`data: x`, not `data:x`),
 * which both endpoints always emit.
 */

import { ProtocolException } from "@/lib/ai/protocol/errors";

/** The event name SSE assigns to a frame whose stream named none. */
const DEFAULT_EVENT = "message";

const EVENT_FIELD_PREFIX = "event: ";
const DATA_FIELD_PREFIX = "data: ";

/**
 * Longest partial line the decoder will buffer before failing closed. Real
 * provider data lines are a few KiB; a stream that exceeds this without a
 * newline is not speaking the protocol. Without the cap, a stream that never
 * terminates a line would grow the buffer forever while emitting zero frames —
 * the one failure shape no downstream guard could ever observe.
 */
const MAX_BUFFERED_LINE_LENGTH = 1_048_576;

/** One complete `{ event, data }` pair decoded from the stream. */
export interface SseFrame {
	/** The preceding `event:` field, or `"message"` when the stream named none. */
	event: string;
	/** The `data:` payload, untouched — JSON parsing is the mapper's job. */
	data: string;
}

export interface SseDecoder {
	/**
	 * Feed one network chunk and collect every frame it completed. A trailing
	 * partial line stays buffered until a later chunk finishes it. Throws a
	 * `malformed_stream` {@link ProtocolException} if that partial line exceeds
	 * the decoder's cap — the stream is not speaking SSE and must be abandoned.
	 */
	decode(chunk: Uint8Array): SseFrame[];
}

/** Create a decoder holding the partial-line and event-name state of one stream. */
export function createSseDecoder(): SseDecoder {
	// `stream: true` below keeps an incomplete UTF-8 sequence pending instead of
	// emitting U+FFFD, so a chunk boundary inside a multi-byte character decodes
	// identically to an unsplit stream.
	const textDecoder = new TextDecoder();
	let buffer = "";
	let eventName = DEFAULT_EVENT;

	return {
		decode(chunk: Uint8Array): SseFrame[] {
			const frames: SseFrame[] = [];
			buffer += textDecoder.decode(chunk, { stream: true });

			const lines = buffer.split("\n");
			// The last element is a line the stream has not terminated yet; keep it
			// for the next chunk.
			buffer = lines.pop() ?? "";
			if (buffer.length > MAX_BUFFERED_LINE_LENGTH) {
				// Drop the buffer before throwing so a caller that survives the throw
				// cannot keep growing it with further chunks.
				buffer = "";
				throw new ProtocolException({
					code: "malformed_stream",
					message: "The provider stream sent an unterminated line too long to be a real event.",
				});
			}

			for (const rawLine of lines) {
				// SSE permits CRLF line endings; the `\n` split leaves the `\r` behind.
				const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
				if (line.startsWith(EVENT_FIELD_PREFIX)) {
					eventName = line.slice(EVENT_FIELD_PREFIX.length).trim();
				} else if (line.startsWith(DATA_FIELD_PREFIX)) {
					frames.push({ event: eventName, data: line.slice(DATA_FIELD_PREFIX.length) });
					eventName = DEFAULT_EVENT;
				}
				// Blank separator lines and `:` comment keep-alives carry nothing.
			}

			return frames;
		},
	};
}
