import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamConversationHandlers } from "@/lib/ai/protocol/client";
import { flattenText } from "@/lib/ai/protocol/messages";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentRegistry } from "@/stores/document-registry";
import { createDocumentStores, setActiveStores } from "@/stores/document-stores";
import type { ThreatModel } from "@/types/threat-model";
import { AiChatTab } from "./ai-chat-tab";

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
	useChatStore.setState({
		sessions: [],
		activeSessionId: null,
		sessionKey: null,
		messages: [],
		isStreaming: false,
		error: null,
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
