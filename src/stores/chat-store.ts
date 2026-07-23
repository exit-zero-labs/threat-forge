import { create } from "zustand";
import { getChatTransport } from "@/lib/adapters/get-chat-transport";
import { getKeychainAdapter } from "@/lib/adapters/get-keychain-adapter";
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
import { useSettingsStore } from "@/stores/settings-store";
import {
	type ChatSession,
	MAX_MESSAGES_PER_SESSION,
	MAX_SESSIONS_PER_FILE,
} from "@/types/chat-session";
import type { ThreatModel } from "@/types/threat-model";
import { cancelActiveTurn } from "./ai-turn-bridge";

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
 * `upgradeLegacyMessage` on load, so the on-disk format is byte-identical to the
 * pre-protocol one and older sessions keep opening. Tool-call blocks do not
 * survive this round trip, which is harmless while the tool list is empty; `#63`
 * replaces `localStorage` with a store that preserves them.
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

function getStorageKey(filePath: string | null): string {
	if (!filePath) return "threatforge-chat-sessions:unsaved";
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
			...session,
			messages: session.messages.map((message) => ({
				role: message.role,
				content: flattenText(message),
			})),
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

interface ChatState {
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
	/** Error message from the last request, if any */
	error: string | null;

	// Session actions
	loadSessionsForFile: (filePath: string | null) => void;
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
	sessions: [],
	activeSessionId: null,
	sessionKey: null,
	messages: [],
	isStreaming: false,
	provider: "anthropic",
	hasApiKey: false,
	error: null,

	loadSessionsForFile: (filePath) => {
		const key = getStorageKey(filePath);
		const sessions = loadSessionsFromStorage(key);

		if (sessions.length > 0) {
			// Set most recent session as active
			const sorted = [...sessions].sort(
				(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
			);
			const active = sorted[0];
			set({
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
				sessions: newSessions,
				activeSessionId: newSession.id,
				sessionKey: key,
				messages: [],
				error: null,
			});
		}
	},

	newSession: () => {
		const { sessions, sessionKey } = get();
		if (!sessionKey) return;

		const newSession: ChatSession = {
			id: generateSessionId(),
			title: "New Chat",
			messages: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		let updatedSessions = [newSession, ...sessions];
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
		const { sessions } = get();
		const session = sessions.find((s) => s.id === id);
		if (!session) return;

		set({
			activeSessionId: id,
			messages: session.messages,
			error: null,
		});
	},

	deleteSession: (id) => {
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

	migrateSessionKey: (newFilePath) => {
		const { sessions, sessionKey } = get();
		if (!sessionKey) return;

		const newKey = getStorageKey(newFilePath);
		if (newKey === sessionKey) return;

		// Save sessions under new key
		saveSessionsToStorage(newKey, sessions);
		// Remove old key
		try {
			localStorage.removeItem(sessionKey);
		} catch {
			// Ignore
		}
		set({ sessionKey: newKey });
	},

	sendMessage: async (content, model) => {
		const { provider, messages, isStreaming, activeSessionId, sessionKey } = get();
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
		// No native tools yet (issue #64); the empty list keeps the model on the
		// fenced ` ```actions ` path this build still understands.
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

			// Persist messages to session, capped at tool-group granularity so a saved
			// session can never split a tool_call from the tool_result answering it.
			const finalState = get();
			const cappedMessages: ChatMessage[] = capMessageHistory(
				finalState.messages,
				MAX_MESSAGES_PER_SESSION,
			);

			// Update session title from first user message if still default
			const updatedSessions = finalState.sessions.map((s) => {
				if (s.id !== activeSessionId) return s;
				const firstUser = cappedMessages.find((m) => m.role === "user");
				const title =
					s.title === "New Chat" && cappedMessages.length > 0
						? generateSessionTitle(firstUser ? flattenText(firstUser) : "New Chat")
						: s.title;
				return {
					...s,
					title,
					messages: cappedMessages,
					updatedAt: new Date().toISOString(),
				};
			});

			saveSessionsToStorage(sessionKey, updatedSessions);
			set({ sessions: updatedSessions, messages: cappedMessages });
		}
	},

	stopGenerating: () => {
		if (currentAbortController) {
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
			const adapter = await getKeychainAdapter();
			const hasKey = await adapter.hasKey(provider);
			set({ hasApiKey: hasKey });
		} catch {
			set({ hasApiKey: false });
		}
	},

	clearError: () => set({ error: null }),
}));
