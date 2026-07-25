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

/**
 * Erase the pre-#133 clear-text slot, reporting whether it is actually gone.
 *
 * A browser can refuse the removal (storage policy, an extension shim, partitioned storage
 * quirks) while still serving reads, so the caller has to know: a surviving clear-text slot
 * is a live credential, and the migration below will read it again.
 */
function removeLegacyKey(provider: AiProvider): boolean {
	try {
		localStorage.removeItem(legacyStorageKey(provider));
	} catch {
		// Fall through to the read-back, which is what actually decides the outcome.
	}
	return readLegacyKey(provider) === null;
}

/**
 * Move a pre-#133 clear-text key into the encrypted vault, then erase the clear-text slot.
 *
 * The vault outranks the legacy slot. Migrating unconditionally would let a slot that could
 * not be erased overwrite the vault on every subsequent read — silently reverting a key the
 * user had just replaced, and resurrecting one they had just deleted — so a provider that
 * already has a stored secret is never re-migrated, only cleaned up.
 *
 * The erase happens only after the encrypted write has committed — {@link putSecret} resolves
 * at transaction commit, not at request success — so a failure part-way through leaves the
 * user's key intact rather than destroying it. If the vault is unavailable the error
 * propagates: callers must not fall back to reading clear text, because that would quietly
 * re-establish the storage posture #133 removed.
 */
async function migrateLegacyKey(provider: AiProvider): Promise<void> {
	const legacy = readLegacyKey(provider);
	if (legacy === null) return;
	if (!(await hasSecret(provider))) {
		await putSecret(provider, legacy);
	}
	removeLegacyKey(provider);
}

/**
 * Per-provider operation chains, so this tab's keychain calls never interleave.
 *
 * Every public method is a read-modify-write across two stores, so an unordered `getKey` and
 * `deleteKey` can interleave such that the migration re-inserts the key the user just
 * deleted. Serializing per provider removes that window. Cross-tab races are out of scope
 * here; IndexedDB's own transaction serialization is what keeps the vault itself consistent.
 */
const providerOperations = new Map<AiProvider, Promise<unknown>>();

function withProviderLock<T>(provider: AiProvider, operation: () => Promise<T>): Promise<T> {
	const pending = (providerOperations.get(provider) ?? Promise.resolve()).then(operation);
	// The stored link never rejects, so one failed operation cannot poison the queue.
	providerOperations.set(
		provider,
		pending.catch(() => undefined),
	);
	return pending;
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
		await withProviderLock(provider, async () => {
			await putSecret(provider, key);
			// A stored key supersedes any pre-#133 clear-text value for the same provider.
			// A slot that refuses to be erased is not failed here: the save genuinely
			// succeeded, and reporting an error would tell the user the opposite. It can no
			// longer override the vault, and `deleteKey` is where a surviving clear-text
			// credential becomes a claim that must not be made.
			removeLegacyKey(provider);
		});
	}

	async hasKey(provider: AiProvider): Promise<boolean> {
		return withProviderLock(provider, async () => {
			await migrateLegacyKey(provider);
			return hasSecret(provider);
		});
	}

	/** Browser-only: read a stored key back so the transport can sign a request. */
	async getKey(provider: AiProvider): Promise<string | null> {
		return withProviderLock(provider, async () => {
			await migrateLegacyKey(provider);
			try {
				return await getSecret(provider);
			} catch (error) {
				if (error instanceof KeyVaultError && error.reason === "corrupt") {
					// This provider's record is unreadable, so it is worth nothing: drop it and
					// report the provider as unconfigured. Without the delete, `hasKey` would keep
					// counting the record and the settings panel would show the provider as
					// configured while every request failed for want of a key.
					await deleteSecret(provider);
					return null;
				}
				// A `vault-corrupt` or `unavailable` fault affects every provider and re-entering
				// a key cannot fix it, so it must reach the user instead of reading as "no key".
				throw error;
			}
		});
	}

	async deleteKey(provider: AiProvider): Promise<void> {
		await withProviderLock(provider, async () => {
			const legacyErased = removeLegacyKey(provider);
			await deleteSecret(provider);
			if (!legacyErased) {
				// The encrypted copy is gone but a clear-text one survived, so the credential
				// is still usable from this browser. Reporting success here would tell a user
				// who is removing a possibly-compromised key that it is gone when it is not.
				throw new KeyVaultError(
					"legacy-retained",
					"The API key was removed from encrypted storage, but this browser would not delete an older clear-text copy. Clear this site's browser data to remove it.",
				);
			}
		});
	}
}
