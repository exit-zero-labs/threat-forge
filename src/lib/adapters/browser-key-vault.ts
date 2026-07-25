/**
 * Encrypted-at-rest storage for browser BYOK API keys.
 *
 * The browser has no OS keychain, so the key has to live in a web store. Rather than the
 * clear text `localStorage` this replaces, the vault keeps a non-extractable AES-GCM
 * `CryptoKey` in IndexedDB and persists only ciphertext. `extractable: false` means the
 * wrapping material cannot be read back out through the Web Crypto API, even by code running
 * on this origin — structured clone moves the handle into IndexedDB, but `exportKey` on it
 * always rejects.
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
/**
 * Key-vault schema version.
 *
 * Exported so tests can construct a database at exactly this version; opening at any other
 * version triggers an upgrade and silently repairs the state a test is trying to arrange.
 *
 * Version 2 adds {@link STORE_META}. #133 has not shipped, so no version-1 database exists
 * outside a development profile; the bump exists so those profiles gain the store instead of
 * failing every operation with a missing-store error.
 */
export const KEY_VAULT_DB_VERSION = 2;

/** Holds the single non-extractable wrapping key. */
const STORE_WRAP = "wrap-key";
/** Holds one ciphertext record per provider. */
const STORE_SECRETS = "secrets";
/**
 * Holds markers that describe a provider rather than store its secret.
 *
 * Separate from {@link STORE_SECRETS} so every record in that store is a `SecretRecord`, and
 * no reader of it has to tolerate two unrelated record shapes.
 */
const STORE_META = "meta";

/**
 * Key of the marker recording that a provider's pre-#133 clear-text slot has been dealt with
 * and must never be imported again.
 *
 * Built in one place because the pre-check, the authoritative guard and both writers must
 * agree on it.
 */
function retiredKey(id: string): string {
	return `legacy-retired:${id}`;
}

/**
 * Why a provider's clear-text slot was settled.
 *
 * `"revoked"` is the user deleting a credential. `"dropped"` is this vault discarding a
 * record it could not read, which the user never asked for. Both block re-import, but only a
 * revocation licenses erasing the clear-text copy while the vault is too damaged to offer a
 * replacement — a dropped record leaves that copy as the last one there is.
 */
type RetiredReason = "revoked" | "dropped";

const REVOKED: RetiredReason = "revoked";
const DROPPED: RetiredReason = "dropped";

/** Read a provider's retirement marker, or `null` when it has none. */
function readRetiredReason(stored: unknown): RetiredReason | null {
	if (stored === REVOKED) return REVOKED;
	if (stored === DROPPED) return DROPPED;
	return null;
}

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

/**
 * The record each `corrupt` error was raised for.
 *
 * Held here rather than on the error so nothing that logs or serializes a `KeyVaultError` can
 * pick up stored ciphertext, and keyed weakly so it disappears with the error.
 */
const corruptRecords = new WeakMap<KeyVaultError, SecretRecord | null>();

/** `null` records that the stored value did not read back as a record at all. */
function corruptRecord(record: SecretRecord | null): KeyVaultError {
	const error = new KeyVaultError("corrupt", CORRUPT_MESSAGE);
	corruptRecords.set(error, record);
	return error;
}

const UNAVAILABLE_MESSAGE =
	"Encrypted key storage is unavailable in this browser. Check that this site is allowed to store data, then try again.";
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
		// A browser can accept `open()` and then never fire any event; the long-standing
		// WebKit report is the case actually observed in the wild, and any storage layer that
		// stalls produces the same shape. Without a bound the promise never settles, the
		// settings spinner never clears, and (because adapter calls are serialized per
		// provider) every later call for that provider is wedged behind it even after storage
		// recovers.
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
			if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
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
function awaitWrite(tx: IDBTransaction, ...requests: IDBRequest[]): Promise<void> {
	return new Promise((resolve, reject) => {
		let succeeded = 0;
		for (const request of requests) {
			request.onsuccess = () => {
				succeeded += 1;
			};
		}
		tx.oncomplete = () => (succeeded === requests.length ? resolve() : reject(unavailable()));
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
async function getOrCreateWrapKey(db: IDBDatabase, mint: MintPolicy): Promise<CryptoKey> {
	const subtle = requireSubtle();

	const existing = await readWrapKey(db);
	if (existing) return existing;

	const candidate = await subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
		"encrypt",
		"decrypt",
	]);
	return installWrapKey(db, candidate, mint);
}

/**
 * Whether a caller may create the vault's wrapping key when the vault holds records it
 * cannot read.
 *
 * `"always"` is for re-entry: the user is supplying a fresh credential, so a vault whose key
 * is gone has to be able to start over, or there is no in-app way out.
 * `"only-when-empty"` is for migration, which is not a user asking to store anything — it
 * runs on a read — so it must not decide that unreadable records are disposable.
 */
type MintPolicy = "always" | "only-when-empty";

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
 *
 * Whatever the policy, the same transaction also reads the secrets, so the decision and the
 * install are indivisible. A caller that looks first and mints second loses to a wrap-key
 * wipe landing in between, which is the state this exists to prevent.
 *
 * Under `"only-when-empty"` a vault that still holds records refuses to mint rather than
 * orphaning them. Under `"always"` it mints and clears them in the same transaction: those
 * records cannot be read under the new key, so leaving them is not preservation, it is a
 * delayed loss that arrives later as a corrupt read — and that read would settle the
 * provider's clear-text slot, destroying a copy that is still good. Clearing here settles
 * nothing, so a slot that outlived the damage is still imported afterwards.
 */
function installWrapKey(
	db: IDBDatabase,
	candidate: CryptoKey,
	mint: MintPolicy,
): Promise<CryptoKey> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction([STORE_WRAP, STORE_SECRETS], "readwrite");
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
			const secrets = tx.objectStore(STORE_SECRETS);
			const stored = secrets.count();
			stored.onsuccess = () => {
				if (stored.result > 0) {
					if (mint === "only-when-empty") {
						// Records survive but their key does not. A new key cannot read them, so
						// minting one would convert a diagnosable vault into permanently silent loss.
						failure = vaultCorrupt();
						tx.abort();
						return;
					}
					// The user is re-entering a credential, so the vault has to start over. The
					// records going with it are already unreadable; discarding them here rather
					// than leaving them to be found broken later is what keeps a surviving
					// clear-text copy importable.
					secrets.clear();
				}
				winner = candidate;
				tx.objectStore(STORE_WRAP).put(candidate, WRAP_KEY_ID);
			};
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

/** Encrypt `secret` under the vault's wrapping key, minting one if the vault has none. */
async function encryptSecret(
	db: IDBDatabase,
	secret: string,
	mint: MintPolicy,
): Promise<SecretRecord> {
	const subtle = requireSubtle();
	const wrapKey = await getOrCreateWrapKey(db, mint);
	const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const encrypted = await subtle.encrypt(
		{ name: "AES-GCM", iv },
		wrapKey,
		new TextEncoder().encode(secret),
	);
	// Persisted as a view rather than a raw `ArrayBuffer` so both fields read back through the
	// same realm-independent check.
	return { iv, ciphertext: new Uint8Array(encrypted) };
}

/**
 * Encrypt `secret` under the vault's wrapping key and store it for `id`.
 *
 * @throws KeyVaultError when the vault cannot be opened or Web Crypto is unavailable. The
 * caller must surface that failure rather than storing the value in clear text.
 */
export async function putSecret(id: string, secret: string): Promise<void> {
	await withVault(async (db) => {
		const record = await encryptSecret(db, secret, "always");
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
		if (!record) throw corruptRecord(null);

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
				throw corruptRecord(record);
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
 * Delete `id`'s secret and mark its pre-#133 clear-text slot as settled, in one transaction.
 *
 * The wrapping key is intentionally left in place: it is shared by every provider, so
 * removing one provider's key must not orphan the others.
 *
 * The two halves cannot be separate operations. A delete removes the stored secret that
 * outranks the clear-text slot, and the marker is the only thing left to stop that slot being
 * imported again — so any moment in which one has been applied and the other has not is a
 * window where a revoked credential comes back. IndexedDB serializes overlapping `readwrite`
 * transactions across connections, and therefore across tabs, so a single transaction is what
 * makes this indivisible rather than merely well-ordered.
 *
 * The marker lives in the vault rather than in `localStorage` because the only situation that
 * needs it is one where `localStorage` has already proven unreliable: a browser that refuses
 * to erase the clear-text slot cannot be trusted to hold a note saying it was dismissed.
 *
 * It is written on every delete, including for providers that never had a clear-text slot,
 * and there is no way to clear one. Both are deliberate: whether a slot exists is decided by
 * a `localStorage` read that can throw, and a durable record must not be gated on one; and a
 * marker that could be cleared would not be durable. The cost is one small record per
 * provider the user has ever deleted a key for.
 */
export async function retireAndDeleteSecret(id: string): Promise<void> {
	await withVault(async (db) => {
		const tx = db.transaction([STORE_SECRETS, STORE_META], "readwrite");
		// Both requests are issued before any `await`, because a transaction commits as soon as
		// its request queue drains and control returns to the event loop.
		const marked = tx.objectStore(STORE_META).put(REVOKED, retiredKey(id));
		const deleted = tx.objectStore(STORE_SECRETS).delete(id);
		await awaitWrite(tx, marked, deleted);
	});
}

/**
 * Drop the record that `error` was raised for, and settle `id`'s clear-text slot with it.
 *
 * Conditional on the stored value still being the one that could not be read. Reading,
 * decrypting and then deleting spans several transactions, so another tab can save a working
 * key in between — and deleting by id alone would throw that key away and leave behind a
 * retirement marker no path can clear. Re-reading inside the write transaction makes the drop
 * apply only to the damaged value it was decided for. A key saved concurrently reads back as
 * a well-formed record, so it is never the thing dropped.
 *
 * Does nothing for an `error` this vault did not raise for a stored value.
 */
export async function dropUnreadableSecret(id: string, error: KeyVaultError): Promise<void> {
	if (!corruptRecords.has(error)) return;
	const expected = corruptRecords.get(error) ?? null;
	await withVault(async (db) => {
		const tx = db.transaction([STORE_SECRETS, STORE_META], "readwrite");
		const secrets = tx.objectStore(STORE_SECRETS);
		await new Promise<void>((resolve, reject) => {
			// Chained inside the callback rather than awaited, to keep the transaction live.
			const current = secrets.get(id);
			current.onsuccess = () => {
				if (current.result === undefined) return;
				const stored = readSecretRecord(current.result);
				// A value that never parsed is identified by still not parsing: there are no
				// bytes to compare, but "unreadable" is itself the fact that was established,
				// and anything written since would parse.
				const isSameValue =
					expected === null ? stored === null : stored !== null && sameRecord(stored, expected);
				if (!isSameValue) return;
				// Order is immaterial inside one transaction, and a failing request aborts it
				// into `onerror`, so resolving on `oncomplete` alone is enough here.
				secrets.delete(id);
				tx.objectStore(STORE_META).put(DROPPED, retiredKey(id));
			};
			tx.oncomplete = () => resolve();
			tx.onabort = () => reject(unavailable());
			tx.onerror = () => reject(unavailable());
		});
	});
}

function sameRecord(a: SecretRecord, b: SecretRecord): boolean {
	return (
		a.iv.length === b.iv.length &&
		a.ciphertext.length === b.ciphertext.length &&
		a.iv.every((byte, index) => byte === b.iv[index]) &&
		a.ciphertext.every((byte, index) => byte === b.ciphertext[index])
	);
}

/**
 * Store `secret` for `id` only if the vault has neither a secret nor a retirement marker.
 *
 * Migration is a check-then-act, and split across transactions it loses to a concurrent
 * delete: a tab that reads "not retired, not stored", is descheduled while another tab
 * completes a delete, then resumes and writes, resurrects the revoked key — and because both
 * tabs' operations individually succeeded, the user is told the delete worked. The
 * per-provider lock cannot prevent this, as it is module-scoped and so orders only one tab's
 * calls. Doing the two counts and the put in one transaction closes it: the importing
 * transaction either wholly precedes the delete, whose marker and delete then apply on top,
 * or wholly follows it and sees the marker.
 *
 * Encryption happens before the write transaction opens, since awaiting Web Crypto inside one
 * would let it commit early.
 */
export async function importLegacySecret(id: string, secret: string): Promise<void> {
	return withVault(async (db) => {
		// Read-only pre-check, so an import that is going to decline never opens a write
		// transaction. The authoritative answer is still the in-transaction check below; this
		// only declines early, so the two cannot disagree in a way that stores something they
		// would not.
		const check = db.transaction([STORE_SECRETS, STORE_META], "readonly");
		// All three handlers are attached in this task, so none of them can miss its event.
		const [retiredMarker, existingCount, storedCount] = await Promise.all([
			awaitRequest(check.objectStore(STORE_META).get(retiredKey(id))),
			awaitRequest(check.objectStore(STORE_SECRETS).count(id)),
			awaitRequest(check.objectStore(STORE_SECRETS).count()),
		]);
		const retired = readRetiredReason(retiredMarker);
		// Answerable without a wrapping key, and answered first: a revocation is a durable
		// record that the user threw this credential away, so the stale clear-text copy is
		// erased on sight even while the vault is damaged. A `"dropped"` marker is not that —
		// the user never asked for it — so it waits behind the guard below.
		if (retired === REVOKED) return;
		// Every other outcome needs the wrapping key, so a vault that has records and cannot
		// produce one is refused rather than answered. Declining here would let the caller
		// erase the clear-text slot, which on an unreadable vault is the user's only remaining
		// copy. `encryptSecret` will not mint over surviving records either — that refusal is
		// atomic and authoritative; this one only makes the answer diagnosable and keeps a
		// readable copy alive.
		if (storedCount > 0 && !(await readWrapKey(db))) throw vaultCorrupt();
		if (retired) return;
		if (existingCount > 0) return;

		const record = await encryptSecret(db, secret, "only-when-empty");
		const tx = db.transaction([STORE_SECRETS, STORE_META], "readwrite");
		const meta = tx.objectStore(STORE_META);
		const secrets = tx.objectStore(STORE_SECRETS);
		return new Promise<void>((resolve, reject) => {
			// Chained inside the success callbacks rather than awaited, to keep the transaction
			// live across the decision.
			const marker = meta.get(retiredKey(id));
			marker.onsuccess = () => {
				// This vault has already settled the credential, by revocation or by dropping an
				// unreadable record. Either way the slot is a copy of something superseded.
				if (readRetiredReason(marker.result)) return;
				const existing = secrets.count(id);
				existing.onsuccess = () => {
					// A stored secret outranks the slot: importing would revert a key the user
					// replaced while the browser was refusing to erase the old clear-text one.
					if (existing.result > 0) return;
					secrets.put(record, id);
				};
			};
			tx.oncomplete = () => resolve();
			tx.onabort = () => reject(unavailable());
			tx.onerror = () => reject(unavailable());
		});
	});
}
