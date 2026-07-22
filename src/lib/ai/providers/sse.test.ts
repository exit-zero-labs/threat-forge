import { describe, expect, it } from "vitest";
import { createSseDecoder, type SseFrame } from "./sse";

const encoder = new TextEncoder();

/**
 * A hand-authored Anthropic-shaped transcript (documented event shapes, not
 * recorded from a live account). The multi-byte characters inside the JSON
 * string ("café ☕") make byte-offset splits land mid-UTF-8-sequence as well as
 * mid-line and mid-JSON.
 */
const TRANSCRIPT =
	"event: message_start\n" +
	'data: {"type":"message_start","message":{"model":"test-model-1"}}\n' +
	"\n" +
	"event: content_block_delta\n" +
	'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"café ☕ review"}}\n' +
	"\n" +
	"event: message_stop\n" +
	'data: {"type":"message_stop"}\n' +
	"\n";

const EXPECTED_FRAMES: SseFrame[] = [
	{ event: "message_start", data: '{"type":"message_start","message":{"model":"test-model-1"}}' },
	{
		event: "content_block_delta",
		data: '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"café ☕ review"}}',
	},
	{ event: "message_stop", data: '{"type":"message_stop"}' },
];

function decodeChunks(chunks: Uint8Array[]): SseFrame[] {
	const decoder = createSseDecoder();
	const frames: SseFrame[] = [];
	for (const chunk of chunks) {
		frames.push(...decoder.decode(chunk));
	}
	return frames;
}

describe("createSseDecoder", () => {
	it("decodes a whole transcript delivered as a single chunk", () => {
		expect(decodeChunks([encoder.encode(TRANSCRIPT)])).toEqual(EXPECTED_FRAMES);
	});

	it("decodes identically when the transcript is split at every byte offset", () => {
		const bytes = encoder.encode(TRANSCRIPT);
		// Every interior offset, which includes every offset inside a JSON string
		// and inside the multi-byte UTF-8 sequences of "café ☕".
		for (let offset = 1; offset < bytes.length; offset++) {
			const frames = decodeChunks([bytes.subarray(0, offset), bytes.subarray(offset)]);
			expect(frames, `split at byte offset ${offset}`).toEqual(EXPECTED_FRAMES);
		}
	});

	it("holds a trailing partial line until a later chunk completes it", () => {
		const decoder = createSseDecoder();
		expect(decoder.decode(encoder.encode('data: {"a":'))).toEqual([]);
		expect(decoder.decode(encoder.encode("1}\n"))).toEqual([{ event: "message", data: '{"a":1}' }]);
	});

	it('assigns the SSE default event "message" to data lines with no event field', () => {
		// OpenAI's stream shape: bare data lines, including the [DONE] sentinel.
		const frames = decodeChunks([encoder.encode('data: {"choices":[]}\n\ndata: [DONE]\n\n')]);
		expect(frames).toEqual([
			{ event: "message", data: '{"choices":[]}' },
			{ event: "message", data: "[DONE]" },
		]);
	});

	it("resets the event name after each frame instead of letting it leak", () => {
		const frames = decodeChunks([
			encoder.encode("event: message_stop\ndata: {}\n\ndata: [DONE]\n\n"),
		]);
		expect(frames).toEqual([
			{ event: "message_stop", data: "{}" },
			{ event: "message", data: "[DONE]" },
		]);
	});

	it("ignores comment keep-alives and blank lines", () => {
		const frames = decodeChunks([encoder.encode(": keep-alive\n\n\nevent: ping\ndata: {}\n\n")]);
		expect(frames).toEqual([{ event: "ping", data: "{}" }]);
	});

	it("decodes CRLF line endings the same as LF", () => {
		const crlfTranscript = TRANSCRIPT.replace(/\n/g, "\r\n");
		expect(decodeChunks([encoder.encode(crlfTranscript)])).toEqual(EXPECTED_FRAMES);
	});

	it("fails closed when an unterminated line exceeds the buffer cap", () => {
		const decoder = createSseDecoder();
		const oversized = new Uint8Array(1_048_576 + 1).fill(120); // "x", no newline
		expect(() => decoder.decode(oversized)).toThrowError(
			expect.objectContaining({
				name: "ProtocolException",
				error: expect.objectContaining({ code: "malformed_stream" }),
			}),
		);
		// The buffer was dropped on breach: further chunks start clean instead of
		// regrowing the abandoned line.
		expect(decoder.decode(encoder.encode("data: {}\n"))).toEqual([
			{ event: "message", data: "{}" },
		]);
	});

	it("keeps buffering a stream that stays under the cap by terminating its lines", () => {
		const decoder = createSseDecoder();
		const bigButTerminated = `data: ${"y".repeat(500_000)}\n`;
		const frames = [
			...decoder.decode(encoder.encode(bigButTerminated)),
			...decoder.decode(encoder.encode(bigButTerminated)),
			...decoder.decode(encoder.encode(bigButTerminated)),
		];
		expect(frames).toHaveLength(3);
	});

	it("does not emit a final line the stream never terminated", () => {
		// A truncated stream ends mid-data-line; the decoder must not present the
		// fragment as a complete frame. Detecting truncation is the client's job.
		const truncated = 'event: message_start\ndata: {"type":"message_st';
		expect(decodeChunks([encoder.encode(truncated)])).toEqual([]);
	});
});
