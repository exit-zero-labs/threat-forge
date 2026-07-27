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
	/**
	 * Check if an API key exists for a provider.
	 *
	 * Rejecting is part of the contract on both platforms, and a rejection is not `false`. A
	 * caller that collapses one into "no API key configured" makes a claim about storage that
	 * never answered, and points the user at entering a key when entering a key is not the
	 * remedy. Surface the rejection's message instead; both implementations author it.
	 *
	 * The browser reaches it when the vault holds records but cannot produce the material to
	 * decrypt them, or where Web Crypto is unavailable. Desktop reaches it when the keychain
	 * refuses to answer, since `KeyStorage` only exists at all once `keys.enc` has decrypted at
	 * startup — so a desktop "record present, key unreadable" state is unreachable rather than
	 * unchecked.
	 */
	hasKey(provider: AiProvider): Promise<boolean>;
	/** Delete an API key for a provider. */
	deleteKey(provider: AiProvider): Promise<void>;
	/**
	 * Browser only. Report whether a pre-#133 clear-text copy of this provider's key is still
	 * readable from `localStorage`, without attempting to erase it and without returning any
	 * part of the key.
	 *
	 * Optional because a platform that never had a clear-text slot has nothing to answer — see
	 * {@link LegacyResidue} for why `undefined` and `null` are different claims.
	 */
	readLegacyResidue?(provider: AiProvider): Promise<LegacyResidue>;
}

/**
 * What a pre-#133 clear-text API key slot currently holds for one provider.
 *
 * `null` is an answer, not an absence of one: the slot was checked and nothing is there. A
 * caller that cannot get an answer at all sees `undefined` from the optional
 * {@link KeychainAdapter.readLegacyResidue} call instead, meaning "there is no such storage
 * location on this platform". Collapsing those two is the same mistake the browser adapter's
 * `readLegacySlot` refuses to make one level down, and it is what would let a desktop build
 * assert an erasure it never performed.
 */
export type LegacyResidue = "retained" | "unverified" | null;

/**
 * The cost of the one instruction that actually removes a clear-text slot (#233).
 *
 * "Clear this site's browser data" is the only remedy the app can offer for a slot the browser
 * refuses to erase — and in this browser it also destroys the user's saved threat models, which
 * live in IndexedDB with their manifest in `localStorage` (`src/lib/persistence/types.ts`).
 * Shipping the instruction without the cost is how a user follows security advice and loses
 * their work, so every surface that gives the instruction states it, from one string.
 *
 * Declared beside {@link LEGACY_RETAINED} for the same reason: the browser adapter and the
 * settings panel both need it, and the panel must not import IndexedDB code to get it.
 */
export const CLEARING_SITE_DATA_COST =
	"Clearing this site's browser data also removes the threat models saved in this browser, so export anything you need first.";

/**
 * What both surfaces call the state where storage answered, and the answer was "I can't" (#234).
 *
 * The AI settings panel and the AI chat tab describe the same fault, and the whole point of
 * #234 is that they cannot disagree about a stored key. Shipping the sentence twice would put
 * that agreement back in a human's hands: an edit to one copy diverges the surfaces in wording
 * while they still agree in fact, which is a quieter version of the bug being fixed.
 *
 * Deliberately not "could not be checked". A check that never answered and a check that
 * answered "this browser cannot read it" are different claims, and the second is the one the
 * vault now makes.
 *
 * The tests assert this text as their own literals rather than importing it. An assertion that
 * imports the string it is checking passes for any value of that string.
 */
export const KEY_STORAGE_UNREADABLE = "Key storage could not be read";

/**
 * Reason code for a removal that succeeded but left a readable clear-text copy behind.
 *
 * Declared here rather than beside the browser keychain adapter that throws it, because
 * callers have to recognise it without importing IndexedDB code into the desktop bundle.
 * Shared so renaming it cannot leave a caller silently matching a string nothing throws any
 * more.
 */
export const LEGACY_RETAINED = "legacy-retained";
