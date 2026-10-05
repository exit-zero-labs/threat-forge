/** Opt-in paid smoke: three sequential requests at most, synthetic data, no retries or saved key reads. */
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { BrowserChatTransport } from "@/lib/adapters/browser-chat-adapter";
import { type ConversationRequest, streamConversation } from "@/lib/ai/protocol/client";
import type { StreamEvent } from "@/lib/ai/protocol/events";
import type { ContentBlock, ProtocolMessage } from "@/lib/ai/protocol/messages";
import { defineTool } from "@/lib/ai/protocol/tools";
import { getModelsForProvider } from "@/lib/ai-models";
import { verifyObservedModel } from "./provider-smoke-checks";

// Storage alone is replaced; requests, validation, framing and mappers are production code.
vi.mock("@/lib/adapters/browser-keychain-adapter", () => ({
	BrowserKeychainAdapter: class {
		async getKey(provider: string) {
			return process.env[provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"] ?? null;
		}
	},
}));
const modelId = process.env.THREATFORGE_LIVE_MODEL ?? "";
const model = [...getModelsForProvider("openai"), ...getModelsForProvider("anthropic")].find(
	(m) => m.id === modelId,
);
const cap = Number(process.env.THREATFORGE_LIVE_MAX_OUTPUT_TOKENS);
if (
	process.env.THREATFORGE_LIVE_SMOKE !== "authorized" ||
	!model ||
	!Number.isInteger(cap) ||
	cap < 128 ||
	cap > 512
)
	throw new Error(
		"No requests sent. Explicit authorization, one current model and a 128–512 output-token ceiling are required. See the provider compatibility runbook.",
	);
const selected = model;
const tool = defineTool({
	name: "smoke_probe",
	description: "Pure local synthetic probe; returns the same nonce.",
	input: { nonce: z.literal("synthetic-probe") },
});
const transport = new BrowserChatTransport();
const observedModels: string[] = [];
async function send(req: ConversationRequest): Promise<StreamEvent[]> {
	const events: StreamEvent[] = [];
	await streamConversation(
		req,
		transport,
		{ onEvent: (e) => events.push(e) },
		AbortSignal.timeout(55_000),
	);
	// Only authored error codes are reported; provider content and keys are never printed.
	const error = events.find((e) => e.type === "error" || e.type === "aborted");
	if (error)
		throw new Error(
			error.type === "error"
				? `Provider smoke failed: ${error.error.code}`
				: "Provider smoke cancelled or timed out",
		);
	const start = events.find((e) => e.type === "message_start");
	observedModels.push(
		verifyObservedModel(selected.id, start?.type === "message_start" ? start.model : undefined),
	);
	expect(events.some((e) => e.type === "message_stop")).toBe(true);
	return events;
}
it("verifies one authorized model's text and native continuation", async () => {
	const req: ConversationRequest = {
		provider: selected.provider,
		modelId: selected.id,
		system: "Synthetic compatibility probe. Follow the user's explicit function instruction.",
		messages: [{ role: "user", content: [{ type: "text", text: "Say hello in one word." }] }],
		tools: [],
		maxOutputTokens: cap,
		turnId: "smoke-text",
		turnStartIndex: 0,
	};
	const greeting = await send(req);
	expect(greeting.some((e) => e.type === "message_stop" && e.stopReason === "end_turn")).toBe(true);
	expect(greeting.some((e) => e.type === "text_delta" && e.text.length > 0)).toBe(true);
	const toolReq = {
		...req,
		turnId: "smoke-tool",
		tools: [tool],
		messages: [
			{
				role: "user" as const,
				content: [
					{
						type: "text" as const,
						text: "Call smoke_probe exactly once with nonce synthetic-probe. After its result, acknowledge completion.",
					},
				],
			},
		],
	};
	const events = await send(toolReq);
	expect(events.some((e) => e.type === "message_stop" && e.stopReason === "tool_use")).toBe(true);
	const calls = events.filter((e) => e.type === "tool_call_complete");
	expect(calls).toHaveLength(1);
	const call = calls[0];
	if (call?.type !== "tool_call_complete") throw new Error("No complete probe call");
	expect(call.name).toBe(tool.name);
	expect(tool.parseInput(call.input)).toEqual({ ok: true, value: { nonce: "synthetic-probe" } });
	const native = events.find((e) => e.type === "continuation");
	if (native?.type !== "continuation" || !native.binding)
		throw new Error("No validated native continuation");
	const assistant: ProtocolMessage = {
		role: "assistant",
		content: events.flatMap<ContentBlock>((e) =>
			e.type === "text_delta"
				? [{ type: "text", text: e.text }]
				: e.type === "tool_call_complete"
					? [{ type: "tool_call", id: e.id, name: e.name, input: e.input }]
					: [],
		),
		continuation: { output: native.output, binding: native.binding },
	};
	const result = await send({
		...toolReq,
		messages: [
			...toolReq.messages,
			assistant,
			{
				role: "user",
				content: [{ type: "tool_result", toolCallId: call.id, content: "synthetic-probe" }],
			},
		],
	});
	expect(result.some((e) => e.type === "message_stop" && e.stopReason === "end_turn")).toBe(true);
	const usage = [...greeting, ...events, ...result]
		.filter((e) => e.type === "usage")
		.map((e) => (e.type === "usage" ? e.usage : undefined));
	expect(usage).toHaveLength(3);
	console.info(
		JSON.stringify({
			modelId: selected.id,
			observedModels,
			provider: selected.provider,
			requests: 3,
			maxOutputTokens: cap,
			usage,
			status: "passed",
		}),
	);
});
