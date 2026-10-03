import type { CallRecord } from "@/lib/ai/loop/turn-machine";
import type { ChatMessage } from "@/stores/chat-store";

/** A single chat session with message history. */
export interface ChatSession {
	id: string;
	title: string;
	messages: ChatMessage[];
	createdAt: string;
	updatedAt: string;
	/** Local draft; never included in persisted chat history. */
	draft?: string;
}

/** Maximum number of sessions per file. */
export const MAX_SESSIONS_PER_FILE = 50;

/** Maximum number of messages per session. */
export const MAX_MESSAGES_PER_SESSION = 200;

/** Display-only receipt; no prepared actions, authorization grants, or handlers. */
export type ToolCallPresentation = Pick<
	CallRecord,
	"id" | "toolName" | "summary" | "status" | "result" | "isError" | "denialReason" | "destructive"
>;
