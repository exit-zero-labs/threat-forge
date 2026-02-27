import type { AiProvider } from "@/stores/chat-store";

/**
 * Adapter interface for API key storage.
 *
 * Tauri implementation uses OS keychain via invoke().
 * Browser implementation uses localStorage (less secure, noted in UI).
 */
export interface KeychainAdapter {
	/** Store an API key for a provider. */
	setKey(provider: AiProvider, key: string): Promise<void>;
	/** Check if an API key exists for a provider. */
	hasKey(provider: AiProvider): Promise<boolean>;
	/** Retrieve an API key for a provider. Returns null if not found. */
	getKey(provider: AiProvider): Promise<string | null>;
	/** Delete an API key for a provider. */
	deleteKey(provider: AiProvider): Promise<void>;
}
