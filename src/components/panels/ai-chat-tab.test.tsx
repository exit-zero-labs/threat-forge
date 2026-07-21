import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentRegistry } from "@/stores/document-registry";
import { createDocumentStores, setActiveStores } from "@/stores/document-stores";
import type { ThreatModel } from "@/types/threat-model";
import { AiChatTab } from "./ai-chat-tab";

// A controllable fake chat adapter. The abort test configures a stream that never resolves.
const chatAdapter = vi.hoisted(() => ({ sendMessage: vi.fn() }));

vi.mock("@/lib/adapters/get-chat-adapter", () => ({
	getChatAdapter: () => Promise.resolve(chatAdapter),
}));

vi.mock("@/lib/adapters/get-keychain-adapter", () => ({
	getKeychainAdapter: () => Promise.resolve({ hasKey: async () => false }),
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
	it("aborts an in-flight AI stream on switch, leaving isStreaming false and dropping later chunks", async () => {
		let capturedOnChunk: ((text: string) => void) | undefined;
		chatAdapter.sendMessage.mockImplementation(
			(
				_provider: unknown,
				_messages: unknown,
				_model: unknown,
				callbacks: { onChunk: (text: string) => void },
			) => {
				capturedOnChunk = callbacks.onChunk;
				// Never resolves: the stream stays in-flight until it is aborted.
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
			// Let sendMessage reach the adapter call and register the abort controller.
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(useChatStore.getState().isStreaming).toBe(true);
		expect(capturedOnChunk).toBeDefined();
		const transcriptBefore = useChatStore.getState().messages;

		// Switching documents cancels the in-flight stream.
		act(() => {
			registry.activateDocument(b);
		});
		expect(useChatStore.getState().isStreaming).toBe(false);

		// A chunk that arrives after the abort must not append to the transcript.
		act(() => {
			capturedOnChunk?.("leaked text");
		});
		expect(useChatStore.getState().messages).toEqual(transcriptBefore);
		expect(useChatStore.getState().messages.some((m) => m.content.includes("leaked text"))).toBe(
			false,
		);
	});
});
