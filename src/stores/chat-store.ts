import { create } from "zustand";
import { getChatAdapter } from "@/lib/adapters/get-chat-adapter";
import { getKeychainAdapter } from "@/lib/adapters/get-keychain-adapter";
import { getDefaultModelId } from "@/lib/ai-models";
import { useSettingsStore } from "@/stores/settings-store";
import {
	type ChatSession,
	MAX_MESSAGES_PER_SESSION,
	MAX_SESSIONS_PER_FILE,
} from "@/types/chat-session";
import type { ThreatModel } from "@/types/threat-model";

export type AiProvider = "anthropic" | "openai";

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

/** Module-level abort controller for the current stream. */
let currentAbortController: AbortController | null = null;

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

function loadSessionsFromStorage(key: string): ChatSession[] {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as ChatSession[];
		if (!Array.isArray(parsed)) return [];
		return parsed;
	} catch {
		return [];
	}
}

function saveSessionsToStorage(key: string, sessions: ChatSession[]): void {
	try {
		localStorage.setItem(key, JSON.stringify(sessions));
	} catch {
		// localStorage full or unavailable — silently ignore
	}
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

		const userMessage: ChatMessage = { role: "user", content };
		const updatedMessages = [...messages, userMessage];
		const assistantMessage: ChatMessage = { role: "assistant", content: "" };

		set({
			messages: [...updatedMessages, assistantMessage],
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

		try {
			const adapter = await getChatAdapter();
			await adapter.sendMessage(
				provider,
				updatedMessages,
				model,
				{
					onChunk: (text) => {
						if (abortController.signal.aborted) return;
						set((state) => {
							const msgs = [...state.messages];
							const last = msgs[msgs.length - 1];
							if (last && last.role === "assistant") {
								msgs[msgs.length - 1] = { ...last, content: last.content + text };
							}
							return { messages: msgs };
						});
					},
					onDone: () => {
						// Stream completed — handled by finally block
					},
					onError: (error) => {
						if (!abortController.signal.aborted) {
							set({ error });
						}
					},
				},
				resolvedModelId,
				abortController.signal,
			);
		} catch (err) {
			// Don't set error if we aborted
			if (abortController.signal.aborted) {
				// Keep partial response
			} else {
				const errorMessage = err instanceof Error ? err.message : String(err);
				set({ error: errorMessage });

				// Remove the empty assistant message on error
				set((state) => {
					const msgs = [...state.messages];
					const last = msgs[msgs.length - 1];
					if (last && last.role === "assistant" && last.content === "") {
						msgs.pop();
					}
					return { messages: msgs };
				});
			}
		} finally {
			currentAbortController = null;
			set({ isStreaming: false });

			// Persist messages to session
			const finalState = get();
			const finalMessages = finalState.messages;

			// Enforce max messages per session
			const cappedMessages =
				finalMessages.length > MAX_MESSAGES_PER_SESSION
					? finalMessages.slice(-MAX_MESSAGES_PER_SESSION)
					: finalMessages;

			// Update session title from first user message if still default
			const updatedSessions = finalState.sessions.map((s) => {
				if (s.id !== activeSessionId) return s;
				const title =
					s.title === "New Chat" && cappedMessages.length > 0
						? generateSessionTitle(
								cappedMessages.find((m) => m.role === "user")?.content ?? "New Chat",
							)
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
