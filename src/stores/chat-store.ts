import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import type { ThreatModel } from "@/types/threat-model";

export type AiProvider = "anthropic" | "openai";

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

interface ChatState {
	/** Chat message history */
	messages: ChatMessage[];
	/** Whether the AI is currently streaming a response */
	isStreaming: boolean;
	/** Selected AI provider */
	provider: AiProvider;
	/** Whether the selected provider has an API key configured */
	hasApiKey: boolean;
	/** Error message from the last request, if any */
	error: string | null;

	// Actions
	sendMessage: (content: string, model: ThreatModel) => Promise<void>;
	setProvider: (provider: AiProvider) => void;
	checkApiKey: (provider?: AiProvider) => Promise<void>;
	clearMessages: () => void;
	clearError: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
	messages: [],
	isStreaming: false,
	provider: "anthropic",
	hasApiKey: false,
	error: null,

	sendMessage: async (content, model) => {
		const { provider, messages, isStreaming } = get();
		if (isStreaming) return;

		const userMessage: ChatMessage = { role: "user", content };
		const updatedMessages = [...messages, userMessage];
		const assistantMessage: ChatMessage = { role: "assistant", content: "" };

		set({
			messages: [...updatedMessages, assistantMessage],
			isStreaming: true,
			error: null,
		});

		// Set up event listeners for streaming
		const unlisteners: UnlistenFn[] = [];

		try {
			const unlisten1 = await listen<{ text: string }>("ai:stream-chunk", (event) => {
				set((state) => {
					const msgs = [...state.messages];
					const last = msgs[msgs.length - 1];
					if (last && last.role === "assistant") {
						msgs[msgs.length - 1] = { ...last, content: last.content + event.payload.text };
					}
					return { messages: msgs };
				});
			});
			unlisteners.push(unlisten1);

			const donePromise = new Promise<void>((resolve, reject) => {
				listen("ai:stream-done", () => {
					resolve();
				}).then((unlisten) => unlisteners.push(unlisten));

				listen<{ error: string }>("ai:stream-error", (event) => {
					reject(new Error(event.payload.error));
				}).then((unlisten) => unlisteners.push(unlisten));
			});

			// Send the chat request to Rust backend
			const ipcMessages = updatedMessages.map((m) => ({
				role: m.role,
				content: m.content,
			}));

			await invoke("send_chat_message", {
				provider,
				messages: ipcMessages,
				model,
			});

			// Wait for stream to complete
			await donePromise;
		} catch (err) {
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
		} finally {
			// Clean up all event listeners
			for (const unlisten of unlisteners) {
				unlisten();
			}
			set({ isStreaming: false });
		}
	},

	setProvider: (provider) => {
		set({ provider });
		// Check API key status for the new provider
		get().checkApiKey(provider);
	},

	checkApiKey: async (providerOverride) => {
		const provider = providerOverride ?? get().provider;
		try {
			const hasKey = await invoke<boolean>("get_api_key_status", { provider });
			set({ hasApiKey: hasKey });
		} catch {
			set({ hasApiKey: false });
		}
	},

	clearMessages: () => set({ messages: [], error: null }),
	clearError: () => set({ error: null }),
}));
