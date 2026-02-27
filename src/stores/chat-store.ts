import { create } from "zustand";
import { getChatAdapter } from "@/lib/adapters/get-chat-adapter";
import { getKeychainAdapter } from "@/lib/adapters/get-keychain-adapter";
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

		try {
			const adapter = await getChatAdapter();
			await adapter.sendMessage(provider, updatedMessages, model, {
				onChunk: (text) => {
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
					set({ error });
				},
			});
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
			const adapter = await getKeychainAdapter();
			const hasKey = await adapter.hasKey(provider);
			set({ hasApiKey: hasKey });
		} catch {
			set({ hasApiKey: false });
		}
	},

	clearMessages: () => set({ messages: [], error: null }),
	clearError: () => set({ error: null }),
}));
