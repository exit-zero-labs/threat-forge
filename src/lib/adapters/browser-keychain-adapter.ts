import type { AiProvider } from "@/stores/chat-store";
import { deleteSecret, getSecret, hasSecret, KeyVaultError, putSecret } from "./browser-key-vault";
import type { KeychainAdapter } from "./keychain-adapter";

/**
 * Prefix of the clear-text `localStorage` slot this adapter used before #133. Retained only
 * so an existing key can be migrated into the encrypted vault and then erased; nothing is
 * ever written back under it.
 */
const LEGACY_KEY_PREFIX = "tf-api-key-";

function legacyStorageKey(provider: AiProvider): string {
	return `${LEGACY_KEY_PREFIX}${provider}`;
}

/** Read the pre-#133 clear-text slot, tolerating a browser that blocks `localStorage`. */
function readLegacyKey(provider: AiProvider): string | null {
	try {
		return localStorage.getItem(legacyStorageKey(provider));
	} catch {
		return null;
	}
}

function removeLegacyKey(provider: AiProvider): void {
	try {
		localStorage.removeItem(legacyStorageKey(provider));
	} catch {
		// A browser that refuses the removal leaves the stale slot behind. The vault is
		// already authoritative at this point, so this cannot resurrect the old value.
	}
}

/**
 * Move a pre-#133 clear-text key into the encrypted vault, then erase the clear-text slot.
 *
 * The erase happens only after the encrypted write resolves, so a failure part-way through
 * leaves the user's key intact rather than destroying it. If the vault is unavailable the
 * error propagates: callers must not fall back to reading clear text, because that would
 * quietly re-establish the storage posture #133 removed.
 */
async function migrateLegacyKey(provider: AiProvider): Promise<void> {
	const legacy = readLegacyKey(provider);
	if (legacy === null) return;
	await putSecret(provider, legacy);
	removeLegacyKey(provider);
}

/**
 * Browser keychain adapter backed by the encrypted {@link ./browser-key-vault | key vault}.
 *
 * Keys are stored as AES-GCM ciphertext under a non-extractable wrapping key held in
 * IndexedDB, never as clear text. When the vault cannot be opened the adapter fails closed
 * and surfaces a {@link KeyVaultError}; it never degrades to plain `localStorage`.
 *
 * {@link BrowserKeychainAdapter.getKey} is deliberately not part of `KeychainAdapter`: in
 * the browser there is no process that can hold the key on the user's behalf, so the
 * transport has to read it back to build the request headers, and that capability must not
 * be reachable through the shared interface a desktop caller also sees.
 */
export class BrowserKeychainAdapter implements KeychainAdapter {
	async setKey(provider: AiProvider, key: string): Promise<void> {
		await putSecret(provider, key);
		// A stored key supersedes any pre-#133 clear-text value for the same provider.
		removeLegacyKey(provider);
	}

	async hasKey(provider: AiProvider): Promise<boolean> {
		await migrateLegacyKey(provider);
		return hasSecret(provider);
	}

	/** Browser-only: read a stored key back so the transport can sign a request. */
	async getKey(provider: AiProvider): Promise<string | null> {
		await migrateLegacyKey(provider);
		try {
			return await getSecret(provider);
		} catch (error) {
			// An undecryptable record is reported as "no key configured" so the caller shows
			// the normal unconfigured path and the user can simply re-enter the key. Any other
			// failure is a real fault and must not be swallowed.
			if (error instanceof KeyVaultError && error.reason === "corrupt") return null;
			throw error;
		}
	}

	async deleteKey(provider: AiProvider): Promise<void> {
		removeLegacyKey(provider);
		await deleteSecret(provider);
	}
}
