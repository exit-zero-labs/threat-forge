import { create } from "zustand";
import { getChatTransport } from "@/lib/adapters/get-chat-transport";
import { keychainErrorText, loadKeychainAdapter } from "@/lib/adapters/load-keychain-adapter";
import { capMessageHistory } from "@/lib/ai/protocol/budget";
import { streamConversation } from "@/lib/ai/protocol/client";
import type { StopReason, StreamEvent, TokenUsage } from "@/lib/ai/protocol/events";
import {
	type AiProvider,
	type ContentBlock,
	flattenText,
	type ProtocolMessage,
	type ProtocolRole,
	upgradeLegacyMessage,
} from "@/lib/ai/protocol/messages";
import { getDefaultModelId } from "@/lib/ai-models";
import { buildSystemPrompt } from "@/lib/ai-prompt";
import { useKeyResidueStore } from "@/stores/key-residue-store";
import { useSettingsStore } from "@/stores/settings-store";
import {
	type ChatSession,
	MAX_MESSAGES_PER_SESSION,
	MAX_SESSIONS_PER_FILE,
} from "@/types/chat-session";
import type { ThreatModel } from "@/types/threat-model";
import { cancelActiveTurn, disposeDocumentTurns, hasOtherChatStorageOwner } from "./ai-turn-bridge";

// `AiProvider` now belongs to the protocol module; re-exported so the eight
// existing importers keep their import path while the AI stack is rebuilt.
export type { AiProvider };

/**
 * A conversation turn as the store holds it in memory.
 *
 * Content is a block list, not a string, so a streamed assistant turn can carry
 * text and tool calls in one message (issue #61 step 10); `usage` and
 * `stopReason` record what the provider reported for the turn. Sessions are
 * still persisted in the pre-protocol `{ role, content: string }` shape — see
 * `saveSessionsToStorage`/`loadSessionsFromStorage` — so existing `localStorage`
 * data stays readable and `#63` owns the eventual storage move.
 */
export interface ChatMessage extends ProtocolMessage {
	/** Token accounting the provider reported for this turn, when it did. */
	usage?: TokenUsage;
	/** Why the model stopped, when the turn ended normally. */
	stopReason?: StopReason;
}

/** Cap on the model's answer per turn; also the tokens budgeting reserves. */
const MAX_OUTPUT_TOKENS = 4096;

/** Module-level abort controller for the current stream. */
let currentAbortController: AbortController | null = null;

/**
 * The string-content shape sessions are persisted in.
 *
 * Block content is flattened to a string on save and read back through
 * `upgradeLegacyMessage` on load, so the persisted shape remains compatible with the
 * pre-protocol one and older sessions keep opening. Tool-call blocks do not
 * survive this round trip. Reload restores readable text while runtime sessions
 * retain protocol blocks; `#63` replaces `localStorage` with a store that preserves them.
 */
interface PersistedChatMessage {
	role: ProtocolRole;
	content: string;
}

interface PersistedChatSession {
	id: string;
	title: string;
	messages: PersistedChatMessage[];
	createdAt: string;
	updatedAt: string;
}

function generateSessionId(): string {
	return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateSessionTitle(firstMessage: string): string {
	const trimmed = firstMessage.trim();
	if (trimmed.length <= 60) return trimmed;
	return `${trimmed.slice(0, 57)}...`;
}

export function getChatStorageKey(filePath: string | null, documentId?: string | null): string {
	if (!filePath) return `threatforge-chat-sessions:unsaved${documentId ? `:${documentId}` : ""}`;
	return `threatforge-chat-sessions:${filePath}`;
}

/** Read a persisted session's string-content messages back into block content. */
function upgradePersistedSession(session: PersistedChatSession): ChatSession {
	return {
		...session,
		messages: Array.isArray(session.messages) ? session.messages.map(upgradeLegacyMessage) : [],
	};
}

function loadSessionsFromStorage(key: string): ChatSession[] {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as PersistedChatSession[];
		if (!Array.isArray(parsed)) return [];
		return parsed.map(upgradePersistedSession);
	} catch {
		return [];
	}
}

function saveSessionsToStorage(key: string, sessions: ChatSession[]): void {
	try {
		// Flatten block content to the persisted string shape so the on-disk format
		// is unchanged and stays readable by older builds and by `#63`.
		const persisted: PersistedChatSession[] = sessions.map((session) => ({
			id: session.id,
			title: session.title,
			createdAt: session.createdAt,
			updatedAt: session.updatedAt,
			messages: session.messages
				.map((message) => ({
					role: message.role,
					content: flattenText(message),
				}))
				.filter((message) => message.content.length > 0),
		}));
		localStorage.setItem(key, JSON.stringify(persisted));
	} catch {
		// localStorage full or unavailable — silently ignore
	}
}

/** Append text to the last assistant turn's trailing text block, or start one. */
function appendAssistantText(messages: ChatMessage[], text: string): ChatMessage[] {
	const next = [...messages];
	const lastIndex = next.length - 1;
	const last = next[lastIndex];
	if (last?.role !== "assistant") return next;

	const content = [...last.content];
	const trailing = content[content.length - 1];
	if (trailing && trailing.type === "text") {
		content[content.length - 1] = { ...trailing, text: trailing.text + text };
	} else {
		content.push({ type: "text", text });
	}
	next[lastIndex] = { ...last, content };
	return next;
}

/** Append a content block to the last assistant turn. */
function appendAssistantBlock(messages: ChatMessage[], block: ContentBlock): ChatMessage[] {
	const next = [...messages];
	const lastIndex = next.length - 1;
	const last = next[lastIndex];
	if (last?.role !== "assistant") return next;

	next[lastIndex] = { ...last, content: [...last.content, block] };
	return next;
}

/** Record turn-level metadata (usage, stop reason) on the last assistant turn. */
function recordOnAssistant(
	messages: ChatMessage[],
	patch: Pick<ChatMessage, "usage"> | Pick<ChatMessage, "stopReason">,
): ChatMessage[] {
	const next = [...messages];
	const lastIndex = next.length - 1;
	const last = next[lastIndex];
	if (last?.role !== "assistant") return next;

	next[lastIndex] = { ...last, ...patch };
	return next;
}

/** True when an assistant turn carries no text and no tool call. */
function isEmptyAssistantTurn(message: ChatMessage): boolean {
	return (
		flattenText(message) === "" && !message.content.some((block) => block.type === "tool_call")
	);
}

interface DocumentChats {
	sessions: ChatSession[];
	activeSessionId: string | null;
	sessionKey: string | null;
}

const documentChats = new Map<string, DocumentChats>();

interface ChatState {
	documentId: string | null;
	/** All sessions for the current file */
	sessions: ChatSession[];
	/** Active session ID */
	activeSessionId: string | null;
	/** localStorage key for current sessions */
	sessionKey: string | null;

	/** Messages from the active session (derived convenience) */
	messages: ChatMessage[];
	/** Whether the AI is currently streaming a response */
	isStreaming: boolean;
	/** Selected AI provider */
	provider: AiProvider;
	/** Whether the selected provider has an API key configured */
	hasApiKey: boolean;
	/**
	 * Authored message for storage that could not be read at all, or `null` when it answered.
	 *
	 * Separate from `error`, which is "the last request failed" and only exists once a request
	 * has been made; this one is "storage cannot be read" and is true before any request. And
	 * separate from `hasApiKey`, which gates sending: a fault means no request can be signed, so
	 * both are set, but nothing gates sending on this field. Holds only text the keychain layer
	 * authored — never key material — and lives in memory only, never persisted.
	 */
	keyFault: string | null;
	/** Error message from the last request, if any */
	error: string | null;

	// Session actions
	loadSessionsForFile: (filePath: string | null, documentId?: string | null) => void;
	bindDocument: (documentId: string, filePath: string | null) => void;
	forgetDocument: (documentId: string) => void;
	renameSession: (id: string, title: string) => void;
	setDraft: (text: string) => void;
	recordTurn: (sessionId: string, messages: readonly ProtocolMessage[], settled: boolean) => void;
	newSession: () => void;
	switchSession: (id: string) => void;
	deleteSession: (id: string) => void;
	migrateSessionKey: (newFilePath: string) => void;

	// Chat actions
	sendMessage: (content: string, model: ThreatModel) => Promise<void>;
	stopGenerating: () => void;
	setProvider: (provider: AiProvider) => void;
	checkApiKey: (provider?: AiProvider) => Promise<void>;
	clearError: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
	documentId: null,
	sessions: [],
	activeSessionId: null,
	sessionKey: null,
	messages: [],
	isStreaming: false,
	provider: "anthropic",
	hasApiKey: false,
	keyFault: null,
	error: null,

	bindDocument: (documentId, filePath) => {
		const current = get();
		const key = getChatStorageKey(filePath, documentId);
		if (current.documentId === documentId) {
			if (current.sessionKey !== key && filePath) current.migrateSessionKey(filePath);
			return;
		}
		current.stopGenerating();
		if (current.documentId) {
			documentChats.set(current.documentId, {
				sessions: get().sessions,
				activeSessionId: get().activeSessionId,
				sessionKey: get().sessionKey,
			});
		}
		const cached = documentChats.get(documentId);
		if (cached) {
			documentChats.delete(documentId);
			set({
				...cached,
				documentId,
				messages: cached.sessions.find((s) => s.id === cached.activeSessionId)?.messages ?? [],
				error: null,
			});
			if (cached.sessionKey !== key && filePath) get().migrateSessionKey(filePath);
		} else {
			get().loadSessionsForFile(filePath, documentId);
		}
	},

	forgetDocument: (documentId) => {
		if (get().documentId === documentId) {
			get().stopGenerating();
			set({
				documentId: null,
				sessions: [],
				activeSessionId: null,
				sessionKey: null,
				messages: [],
				error: null,
			});
		}
		documentChats.delete(documentId);
		disposeDocumentTurns(documentId);
	},

	loadSessionsForFile: (filePath, documentId = null) => {
		get().stopGenerating();
		const key = getChatStorageKey(filePath, documentId);
		const sessions = loadSessionsFromStorage(key);

		if (sessions.length > 0) {
			// Set most recent session as active
			const sorted = [...sessions].sort(
				(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
			);
			const active = sorted[0];
			set({
				documentId,
				sessions,
				activeSessionId: active.id,
				sessionKey: key,
				messages: active.messages,
				error: null,
			});
		} else {
			// Create a fresh session
			const newSession: ChatSession = {
				id: generateSessionId(),
				title: "New Chat",
				messages: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};
			const newSessions = [newSession];
			saveSessionsToStorage(key, newSessions);
			set({
				documentId,
				sessions: newSessions,
				activeSessionId: newSession.id,
				sessionKey: key,
				messages: [],
				error: null,
			});
		}
	},

	newSession: () => {
		get().stopGenerating();
		const { sessions, sessionKey } = get();
		if (!sessionKey) return;
		const empty = sessions.find((s) => s.messages.length === 0 && !s.draft);
		if (empty) {
			get().switchSession(empty.id);
			return;
		}

		const newSession: ChatSession = {
			id: generateSessionId(),
			title: "New Chat",
			messages: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		let updatedSessions = [newSession, ...sessions].sort((a, b) =>
			b.updatedAt.localeCompare(a.updatedAt),
		);
		// Enforce max sessions limit
		if (updatedSessions.length > MAX_SESSIONS_PER_FILE) {
			updatedSessions = updatedSessions.slice(0, MAX_SESSIONS_PER_FILE);
		}

		saveSessionsToStorage(sessionKey, updatedSessions);
		set({
			sessions: updatedSessions,
			activeSessionId: newSession.id,
			messages: [],
			error: null,
		});
	},

	switchSession: (id) => {
		if (get().activeSessionId === id) return;
		const { sessions } = get();
		const session = sessions.find((s) => s.id === id);
		if (!session) return;
		get().stopGenerating();

		set({
			activeSessionId: id,
			messages: session.messages,
			error: null,
		});
	},

	deleteSession: (id) => {
		if (get().activeSessionId === id) get().stopGenerating();
		const { sessions, activeSessionId, sessionKey } = get();
		if (!sessionKey) return;

		const filtered = sessions.filter((s) => s.id !== id);

		if (filtered.length === 0) {
			// Create a new empty session to replace
			const newSession: ChatSession = {
				id: generateSessionId(),
				title: "New Chat",
				messages: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};
			const newSessions = [newSession];
			saveSessionsToStorage(sessionKey, newSessions);
			set({
				sessions: newSessions,
				activeSessionId: newSession.id,
				messages: [],
				error: null,
			});
			return;
		}

		saveSessionsToStorage(sessionKey, filtered);

		if (activeSessionId === id) {
			// Switch to most recent remaining
			const active = filtered[0];
			set({
				sessions: filtered,
				activeSessionId: active.id,
				messages: active.messages,
				error: null,
			});
		} else {
			set({ sessions: filtered });
		}
	},

	renameSession: (id, title) => {
		const trimmed = title.trim().slice(0, 60);
		const { sessions, sessionKey } = get();
		if (!trimmed || !sessionKey) return;
		const updated = sessions.map((s) => (s.id === id ? { ...s, title: trimmed } : s));
		saveSessionsToStorage(sessionKey, updated);
		set({ sessions: updated });
	},

	setDraft: (draft) => {
		set((state) => ({
			sessions: state.sessions.map((s) => (s.id === state.activeSessionId ? { ...s, draft } : s)),
		}));
	},

	recordTurn: (sessionId, messages, settled) => {
		const current = get();
		const bounded = settled
			? capMessageHistory([...messages], MAX_MESSAGES_PER_SESSION)
			: [...messages];
		const sessions = current.sessions.map((session) => {
			if (session.id !== sessionId) return session;
			const firstUser = messages.find((m) => m.role === "user");
			return {
				...session,
				messages: bounded,
				title:
					session.title === "New Chat" && firstUser
						? generateSessionTitle(flattenText(firstUser))
						: session.title,
				updatedAt: settled ? new Date().toISOString() : session.updatedAt,
			};
		});
		if (settled && current.sessionKey) saveSessionsToStorage(current.sessionKey, sessions);
		set({ sessions, ...(current.activeSessionId === sessionId ? { messages: bounded } : {}) });
	},

	migrateSessionKey: (newFilePath) => {
		const { sessions, sessionKey, documentId } = get();
		if (!sessionKey) return;

		const newKey = getChatStorageKey(newFilePath);
		if (newKey === sessionKey) return;

		// Save sessions under new key
		saveSessionsToStorage(newKey, sessions);
		// Another open tab may still use the saved file, including a restored tab
		// that has not loaded its chats yet. Save As must leave that history intact.
		const cachedOwner = [...documentChats.values()].some((chat) => chat.sessionKey === sessionKey);
		if (!cachedOwner && !hasOtherChatStorageOwner(sessionKey, documentId)) {
			try {
				localStorage.removeItem(sessionKey);
			} catch {
				// Storage may be unavailable.
			}
		}
		set({ sessionKey: newKey });
	},

	sendMessage: async (content, model) => {
		const { provider, messages, isStreaming, activeSessionId, sessionKey, documentId } = get();
		if (isStreaming || !activeSessionId || !sessionKey) return;

		const userMessage: ChatMessage = { role: "user", content: [{ type: "text", text: content }] };
		// History sent to the provider: everything through the new user turn. The
		// empty assistant turn below is the local placeholder the stream fills in.
		const conversation: ChatMessage[] = [...messages, userMessage];
		const assistantMessage: ChatMessage = { role: "assistant", content: [] };

		set({
			messages: [...conversation, assistantMessage],
			isStreaming: true,
			error: null,
		});

		// Create abort controller for this request
		const abortController = new AbortController();
		currentAbortController = abortController;

		// Get the model ID from settings
		const settings = useSettingsStore.getState().settings;
		const modelId = provider === "anthropic" ? settings.aiModelAnthropic : settings.aiModelOpenai;
		const resolvedModelId = modelId || getDefaultModelId(provider);
		// This legacy text stream offers no tools. Native turns use ai-turn-store.
		const systemPrompt = buildSystemPrompt(model, { tools: [] });

		/** Fold one stream event into store state. */
		const applyEvent = (event: StreamEvent): void => {
			// A late event from a stream the user already stopped must not append to
			// the transcript or clear the retained partial text.
			if (abortController.signal.aborted) return;

			switch (event.type) {
				case "text_delta":
					set((state) => ({ messages: appendAssistantText(state.messages, event.text) }));
					return;
				case "tool_call_complete":
					set((state) => ({
						messages: appendAssistantBlock(state.messages, {
							type: "tool_call",
							id: event.id,
							name: event.name,
							input: event.input,
						}),
					}));
					return;
				case "usage":
					set((state) => ({ messages: recordOnAssistant(state.messages, { usage: event.usage }) }));
					return;
				case "message_stop":
					set((state) => ({
						messages: recordOnAssistant(state.messages, { stopReason: event.stopReason }),
					}));
					return;
				case "error":
					// `ProtocolError.message` is authored by ThreatForge and safe to
					// render; provider text never reaches here (see `./errors.ts`).
					set({ error: event.error.message });
					return;
				default:
					// `message_start`, `tool_call_start`, and `tool_call_input_delta` are
					// progress-only; `aborted` keeps the partial turn and, by not touching
					// `error`, leaves the banner clear.
					return;
			}
		};

		try {
			const transport = await getChatTransport();
			await streamConversation(
				{
					provider,
					modelId: resolvedModelId,
					system: systemPrompt,
					messages: conversation,
					tools: [],
					maxOutputTokens: MAX_OUTPUT_TOKENS,
				},
				transport,
				{ onEvent: applyEvent },
				abortController.signal,
			);
		} catch {
			// `streamConversation` resolves for every expected protocol failure (they
			// arrive as `error` events applied above), so this only catches an
			// unexpected throw — for example the transport module failing to load.
			// Its raw message can name internal state (a module path or a build
			// defect), so the banner gets an authored sentence rather than the raw
			// text; the browser surfaces the underlying failure to the console.
			if (!abortController.signal.aborted) {
				set({ error: "The AI request failed unexpectedly. Please try again." });
			}
		} finally {
			if (
				get().documentId === documentId &&
				get().activeSessionId === activeSessionId &&
				(!currentAbortController || currentAbortController === abortController)
			) {
				currentAbortController = null;
				const wasAborted = abortController.signal.aborted;
				set({ isStreaming: false });

				// An error that produced no output leaves a blank assistant bubble; drop
				// it. A cancellation keeps whatever text arrived, and a mid-stream error
				// keeps its partial text.
				if (!wasAborted && get().error !== null) {
					set((state) => {
						const msgs = [...state.messages];
						const last = msgs[msgs.length - 1];
						if (last && last.role === "assistant" && isEmptyAssistantTurn(last)) {
							msgs.pop();
						}
						return { messages: msgs };
					});
				}

				get().recordTurn(activeSessionId, get().messages, true);
			}
		}
	},

	stopGenerating: () => {
		if (currentAbortController) {
			const { activeSessionId, messages } = get();
			if (activeSessionId) get().recordTurn(activeSessionId, messages, true);
			currentAbortController.abort();
			currentAbortController = null;
		}
		// Also settle any live tool-loop turn (issue #62), so switching documents
		// cannot let a turn write into the newly visible one. Routed through the
		// bridge to avoid a static import cycle; idempotent when no turn is running.
		cancelActiveTurn();
		set({ isStreaming: false });
	},

	setProvider: (provider) => {
		set({ provider });
		// Check API key status for the new provider
		get().checkApiKey(provider);
	},

	checkApiKey: async (providerOverride) => {
		const provider = providerOverride ?? get().provider;
		try {
			const adapter = await loadKeychainAdapter();
			const hasKey = await adapter.hasKey(provider);
			set({ hasApiKey: hasKey, keyFault: null });
		} catch (err) {
			// `hasApiKey: false` because no request can be signed, which is true. But a rejection
			// is not the claim "there is no key" — the record may be sitting in a vault this
			// browser cannot read — so the reason is carried too, and the chat surface reports
			// the fault rather than an absence the user would try to fix by entering a key.
			// What keeps an internal string out of this field is upstream: the browser vault
			// remaps everything that is not a `KeyVaultError` before it leaves `withVault`, and
			// the desktop adapter relays a sentence authored in Rust.
			set({ hasApiKey: false, keyFault: keychainErrorText(err) });
		}
		// `hasKey` is also what migrates a pre-#133 clear-text key into the vault and erases the
		// slot, so a slot that was there when the session started may be gone now. Re-read it
		// rather than leaving a standing "clear-text API key" warning (#233) about storage this
		// call just cleaned up. Never rejects, and never gates a request on the answer.
		await useKeyResidueStore.getState().refreshResidue(provider);
	},

	clearError: () => set({ error: null }),
}));
