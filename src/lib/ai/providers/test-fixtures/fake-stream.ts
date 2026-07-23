/**
 * Deterministic stand-ins for a provider stream, requiring no key and no network.
 *
 * Every helper here is pure data plus a `ReadableStream` or an in-memory relay
 * replay: there are no timers, no randomness, and no live sockets, so a fixture
 * produces the same bytes and the same frame order on every run. The browser
 * path is driven with a stubbed `fetch` returning {@link fakeStream}; the desktop
 * path is driven by replaying the same fixture frames through the real Tauri
 * relay event shape with {@link replayTauriFrames}. Because both paths consume
 * one shared fixture corpus, an identical `StreamEvent` sequence on the two
 * transports is the transport-neutrality proof, exactly as the cross-provider
 * mapper test is the provider-neutrality proof.
 *
 * Imported only by tests (`*.test.ts`), so nothing here reaches the bundle.
 */

import type { SseFrame } from "@/lib/ai/providers/sse";

const encoder = new TextEncoder();

/**
 * Serialize decoded frames back to SSE wire text.
 *
 * A frame whose event is the SSE default `"message"` — OpenAI's shape, including
 * its `[DONE]` sentinel — is written as a bare `data:` line with no `event:`
 * field, matching what the provider sends; any other event name is written as an
 * `event:`/`data:` pair. The result is what {@link fakeStream} turns into bytes.
 */
export function serializeFrames(frames: readonly SseFrame[]): string {
	let wire = "";
	for (const frame of frames) {
		if (frame.event !== "message") {
			wire += `event: ${frame.event}\n`;
		}
		wire += `data: ${frame.data}\n\n`;
	}
	return wire;
}

export interface FakeStreamOptions {
	/**
	 * Byte offsets at which to cut the serialized stream into chunks, so a test can
	 * force a chunk boundary mid-line, mid-JSON, or mid-multi-byte-UTF-8. Offsets
	 * are into the encoded byte array, applied in order; anything out of range is
	 * ignored. Omitted delivers the whole stream as one chunk.
	 */
	splitAt?: readonly number[];
	/** Response status; defaults to 200. A non-2xx makes `body` the error body. */
	status?: number;
	/** Response headers, e.g. a `retry-after` on a 429. */
	headers?: Record<string, string>;
}

/**
 * A finished `Response` whose body streams the serialized frames as bytes,
 * optionally split at caller-chosen offsets. Stands in for `fetch` on the
 * browser transport.
 */
export function fakeStream(frames: readonly SseFrame[], options: FakeStreamOptions = {}): Response {
	const bytes = encoder.encode(serializeFrames(frames));
	return byteResponse(bytes, options);
}

/**
 * A finished `Response` for a raw body string (not frames), used for HTTP-error
 * fixtures where the provider returns an error document rather than a stream.
 */
export function fakeErrorResponse(
	body: string,
	options: Omit<FakeStreamOptions, "splitAt"> = {},
): Response {
	return byteResponse(encoder.encode(body), options);
}

function byteResponse(bytes: Uint8Array, options: FakeStreamOptions): Response {
	const chunks = splitBytes(bytes, options.splitAt);
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(chunk);
			controller.close();
		},
	});
	const init: ResponseInit = {};
	if (options.status !== undefined) init.status = options.status;
	if (options.headers !== undefined) init.headers = options.headers;
	return new Response(stream, init);
}

/** Cut a byte array into chunks at the given ascending, in-range offsets. */
function splitBytes(bytes: Uint8Array, splitAt: readonly number[] | undefined): Uint8Array[] {
	if (splitAt === undefined || splitAt.length === 0) return [bytes];
	const chunks: Uint8Array[] = [];
	let start = 0;
	for (const offset of splitAt) {
		if (offset <= start || offset >= bytes.length) continue;
		chunks.push(bytes.subarray(start, offset));
		start = offset;
	}
	chunks.push(bytes.subarray(start));
	return chunks;
}

/**
 * A terminal outcome a desktop stream can end on, mirroring the `kind` variants of
 * `StreamClosedPayload.outcome` in `src-tauri/src/ai/types.rs`. Only the two the
 * corpus drives are modeled — a clean `done` and a retriable `httpError`; the real
 * `cancelled` and `transportError` outcomes are exercised through the transport's
 * own tests rather than replayed here.
 */
export type TauriStreamOutcome =
	| { kind: "done" }
	| {
			kind: "httpError";
			status: number;
			message: string;
			providerDetail?: string;
			retryAfterMs?: number;
	  };

/** The minimal relay surface {@link replayTauriFrames} drives; a test's mock satisfies it. */
export interface RelayEmitter {
	emit(name: string, payload: unknown): void;
}

const STREAM_FRAME_EVENT = "ai:stream-frame";
const STREAM_CLOSED_EVENT = "ai:stream-closed";

/**
 * Replay a fixture through the desktop relay's event shape for one stream id.
 *
 * Emits one `ai:stream-frame` per fixture frame — the pre-framed `{ streamId,
 * event, data }` shape the Rust relay produces, so no SSE byte decoding happens
 * on this path, matching desktop reality — then one terminal `ai:stream-closed`.
 * Driving the real `TauriChatTransport` this way exercises the shared decoder,
 * mappers, and client against the same corpus the browser path uses.
 */
export function replayTauriFrames(
	relay: RelayEmitter,
	streamId: string,
	frames: readonly SseFrame[],
	outcome: TauriStreamOutcome = { kind: "done" },
): void {
	for (const frame of frames) {
		relay.emit(STREAM_FRAME_EVENT, { streamId, event: frame.event, data: frame.data });
	}
	relay.emit(STREAM_CLOSED_EVENT, { streamId, outcome });
}
