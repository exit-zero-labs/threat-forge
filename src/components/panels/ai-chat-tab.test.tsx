import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamConversationHandlers } from "@/lib/ai/protocol/client";
import { flattenText } from "@/lib/ai/protocol/messages";
import { DEFAULT_ANTHROPIC_MODEL } from "@/lib/ai-models";
import { useAiTurnStore } from "@/stores/ai-turn-store";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentRegistry } from "@/stores/document-registry";
import { createDocumentStores, setActiveStores } from "@/stores/document-stores";
import { useHistoryStore } from "@/stores/history-store";
import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { ThreatModel } from "@/types/threat-model";
import { AiChatTab } from "./ai-chat-tab";

/** Drain the microtask/timer queue so the fire-and-forget turn runner settles. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// The store drives the protocol client over a platform transport. The client is
// captured so a test can push stream events and hold the turn open; the
// transport is an inert stand-in the mocked client never touches.
const streamConversationMock = vi.hoisted(() => vi.fn());
// Whether the mocked keychain reports a stored key; a test flips it to reach the
// chat view instead of the empty state.
const keychain = vi.hoisted(() => ({ hasKey: false }));

vi.mock("@/lib/ai/protocol/client", () => ({
	streamConversation: streamConversationMock,
}));

vi.mock("@/lib/adapters/get-chat-transport", () => ({
	getChatTransport: () => Promise.resolve({ open: vi.fn() }),
}));

vi.mock("@/lib/adapters/get-keychain-adapter", () => ({
	getKeychainAdapter: () => Promise.resolve({ hasKey: async () => keychain.hasKey }),
}));

function makeModel(title: string): ThreatModel {
	return {
		version: "1.0",
		metadata: {
			title,
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

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	keychain.hasKey = false;
	// jsdom does not implement scrollIntoView, which the message list calls on update.
	Element.prototype.scrollIntoView = vi.fn();
	useDocumentRegistry.setState({
		documents: {},
		openDocumentIds: [],
		activeDocumentId: null,
	});
	setActiveStores(createDocumentStores());
	useAiTurnStore.getState().resetTurn();
	useSettingsStore.setState((state) => ({
		settings: { ...state.settings, aiModelAnthropic: DEFAULT_ANTHROPIC_MODEL },
	}));
	useChatStore.setState({
		sessions: [],
		activeSessionId: null,
		sessionKey: null,
		messages: [],
		isStreaming: false,
		error: null,
		provider: "anthropic",
	});
});

describe("AiChatTab session binding", () => {
	it("re-binds chat sessions on a switch between two unsaved documents", async () => {
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: makeModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		const b = registry.createDocument({
			model: makeModel("B"),
			filePath: null,
			pendingLayout: null,
		});
		registry.activateDocument(a);

		// Spy on the session loader while keeping its real behavior.
		const realLoad = useChatStore.getState().loadSessionsForFile;
		const loadSpy = vi.fn(realLoad);
		useChatStore.setState({ loadSessionsForFile: loadSpy });

		await act(async () => {
			render(<AiChatTab />);
		});
		const initialCalls = loadSpy.mock.calls.length;
		expect(initialCalls).toBeGreaterThan(0);

		// Both documents are unsaved (filePath === null), so only the activeDocumentId dependency
		// can re-run the binding effect. A build that keys the effect on filePath alone fails here.
		await act(async () => {
			registry.activateDocument(b);
		});
		expect(loadSpy.mock.calls.length).toBeGreaterThan(initialCalls);
	});
});

describe("AiChatTab stream cancellation on document switch", () => {
	it("aborts an in-flight AI stream on switch, leaving isStreaming false and dropping later events", async () => {
		let capturedOnEvent: StreamConversationHandlers["onEvent"] | undefined;
		streamConversationMock.mockImplementation(
			(_request: unknown, _transport: unknown, handlers: StreamConversationHandlers) => {
				capturedOnEvent = handlers.onEvent;
				// Never resolves: the turn stays in-flight until it is aborted.
				return new Promise<void>(() => {});
			},
		);

		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: makeModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		const b = registry.createDocument({
			model: makeModel("B"),
			filePath: null,
			pendingLayout: null,
		});
		registry.activateDocument(a);

		// A session must exist for the chat store to accept a message.
		useChatStore.setState({
			sessions: [{ id: "s1", title: "s1", messages: [], createdAt: "t", updatedAt: "t" }],
			activeSessionId: "s1",
			sessionKey: "threatforge-chat-sessions:unsaved",
			messages: [],
		});

		await act(async () => {
			void useChatStore.getState().sendMessage("hello", makeModel("A"));
			// Let sendMessage resolve the transport and reach the client call.
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(useChatStore.getState().isStreaming).toBe(true);
		expect(capturedOnEvent).toBeDefined();

		// A delta before the stop appends to the assistant turn.
		act(() => {
			capturedOnEvent?.({ type: "text_delta", text: "streamed" });
		});
		expect(useChatStore.getState().messages.some((m) => flattenText(m).includes("streamed"))).toBe(
			true,
		);

		// Switching documents cancels the in-flight stream.
		act(() => {
			registry.activateDocument(b);
		});
		expect(useChatStore.getState().isStreaming).toBe(false);

		const transcriptAfterSwitch = useChatStore.getState().messages;

		// An event that arrives after the abort must not append to the transcript.
		act(() => {
			capturedOnEvent?.({ type: "text_delta", text: "leaked text" });
		});
		expect(useChatStore.getState().messages).toEqual(transcriptAfterSwitch);
		expect(
			useChatStore.getState().messages.some((m) => flattenText(m).includes("leaked text")),
		).toBe(false);
	});
});

describe("AiChatTab fenced action rendering", () => {
	it("renders an action preview for a fenced ```actions response while the flag is on", async () => {
		keychain.hasKey = true;
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: makeModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		registry.activateDocument(a);

		await act(async () => {
			render(<AiChatTab />);
		});

		// A completed assistant turn whose text carries a fenced ` ```actions ` block —
		// exactly what the accumulated `text_delta` output looks like today.
		const fenced = [
			"Here is a change.",
			"```actions",
			'[{ "action": "delete_element", "id": "old-service" }]',
			"```",
		].join("\n");

		await act(async () => {
			useChatStore.setState({
				messages: [{ role: "assistant", content: [{ type: "text", text: fenced }] }],
				isStreaming: false,
			});
		});

		// The fenced block is parsed through the legacy boundary and rendered as an
		// applicable action, while the fence itself is stripped from the shown text.
		expect(screen.getByText("Suggested changes (1):")).toBeInTheDocument();
		expect(screen.getByText("Delete element: old-service")).toBeInTheDocument();
		expect(screen.queryByText(/```actions/)).not.toBeInTheDocument();
	});
});

describe("AiChatTab tool-loop turn", () => {
	function openDocument(title: string): void {
		const registry = useDocumentRegistry.getState();
		const id = registry.createDocument({
			model: makeModel(title),
			filePath: null,
			pendingLayout: null,
		});
		registry.activateDocument(id);
	}

	it("does not render fenced Apply buttons for a tool-enabled turn", async () => {
		keychain.hasKey = true;
		openDocument("A");
		streamConversationMock.mockImplementation(
			async (_r: unknown, _t: unknown, handlers: StreamConversationHandlers) => {
				handlers.onEvent({ type: "message_start", model: "m" });
				handlers.onEvent({
					type: "text_delta",
					text: 'Here is a change.\n```actions\n[{ "action": "delete_element", "id": "old-service" }]\n```',
				});
				handlers.onEvent({ type: "message_stop", stopReason: "end_turn" });
			},
		);

		await act(async () => {
			render(<AiChatTab />);
		});
		await act(async () => {
			await useAiTurnStore.getState().submitTurn("change it", makeModel("A"));
			await flush();
		});

		// The turn offered the twelve native tools, so the injected fence is inert.
		expect(useAiTurnStore.getState().turn?.toolSet.list().length).toBeGreaterThan(0);
		expect(screen.queryByText(/Suggested changes/)).not.toBeInTheDocument();
		expect(screen.queryByText("Delete element: old-service")).not.toBeInTheDocument();
	});

	it("shows the Stop button and an approval card while a turn awaits review", async () => {
		keychain.hasKey = true;
		openDocument("A");
		streamConversationMock.mockImplementation(
			async (_r: unknown, _t: unknown, handlers: StreamConversationHandlers) => {
				handlers.onEvent({ type: "message_start", model: "m" });
				handlers.onEvent({
					type: "tool_call_complete",
					id: "c1",
					name: "add_element",
					input: { action: "add_element", element: { type: "process", name: "Cache" } },
				});
				handlers.onEvent({ type: "message_stop", stopReason: "tool_use" });
			},
		);

		await act(async () => {
			render(<AiChatTab />);
		});
		await act(async () => {
			await useAiTurnStore.getState().submitTurn("add a cache", makeModel("A"));
			await flush();
		});

		expect(useAiTurnStore.getState().turn?.phase).toBe("awaiting_approval");
		expect(screen.getByTitle("Stop generating (Esc)")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
	});

	it("settles a live turn cancelled when the active document switches", async () => {
		keychain.hasKey = true;
		openDocument("A");
		useDocumentRegistry
			.getState()
			.createDocument({ model: makeModel("B"), filePath: null, pendingLayout: null });
		const registry = useDocumentRegistry.getState();
		const otherId = registry.openDocumentIds[registry.openDocumentIds.length - 1];
		registry.activateDocument(registry.openDocumentIds[0]);

		streamConversationMock.mockImplementation(
			async (_r: unknown, _t: unknown, handlers: StreamConversationHandlers) => {
				handlers.onEvent({ type: "message_start", model: "m" });
				handlers.onEvent({
					type: "tool_call_complete",
					id: "c1",
					name: "add_element",
					input: { action: "add_element", element: { type: "process", name: "Cache" } },
				});
				handlers.onEvent({ type: "message_stop", stopReason: "tool_use" });
			},
		);

		await act(async () => {
			await useAiTurnStore.getState().submitTurn("add a cache", makeModel("A"));
			await flush();
		});
		expect(useAiTurnStore.getState().turn?.phase).toBe("awaiting_approval");

		// A document switch cancels the in-flight turn through the preserved
		// stopGenerating contract — document-registry.ts is unchanged.
		await act(async () => {
			registry.activateDocument(otherId);
			await flush();
		});
		expect(useAiTurnStore.getState().turn?.outcome).toBe("cancelled");
	});
});

describe("AiChatTab conversation isolation", () => {
	const textTurn =
		(text: string) => async (_r: unknown, _t: unknown, handlers: StreamConversationHandlers) => {
			handlers.onEvent({ type: "message_start", model: "m" });
			handlers.onEvent({ type: "text_delta", text });
			handlers.onEvent({ type: "message_stop", stopReason: "end_turn" });
		};

	it("does not carry a settled turn or its history from one document to another", async () => {
		keychain.hasKey = true;
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: makeModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		const b = registry.createDocument({
			model: makeModel("B"),
			filePath: null,
			pendingLayout: null,
		});
		registry.activateDocument(a);

		streamConversationMock.mockImplementation(textTurn("Doc A analysis"));
		await act(async () => {
			render(<AiChatTab />);
		});
		await act(async () => {
			await useAiTurnStore.getState().submitTurn("secret A question", makeModel("A"));
			await flush();
		});
		expect(screen.getByText("Doc A analysis")).toBeInTheDocument();

		// Switching documents clears the turn through the panel's activeDocumentId
		// effect — document-registry.ts is unchanged.
		await act(async () => {
			registry.activateDocument(b);
			await flush();
		});
		expect(useAiTurnStore.getState().turn).toBeNull();
		expect(screen.queryByText("Doc A analysis")).not.toBeInTheDocument();

		// Doc B's first turn sends none of doc A's conversation to the provider.
		streamConversationMock.mockClear();
		streamConversationMock.mockImplementation(textTurn("Doc B analysis"));
		await act(async () => {
			await useAiTurnStore.getState().submitTurn("doc B question", makeModel("B"));
			await flush();
		});
		const request = streamConversationMock.mock.calls[0][0];
		const texts = request.messages
			.flatMap((m: { content: Array<{ type: string; text?: string }> }) => m.content)
			.filter((block: { type: string }) => block.type === "text")
			.map((block: { text?: string }) => block.text);
		expect(texts).toContain("doc B question");
		expect(texts).not.toContain("secret A question");
		expect(texts).not.toContain("Doc A analysis");
	});

	it("clears a settled turn when a new chat session starts", async () => {
		keychain.hasKey = true;
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: makeModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		registry.activateDocument(a);

		streamConversationMock.mockImplementation(textTurn("prior turn text"));
		await act(async () => {
			render(<AiChatTab />);
		});
		await act(async () => {
			await useAiTurnStore.getState().submitTurn("a question", makeModel("A"));
			await flush();
		});
		expect(screen.getByText("prior turn text")).toBeInTheDocument();

		await act(async () => {
			fireEvent.click(screen.getByTitle("New chat session"));
			await flush();
		});
		expect(useAiTurnStore.getState().turn).toBeNull();
		expect(screen.queryByText("prior turn text")).not.toBeInTheDocument();
	});
});

describe("AiChatTab undo affordance", () => {
	it("disables 'Undo this turn' with an explanation once a later edit supersedes it", async () => {
		keychain.hasKey = true;
		const registry = useDocumentRegistry.getState();
		const a = registry.createDocument({
			model: makeModel("A"),
			filePath: null,
			pendingLayout: null,
		});
		registry.activateDocument(a);

		let requests = 0;
		streamConversationMock.mockImplementation(
			async (_r: unknown, _t: unknown, handlers: StreamConversationHandlers) => {
				if (requests === 0) {
					requests += 1;
					handlers.onEvent({ type: "message_start", model: "m" });
					handlers.onEvent({
						type: "tool_call_complete",
						id: "c1",
						name: "add_element",
						input: { action: "add_element", element: { type: "process", name: "Cache" } },
					});
					handlers.onEvent({ type: "message_stop", stopReason: "tool_use" });
					return;
				}
				handlers.onEvent({ type: "message_start", model: "m" });
				handlers.onEvent({ type: "text_delta", text: "done" });
				handlers.onEvent({ type: "message_stop", stopReason: "end_turn" });
			},
		);

		await act(async () => {
			render(<AiChatTab />);
		});
		await act(async () => {
			await useAiTurnStore.getState().submitTurn("add a cache", makeModel("A"));
			await flush();
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Approve" }));
			await flush();
		});

		expect(screen.getByRole("button", { name: /Undo this turn/ })).toBeEnabled();

		// A later canvas edit supersedes the turn's single undo entry.
		await act(async () => {
			const model = useModelStore.getState().model;
			if (model) useHistoryStore.getState().pushSnapshot(model);
		});

		const undoButton = screen.getByRole("button", { name: /Undo this turn/ });
		expect(undoButton).toBeDisabled();
		expect(undoButton.getAttribute("title")).toContain("superseded");
	});
});
