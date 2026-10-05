/** Hand-authored Responses transcripts; no live accounts or captured credentials. */
import type { StreamEvent } from "@/lib/ai/protocol/events";
import type { SseFrame } from "@/lib/ai/providers/sse";
import { FIXTURE_MODEL } from "./anthropic-fixtures";

function frame(type: string, data: object = {}): SseFrame {
	return { event: type, data: JSON.stringify({ type, ...data }) };
}
const created = () => frame("response.created", { response: { model: FIXTURE_MODEL } });
const textItem = (text: string) => ({
	id: "msg_1",
	type: "message",
	role: "assistant",
	status: "completed",
	content: [{ type: "output_text", text, annotations: [] }],
});
const callItem = (id: string, name: string, args: string) => ({
	id: "fc_1",
	type: "function_call",
	call_id: id,
	name,
	arguments: args,
	status: "completed",
});
const textStart = () =>
	frame("response.output_item.added", {
		output_index: 0,
		item: { ...textItem(""), content: [], status: "in_progress" },
	});
const completed = (output: unknown[], inputTokens: number, outputTokens: number) =>
	frame("response.completed", {
		response: {
			model: FIXTURE_MODEL,
			status: "completed",
			output,
			usage: { input_tokens: inputTokens, output_tokens: outputTokens },
		},
	});

export const OPENAI_TEXT_STREAM: SseFrame[] = [
	created(),
	textStart(),
	frame("response.output_text.delta", { output_index: 0, delta: "Review " }),
	frame("response.output_text.delta", { output_index: 0, delta: "the gateway." }),
	completed([textItem("Review the gateway.")], 12, 9),
];
export const OPENAI_TOOL_STREAM: SseFrame[] = [
	created(),
	textStart(),
	frame("response.output_text.delta", { output_index: 0, delta: "Adding it." }),
	frame("response.output_item.added", {
		output_index: 1,
		item: callItem("call_1", "add_element", ""),
	}),
	frame("response.function_call_arguments.delta", { output_index: 1, delta: '{"type":"process",' }),
	frame("response.function_call_arguments.delta", { output_index: 1, delta: '"name":"Gateway"}' }),
	completed(
		[
			textItem("Adding it."),
			callItem("call_1", "add_element", '{"type":"process","name":"Gateway"}'),
		],
		20,
		15,
	),
];
export const OPENAI_EMPTY_ARGS_TOOL_STREAM: SseFrame[] = [
	created(),
	textStart(),
	frame("response.output_text.delta", { output_index: 0, delta: "Summarizing." }),
	frame("response.output_item.added", {
		output_index: 1,
		item: callItem("call_2", "get_document_summary", ""),
	}),
	completed([textItem("Summarizing."), callItem("call_2", "get_document_summary", "{}")], 20, 8),
];
export const OPENAI_TRUNCATED_STREAM: SseFrame[] = [
	created(),
	textStart(),
	frame("response.output_text.delta", { output_index: 0, delta: "Half a thou" }),
];

const fatal: StreamEvent = {
	type: "error",
	terminal: true,
	error: { code: "malformed_stream", message: "The OpenAI response could not be decoded safely." },
};
export const OPENAI_INVALID_JSON_STREAM: SseFrame[] = [
	created(),
	{ event: "response.output_text.delta", data: '{"delta":' },
	completed([], 0, 0),
];
export const EXPECTED_OPENAI_INVALID_JSON_EVENTS: StreamEvent[] = [
	{ type: "message_start", model: FIXTURE_MODEL },
	fatal,
];
export const OPENAI_BAD_TOOL_ARGS_STREAM: SseFrame[] = [
	created(),
	frame("response.output_item.added", {
		output_index: 0,
		item: callItem("call_bad", "add_element", ""),
	}),
	frame("response.function_call_arguments.delta", { output_index: 0, delta: '{"type": ' }),
	completed([callItem("call_bad", "add_element", '{"type": ')], 0, 0),
];
export const EXPECTED_OPENAI_BAD_TOOL_ARGS_EVENTS: StreamEvent[] = [
	{ type: "message_start", model: FIXTURE_MODEL },
	{ type: "tool_call_start", id: "call_bad", name: "add_element" },
	{ type: "tool_call_input_delta", id: "call_bad", partialJson: '{"type": ' },
	fatal,
];
export const OPENAI_ORPHAN_FRAGMENT_STREAM: SseFrame[] = [
	created(),
	frame("response.function_call_arguments.delta", { output_index: 0, delta: '{"a":1}' }),
	completed([], 0, 0),
];
export const EXPECTED_OPENAI_ORPHAN_FRAGMENT_EVENTS: StreamEvent[] = [
	{ type: "message_start", model: FIXTURE_MODEL },
	fatal,
];
export const OPENAI_INSTREAM_RATE_LIMIT_STREAM: SseFrame[] = [
	created(),
	textStart(),
	frame("response.output_text.delta", { output_index: 0, delta: "Start" }),
	frame("error", {
		message: "Rate limit reached for key sk-proj-abc123",
		code: "rate_limit_exceeded",
	}),
];
export const EXPECTED_OPENAI_INSTREAM_RATE_LIMIT_EVENTS: StreamEvent[] = [
	{ type: "message_start", model: FIXTURE_MODEL },
	{ type: "text_delta", text: "Start" },
	{
		type: "error",
		error: {
			code: "rate_limited",
			message: "OpenAI rate limit or quota exceeded — wait and try again.",
			providerDetail: "Rate limit reached for key [redacted-key]",
		},
	},
];
export const OPENAI_429_BODY = JSON.stringify({
	error: {
		message: "Rate limit reached for key sk-proj-RL429SECRET; contact us if this persists",
		type: "requests",
		code: "rate_limit_exceeded",
	},
});
