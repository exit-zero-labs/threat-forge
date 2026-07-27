/**
 * Chat store event consumption, cancellation, error mapping, and persistence.
 *
 * The store drives the protocol client, which is mocked here so a test scripts
 * the exact `StreamEvent` sequence a turn produces — the point under test is how
 * the store folds those events into message blocks and state, not how the client
 * decodes a provider stream (that is `src/lib/ai/protocol/client.test.ts`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LegacyResidue } from "@/lib/adapters/keychain-adapter";
import type { StreamConversationHandlers } from "@/lib/ai/protocol/client";
import { flattenText } from "@/lib/ai/protocol/messages";
import { type ChatMessage, useChatStore } from "@/stores/chat-store";
import { useKeyResidueStore } from "@/stores/key-residue-store";
import type { ThreatModel } from "@/types/threat-model";

const streamConversationMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/protocol/client", () => ({
	streamConversation: streamConversationMock,
}));

vi.mock("@/lib/adapters/get-chat-transport", () => ({
	getChatTransport: () => Promise.resolve({ open: vi.fn() }),
}));

// `checkApiKey` crosses the keychain boundary twice: `hasKey`, which also migrates and erases a
// pre-#133 clear-text slot, and the residue re-read that follows it. Mocked so both the order of
// those calls and the slot's fate are observable without IndexedDB.
let keychainCalls: string[] = [];
/** The clear-text slot as the real adapter would see it, per provider. */
let slot: Record<string, LegacyResidue> = { anthropic: null, openai: null };
/** Whether `hasKey` migrates the slot away, as it does for every upgrading pre-#133 user. */
let hasKeyMigrates = false;
/**
 * What `hasKey` rejects with, or `null` when it answers.
 *
 * A knob on the one keychain mock rather than a second mock: `checkApiKey`'s two boundary
 * calls have to stay in the same order and the same recording, and a separate mock for the
 * failure case would let the two drift into testing different call sequences (#234).
 */
let hasKeyRejection: Error | null = null;
/** What `hasKey` answers when it does not reject. */
let hasKeyAnswer = false;
vi.mock("@/lib/adapters/get-keychain-adapter", () => ({
	getKeychainAdapter: async () => ({
		setKey: async () => undefined,
		hasKey: async (provider: string) => {
			keychainCalls.push(`hasKey:${provider}`);
			if (hasKeyRejection) throw hasKeyRejection;
			if (hasKeyMigrates) slot[provider] = null;
			return hasKeyAnswer;
		},
		deleteKey: async () => undefined,
		readLegacyResidue: async (provider: string) => {
			keychainCalls.push(`residue:${provider}`);
			return slot[provider] ?? null;
		},
	}),
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
		hasApiKey: false,
		keyFault: null,
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
	keychainCalls = [];
	slot = { anthropic: null, openai: null };
	hasKeyMigrates = false;
	hasKeyRejection = null;
	hasKeyAnswer = false;
	useKeyResidueStore.setState({ residue: { anthropic: null, openai: null } });
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

/**
 * #233: `checkApiKey` is the third path that runs the legacy migration, and the only one that
 * runs outside both the launch effect and the settings panel — `ai-chat-tab.tsx` calls it on
 * mount. Without a residue re-read here, opening the AI chat tab can erase the clear-text slot
 * while the status bar keeps claiming one is there for the rest of the session.
 */
describe("chat store clear-text key residue", () => {
	it("re-reads the clear-text slot after the key check that can erase it", async () => {
		useKeyResidueStore.setState({ residue: { anthropic: "retained", openai: null } });
		slot = { anthropic: "retained", openai: null };
		hasKeyMigrates = true;

		await useChatStore.getState().checkApiKey("anthropic");

		expect(useKeyResidueStore.getState().residue.anthropic).toBeNull();
		// Ordered, not merely present: `hasKey` is what migrates the slot, so a read taken
		// before it would answer "retained" for storage this same call just cleaned up. Only
		// the checked provider is re-read — the other's slot was not touched.
		expect(keychainCalls).toEqual(["hasKey:anthropic", "residue:anthropic"]);
	});

	it("leaves a standing warning alone when the check did not clear the slot", async () => {
		// Seeded empty, not `retained`: if the store already held the value the assertion looks
		// for, it would pass with the refresh deleted. The warning has to arrive from the slot.
		useKeyResidueStore.setState({ residue: { anthropic: null, openai: null } });
		slot = { anthropic: "retained", openai: null };

		await useChatStore.getState().checkApiKey("anthropic");

		// The re-read is a re-derivation, not a dismissal: a browser that still refuses the
		// erase keeps its warning.
		expect(useKeyResidueStore.getState().residue.anthropic).toBe("retained");
	});
});

/**
 * #234: `hasKey` rejects for a vault that holds records this browser cannot decrypt. The
 * store's `catch` used to turn that into `hasApiKey: false` and nothing else, which the AI
 * chat tab renders as "No API key configured" — the exact claim the settings panel refuses to
 * make about the same storage. Two surfaces, one fact, opposite answers.
 */
describe("chat store key storage faults", () => {
	/**
	 * A stand-in, not the vault's copy. The keychain is mocked here, so this suite injects the
	 * string and reads it back — any sentence would pass, and spelling the real one would read
	 * as a pin it is not. The vault's actual wording is pinned once, against a real vault, in
	 * `ai-settings-damaged-vault.test.tsx`. What this suite proves is that whatever the
	 * keychain says arrives intact rather than being replaced by "no key configured".
	 */
	const VAULT_DAMAGED = "TEST-ONLY authored fault sentence from the keychain layer.";

	it("does not report a vault it cannot read as no key configured", async () => {
		hasKeyRejection = new Error(VAULT_DAMAGED);

		await useChatStore.getState().checkApiKey("anthropic");

		// Both, and they say different things. No request can be signed, which is what
		// `hasApiKey` means — but the reason is not an absence, and the reason is what the user
		// has to read, because entering a key is not what repairs a damaged vault.
		expect(useChatStore.getState().hasApiKey).toBe(false);
		expect(useChatStore.getState().keyFault).toBe(VAULT_DAMAGED);
	});

	it("clears the storage fault once the check answers again", async () => {
		hasKeyRejection = new Error(VAULT_DAMAGED);
		await useChatStore.getState().checkApiKey("anthropic");

		hasKeyRejection = null;
		hasKeyAnswer = true;
		await useChatStore.getState().checkApiKey("anthropic");

		// A fault that outlived the condition would leave a permanent warning over storage that
		// is working — and saving a fresh key is exactly what repairs this vault.
		expect(useChatStore.getState().keyFault).toBeNull();
		expect(useChatStore.getState().hasApiKey).toBe(true);
	});

	it("re-reads the clear-text slot even when the key check failed", async () => {
		useKeyResidueStore.setState({ residue: { anthropic: null, openai: null } });
		slot = { anthropic: "retained", openai: null };
		hasKeyRejection = new Error(VAULT_DAMAGED);

		await useChatStore.getState().checkApiKey("anthropic");

		// #233's guarantee is not conditional on the key check succeeding. A damaged vault is
		// precisely when a surviving clear-text copy matters most, so the residue read has to
		// run after both outcomes.
		expect(keychainCalls).toEqual(["hasKey:anthropic", "residue:anthropic"]);
		expect(useKeyResidueStore.getState().residue.anthropic).toBe("retained");
	});
});
