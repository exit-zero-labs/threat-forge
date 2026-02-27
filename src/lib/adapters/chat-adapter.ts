import type { AiProvider, ChatMessage } from "@/stores/chat-store";
import type { ThreatModel } from "@/types/threat-model";

/**
 * Callbacks for streaming AI chat responses.
 */
export interface ChatStreamCallbacks {
	onChunk: (text: string) => void;
	onDone: () => void;
	onError: (error: string) => void;
}

/**
 * Adapter interface for AI chat communication.
 *
 * Tauri implementation uses invoke() + Tauri event listeners for streaming.
 * Browser implementation uses direct fetch() with ReadableStream SSE parsing.
 */
export interface ChatAdapter {
	/** Send a chat message and stream the response via callbacks. */
	sendMessage(
		provider: AiProvider,
		messages: ChatMessage[],
		model: ThreatModel,
		callbacks: ChatStreamCallbacks,
	): Promise<void>;
}
