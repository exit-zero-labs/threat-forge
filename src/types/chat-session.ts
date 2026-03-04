import type { ChatMessage } from "@/stores/chat-store";

/** A single chat session with message history. */
export interface ChatSession {
	id: string;
	title: string;
	messages: ChatMessage[];
	createdAt: string;
	updatedAt: string;
}

/** Maximum number of sessions per file. */
export const MAX_SESSIONS_PER_FILE = 50;

/** Maximum number of messages per session. */
export const MAX_MESSAGES_PER_SESSION = 200;
