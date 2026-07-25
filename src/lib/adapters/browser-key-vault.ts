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
 * What this defends against: casual inspection of web storage. Extensions, devtools, and
 * tooling that read the origin's storage through the platform APIs now see ciphertext and a
 * handle whose `exportKey` always rejects, and a scan of the profile for a key-shaped string
 * no longer finds one.
 *
 * What it does not defend against, and must not be described as defending against:
 *
 * - Script execution on the ThreatForge origin. Such script can reach the same handle and use
 *   it to decrypt, exactly as the application does. That residual risk is accepted (#133) and
 *   is mitigated separately by the deployed CSP (#156).
 * - An attacker with read access to the browser profile directory. `extractable: false` is an
 *   API-level restriction enforced by the Web Crypto implementation, not encryption at rest:
 *   browsers serialize the wrapping key's material into the same IndexedDB backing store that
 *   holds the ciphertext, so both are recoverable together off disk. Only the desktop build
 *   keeps the key out of the browser profile.
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

/**
 * How long to wait for `indexedDB.open` before giving up. Opening a local database is a
 * sub-millisecond operation in a healthy browser, so this only ever fires when the store is
 * wedged; it is generous enough that a loaded machine never trips it.
 */
const OPEN_TIMEOUT_MS = 10_000;

/** Why a vault operation could not complete. */
export type KeyVaultErrorReason =
	/** IndexedDB or Web Crypto is missing, blocked, or otherwise unusable here. */
	| "unavailable"
	/** One provider's record exists but could not be decrypted. Re-entering that key fixes it. */
	| "corrupt"
	/**
	 * The wrapping key itself is unusable, so no provider's record can be decrypted. This is
	 * distinct from `corrupt` because re-entering a key does not help: the write path needs
	 * the same wrapping key and fails identically.
	 */
	| "vault-corrupt"
	/**
	 * A pre-#133 clear-text slot could not be erased, so a usable credential is still sitting
	 * in this browser's storage. Reported so no caller can claim a key was removed when it
	 * was not.
	 */
	| "legacy-retained";

/**
 * A vault failure carrying a user-safe message. Raw `DOMException` text and internal detail
 * are never propagated, so nothing about the stored key or the host can leak through an
 * error surfaced in the UI. {@link withVault} enforces that by remapping every non-vault
 * error it sees.
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
const VAULT_CORRUPT_MESSAGE =
	"Encrypted key storage in this browser is damaged. Clear this site's browser data, then add your API key again.";

function unavailable(): KeyVaultError {
	return new KeyVaultError("unavailable", UNAVAILABLE_MESSAGE);
}

function vaultCorrupt(): KeyVaultError {
	return new KeyVaultError("vault-corrupt", VAULT_CORRUPT_MESSAGE);
}

/** A stored secret: the AES-GCM nonce and ciphertext for one provider's key. */
interface SecretRecord {
	iv: Uint8Array<ArrayBuffer>;
	ciphertext: Uint8Array<ArrayBuffer>;
}

/**
 * Coerce a value read back from IndexedDB into bytes.
 *
 * `value instanceof Uint8Array` compares against one realm's constructor, and a value that
 * arrived through structured clone need not have been constructed in that realm — under
 * vitest, jsdom's `window.Uint8Array` and the Node realm that materializes stored records
 * are different constructors, so `instanceof` returns false for a perfectly good array.
 * `ArrayBuffer.isView` tests the internal slot instead and holds regardless of realm, which
 * is the property a deserialization boundary needs.
 */
function asBytes(value: unknown): Uint8Array<ArrayBuffer> | null {
	if (!ArrayBuffer.isView(value)) return null;
	// Copied rather than aliased so the result is always backed by a plain `ArrayBuffer`,
	// which is what Web Crypto accepts as a `BufferSource`.
	return Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
}

function isCryptoKey(value: unknown): value is CryptoKey {
	return Object.prototype.toString.call(value) === "[object CryptoKey]";
}

/**
 * Report whether a value read back from IndexedDB is a wrapping key this vault can use.
 *
 * The algorithm and usages are checked, not just the type. A `CryptoKey` of the wrong shape
 * — say encrypt-only, or HMAC — would otherwise be accepted and then fail at `decrypt`,
 * which reads as "this record is corrupt" and gets the record deleted. Rejecting it here
 * classifies the fault as vault-wide, which is what it is.
 *
 * Unlike the {@link asBytes} hazard, no environment here has been observed to break
 * `instanceof CryptoKey`; the brand check is deliberate symmetry rather than a fix for a
 * reproduced failure. It is the right default at this boundary because the cost of a false
 * negative is severe and silent. `Symbol.toStringTag` cannot be forged through structured
 * clone, which drops symbol-keyed properties.
 */
function isWrapKey(value: unknown): value is CryptoKey {
	if (!isCryptoKey(value)) return false;
	return (
		value.algorithm.name === "AES-GCM" &&
		value.usages.includes("encrypt") &&
		value.usages.includes("decrypt")
	);
}

/**
 * Report whether a rejection is a Web Crypto `OperationError`, which is how AES-GCM reports
 * an authentication failure — the one decrypt failure that really does mean "this record is
 * damaged" rather than "this vault is broken".
 *
 * Checked by name rather than `instanceof DOMException` because that check demonstrably
 * fails here: the error Node's Web Crypto throws is not an instance of the `DOMException`
 * jsdom installs as the global, so `instanceof` reports `false` for a genuine authentication
 * failure. This is the same cross-realm hazard {@link asBytes} guards against.
 */
function isOperationError(error: unknown): boolean {
	if (typeof error !== "object" || error === null || !("name" in error)) return false;
	return error.name === "OperationError";
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

		let settled = false;
		// Some browsers accept `open()` and then never fire any event — a documented
		// private-mode failure mode. Without a bound the promise never settles, the settings
		// spinner never clears, and (because adapter calls are serialized per provider) every
		// later call for that provider is wedged behind it even after storage recovers.
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			reject(unavailable());
		}, OPEN_TIMEOUT_MS);

		const finish = (outcome: () => void): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			outcome();
		};

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_WRAP)) db.createObjectStore(STORE_WRAP);
			if (!db.objectStoreNames.contains(STORE_SECRETS)) db.createObjectStore(STORE_SECRETS);
		};
		request.onsuccess = () => {
			// A timeout or `onblocked` may already have rejected; close the connection that
			// arrived late rather than leaking it.
			if (settled) {
				request.result.close();
				return;
			}
			finish(() => resolve(request.result));
		};
		request.onerror = () => finish(() => reject(unavailable()));
		request.onblocked = () => finish(() => reject(unavailable()));
	});
}

/** Await one IndexedDB read request, mapping any failure to a user-safe vault error. */
function awaitRequest<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(unavailable());
	});
}

/**
 * Await a write, resolving only once its transaction has committed.
 *
 * A successful `IDBRequest` does not mean the data is durable: the transaction can still
 * abort afterwards on a commit-time quota or I/O failure, and the write is then lost.
 * Callers here treat a resolved write as authoritative — the legacy migration erases the
 * user's only clear-text copy on the strength of it — so the commit is the only honest
 * point to resolve at. This matches `indexeddb-workspace-storage.ts`.
 */
function awaitWrite(tx: IDBTransaction, request: IDBRequest): Promise<void> {
	return new Promise((resolve, reject) => {
		let succeeded = false;
		request.onsuccess = () => {
			succeeded = true;
		};
		tx.oncomplete = () => (succeeded ? resolve() : reject(unavailable()));
		tx.onabort = () => reject(unavailable());
		tx.onerror = () => reject(unavailable());
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
	if (isWrapKey(stored)) return stored;
	if (stored !== undefined) {
		// A record is present but is not a usable key: refuse rather than silently replacing
		// it, because overwriting would permanently orphan every secret encrypted under it.
		throw vaultCorrupt();
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
 * and orphaning everything already encrypted under it. Resolution waits for the commit so a
 * caller never encrypts under a wrapping key whose write later aborts, which would leave a
 * permanently undecryptable record behind.
 */
function installWrapKey(db: IDBDatabase, candidate: CryptoKey): Promise<CryptoKey> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_WRAP, "readwrite");
		const read = tx.objectStore(STORE_WRAP).get(WRAP_KEY_ID);
		let winner: CryptoKey | null = null;
		let failure: KeyVaultError | null = null;

		read.onsuccess = () => {
			if (isWrapKey(read.result)) {
				// Another context won the race; adopt its key and write nothing.
				winner = read.result;
				return;
			}
			if (read.result !== undefined) {
				// Guards a cross-context TOCTOU only: another tab would have to write a
				// non-key into the slot between `readWrapKey`'s transaction and this one. No
				// test reaches it, because the app itself never writes such a value.
				failure = vaultCorrupt();
				tx.abort();
				return;
			}
			winner = candidate;
			tx.objectStore(STORE_WRAP).put(candidate, WRAP_KEY_ID);
		};

		tx.oncomplete = () => (winner ? resolve(winner) : reject(failure ?? unavailable()));
		tx.onabort = () => reject(failure ?? unavailable());
		tx.onerror = () => reject(failure ?? unavailable());
	});
}

/**
 * Run `operation` against an open vault, always closing the connection.
 *
 * Anything that is not already a {@link KeyVaultError} is remapped, so a raw `DOMException`
 * from `transaction()` or a Web Crypto rejection cannot reach the UI with internal detail
 * attached. Only messages authored in this module are ever surfaced.
 */
async function withVault<T>(operation: (db: IDBDatabase) => Promise<T>): Promise<T> {
	const db = await openVault();
	try {
		return await operation(db);
	} catch (error) {
		if (error instanceof KeyVaultError) throw error;
		throw unavailable();
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
		const tx = db.transaction(STORE_SECRETS, "readwrite");
		await awaitWrite(tx, tx.objectStore(STORE_SECRETS).put(record, id));
	});
}

/**
 * Decrypt and return the secret stored for `id`, or `null` when none is stored.
 *
 * @throws KeyVaultError with reason `corrupt` when this record exists but cannot be
 * decrypted, or `vault-corrupt` when the wrapping key itself is unusable and no record can
 * be read. Reading never creates key material: minting a wrapping key here would turn a
 * diagnosable "records exist but the key is gone" state into records that are silently
 * undecryptable forever.
 */
export async function getSecret(id: string): Promise<string | null> {
	return withVault(async (db) => {
		const subtle = requireSubtle();
		const store = db.transaction(STORE_SECRETS, "readonly").objectStore(STORE_SECRETS);
		const stored = await awaitRequest(store.get(id));
		if (stored === undefined) return null;
		const record = readSecretRecord(stored);
		if (!record) throw new KeyVaultError("corrupt", CORRUPT_MESSAGE);

		const wrapKey = await readWrapKey(db);
		if (!wrapKey) throw vaultCorrupt();
		let plaintext: ArrayBuffer;
		try {
			plaintext = await subtle.decrypt(
				{ name: "AES-GCM", iv: record.iv },
				wrapKey,
				record.ciphertext,
			);
		} catch (error) {
			// An `OperationError` is an AES-GCM authentication failure: this record really was
			// truncated or tampered with, and the caller may discard it. Any other rejection is
			// a fault in the crypto layer, not evidence about this record — classifying it as
			// `corrupt` would let a transient failure delete a perfectly good key.
			if (isOperationError(error)) {
				throw new KeyVaultError("corrupt", CORRUPT_MESSAGE);
			}
			throw vaultCorrupt();
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
		const tx = db.transaction(STORE_SECRETS, "readwrite");
		await awaitWrite(tx, tx.objectStore(STORE_SECRETS).delete(id));
	});
}
