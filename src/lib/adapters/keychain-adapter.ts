import type { AiProvider } from "@/stores/chat-store";

/**
 * Adapter interface for API key storage.
 *
 * Tauri implementation uses AES-256-GCM encrypted file storage via invoke().
 * Browser implementation encrypts the key under a non-extractable Web Crypto key held in
 * IndexedDB; see `./browser-key-vault.ts` for what that does and does not defend against.
 *
 * Reading a key back is deliberately absent from this interface. On desktop the
 * key never leaves Rust — it is used only inside `auth_headers`
 * (`src-tauri/src/ai/providers.rs`) and there is no `get_api_key` command to
 * fetch it — so `getKey` exists solely on `BrowserKeychainAdapter`, where the
 * encrypted key vault is the store and the browser transport is the one caller.
 * Declaring it here would make asking for the desktop key compile, which is the
 * property this omission removes; see `./keychain-adapter.test.ts`.
 */
export interface KeychainAdapter {
	/** Store an API key for a provider. */
	setKey(provider: AiProvider, key: string): Promise<void>;
	/** Check if an API key exists for a provider. */
	hasKey(provider: AiProvider): Promise<boolean>;
	/** Delete an API key for a provider. */
	deleteKey(provider: AiProvider): Promise<void>;
}

/**
 * Reason code for a removal that succeeded but left a readable clear-text copy behind.
 *
 * Declared here rather than beside the browser keychain adapter that throws it, because
 * callers have to recognise it without importing IndexedDB code into the desktop bundle.
 * Shared so renaming it cannot leave a caller silently matching a string nothing throws any
 * more.
 */
export const LEGACY_RETAINED = "legacy-retained";
