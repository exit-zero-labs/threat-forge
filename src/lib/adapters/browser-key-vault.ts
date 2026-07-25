/**
 * Encrypted-at-rest storage for browser BYOK API keys.
 *
 * The browser has no OS keychain, so the key has to live in a web store. Rather than the
 * clear text `localStorage` this replaces, the vault keeps a non-extractable AES-GCM
 * `CryptoKey` in IndexedDB and persists only ciphertext. `extractable: false` means the
 * wrapping material cannot be read back out of the browser even by code running on this
 * origin — structured clone moves the handle into IndexedDB, but `exportKey` on it always
 * rejects.
 *
 * What this defends against: inspection of the browser profile on disk, and extensions or
 * tooling that read web storage, which now see ciphertext and an unexportable handle.
 *
 * What it does not defend against: script execution on the ThreatForge origin. Such script
 * can reach the same handle and use it to decrypt, exactly as the application does. That
 * residual risk is accepted (#133) and is mitigated separately by the strict CSP (#156). Do
 * not describe this storage as protecting against a compromised page.
 *
 * The database is deliberately separate from the workspace database so document storage and
 * key storage never share a namespace; see `src/lib/persistence/no-key-leakage.test.ts`.
 */

/** Key-vault database name. Disjoint from `WORKSPACE_STORAGE_NAMESPACE`. */
export const KEY_VAULT_DB_NAME = "threatforge-keychain";
const KEY_VAULT_DB_VERSION = 1;

/** Holds the single non-extractable wrapping key. */
const STORE_WRAP = "wrap-key";
/** Holds one ciphertext record per provider. */
const STORE_SECRETS = "secrets";

const WRAP_KEY_ID = "aes-gcm-256-v1";

/** AES-GCM standard nonce length. A fresh nonce is drawn for every encryption. */
const IV_BYTES = 12;

/** Why a vault operation could not complete. */
export type KeyVaultErrorReason =
	/** IndexedDB or Web Crypto is missing, blocked, or otherwise unusable here. */
	| "unavailable"
	/** A stored record exists but could not be decrypted into a usable key. */
	| "corrupt";

/**
 * A vault failure carrying a user-safe message. Raw `DOMException` text and internal detail
 * are never propagated, so nothing about the stored key or the host can leak through an
 * error surfaced in the UI.
 */
export class KeyVaultError extends Error {
	readonly reason: KeyVaultErrorReason;

	constructor(reason: KeyVaultErrorReason, message: string) {
		super(message);
		this.name = "KeyVaultError";
		this.reason = reason;
	}
}

const UNAVAILABLE_MESSAGE =
	"Encrypted key storage is unavailable in this browser, so the API key cannot be stored.";
const CORRUPT_MESSAGE = "The stored API key could not be read and needs to be entered again.";

function unavailable(): KeyVaultError {
	return new KeyVaultError("unavailable", UNAVAILABLE_MESSAGE);
}

/** A stored secret: the AES-GCM nonce and ciphertext for one provider's key. */
interface SecretRecord {
	iv: Uint8Array<ArrayBuffer>;
	ciphertext: Uint8Array<ArrayBuffer>;
}

/**
 * Coerce a value read back from IndexedDB into bytes.
 *
 * Structured clone can hand back a typed array constructed in a different realm from the
 * one running this check, so `value instanceof Uint8Array` is unreliable. `ArrayBuffer.isView`
 * tests the internal slot instead and holds across realms, which is the property needed here.
 */
function asBytes(value: unknown): Uint8Array<ArrayBuffer> | null {
	if (!ArrayBuffer.isView(value)) return null;
	// Copied rather than aliased so the result is always backed by a plain `ArrayBuffer`,
	// which is what Web Crypto accepts as a `BufferSource`.
	return Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
}

/** Recover a secret record from a stored value, or `null` when it is not one. */
function readSecretRecord(value: unknown): SecretRecord | null {
	if (typeof value !== "object" || value === null) return null;
	const candidate = value as Record<string, unknown>;
	const iv = asBytes(candidate.iv);
	const ciphertext = asBytes(candidate.ciphertext);
	if (!iv || !ciphertext) return null;
	return { iv, ciphertext };
}

/**
 * Resolve Web Crypto, rejecting when `subtle` is absent. `crypto.subtle` is only exposed in
 * secure contexts, so an insecure origin fails here rather than silently degrading.
 */
function requireSubtle(): SubtleCrypto {
	const subtle = globalThis.crypto?.subtle;
	if (!subtle) throw unavailable();
	return subtle;
}

/** Open the vault database, creating both stores on first use. */
function openVault(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const factory = globalThis.indexedDB;
		if (!factory) {
			reject(unavailable());
			return;
		}

		let request: IDBOpenDBRequest;
		try {
			request = factory.open(KEY_VAULT_DB_NAME, KEY_VAULT_DB_VERSION);
		} catch {
			// Some private-mode browsers throw synchronously from `open()`.
			reject(unavailable());
			return;
		}

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_WRAP)) db.createObjectStore(STORE_WRAP);
			if (!db.objectStoreNames.contains(STORE_SECRETS)) db.createObjectStore(STORE_SECRETS);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(unavailable());
		request.onblocked = () => reject(unavailable());
	});
}

/** Await one IndexedDB request, mapping any failure to a user-safe vault error. */
function awaitRequest<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(unavailable());
	});
}

/**
 * Return the vault's wrapping key, generating it on first use.
 *
 * Key generation is awaited outside any transaction, because an IndexedDB transaction
 * commits as soon as the event loop drains with no pending request against it — holding one
 * open across `generateKey` would silently drop the write.
 */
async function getOrCreateWrapKey(db: IDBDatabase): Promise<CryptoKey> {
	const subtle = requireSubtle();

	const existing = await readWrapKey(db);
	if (existing) return existing;

	const candidate = await subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
		"encrypt",
		"decrypt",
	]);
	return installWrapKey(db, candidate);
}

/** Read the stored wrapping key, or `null` when the vault has not been initialized yet. */
async function readWrapKey(db: IDBDatabase): Promise<CryptoKey | null> {
	const store = db.transaction(STORE_WRAP, "readonly").objectStore(STORE_WRAP);
	const stored = await awaitRequest(store.get(WRAP_KEY_ID));
	if (stored instanceof CryptoKey) return stored;
	if (stored !== undefined) {
		// A record is present but is not a usable key: refuse rather than silently replacing
		// it, because overwriting would permanently orphan every secret encrypted under it.
		throw new KeyVaultError("corrupt", CORRUPT_MESSAGE);
	}
	return null;
}

/**
 * Store `candidate` as the wrapping key unless another context installed one first, and
 * return whichever key won.
 *
 * The re-read and the write are chained inside the request callback so they share one live
 * `readwrite` transaction. That makes the check-and-set atomic: two tabs initializing the
 * vault concurrently converge on a single key instead of the second overwriting the first
 * and orphaning everything already encrypted under it.
 */
function installWrapKey(db: IDBDatabase, candidate: CryptoKey): Promise<CryptoKey> {
	return new Promise((resolve, reject) => {
		const store = db.transaction(STORE_WRAP, "readwrite").objectStore(STORE_WRAP);
		const read = store.get(WRAP_KEY_ID);
		read.onerror = () => reject(unavailable());
		read.onsuccess = () => {
			const stored = read.result;
			if (stored instanceof CryptoKey) {
				resolve(stored);
				return;
			}
			if (stored !== undefined) {
				reject(new KeyVaultError("corrupt", CORRUPT_MESSAGE));
				return;
			}
			const write = store.put(candidate, WRAP_KEY_ID);
			write.onerror = () => reject(unavailable());
			write.onsuccess = () => resolve(candidate);
		};
	});
}

/** Run `operation` against an open vault, always closing the connection. */
async function withVault<T>(operation: (db: IDBDatabase) => Promise<T>): Promise<T> {
	const db = await openVault();
	try {
		return await operation(db);
	} finally {
		db.close();
	}
}

/**
 * Encrypt `secret` under the vault's wrapping key and store it for `id`.
 *
 * @throws KeyVaultError when the vault cannot be opened or Web Crypto is unavailable. The
 * caller must surface that failure rather than storing the value in clear text.
 */
export async function putSecret(id: string, secret: string): Promise<void> {
	await withVault(async (db) => {
		const subtle = requireSubtle();
		const wrapKey = await getOrCreateWrapKey(db);
		const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
		const encrypted = await subtle.encrypt(
			{ name: "AES-GCM", iv },
			wrapKey,
			new TextEncoder().encode(secret),
		);
		// Persisted as a view rather than a raw `ArrayBuffer` so both fields read back through
		// the same realm-independent check.
		const record: SecretRecord = { iv, ciphertext: new Uint8Array(encrypted) };
		const store = db.transaction(STORE_SECRETS, "readwrite").objectStore(STORE_SECRETS);
		await awaitRequest(store.put(record, id));
	});
}

/**
 * Decrypt and return the secret stored for `id`, or `null` when none is stored.
 *
 * @throws KeyVaultError with reason `corrupt` when a record exists but cannot be decrypted,
 * which is reported distinctly from "no key stored" so the UI can prompt for re-entry.
 */
export async function getSecret(id: string): Promise<string | null> {
	return withVault(async (db) => {
		const subtle = requireSubtle();
		const store = db.transaction(STORE_SECRETS, "readonly").objectStore(STORE_SECRETS);
		const stored = await awaitRequest(store.get(id));
		if (stored === undefined) return null;
		const record = readSecretRecord(stored);
		if (!record) throw new KeyVaultError("corrupt", CORRUPT_MESSAGE);

		const wrapKey = await getOrCreateWrapKey(db);
		let plaintext: ArrayBuffer;
		try {
			plaintext = await subtle.decrypt(
				{ name: "AES-GCM", iv: record.iv },
				wrapKey,
				record.ciphertext,
			);
		} catch {
			// AES-GCM authentication failed: the record was truncated, tampered with, or was
			// written under a wrapping key that no longer exists.
			throw new KeyVaultError("corrupt", CORRUPT_MESSAGE);
		}
		return new TextDecoder().decode(plaintext);
	});
}

/** Report whether a secret is stored for `id` without decrypting it. */
export async function hasSecret(id: string): Promise<boolean> {
	return withVault(async (db) => {
		const store = db.transaction(STORE_SECRETS, "readonly").objectStore(STORE_SECRETS);
		const count = await awaitRequest(store.count(id));
		return count > 0;
	});
}

/**
 * Delete the secret stored for `id`.
 *
 * The wrapping key is intentionally left in place: it is shared by every provider, so
 * removing one provider's key must not orphan the others.
 */
export async function deleteSecret(id: string): Promise<void> {
	await withVault(async (db) => {
		const store = db.transaction(STORE_SECRETS, "readwrite").objectStore(STORE_SECRETS);
		await awaitRequest(store.delete(id));
	});
}
