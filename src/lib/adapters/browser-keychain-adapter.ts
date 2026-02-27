import type { AiProvider } from "@/stores/chat-store";
import type { KeychainAdapter } from "./keychain-adapter";

const KEY_PREFIX = "tf-api-key-";

function storageKey(provider: AiProvider): string {
	return `${KEY_PREFIX}${provider}`;
}

/**
 * Browser keychain adapter using localStorage.
 * Less secure than OS keychain — noted in the UI when running in browser.
 */
export class BrowserKeychainAdapter implements KeychainAdapter {
	async setKey(provider: AiProvider, key: string): Promise<void> {
		localStorage.setItem(storageKey(provider), key);
	}

	async hasKey(provider: AiProvider): Promise<boolean> {
		return localStorage.getItem(storageKey(provider)) !== null;
	}

	async getKey(provider: AiProvider): Promise<string | null> {
		return localStorage.getItem(storageKey(provider));
	}

	async deleteKey(provider: AiProvider): Promise<void> {
		localStorage.removeItem(storageKey(provider));
	}
}
