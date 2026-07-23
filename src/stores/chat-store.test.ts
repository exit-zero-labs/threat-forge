/**
 * Chat store event consumption, cancellation, error mapping, and persistence.
 *
 * The store drives the protocol client, which is mocked here so a test scripts
 * the exact `StreamEvent` sequence a turn produces — the point under test is how
 * the store folds those events into message blocks and state, not how the client
 * decodes a provider stream (that is `src/lib/ai/protocol/client.test.ts`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamConversationHandlers } from "@/lib/ai/protocol/client";
import { flattenText } from "@/lib/ai/protocol/messages";
import { type ChatMessage, useChatStore } from "@/stores/chat-store";
import type { ThreatModel } from "@/types/threat-model";

const streamConversationMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/protocol/client", () => ({
	streamConversation: streamConversationMock,
}));

vi.mock("@/lib/adapters/get-chat-transport", () => ({
	getChatTransport: () => Promise.resolve({ open: vi.fn() }),
}));

function emptyModel(): ThreatModel {
	return {
		version: "1.0",
		metadata: {
			title: "Test Model",
			author: "Test",
			created: "2026-01-01",
			modified: "2026-01-01",
			description: "",
		},
		elements: [],
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [],
	};
}

const SESSION_KEY = "threatforge-chat-sessions:unsaved";

/** Seat the store on a live, empty session so `sendMessage` will run. */
function seedSession(): void {
	useChatStore.setState({
		sessions: [{ id: "s1", title: "New Chat", messages: [], createdAt: "t", updatedAt: "t" }],
		activeSessionId: "s1",
		sessionKey: SESSION_KEY,
		messages: [],
		isStreaming: false,
		error: null,
	});
}

function lastMessage(): ChatMessage {
	const { messages } = useChatStore.getState();
	const last = messages[messages.length - 1];
	if (!last) throw new Error("expected at least one message");
	return last;
}

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	seedSession();
});

afterEach(() => {
	localStorage.clear();
});

describe("chat store event consumption", () => {
	it("folds a scripted turn into text and tool-call blocks with usage and stop reason", async () => {
		streamConversationMock.mockImplementation(
			async (_request, _transport, handlers: StreamConversationHandlers) => {
				handlers.onEvent({ type: "message_start", model: "claude-sonnet-4-20250514" });
				handlers.onEvent({ type: "text_delta", text: "Here " });
				handlers.onEvent({ type: "text_delta", text: "is the plan." });
				handlers.onEvent({
					type: "tool_call_complete",
					id: "call-1",
					name: "add_element",
					input: { action: "add_element", element: { type: "process", name: "Auth" } },
				});
				handlers.onEvent({ type: "usage", usage: { inputTokens: 12, outputTokens: 7 } });
				handlers.onEvent({ type: "message_stop", stopReason: "end_turn" });
			},
		);

		await useChatStore.getState().sendMessage("draft it", emptyModel());

		const { messages, isStreaming, error } = useChatStore.getState();
		expect(isStreaming).toBe(false);
		expect(error).toBeNull();

		// The user turn is a text block, not a raw string.
		expect(messages[0]).toMatchObject({
			role: "user",
			content: [{ type: "text", text: "draft it" }],
		});

		const assistant = messages[messages.length - 1];
		expect(assistant.role).toBe("assistant");
		// text deltas accumulate into one text block; the tool call is a second block.
		expect(assistant.content).toEqual([
			{ type: "text", text: "Here is the plan." },
			{
				type: "tool_call",
				id: "call-1",
				name: "add_element",
				input: { action: "add_element", element: { type: "process", name: "Auth" } },
			},
		]);
		expect(assistant.usage).toEqual({ inputTokens: 12, outputTokens: 7 });
		expect(assistant.stopReason).toBe("end_turn");
	});

	it("keeps the partial assistant text when the turn is aborted, with no error", async () => {
		streamConversationMock.mockImplementation(
			(_request, _transport, handlers: StreamConversationHandlers, signal: AbortSignal) =>
				new Promise<void>((resolve) => {
					handlers.onEvent({ type: "text_delta", text: "partial answer" });
					signal.addEventListener(
						"abort",
						() => {
							// The client turns a stop into a terminal `aborted` event, never
							// an error, and the store must keep the partial text.
							handlers.onEvent({ type: "aborted" });
							resolve();
						},
						{ once: true },
					);
				}),
		);

		const pending = useChatStore.getState().sendMessage("go", emptyModel());
		// Let the transport promise resolve and the client be invoked.
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		expect(useChatStore.getState().isStreaming).toBe(true);
		expect(flattenText(lastMessage())).toBe("partial answer");

		useChatStore.getState().stopGenerating();
		await pending;

		expect(useChatStore.getState().isStreaming).toBe(false);
		expect(useChatStore.getState().error).toBeNull();
		// The partial answer survives the stop rather than being discarded.
		expect(flattenText(lastMessage())).toBe("partial answer");
		expect(lastMessage().role).toBe("assistant");
	});

	it("drops an event that arrives after the stop", async () => {
		let captured: StreamConversationHandlers | undefined;
		streamConversationMock.mockImplementation(
			(_request, _transport, handlers: StreamConversationHandlers, signal: AbortSignal) =>
				new Promise<void>((resolve) => {
					captured = handlers;
					signal.addEventListener("abort", () => resolve(), { once: true });
				}),
		);

		const pending = useChatStore.getState().sendMessage("go", emptyModel());
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		useChatStore.getState().stopGenerating();
		await pending;

		const before = useChatStore.getState().messages;
		captured?.onEvent({ type: "text_delta", text: "late" });
		expect(useChatStore.getState().messages).toEqual(before);
		expect(useChatStore.getState().messages.some((m) => flattenText(m).includes("late"))).toBe(
			false,
		);
	});
});

describe("chat store error mapping", () => {
	it("surfaces a protocol error's authored message and drops a blank assistant turn", async () => {
		streamConversationMock.mockImplementation(
			async (_request, _transport, handlers: StreamConversationHandlers) => {
				handlers.onEvent({
					type: "error",
					error: {
						code: "http_status",
						message: "Anthropic reported an error while streaming the response.",
					},
				});
			},
		);

		await useChatStore.getState().sendMessage("go", emptyModel());

		expect(useChatStore.getState().error).toBe(
			"Anthropic reported an error while streaming the response.",
		);
		expect(useChatStore.getState().isStreaming).toBe(false);
		// No text arrived, so the empty assistant bubble is removed: only the user
		// turn remains.
		const { messages } = useChatStore.getState();
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("user");
	});

	it("keeps partial text when an error arrives mid-stream", async () => {
		streamConversationMock.mockImplementation(
			async (_request, _transport, handlers: StreamConversationHandlers) => {
				handlers.onEvent({ type: "text_delta", text: "started answering" });
				handlers.onEvent({
					type: "error",
					error: { code: "transport", message: "The AI request could not be completed." },
				});
			},
		);

		await useChatStore.getState().sendMessage("go", emptyModel());

		expect(useChatStore.getState().error).toBe("The AI request could not be completed.");
		// The partial answer is not a blank turn, so it is kept alongside the error.
		expect(flattenText(lastMessage())).toBe("started answering");
	});
});

describe("chat store persistence", () => {
	it("persists block content as strings and reads it back as blocks", async () => {
		streamConversationMock.mockImplementation(
			async (_request, _transport, handlers: StreamConversationHandlers) => {
				handlers.onEvent({ type: "text_delta", text: "remembered answer" });
				handlers.onEvent({ type: "message_stop", stopReason: "end_turn" });
			},
		);

		await useChatStore.getState().sendMessage("remember this", emptyModel());

		// On disk the messages are the pre-protocol string shape, so older builds and
		// `#63` keep reading them.
		const raw = localStorage.getItem(SESSION_KEY);
		expect(raw).not.toBeNull();
		const persisted = JSON.parse(raw ?? "[]") as Array<{
			messages: Array<{ role: string; content: unknown }>;
		}>;
		expect(persisted[0].messages).toEqual([
			{ role: "user", content: "remember this" },
			{ role: "assistant", content: "remembered answer" },
		]);

		// Reloading upgrades that string content back into blocks.
		useChatStore.getState().loadSessionsForFile(null);
		const reloaded = useChatStore.getState().messages;
		expect(reloaded).toEqual([
			{ role: "user", content: [{ type: "text", text: "remember this" }] },
			{ role: "assistant", content: [{ type: "text", text: "remembered answer" }] },
		]);
	});
});
