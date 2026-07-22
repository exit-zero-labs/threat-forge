import type { AiProvider } from "@/stores/chat-store";
import type { KeychainAdapter } from "./keychain-adapter";

const KEY_PREFIX = "tf-api-key-";

function storageKey(provider: AiProvider): string {
	return `${KEY_PREFIX}${provider}`;
}

/**
 * Browser keychain adapter using localStorage.
 * Less secure than encrypted storage — noted in the UI when running in browser.
 *
 * {@link BrowserKeychainAdapter.getKey} is deliberately not part of
 * `KeychainAdapter`: in the browser there is no process that can hold the key on
 * the user's behalf, so the transport has to read it back to build the request
 * headers, and that capability must not be reachable through the shared
 * interface a desktop caller also sees.
 */
export class BrowserKeychainAdapter implements KeychainAdapter {
	async setKey(provider: AiProvider, key: string): Promise<void> {
		localStorage.setItem(storageKey(provider), key);
	}

	async hasKey(provider: AiProvider): Promise<boolean> {
		return localStorage.getItem(storageKey(provider)) !== null;
	}

	/** Browser-only: read a stored key back so the transport can sign a request. */
	async getKey(provider: AiProvider): Promise<string | null> {
		return localStorage.getItem(storageKey(provider));
	}

	async deleteKey(provider: AiProvider): Promise<void> {
		localStorage.removeItem(storageKey(provider));
	}
}
