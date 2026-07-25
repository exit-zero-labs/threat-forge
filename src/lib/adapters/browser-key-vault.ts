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

import type { LEGACY_RETAINED } from "./keychain-adapter";

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
 * `"revoked"` is the user deleting a credential. `"settled"` is everything else that stops a
 * slot being importable: a stored key replacing one the browser would not erase, and this
 * vault discarding a record it could not read.
 *
 * Both block re-import, and the distinction carries exactly one decision. While the vault
 * holds records it cannot decrypt, a revocation is still answered — the user threw the
 * credential away — and anything else is refused, because the clear-text copy may be the last
 * one there is and the user asked for neither.
 *
 * The causes behind `"settled"` are not recorded apart. Nothing reads them: no code path,
 * surface or diagnostic distinguishes a supersession from a drop, so naming them would
 * describe the writers rather than anything the vault decides. Two named values rather than a
 * boolean because the marker is persisted, and a name states which decision it licenses.
 *
 * Only `retireAndDeleteSecret` overwrites a marker that already stands. The other writers
 * defer to whatever is there, so a value this build does not recognise is preserved rather
 * than downgraded to one it does.
 */
type RetiredReason = "revoked" | "settled";

const REVOKED: RetiredReason = "revoked";
const SETTLED: RetiredReason = "settled";

/**
 * Read a provider's retirement marker, or `null` when it has none.
 *
 * Fails closed on anything present but unrecognised. A false negative here re-imports a
 * clear-text credential the vault has already settled — the exact resurrection the marker
 * exists to prevent — so an unreadable marker is still a marker. Only `undefined`, which is
 * what IndexedDB returns for a key that was never written, means no marker.
 *
 * The default covers a marker from a build this one does not understand, and the shapes
 * earlier builds on this branch wrote: bare `true`, and the `"superseded"` and `"dropped"`
 * values `"settled"` replaced. None is read as a revocation. A revocation licenses erasing a
 * clear-text slot on a vault that can offer no replacement, and an unrecognised marker
 * establishes only that re-import was already declined.
 */
function readRetiredReason(stored: unknown): RetiredReason | null {
	if (stored === undefined) return null;
	if (stored === REVOKED) return REVOKED;
	return SETTLED;
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
	| typeof LEGACY_RETAINED;

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
 *
 * Takes only the transaction. A failed request fires `error`, which bubbles to the
 * transaction and aborts it, so reaching `oncomplete` already means every request the caller
 * issued succeeded; tracking them individually would add a branch nothing can reach. Callers
 * must issue their requests before awaiting, since a transaction commits as soon as its queue
 * drains and control returns to the event loop.
 */
function awaitWrite(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
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
 * Whether a save must also record that it superseded a pre-#133 clear-text slot.
 *
 * Not inferable inside the vault: only the adapter can see `localStorage`. Passed rather
 * than defaulted so a caller storing a secret has to decide, since guessing wrong in the
 * `"leave-slot"` direction is what lets a replaced credential come back.
 */
type SlotSettlement = "supersede-slot" | "leave-slot";

/**
 * Encrypt `secret` under the vault's wrapping key and store it for `id`.
 *
 * Under `"supersede-slot"` the ciphertext and the retirement marker are written in one
 * transaction. They cannot be two operations: the stored record is the only thing outranking
 * a clear-text slot the browser refused to erase, and that record does not survive the vault
 * being restarted after its wrapping key is lost. A save that committed the record and then
 * failed to write the marker — quota, eviction, a closed tab — would report success and leave
 * the superseded credential ready to come back as the active key. The conditions that make
 * the marker write fail are the same ones that later destroy the record, so the two are
 * correlated rather than independent.
 *
 * A marker already recorded for this provider is never overwritten. Rewriting one that stands
 * changes nothing this build reads, but it is a request that can fail, and it shares the
 * transaction with the ciphertext — so a per-record meta fault would turn a save that used to
 * commit into a rejection. It would also clobber a marker shape written by some later build,
 * which this build cannot interpret and so must not downgrade. The read and the write share
 * the transaction, so no concurrent delete can land between them.
 *
 * @throws KeyVaultError when the vault cannot be opened or Web Crypto is unavailable. The
 * caller must surface that failure rather than storing the value in clear text.
 */
export async function putSecret(
	id: string,
	secret: string,
	settlement: SlotSettlement,
): Promise<void> {
	await withVault(async (db) => {
		// Encryption finishes before any transaction opens, since awaiting Web Crypto inside
		// one would let it commit early.
		const record = await encryptSecret(db, secret, "always");
		if (settlement === "leave-slot") {
			const tx = db.transaction(STORE_SECRETS, "readwrite");
			tx.objectStore(STORE_SECRETS).put(record, id);
			await awaitWrite(tx);
			return;
		}
		const tx = db.transaction([STORE_SECRETS, STORE_META], "readwrite");
		const meta = tx.objectStore(STORE_META);
		// Issued before the promise body so the ciphertext write is queued ahead of the marker
		// read, and before any `await`, since a transaction commits once its queue drains.
		tx.objectStore(STORE_SECRETS).put(record, id);
		return new Promise<void>((resolve, reject) => {
			// The marker read is chained inside a success callback rather than awaited, to keep
			// the transaction live across the decision.
			const marker = meta.get(retiredKey(id));
			marker.onsuccess = () => {
				if (readRetiredReason(marker.result) !== null) return;
				meta.put(SETTLED, retiredKey(id));
			};
			// Neither write is tracked with a flag. A failed request fires `error`, which
			// bubbles to the transaction and aborts it, so reaching `oncomplete` means every
			// write that was issued landed. A flag on the marker would be worse than redundant:
			// the write is conditional, so a cleared flag could not tell a skip from a loss.
			tx.oncomplete = () => resolve();
			tx.onabort = () => reject(unavailable());
			tx.onerror = () => reject(unavailable());
		});
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
 *
 * The write is unconditional, where the other two writers defer to any marker that already
 * stands. This is the one direction that must override: a slot already settled for some other
 * reason has to be re-settled as revoked when the user throws the credential away, because
 * that is what makes the stale clear-text copy erasable on a vault too damaged to offer a
 * replacement. Every other re-settling would only rewrite a decision with an equal one.
 */
export async function retireAndDeleteSecret(id: string): Promise<void> {
	await withVault(async (db) => {
		const tx = db.transaction([STORE_SECRETS, STORE_META], "readwrite");
		// Both requests are issued before the `await`, because a transaction commits as soon as
		// its request queue drains and control returns to the event loop.
		tx.objectStore(STORE_META).put(REVOKED, retiredKey(id));
		tx.objectStore(STORE_SECRETS).delete(id);
		await awaitWrite(tx);
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
 *
 * The marker defers to any marker already recorded, which matters most for a revocation. A
 * save after one re-creates a stored record while the `REVOKED` marker still stands, so this
 * path can find a matching value to drop with a revocation in place, and lowering it would
 * leave a credential the user threw away sitting readable in clear text on a damaged vault.
 */
export async function dropUnreadableSecret(id: string, error: KeyVaultError): Promise<void> {
	if (!corruptRecords.has(error)) return;
	const expected = corruptRecords.get(error) ?? null;
	await withVault(async (db) => {
		const tx = db.transaction([STORE_SECRETS, STORE_META], "readwrite");
		const secrets = tx.objectStore(STORE_SECRETS);
		const meta = tx.objectStore(STORE_META);
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
				const marker = meta.get(retiredKey(id));
				marker.onsuccess = () => {
					if (readRetiredReason(marker.result) !== null) return;
					meta.put(SETTLED, retiredKey(id));
				};
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
		// erased on sight even while the vault is damaged. The other reasons are not that —
		// the user asked for neither — so they wait behind the guard below.
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
				// This vault has already settled the credential, by revocation or by a save or
				// drop that outranked the slot. Either way it is a copy of something superseded.
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
