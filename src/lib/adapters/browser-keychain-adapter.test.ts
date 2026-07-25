import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import "fake-indexeddb/auto";
import { KEY_VAULT_DB_NAME, KEY_VAULT_DB_VERSION, KeyVaultError } from "./browser-key-vault";
import { BrowserKeychainAdapter } from "./browser-keychain-adapter";
import { LEGACY_RETAINED } from "./keychain-adapter";
import { yieldHostTask } from "./test-fixtures/host-task";
import { resetKeyVault } from "./test-fixtures/key-vault";

/**
 * #133: browser BYOK keys are encrypted at rest under a non-extractable wrapping key.
 *
 * These tests assert the property that matters — a stored key is never recoverable as clear
 * text from web storage — against the real IndexedDB and Web Crypto implementations rather
 * than against a mock of them, so they would fail if the adapter reverted to `localStorage`.
 */

const SECRET = "sk-ant-test-0123456789abcdef";
const LEGACY_SLOT = "tf-api-key-anthropic";

/** Read every value held in the vault database, as one string, for substring scanning. */
async function dumpVault(): Promise<string> {
	const db = await openVaultDb();
	try {
		const names = Array.from(db.objectStoreNames);
		const dumps = await Promise.all(
			names.map(
				(name) =>
					new Promise<unknown[]>((resolve, reject) => {
						const request = db.transaction(name, "readonly").objectStore(name).getAll();
						request.onsuccess = () => resolve(request.result);
						request.onerror = () => reject(request.error);
					}),
			),
		);
		// `CryptoKey` and byte views do not survive `JSON.stringify`, so build a
		// representation that decodes raw bytes — otherwise a plaintext key sitting in the
		// store could pass a substring check simply by being unreadable.
		return dumps
			.flat()
			.map((record) => describeStoredValue(record))
			.join("|");
	} finally {
		db.close();
	}
}

/**
 * Render one stored value as scannable text. Structured clone returns cross-realm objects,
 * so this brands byte views with `ArrayBuffer.isView` rather than `instanceof`.
 */
function describeStoredValue(value: unknown): string {
	if (ArrayBuffer.isView(value)) {
		return new TextDecoder().decode(
			new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
		);
	}
	if (typeof value !== "object" || value === null) return String(value);
	// Branded the same way production does, so this helper cannot disagree with the
	// vault about what counts as a key.
	if (Object.prototype.toString.call(value) === "[object CryptoKey]") return "CryptoKey";
	return Object.values(value).map(describeStoredValue).join(",");
}

/** Open the vault database directly, to inspect or damage it the way a test needs. */
async function openVaultDb(): Promise<IDBDatabase> {
	return new Promise<IDBDatabase>((resolve, reject) => {
		const request = globalThis.indexedDB.open(KEY_VAULT_DB_NAME);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Empty the wrap-key store immediately after the next read of it, then stop.
 *
 * The migration reads the wrapping key twice — once to decide it may proceed, once to
 * encrypt under — and a loss landing between them is what a caller-side check cannot see.
 * Firing on the read itself makes that window deterministic instead of hoping a concurrent
 * write lands inside it. It fires at most once, so later assertions in the same test are not
 * wiped a second time; `vi.restoreAllMocks()` in `afterEach` is what stops it leaking into
 * the next test when an assertion fails before the read.
 */
function wipeWrapKeyAfterRead(): void {
	const original = IDBObjectStore.prototype.get;
	let armed = true;
	vi.spyOn(IDBObjectStore.prototype, "get").mockImplementation(function patched(
		this: IDBObjectStore,
		query: IDBValidKey | IDBKeyRange,
	) {
		const request = original.call(this, query);
		if (armed && this.name === "wrap-key") {
			armed = false;
			const db = this.transaction.db;
			request.addEventListener("success", () => {
				// Opened on the same connection and from inside the handler, so it is created
				// before any transaction the caller opens next and therefore commits first.
				db.transaction("wrap-key", "readwrite").objectStore("wrap-key").clear();
			});
		}
		return request;
	});
}

/** Read a raw value back out of the vault's meta store. */
async function readMetaValue(key: string): Promise<unknown> {
	const db = await openVaultDb();
	try {
		return await new Promise<unknown>((resolve, reject) => {
			const request = db.transaction("meta", "readonly").objectStore("meta").get(key);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	} finally {
		db.close();
	}
}

/** Write a raw value into the vault's meta store, standing in for another build. */
async function writeMetaValue(key: string, value: unknown): Promise<void> {
	const db = await openVaultDb();
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction("meta", "readwrite");
		tx.objectStore("meta").put(value, key);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
	db.close();
}

/** Replace the contents of the wrap-key store, simulating a damaged vault. */
async function writeWrapKeyStore(entries: [unknown, string][]): Promise<void> {
	const db = await openVaultDb();
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction("wrap-key", "readwrite");
		const store = tx.objectStore("wrap-key");
		store.clear();
		for (const [value, key] of entries) store.put(value, key);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error);
	});
	db.close();
}

async function countWrapKeys(): Promise<number> {
	return countStore("wrap-key");
}

/** Count the stored secret records. */
async function countSecrets(): Promise<number> {
	return countStore("secrets");
}

async function countStore(store: string): Promise<number> {
	const db = await openVaultDb();
	try {
		return await new Promise<number>((resolve, reject) => {
			const request = db.transaction(store, "readonly").objectStore(store).count();
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	} finally {
		db.close();
	}
}

beforeEach(() => {
	resetKeyVault();
	localStorage.clear();
});

afterEach(() => {
	vi.restoreAllMocks();
	// Restored here, not only at the end of the tests that install them: a test that fails
	// while timers are faked would otherwise hang every test that follows it.
	vi.useRealTimers();
});

describe("BrowserKeychainAdapter encrypted storage", () => {
	it("round-trips a stored key", async () => {
		const adapter = new BrowserKeychainAdapter();

		expect(await adapter.hasKey("anthropic")).toBe(false);
		expect(await adapter.getKey("anthropic")).toBeNull();

		await adapter.setKey("anthropic", SECRET);

		expect(await adapter.hasKey("anthropic")).toBe(true);
		expect(await adapter.getKey("anthropic")).toBe(SECRET);
	});

	it("never writes the key to localStorage", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);

		const values = Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? "");
		expect(values.some((value) => value.includes(SECRET))).toBe(false);
		expect(localStorage.getItem(LEGACY_SLOT)).toBeNull();
	});

	it("persists ciphertext rather than the key itself", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);

		const dump = await dumpVault();
		expect(dump).not.toContain(SECRET);
		// The vault is not merely empty: a wrapping key and a record are both present.
		expect(dump).toContain("CryptoKey");
	});

	it("stores the wrapping key as non-extractable", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);

		const db = await openVaultDb();
		const wrapKey = await new Promise<unknown>((resolve, reject) => {
			const request = db.transaction("wrap-key", "readonly").objectStore("wrap-key").getAll();
			request.onsuccess = () => resolve(request.result[0]);
			request.onerror = () => reject(request.error);
		});
		db.close();

		expect(wrapKey).toBeInstanceOf(CryptoKey);
		expect((wrapKey as CryptoKey).extractable).toBe(false);
		// The property that makes `extractable: false` meaningful: the material cannot be
		// read back out through the Web Crypto API, even by code running on this origin.
		await expect(globalThis.crypto.subtle.exportKey("raw", wrapKey as CryptoKey)).rejects.toThrow();
	});

	it("keeps providers isolated from each other", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await adapter.setKey("openai", "sk-openai-different-value");

		expect(await adapter.getKey("anthropic")).toBe(SECRET);
		expect(await adapter.getKey("openai")).toBe("sk-openai-different-value");
	});

	it("overwrites a previously stored key", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await adapter.setKey("anthropic", "sk-ant-replacement");

		expect(await adapter.getKey("anthropic")).toBe("sk-ant-replacement");
	});

	it("uses a fresh nonce per encryption so identical keys differ on disk", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await adapter.setKey("openai", SECRET);

		const db = await openVaultDb();
		const records = await new Promise<{ iv: Uint8Array; ciphertext: Uint8Array }[]>(
			(resolve, reject) => {
				const request = db.transaction("secrets", "readonly").objectStore("secrets").getAll();
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			},
		);
		db.close();

		expect(records).toHaveLength(2);
		const [first, second] = records;
		expect(Array.from(first.iv)).not.toEqual(Array.from(second.iv));
		expect(Array.from(first.ciphertext)).not.toEqual(Array.from(second.ciphertext));
	});

	it("removes a deleted key", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await adapter.deleteKey("anthropic");

		expect(await adapter.hasKey("anthropic")).toBe(false);
		expect(await adapter.getKey("anthropic")).toBeNull();
		expect(await dumpVault()).not.toContain(SECRET);
	});

	it("leaves other providers usable after one is deleted", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await adapter.setKey("openai", "sk-openai-survivor");

		await adapter.deleteKey("anthropic");

		// Deleting one provider must not drop the shared wrapping key and orphan the rest.
		expect(await adapter.getKey("openai")).toBe("sk-openai-survivor");
	});
});

describe("migration from the pre-#133 clear-text slot", () => {
	it("moves an existing clear-text key into the vault and erases the slot", async () => {
		localStorage.setItem(LEGACY_SLOT, SECRET);
		const adapter = new BrowserKeychainAdapter();

		expect(await adapter.getKey("anthropic")).toBe(SECRET);

		expect(localStorage.getItem(LEGACY_SLOT)).toBeNull();
		expect(await dumpVault()).not.toContain(SECRET);
		// The key is still usable after the clear-text copy is gone.
		expect(await adapter.getKey("anthropic")).toBe(SECRET);
	});

	it("migrates on a status check as well as on a read", async () => {
		localStorage.setItem(LEGACY_SLOT, SECRET);
		const adapter = new BrowserKeychainAdapter();

		expect(await adapter.hasKey("anthropic")).toBe(true);
		expect(localStorage.getItem(LEGACY_SLOT)).toBeNull();
	});

	it("erases the clear-text slot when a new key is saved over it", async () => {
		localStorage.setItem(LEGACY_SLOT, "sk-ant-old-clear-text");
		const adapter = new BrowserKeychainAdapter();

		await adapter.setKey("anthropic", SECRET);

		expect(localStorage.getItem(LEGACY_SLOT)).toBeNull();
		expect(await adapter.getKey("anthropic")).toBe(SECRET);
	});

	it("erases the clear-text slot on delete", async () => {
		localStorage.setItem(LEGACY_SLOT, SECRET);
		const adapter = new BrowserKeychainAdapter();

		await adapter.deleteKey("anthropic");

		expect(localStorage.getItem(LEGACY_SLOT)).toBeNull();
		expect(await adapter.hasKey("anthropic")).toBe(false);
	});

	it("keeps the clear-text key when the encrypted write fails", async () => {
		localStorage.setItem(LEGACY_SLOT, SECRET);
		// The vault cannot be opened, so the migration cannot complete.
		vi.spyOn(globalThis.indexedDB, "open").mockImplementation(() => {
			throw new DOMException("blocked", "SecurityError");
		});
		const adapter = new BrowserKeychainAdapter();

		await expect(adapter.getKey("anthropic")).rejects.toBeInstanceOf(KeyVaultError);

		// Erasing before the encrypted copy exists would destroy the user's only key.
		expect(localStorage.getItem(LEGACY_SLOT)).toBe(SECRET);
	});
});

describe("failing closed when encrypted storage is unavailable", () => {
	it("refuses to store a key when IndexedDB is blocked", async () => {
		vi.spyOn(globalThis.indexedDB, "open").mockImplementation(() => {
			throw new DOMException("blocked", "SecurityError");
		});
		const adapter = new BrowserKeychainAdapter();

		await expect(adapter.setKey("anthropic", SECRET)).rejects.toBeInstanceOf(KeyVaultError);

		// The whole point of failing closed: no clear-text consolation copy is written.
		const values = Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? "");
		expect(values.some((value) => value.includes(SECRET))).toBe(false);
	});

	it("refuses to store a key when Web Crypto is unavailable", async () => {
		vi.spyOn(globalThis.crypto, "subtle", "get").mockReturnValue(
			undefined as unknown as SubtleCrypto,
		);
		const adapter = new BrowserKeychainAdapter();

		await expect(adapter.setKey("anthropic", SECRET)).rejects.toBeInstanceOf(KeyVaultError);

		const values = Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? "");
		expect(values.some((value) => value.includes(SECRET))).toBe(false);
	});

	it("surfaces a user-safe message that carries no internal detail", async () => {
		vi.spyOn(globalThis.indexedDB, "open").mockImplementation(() => {
			throw new DOMException("IDBFactory internal failure at /var/db/foo", "SecurityError");
		});
		const adapter = new BrowserKeychainAdapter();

		const error = await adapter.setKey("anthropic", SECRET).catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(KeyVaultError);
		expect((error as KeyVaultError).reason).toBe("unavailable");
		expect((error as KeyVaultError).message).not.toContain("/var/db/foo");
		expect((error as KeyVaultError).message).not.toContain("IDBFactory");
	});

	it("redacts a failure raised after the database is open", async () => {
		// `open()` succeeding is not the only way in. A vault database that already exists at
		// the expected version but has no stores opens cleanly and then raises a real
		// `NotFoundError` from `transaction()`, which would otherwise reach the settings panel
		// verbatim. No mock: this is the genuine exception the platform throws.
		await new Promise<void>((resolve, reject) => {
			const request = globalThis.indexedDB.open(KEY_VAULT_DB_NAME, KEY_VAULT_DB_VERSION);
			request.onsuccess = () => {
				request.result.close();
				resolve();
			};
			request.onerror = () => reject(request.error);
		});
		const adapter = new BrowserKeychainAdapter();

		const error = await adapter.setKey("anthropic", SECRET).catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(KeyVaultError);
		expect((error as KeyVaultError).reason).toBe("unavailable");
		expect((error as KeyVaultError).message).not.toContain("objectStore");
	});
});

/** Truncate a stored record's ciphertext so AES-GCM authentication fails on read. */
async function corruptStoredRecord(id: string): Promise<void> {
	const db = await openVaultDb();
	try {
		await new Promise<void>((resolve, reject) => {
			const store = db.transaction("secrets", "readwrite").objectStore("secrets");
			const read = store.get(id);
			read.onsuccess = () => {
				const record = read.result as { iv: Uint8Array; ciphertext: Uint8Array };
				const write = store.put({ iv: record.iv, ciphertext: record.ciphertext.slice(0, 4) }, id);
				write.onsuccess = () => resolve();
				write.onerror = () => reject(write.error);
			};
			read.onerror = () => reject(read.error);
		});
	} finally {
		db.close();
	}
}

describe("recovering from an unreadable record", () => {
	it("reports a corrupted record as no key rather than throwing at the caller", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);

		await corruptStoredRecord("anthropic");

		// The user sees the ordinary "no key configured" path and can simply re-enter it.
		expect(await adapter.getKey("anthropic")).toBeNull();
		// ...and the two predicates agree, so the settings panel cannot show the provider as
		// configured while every request fails for want of a key.
		expect(await adapter.hasKey("anthropic")).toBe(false);

		await adapter.setKey("anthropic", "sk-ant-reentered");
		expect(await adapter.getKey("anthropic")).toBe("sk-ant-reentered");
	});

	it("does not reinstate a replaced clear-text key when the record is dropped", async () => {
		// A browser that refuses to erase the slot, and a user who replaced a compromised key
		// rather than deleting it: the clear-text copy still holds the value they retired.
		localStorage.setItem(LEGACY_SLOT, "sk-ant-replaced-and-compromised");
		vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => undefined);
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);

		await corruptStoredRecord("anthropic");

		// Dropping the damaged record removes the only thing outranking that slot, so the drop
		// has to settle the slot too. Otherwise a truncated ciphertext is enough to silently
		// restore the retired credential, and the panel reports the provider as configured
		// while every request is signed with a key the user thought they had replaced.
		expect(await adapter.getKey("anthropic")).toBeNull();
		expect(await adapter.getKey("anthropic")).toBeNull();
		expect(await adapter.hasKey("anthropic")).toBe(false);
	});

	it("surfaces a damaged wrapping key instead of reporting no key configured", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);

		// A wrapping key that is not a usable key makes every record undecryptable. Reporting
		// that as "no key configured" would send the user into re-entry, which fails the same
		// way, so the fault has to reach them instead.
		await writeWrapKeyStore([["not-a-crypto-key", "aes-gcm-256-v1"]]);

		const error = await adapter.getKey("anthropic").catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(KeyVaultError);
		expect((error as KeyVaultError).reason).toBe("vault-corrupt");
	});

	it("does not discard a record when the crypto layer itself fails", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);

		// Not an authentication failure — a fault in the platform. Read as "this record is
		// corrupt" it would delete a perfectly good key, and since the user's re-entry would
		// meet the same fault, they would loop through save-and-vanish indefinitely.
		const decrypt = vi
			.spyOn(crypto.subtle, "decrypt")
			.mockRejectedValue(new Error("crypto unavailable"));

		const error = await adapter.getKey("anthropic").catch((caught: unknown) => caught);
		expect((error as KeyVaultError).reason).toBe("vault-corrupt");

		decrypt.mockRestore();
		// The record was never touched, so the key is readable again once the fault clears.
		expect(await adapter.getKey("anthropic")).toBe(SECRET);
	});

	it("never creates key material on the read path", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await writeWrapKeyStore([]);

		const error = await adapter.getKey("anthropic").catch((caught: unknown) => caught);

		expect((error as KeyVaultError).reason).toBe("vault-corrupt");
		// Minting a wrapping key here would convert a diagnosable "the key is gone" state into
		// records that are silently undecryptable under a brand-new key.
		expect(await countWrapKeys()).toBe(0);
	});

	it("keeps the clear-text slot when the wrapping key is unusable", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await writeWrapKeyStore([["not-a-crypto-key", "aes-gcm-256-v1"]]);
		localStorage.setItem(LEGACY_SLOT, "sk-ant-only-readable-copy");

		const error = await adapter.getKey("anthropic").catch((caught: unknown) => caught);

		expect((error as KeyVaultError).reason).toBe("vault-corrupt");
		// The stored record cannot be decrypted, so the clear-text slot is the only usable
		// credential left. Deciding the migration has nothing to do — a record is already
		// stored — and erasing the slot on that basis destroys it, while the message shown
		// tells the user to clear their browser data.
		expect(localStorage.getItem(LEGACY_SLOT)).toBe("sk-ant-only-readable-copy");
	});

	it("does not create key material for one provider while another's record is stranded", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await writeWrapKeyStore([]);
		localStorage.setItem("tf-api-key-openai", "sk-openai-old-cleartext");

		const error = await adapter.getKey("openai").catch((caught: unknown) => caught);

		// The wrapping key is shared, so minting one to migrate openai would strand the
		// anthropic record under a key that no longer exists — and the next anthropic read
		// would then read as an ordinary corrupt record and drop it. Nothing about openai
		// makes that acceptable, so the vault has to fail for every provider at once.
		expect((error as KeyVaultError).reason).toBe("vault-corrupt");
		expect(await countWrapKeys()).toBe(0);
		expect(await countSecrets()).toBe(1);
		// The clear-text slot must survive too: erasing it on the strength of an import that
		// never happened would destroy the only copy of that key.
		expect(localStorage.getItem("tf-api-key-openai")).toBe("sk-openai-old-cleartext");
	});

	it("does not create key material while a clear-text slot is waiting to migrate", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await writeWrapKeyStore([]);
		localStorage.setItem(LEGACY_SLOT, "sk-ant-old-cleartext");

		const error = await adapter.getKey("anthropic").catch((caught: unknown) => caught);

		// The migration declines — a secret is already stored — but deciding that must not
		// involve encrypting, because encrypting mints a wrapping key. Minting one here would
		// re-key the vault behind the user's back, and the stored record, still encrypted under
		// the lost key, would go from diagnosably unreadable to silently undecryptable.
		expect((error as KeyVaultError).reason).toBe("vault-corrupt");
		expect(await countWrapKeys()).toBe(0);
		// The record must survive, so restoring the profile's storage restores the key.
		expect(await countSecrets()).toBe(1);
	});

	it("drops a stored value too malformed to read back as a record", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		const db = await openVaultDb();
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction("secrets", "readwrite");
			tx.objectStore("secrets").put({ iv: "not-bytes", ciphertext: "nope" }, "anthropic");
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		db.close();

		// Nothing here can be compared byte for byte, but the record still has to go. Left in
		// place it is counted forever: the panel shows the provider as configured while every
		// request fails for want of a key, and no path removes it.
		expect(await adapter.getKey("anthropic")).toBeNull();
		expect(await adapter.hasKey("anthropic")).toBe(false);
		expect(await countSecrets()).toBe(0);
	});

	it("erases a clear-text slot the user already revoked even while the vault is damaged", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await adapter.setKey("openai", "sk-openai-stored");
		await adapter.deleteKey("anthropic");
		await writeWrapKeyStore([]);
		localStorage.setItem(LEGACY_SLOT, "sk-ant-revoked-cleartext");

		// The marker says the user revoked this credential, and reading a marker needs no
		// wrapping key — so this answers even though the vault cannot decrypt anything, and the
		// stale clear-text copy does not outlive the damage. Refusing here instead would leave
		// a revoked key sitting in `localStorage` until the profile was repaired.
		expect(await adapter.getKey("anthropic")).toBeNull();
		expect(localStorage.getItem(LEGACY_SLOT)).toBeNull();
		// The other provider's record is untouched: nothing was minted to strand it.
		expect(await countSecrets()).toBe(1);
		expect(await countWrapKeys()).toBe(0);
	});

	it("lets the user store a new key after the wrapping key is lost", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await adapter.setKey("openai", "sk-openai-stored");
		await writeWrapKeyStore([]);

		// Migration refuses to mint over surviving records, but this is the user handing over a
		// fresh credential. Refusing here too would leave the vault permanently unusable with no
		// in-app way out, so storing has to be able to start the vault over.
		await expect(adapter.setKey("anthropic", "sk-ant-reentered")).resolves.toBeUndefined();
		expect(await adapter.getKey("anthropic")).toBe("sk-ant-reentered");
		// The record that predates the new key cannot be read under it. Recovery does not
		// resurrect it — starting the vault over discards it in the same transaction that
		// installs the new key, so the panel stops claiming a key the user cannot use.
		expect(await adapter.getKey("openai")).toBeNull();
		expect(await adapter.hasKey("openai")).toBe(false);
	});

	it("still declines a slot settled before markers carried a reason", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await adapter.deleteKey("anthropic");
		// The shape earlier builds on this branch wrote. Reading it as "no marker" hands back
		// the credential the read is supposed to have settled.
		await writeMetaValue("legacy-retired:anthropic", true);
		localStorage.setItem(LEGACY_SLOT, "sk-ant-settled");

		expect(await adapter.getKey("anthropic")).toBeNull();
		// A healthy vault discards a settled slot whatever the reason, so the residue goes too.
		expect(localStorage.getItem(LEGACY_SLOT)).toBeNull();
	});

	it("does not erase a clear-text copy on the strength of a marker that predates reasons", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await adapter.setKey("openai", "sk-openai-stored");
		await writeMetaValue("legacy-retired:anthropic", true);
		await writeWrapKeyStore([]);
		localStorage.setItem(LEGACY_SLOT, "sk-ant-still-good");

		const error = await adapter.getKey("anthropic").catch((caught: unknown) => caught);

		// Both the delete path and the dropped-record path wrote `true`, so it establishes only
		// that re-import was declined. Reading it as a revocation would license erasing this
		// copy on a vault that can offer no replacement — more authority than that shape ever
		// carried, and on a profile whose marker came from a drop it destroys a good key.
		expect((error as KeyVaultError).reason).toBe("vault-corrupt");
		expect(localStorage.getItem(LEGACY_SLOT)).toBe("sk-ant-still-good");
	});

	it("does not overwrite a marker it cannot recognise when a record is dropped", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await corruptStoredRecord("anthropic");
		const foreign = { reason: "revoked-by-policy", v: 3 };
		await writeMetaValue("legacy-retired:anthropic", foreign);

		expect(await adapter.getKey("anthropic")).toBeNull();

		// The same rule as the save path: this build writes only `settled`, so overwriting a
		// marker it cannot interpret can only hold it level or lower it. The drop path needs
		// its own witness because it is a separate guard.
		expect(await readMetaValue("legacy-retired:anthropic")).toEqual(foreign);
	});

	it("does not create key material on a read after a record was dropped", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await corruptStoredRecord("anthropic");
		expect(await adapter.getKey("anthropic")).toBeNull();
		await writeWrapKeyStore([]);
		localStorage.setItem(LEGACY_SLOT, "sk-ant-cleartext");

		// The vault is empty now, so nothing is stranded and the marker answers on its own. What
		// must not happen is reaching the encrypt step to get there: that mints a wrapping key,
		// and a read must never create key material whatever the vault happens to hold.
		expect(await adapter.getKey("anthropic")).toBeNull();
		expect(await countWrapKeys()).toBe(0);
	});

	it("does not overwrite a marker it cannot recognise", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await adapter.deleteKey("anthropic");
		const foreign = { reason: "revoked-by-policy", v: 3 };
		await writeMetaValue("legacy-retired:anthropic", foreign);
		localStorage.setItem(LEGACY_SLOT, "sk-ant-settled");

		await adapter.setKey("anthropic", "sk-ant-new");

		// Reading an unrecognised marker fails closed, so writing over one has to be refused
		// for the same reason: this build cannot tell whether it is weaker than what it would
		// replace. Downgrading a stronger marker from a later build to `settled` would strip
		// the authority to erase a revoked clear-text slot on a vault that cannot decrypt.
		expect(await readMetaValue("legacy-retired:anthropic")).toEqual(foreign);
	});

	it("treats a marker it cannot recognise as a marker", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await adapter.deleteKey("anthropic");
		await writeMetaValue("legacy-retired:anthropic", { reason: "from-a-later-build" });
		localStorage.setItem(LEGACY_SLOT, "sk-ant-revoked");

		// A marker written by a build this one does not understand still says the vault settled
		// this credential. Reading it as absence re-imports something already dealt with, so an
		// unrecognised marker declines rather than failing open.
		expect(await adapter.getKey("anthropic")).toBeNull();
	});

	it("recovers a clear-text copy left behind when the vault is started over", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await adapter.setKey("openai", "sk-openai-stored");
		await writeWrapKeyStore([]);
		localStorage.setItem("tf-api-key-openai", "sk-openai-cleartext");

		await adapter.setKey("anthropic", "sk-ant-reentered");

		// Re-entry mints a key that cannot read the `openai` record. Leaving that record in
		// place would let the next read find it broken, drop it, and settle `openai` — erasing
		// the clear-text copy that is still perfectly good. Discarding it with the old key
		// instead leaves the slot importable, so the credential comes back.
		expect(await adapter.getKey("openai")).toBe("sk-openai-cleartext");
		expect(await adapter.getKey("anthropic")).toBe("sk-ant-reentered");
	});

	it("keeps a clear-text copy the user never revoked when the vault is damaged", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await adapter.setKey("openai", "sk-openai-stored");
		await corruptStoredRecord("anthropic");
		// The vault discards the unreadable record. The user asked for none of this.
		expect(await adapter.getKey("anthropic")).toBeNull();
		await writeWrapKeyStore([]);
		localStorage.setItem(LEGACY_SLOT, "sk-ant-still-good");

		const error = await adapter.getKey("anthropic").catch((caught: unknown) => caught);

		// A dropped record settles the provider, but it is not a revocation, so it must not
		// license erasing the clear-text copy while the vault cannot offer a replacement.
		expect((error as KeyVaultError).reason).toBe("vault-corrupt");
		expect(localStorage.getItem(LEGACY_SLOT)).toBe("sk-ant-still-good");
	});

	it("refuses to mint over surviving records when the key disappears mid-migration", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		localStorage.setItem("tf-api-key-openai", "sk-openai-cleartext");

		// The migration reads the wrapping key to decide it may proceed, then reads it again to
		// encrypt under. Wiping the store between those two reads is the window a caller-side
		// check cannot close, and the only way to reach the install path's own refusal.
		wipeWrapKeyAfterRead();

		const error = await adapter.getKey("openai").catch((caught: unknown) => caught);

		expect((error as KeyVaultError).reason).toBe("vault-corrupt");
		// A key installed here could not read the `anthropic` record, so installing one would
		// destroy it silently. Refusing keeps both the record and the clear-text slot.
		expect(await countWrapKeys()).toBe(0);
		expect(await countSecrets()).toBe(1);
		expect(localStorage.getItem("tf-api-key-openai")).toBe("sk-openai-cleartext");
	});
});

describe("storage that never responds", () => {
	it("gives up on a wedged open rather than hanging the caller forever", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		// A stalled storage layer can accept `open()` and then fire no event at all — the
		// case reported against WebKit, and the shape any wedged implementation produces. An
		// unbounded wait leaves the settings panel spinning forever, and because adapter calls
		// are serialized per provider, wedges every later call too.
		const open = vi.spyOn(globalThis.indexedDB, "open").mockReturnValue({
			onsuccess: null,
			onerror: null,
			onblocked: null,
			onupgradeneeded: null,
		} as unknown as IDBOpenDBRequest);
		const adapter = new BrowserKeychainAdapter();

		const pending = adapter.getKey("anthropic").catch((caught: unknown) => caught);
		await vi.advanceTimersByTimeAsync(10_000);
		// Raced rather than awaited directly: nothing but the vault's own bound can settle
		// this call, so an unbounded implementation would hang the suite instead of failing it.
		const error = await Promise.race([pending, yieldHostTask().then(() => "still pending")]);

		expect(error).toBeInstanceOf(KeyVaultError);
		expect((error as KeyVaultError).reason).toBe("unavailable");

		open.mockRestore();
		vi.useRealTimers();
		// The provider is not left wedged: a later call runs against recovered storage.
		await adapter.setKey("anthropic", SECRET);
		expect(await adapter.getKey("anthropic")).toBe(SECRET);
	});
});

describe("a clear-text slot that will not erase", () => {
	/** Make `localStorage.removeItem` a no-op, as a browser refusing the removal would. */
	function refuseLegacyRemoval(): MockInstance<Storage["removeItem"]> {
		return vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => undefined);
	}

	it("does not reinstate a replaced key when the vault is started over", async () => {
		refuseLegacyRemoval();
		localStorage.setItem(LEGACY_SLOT, "sk-ant-old");
		const adapter = new BrowserKeychainAdapter();
		// The old clear-text key migrates in; the browser will not erase the slot.
		expect(await adapter.getKey("anthropic")).toBe("sk-ant-old");
		await adapter.setKey("anthropic", "sk-ant-rotated");
		await writeWrapKeyStore([]);

		// A save for an unrelated provider restarts the vault, taking the record that outranked
		// the slot with it. Nothing about that says the user wants their old key back, and
		// reinstating it would hand a credential they deliberately rotated away from to every
		// outbound request — triggered by a save for a different provider entirely.
		await adapter.setKey("openai", "sk-openai-new");

		expect(await adapter.getKey("anthropic")).toBeNull();
		expect(await adapter.getKey("openai")).toBe("sk-openai-new");
	});

	it("keeps a superseded clear-text copy while the vault cannot offer a replacement", async () => {
		const refusal = refuseLegacyRemoval();
		localStorage.setItem(LEGACY_SLOT, "sk-ant-old");
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", "sk-ant-rotated");
		await adapter.setKey("openai", "sk-openai-stored");
		await writeWrapKeyStore([]);
		// The browser starts allowing removals again, so from here an erase would really land.
		refusal.mockRestore();

		const error = await adapter.getKey("anthropic").catch((caught: unknown) => caught);

		// Replacing a key is not throwing one away. With the vault unable to decrypt the
		// replacement, the superseded copy is the only readable credential left, so it is kept
		// and the damage is reported instead of quietly erasing it.
		expect((error as KeyVaultError).reason).toBe("vault-corrupt");
		expect(localStorage.getItem(LEGACY_SLOT)).toBe("sk-ant-old");
	});

	/**
	 * Make any transaction touching the vault's marker store fail, leaving the rest working.
	 *
	 * Applied to the prototype and dispatched on `this`, so production keeps using its own
	 * connection: routing its transactions through a second connection opened here would hide
	 * a real connection-lifecycle bug.
	 */
	function failMetaStore(): MockInstance<IDBDatabase["transaction"]> {
		const realTransaction = IDBDatabase.prototype.transaction;
		return vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (
			this: IDBDatabase,
			...args
		) {
			const stores = typeof args[0] === "string" ? [args[0]] : Array.from(args[0]);
			if (stores.includes("meta")) throw new DOMException("no meta store", "NotFoundError");
			return realTransaction.apply(this, args);
		});
	}

	it("does not settle a slot the profile never had", async () => {
		const adapter = new BrowserKeychainAdapter();

		await adapter.setKey("anthropic", SECRET);

		// Markers are durable and uncleared, so writing one per save on a profile created after
		// #133 — where no clear-text slot has ever existed — is litter, and it would decline an
		// import that could only ever be legitimate.
		expect(await countStore("meta")).toBe(0);
	});

	it("does not let the stale slot overwrite a newly saved key", async () => {
		localStorage.setItem(LEGACY_SLOT, "sk-ant-old-cleartext");
		refuseLegacyRemoval();
		const adapter = new BrowserKeychainAdapter();

		await adapter.setKey("anthropic", SECRET);

		// Migration must not run again once the vault holds a key, or every later read would
		// silently revert the user to the clear-text value they just replaced.
		expect(await adapter.getKey("anthropic")).toBe(SECRET);
		expect(await adapter.getKey("anthropic")).toBe(SECRET);
	});

	it("refuses to report a key as removed while a clear-text copy survives", async () => {
		localStorage.setItem(LEGACY_SLOT, "sk-ant-old-cleartext");
		refuseLegacyRemoval();
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);

		// Telling a user who is removing a possibly-compromised key that it is gone, while it
		// is still readable in clear text, is the most dangerous lie this adapter could tell.
		const error = await adapter.deleteKey("anthropic").catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(KeyVaultError);
		expect((error as KeyVaultError).reason).toBe(LEGACY_RETAINED);
		// The encrypted copy is still removed; only the claim of completeness is withheld.
		expect(localStorage.getItem(LEGACY_SLOT)).toBe("sk-ant-old-cleartext");
	});
	it("does not let a dismissed clear-text slot come back after a delete", async () => {
		localStorage.setItem(LEGACY_SLOT, "sk-ant-compromised");
		refuseLegacyRemoval();
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);

		await expect(adapter.deleteKey("anthropic")).rejects.toBeInstanceOf(KeyVaultError);

		// The user removed a key they believe is compromised. The clear-text copy survived and
		// they were told so — but the vault must not re-import it, or the app silently resumes
		// signing provider requests with the credential they just revoked.
		expect(await adapter.hasKey("anthropic")).toBe(false);
		expect(await adapter.getKey("anthropic")).toBeNull();
	});

	it("does not report a key as removed when it cannot read the slot back", async () => {
		localStorage.setItem(LEGACY_SLOT, "sk-ant-old-cleartext");
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		localStorage.setItem(LEGACY_SLOT, "sk-ant-old-cleartext");
		// A browser that blocks site data throws on both removal and read-back. An absent
		// value and an unreadable one are not the same fact, and treating them alike reports
		// a clear-text credential as erased when it was never touched.
		vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
			throw new DOMException("blocked", "SecurityError");
		});
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new DOMException("blocked", "SecurityError");
		});

		const error = await adapter.deleteKey("anthropic").catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(KeyVaultError);
		expect((error as KeyVaultError).reason).toBe(LEGACY_RETAINED);
		// Asserted here as well as on the retained branch, so collapsing the two messages onto
		// either wording is caught. Only the message distinguishes "a copy is definitely still
		// there" from "a copy could not be checked", and they call for different advice.
		expect((error as KeyVaultError).message).toContain("blocked the check");
	});

	it("keeps the stored key when the tombstone cannot be written", async () => {
		localStorage.setItem(LEGACY_SLOT, "sk-ant-compromised");
		refuseLegacyRemoval();
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);

		// The marker is what stops the clear-text slot being re-imported. Were it a separate
		// operation from the delete, a failure here would leave no stored secret to outrank the
		// slot and no marker to stop it — and the revoked key would return on the next read.
		const metaFailure = failMetaStore();

		const failure = await adapter.deleteKey("anthropic").catch((caught: unknown) => caught);
		// Pinned to the marker write this test is named for, rather than accepting the
		// `legacy-retained` rejection the refused erase would also produce.
		expect((failure as KeyVaultError).reason).toBe("unavailable");

		metaFailure.mockRestore();
		// Nothing was destroyed, so once storage recovers the user still has the key they were
		// trying to remove, and can retry — rather than the revoked clear-text value coming
		// back in its place.
		expect(await adapter.getKey("anthropic")).toBe(SECRET);
	});

	it("does not let a later save weaken a revocation already recorded", async () => {
		localStorage.setItem(LEGACY_SLOT, "sk-ant-compromised");
		const refusal = refuseLegacyRemoval();
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await expect(adapter.deleteKey("anthropic")).rejects.toBeInstanceOf(KeyVaultError);

		// The user revoked the key, was told a clear-text copy survived, and enters a new one.
		// The save settles the slot too, but the reasons are not equal: only a revocation is
		// answered on a vault that cannot decrypt anything. Writing the weaker reason over the
		// stronger one disarms the single path that erases the revoked copy.
		await adapter.setKey("anthropic", "sk-ant-replacement");
		await writeWrapKeyStore([]);
		refusal.mockRestore();

		const error = await adapter.getKey("anthropic").catch((caught: unknown) => caught);

		// The damaged vault is still reported — the replacement is unreadable and re-entering a
		// key is the only fix. What the revocation decides is the clear-text residue: it is
		// erased on sight, where a supersession in the same state is kept.
		expect((error as KeyVaultError).reason).toBe("vault-corrupt");
		expect(localStorage.getItem(LEGACY_SLOT)).toBeNull();
	});

	it("fails the save rather than storing a key whose supersession went unrecorded", async () => {
		localStorage.setItem(LEGACY_SLOT, "sk-ant-old");
		refuseLegacyRemoval();
		const adapter = new BrowserKeychainAdapter();
		const metaFailure = failMetaStore();

		// The marker is the only durable statement that the stored key outranks the slot, and
		// the record that would otherwise carry that fact does not survive the vault being
		// restarted. A save that committed the ciphertext and lost the marker would report
		// success and leave the replaced credential ready to come back as the active key —
		// under exactly the storage pressure that later destroys the record.
		await expect(adapter.setKey("anthropic", "sk-ant-rotated")).rejects.toBeInstanceOf(
			KeyVaultError,
		);

		metaFailure.mockRestore();
		// Neither half landed, so the user is where they started and can retry.
		expect(await countSecrets()).toBe(0);
		expect(localStorage.getItem(LEGACY_SLOT)).toBe("sk-ant-old");
	});

	it("does not let a dropped record weaken a revocation already recorded", async () => {
		localStorage.setItem(LEGACY_SLOT, "sk-ant-compromised");
		const refusal = refuseLegacyRemoval();
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await expect(adapter.deleteKey("anthropic")).rejects.toBeInstanceOf(KeyVaultError);

		// A save after a revocation re-creates a record while the revocation still stands, so
		// this provider can reach the drop path with a marker already recorded. Re-labelling it
		// there would lower the only reason answered on a vault that cannot decrypt anything.
		await adapter.setKey("anthropic", "sk-ant-replacement");
		await corruptStoredRecord("anthropic");
		expect(await adapter.getKey("anthropic")).toBeNull();

		await adapter.setKey("openai", "sk-openai-stored");
		await writeWrapKeyStore([]);
		refusal.mockRestore();

		const settled = await adapter.getKey("anthropic").catch((caught: unknown) => caught);

		// The revocation is answered before the wrap-key guard, so the read settles the slot and
		// returns instead of reporting damage. Lowered to a drop, it would stop at that guard —
		// leaving the revoked credential readable in clear text with no path left to erase it.
		expect(settled).toBeNull();
		expect(localStorage.getItem(LEGACY_SLOT)).toBeNull();
	});

	it("erases a settled slot once the browser starts allowing it", async () => {
		localStorage.setItem(LEGACY_SLOT, "sk-ant-compromised");
		const refusal = refuseLegacyRemoval();
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await expect(adapter.deleteKey("anthropic")).rejects.toBeInstanceOf(KeyVaultError);

		// The refusal lifts — the user changed a site-data setting, or removed an extension.
		// A user who revoked a key and then left this provider alone runs no other path, so
		// without this the revoked credential stays readable in clear text indefinitely.
		refusal.mockRestore();

		expect(await adapter.hasKey("anthropic")).toBe(false);
		expect(localStorage.getItem(LEGACY_SLOT)).toBeNull();
	});

	it("distinguishes a slot known to survive from one it could not check", async () => {
		localStorage.setItem(LEGACY_SLOT, "sk-ant-old-cleartext");
		refuseLegacyRemoval();
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);

		const retained = await adapter.deleteKey("anthropic").catch((caught: unknown) => caught);

		// Both cases share a reason code, so only the message tells the user which situation
		// they are in — and only one of them justifies asserting a copy exists.
		expect((retained as KeyVaultError).message).toContain("would not delete");
		expect((retained as KeyVaultError).message).not.toContain("blocked the check");
	});
});

describe("a wrapping key of the wrong shape", () => {
	it("is rejected as a vault fault rather than destroying the stored record", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);

		// A real CryptoKey that cannot decrypt. Accepted, it would fail at `decrypt`, read as
		// "this record is corrupt", and get a perfectly good ciphertext deleted.
		//
		// Two defenses cover this — the wrapping key is rejected on shape, and a non-
		// authentication decrypt failure is not classified as record corruption — so removing
		// either one alone leaves this passing. It is kept as the end-to-end property because
		// the property, not the mechanism, is what must hold.
		const encryptOnly = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
			"encrypt",
		]);
		await writeWrapKeyStore([[encryptOnly, "aes-gcm-256-v1"]]);

		const error = await adapter.getKey("anthropic").catch((caught: unknown) => caught);

		expect((error as KeyVaultError).reason).toBe("vault-corrupt");
		// The record survives, so restoring the correct wrapping key would recover it.
		expect(await adapter.hasKey("anthropic")).toBe(true);
	});

	it("refuses to save under it rather than reporting a save that cannot be read back", async () => {
		const encryptOnly = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
			"encrypt",
		]);
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await writeWrapKeyStore([[encryptOnly, "aes-gcm-256-v1"]]);

		// Otherwise the panel reports success and the key vanishes on the next read, forever.
		await expect(adapter.setKey("anthropic", "sk-ant-second")).rejects.toBeInstanceOf(
			KeyVaultError,
		);
	});
});

describe("upgrading a database written by an earlier schema", () => {
	it("keeps an existing key readable when the marker store is added", async () => {
		// A version-1 vault: wrapping key and ciphertext, no `meta` store. The records are built
		// through the adapter so they really are what this code writes, then replayed into a
		// fresh version-1 database — IndexedDB cannot reopen an existing database at a lower
		// version, so there is no way to strip the store from the one just written.
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		const seeded = await openVaultDb();
		const wrapKeys = await new Promise<unknown[]>((resolve, reject) => {
			const request = seeded.transaction("wrap-key", "readonly").objectStore("wrap-key").getAll();
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const secrets = await new Promise<unknown[]>((resolve, reject) => {
			const request = seeded.transaction("secrets", "readonly").objectStore("secrets").getAll();
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		seeded.close();
		resetKeyVault();
		await new Promise<void>((resolve, reject) => {
			const request = globalThis.indexedDB.open(KEY_VAULT_DB_NAME, 1);
			request.onupgradeneeded = () => {
				const db = request.result;
				db.createObjectStore("wrap-key");
				db.createObjectStore("secrets");
			};
			request.onsuccess = () => {
				const db = request.result;
				const tx = db.transaction(["wrap-key", "secrets"], "readwrite");
				tx.objectStore("wrap-key").put(wrapKeys[0], "aes-gcm-256-v1");
				tx.objectStore("secrets").put(secrets[0], "anthropic");
				tx.oncomplete = () => {
					db.close();
					resolve();
				};
				tx.onerror = () => reject(tx.error);
			};
			request.onerror = () => reject(request.error);
		});

		// The upgrade must add a store, not reset the database: a user whose key silently
		// vanished on upgrade would have no way to tell that from the app losing it.
		expect(await new BrowserKeychainAdapter().getKey("anthropic")).toBe(SECRET);

		const upgraded = await openVaultDb();
		expect(Array.from(upgraded.objectStoreNames).sort()).toEqual(["meta", "secrets", "wrap-key"]);
		expect(upgraded.version).toBe(KEY_VAULT_DB_VERSION);
		upgraded.close();
	});
});

describe("two tabs acting on the same provider", () => {
	/**
	 * A second tab, as a second module instance.
	 *
	 * The per-provider lock is a module-scoped `Map`, so it orders one tab's calls and nothing
	 * else. Re-importing gives a genuinely independent lock and vault connection over the same
	 * `fake-indexeddb` and `localStorage` backing stores, which is what two tabs are.
	 */
	async function openSecondTab(): Promise<BrowserKeychainAdapter> {
		vi.resetModules();
		const module = await import("./browser-keychain-adapter");
		return new module.BrowserKeychainAdapter();
	}

	/**
	 * Hold the `nth` vault connection opened from now on, and report when it is reached.
	 *
	 * Every vault operation opens its own connection, so suspending one parks a tab between
	 * two of its operations — the gap a check-then-act spans, and the gap a backgrounded tab
	 * sits in when the scheduler deprioritizes it. Real IndexedDB and real Web Crypto still do
	 * the work; only the delivery of one connection is deferred. Starting two tabs together
	 * instead samples whichever interleaving the event loop happens to pick, and passes
	 * against code that has the race.
	 *
	 * `nth` counts connections rather than naming an operation, so it moves if the operations
	 * under test change how many they open. `reached` therefore rejects instead of leaving the
	 * test to time out silently on a park that is never hit — a park landing somewhere
	 * harmless would let these tests pass vacuously.
	 */
	interface Park {
		/** Resolves once the park is hit, and rejects if it never is. */
		reached: Promise<void>;
		/** Let the parked operation continue. */
		release: () => void;
	}

	/**
	 * The scaffolding both parks share: a gate to hold on, and a `reached` that fails loudly.
	 *
	 * A park that lands somewhere harmless, or never lands at all, would let a race test pass
	 * without sampling the race. `arrive()` is what a spy calls when it recognises its target;
	 * if nothing calls it within the deadline, `reached` rejects with `missDescription()`
	 * rather than leaving the test to time out with no explanation.
	 */
	function createPark(missDescription: () => string): Park & { arrive: () => Promise<void> } {
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		let signalReached = () => {};
		let signalMissed = (_reason: Error) => {};
		const reached = new Promise<void>((resolve, reject) => {
			signalReached = resolve;
			signalMissed = reject;
		});
		const missed = setTimeout(() => signalMissed(new Error(missDescription())), 3_000);
		// Every park must be awaited through `reached` — that await is what turns a missed park
		// into a failure. This only keeps a test that aborts before reaching its await from
		// emitting a late rejection that would be attributed to whichever test ran next.
		void reached.catch(() => undefined);
		return {
			reached,
			release,
			arrive: () => {
				clearTimeout(missed);
				signalReached();
				return gate;
			},
		};
	}

	function parkVaultOpen(nth: number): Park {
		let seen = 0;
		const { reached, release, arrive } = createPark(
			() => `park never reached: wanted vault open #${nth}, saw ${seen}`,
		);
		const realOpen = globalThis.indexedDB.open.bind(globalThis.indexedDB);
		vi.spyOn(globalThis.indexedDB, "open").mockImplementation((name, version) => {
			seen += 1;
			if (seen !== nth) return realOpen(name, version);
			const parked = {
				onupgradeneeded: null,
				onsuccess: null,
				onerror: null,
				onblocked: null,
				result: undefined,
			} as unknown as IDBOpenDBRequest;
			void arrive().then(() => {
				const real = realOpen(name, version);
				const forward = (handler: keyof IDBOpenDBRequest) => (event: Event) => {
					Object.defineProperty(parked, "result", { value: real.result, configurable: true });
					(parked[handler] as ((this: IDBRequest, event: Event) => void) | null)?.call(
						parked,
						event,
					);
				};
				real.onupgradeneeded = forward("onupgradeneeded");
				real.onsuccess = forward("onsuccess");
				real.onerror = forward("onerror");
				real.onblocked = forward("onblocked");
			});
			return parked;
		});
		// Every park must be awaited through `reached` — that await is what turns a missed park
		// into a failure. This only keeps a test that aborts before reaching its await from
		// emitting a late rejection that would be attributed to whichever test ran next.
		void reached.catch(() => undefined);
		return { reached, release };
	}

	/**
	 * Hold the migration between its pre-check and the transaction that decides.
	 *
	 * `importLegacySecret` reads the marker and the record count once before encrypting, then
	 * re-reads both inside the write transaction. Parking a connection cannot sample the gap
	 * between those two reads, because it stalls the tab before the pre-check rather than
	 * after it. Encryption is the last await before the write transaction opens, so gating it
	 * is what puts another tab inside the window the in-transaction guards exist to close.
	 *
	 * The park is identified by the plaintext being encrypted rather than by call order. An
	 * ordinal would silently move to an unrelated `encrypt` the moment a test gained a setup
	 * step that stores a key, and the migration would then run unparked while the test still
	 * passed — the vacuous pass these tests exist to rule out.
	 */
	function parkEncryptOf(plaintext: string): Park {
		const seen: string[] = [];
		const { reached, release, arrive } = createPark(
			() => `park never reached: nothing encrypted ${plaintext}, saw [${seen.join(", ")}]`,
		);
		const realEncrypt = globalThis.crypto.subtle.encrypt.bind(globalThis.crypto.subtle);
		vi.spyOn(globalThis.crypto.subtle, "encrypt").mockImplementation(async (...args) => {
			const [, , data] = args;
			const encoded = new TextDecoder().decode(data as BufferSource);
			seen.push(encoded);
			if (encoded !== plaintext) return realEncrypt(...args);
			await arrive();
			return realEncrypt(...args);
		});
		return { reached, release };
	}

	it("does not import a clear-text slot revoked while the migration was encrypting", async () => {
		localStorage.setItem(LEGACY_SLOT, "sk-ant-revoked");
		const tabB = await openSecondTab();
		const tabA = new BrowserKeychainAdapter();

		// Tab B has read an unsettled slot and an empty vault, and is now encrypting what it
		// captured. Both reads were true when it made them.
		const suspended = parkEncryptOf("sk-ant-revoked");
		const migrating = tabB.getKey("anthropic");
		await suspended.reached;

		// The user revokes the provider in the foreground tab and is told it worked.
		await expect(tabA.deleteKey("anthropic")).resolves.toBeUndefined();
		expect(localStorage.getItem(LEGACY_SLOT)).toBeNull();

		suspended.release();
		// Tab B resumes holding a credential the user has since thrown away. Its pre-check is
		// stale, so only the marker re-read inside the write transaction can stop it storing
		// the value — and a resurrection here is silent, since the migration reports the key
		// it captured either way.
		await migrating;

		expect(await tabA.hasKey("anthropic")).toBe(false);
		expect(await countSecrets()).toBe(0);
	});

	it("does not import a clear-text slot replaced while the migration was encrypting", async () => {
		localStorage.setItem(LEGACY_SLOT, "sk-ant-old");
		const tabB = await openSecondTab();
		const tabA = new BrowserKeychainAdapter();

		const suspended = parkEncryptOf("sk-ant-old");
		const migrating = tabB.getKey("anthropic");
		await suspended.reached;

		// The user types a new key in the foreground tab. That save writes a marker too, so the
		// count re-read is only load-bearing for the window where a record exists without one:
		// a save whose slot was already absent takes the `leave-slot` path.
		localStorage.removeItem(LEGACY_SLOT);
		await tabA.setKey("anthropic", "sk-ant-replacement");

		suspended.release();
		await migrating;

		// Reverting to the old key would be indistinguishable from the save silently failing.
		expect(await tabA.getKey("anthropic")).toBe("sk-ant-replacement");
		expect(await countSecrets()).toBe(1);
	});

	it("does not resurrect a revoked key when a read races the delete", async () => {
		const tabA = new BrowserKeychainAdapter();
		await tabA.setKey("anthropic", SECRET);
		localStorage.setItem(LEGACY_SLOT, "sk-ant-revoked");
		const tabB = await openSecondTab();

		// Tab B starts migrating the clear-text slot and stalls part-way through. No fault is
		// injected into storage and both tabs' operations succeed on their own terms; the only
		// thing arranged is the order, which a backgrounded tab produces by itself.
		// #1 is the migration's own connection; #2 is the read that follows it.
		const suspended = parkVaultOpen(2);
		const read = tabB.getKey("anthropic");
		await suspended.reached;
		// Parked before the delete, so the race really is being sampled: the vault still holds
		// the key tab A is about to remove.
		expect(await countSecrets()).toBe(1);

		// The user revokes the key in the foreground tab, and is told it worked.
		await expect(tabA.deleteKey("anthropic")).resolves.toBeUndefined();

		suspended.release();
		// Tab B now resumes against a vault the delete has already changed. Parking the
		// connection stalls it before its pre-check rather than inside the window between that
		// check and the write, so what this samples is the coarser ordering: a tab that opens
		// its migration connection before the delete must still not hand back the revoked
		// value. The narrower gap is covered by the two encrypt-parked tests above.
		await expect(read).resolves.toBeNull();

		expect(await tabA.getKey("anthropic")).toBeNull();
		expect(await tabB.getKey("anthropic")).toBeNull();
		expect(localStorage.getItem(LEGACY_SLOT)).toBeNull();
	});

	it("does not discard a key re-entered elsewhere while an unparseable one is dropped", async () => {
		const tabA = new BrowserKeychainAdapter();
		await tabA.setKey("anthropic", SECRET);
		const seed = await openVaultDb();
		await new Promise<void>((resolve, reject) => {
			const tx = seed.transaction("secrets", "readwrite");
			tx.objectStore("secrets").put({ iv: "not-bytes", ciphertext: "nope" }, "anthropic");
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		seed.close();
		const tabB = await openSecondTab();

		// The same gap as the damaged-record case, but for a value with no bytes to compare.
		// "Unreadable" is all that identifies it, so the drop has to re-establish that and not
		// fall back to deleting by id.
		const suspended = parkVaultOpen(2);
		const read = tabA.getKey("anthropic");
		await suspended.reached;
		await tabB.setKey("anthropic", "sk-ant-reentered");
		suspended.release();

		await expect(read).resolves.toBeNull();
		expect(await tabB.getKey("anthropic")).toBe("sk-ant-reentered");
		expect(await tabA.getKey("anthropic")).toBe("sk-ant-reentered");
	});

	it("does not discard a key re-entered elsewhere while a damaged one is dropped", async () => {
		const tabA = new BrowserKeychainAdapter();
		await tabA.setKey("anthropic", SECRET);
		await corruptStoredRecord("anthropic");
		const tabB = await openSecondTab();

		// Tab A reads a damaged record and decides to drop it. Suspending the connection that
		// drop opens puts the decision and the deletion either side of a real gap — which is
		// where the user goes when a key stops working: to another tab, to re-enter it.
		// #1 is the read that finds the damage; #2 is the drop it decides on.
		const suspended = parkVaultOpen(2);
		const read = tabA.getKey("anthropic");
		await suspended.reached;
		await tabB.setKey("anthropic", "sk-ant-reentered");
		suspended.release();

		await expect(read).resolves.toBeNull();
		// The drop must apply to the record it was decided for, not to whatever is stored by
		// the time it runs. Otherwise the key the user just re-entered disappears with no error
		// anywhere, and a retirement marker is left behind that nothing can clear.
		expect(await tabB.getKey("anthropic")).toBe("sk-ant-reentered");
		expect(await tabA.getKey("anthropic")).toBe("sk-ant-reentered");
	});
});

describe("durability and ordering", () => {
	it("resolves a write only after its transaction has committed", async () => {
		const order: string[] = [];
		const realTransaction = IDBDatabase.prototype.transaction;
		vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (
			this: IDBDatabase,
			...args: Parameters<IDBDatabase["transaction"]>
		) {
			const tx = realTransaction.apply(this, args);
			// Track the secret write specifically: the wrapping key is written in a separate
			// transaction, and its commit must not be mistaken for this one's.
			if (args[0] === "secrets" && args[1] === "readwrite") {
				tx.addEventListener("complete", () => order.push("committed"));
			}
			return tx;
		});

		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		order.push("resolved");

		// A request succeeding does not mean the transaction committed; it can still abort at
		// commit time. The legacy migration erases the user's only clear-text copy on the
		// strength of this resolution, so resolving early would risk destroying the key.
		expect(order).toEqual(["committed", "resolved"]);
	});

	/**
	 * Abort the transaction of the next write to `store`, after its request has succeeded.
	 *
	 * This is the failure `awaitWrite` exists for and the one no other fault helper reaches:
	 * `failMetaStore` throws from `transaction()` before any handler is attached, and a
	 * rejected request never reaches commit. A transaction that aborts after its requests
	 * succeeded is what a commit-time quota or I/O failure looks like, and the only signal is
	 * `onabort`. Resolving there instead of rejecting turns every writer into a silent
	 * success — worst of all the migration, which erases the user's only clear-text copy on
	 * the strength of that resolution.
	 */
	function abortWriteTo(store: string): void {
		const realPut = IDBObjectStore.prototype.put;
		const realDelete = IDBObjectStore.prototype.delete;
		const abortOnSuccess = function (this: IDBObjectStore, request: IDBRequest): IDBRequest {
			if (this.name === store) {
				request.addEventListener("success", () => request.transaction?.abort());
			}
			return request;
		};
		vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
			this: IDBObjectStore,
			...args: Parameters<IDBObjectStore["put"]>
		) {
			return abortOnSuccess.call(this, realPut.apply(this, args));
		});
		vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementation(function (
			this: IDBObjectStore,
			...args: Parameters<IDBObjectStore["delete"]>
		) {
			return abortOnSuccess.call(this, realDelete.apply(this, args));
		});
	}

	it("does not report a save whose transaction aborted at commit", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		abortWriteTo("secrets");

		await expect(adapter.setKey("anthropic", "sk-ant-replacement")).rejects.toMatchObject({
			reason: "unavailable",
		});

		// Reporting success here would show the settings panel a key the vault does not hold,
		// and every request would then fail with the old one still silently in place.
		vi.restoreAllMocks();
		expect(await adapter.getKey("anthropic")).toBe(SECRET);
	});

	it("does not report a save that supersedes a clear-text slot when its transaction aborts", async () => {
		localStorage.setItem(LEGACY_SLOT, "sk-ant-only-copy");
		const adapter = new BrowserKeychainAdapter();
		abortWriteTo("secrets");

		await expect(adapter.setKey("anthropic", "sk-ant-new")).rejects.toMatchObject({
			reason: "unavailable",
		});

		// A save over a clear-text slot erases that slot once it has committed. Resolving on an
		// aborted transaction would erase it with nothing stored, so the user would lose the
		// old key and the new one at once while the panel showed the save as successful. This
		// path is separate from the plain save: it writes the marker too, so it commits through
		// its own handlers rather than the shared `awaitWrite`.
		vi.restoreAllMocks();
		expect(localStorage.getItem(LEGACY_SLOT)).toBe("sk-ant-only-copy");
		expect(await countSecrets()).toBe(0);
	});

	it("does not report a revocation whose transaction aborted at commit", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		abortWriteTo("secrets");

		await expect(adapter.deleteKey("anthropic")).rejects.toMatchObject({
			reason: "unavailable",
		});

		// A delete that reports success while the record survives is the worst direction to
		// fail in: the user believes a credential is gone and stops rotating it.
		vi.restoreAllMocks();
		expect(await adapter.getKey("anthropic")).toBe(SECRET);
		expect(await readMetaValue("legacy-retired:anthropic")).toBeUndefined();
	});

	it("does not erase the clear-text slot when the import transaction aborts", async () => {
		localStorage.setItem(LEGACY_SLOT, "sk-ant-only-copy");
		const adapter = new BrowserKeychainAdapter();
		abortWriteTo("secrets");

		await expect(adapter.getKey("anthropic")).rejects.toMatchObject({
			reason: "unavailable",
		});

		// The migration erases the slot only once the import has committed. If the import
		// resolved on an aborted transaction the slot would go while nothing was stored, and
		// the user's only copy of the credential would be gone with no error anywhere.
		vi.restoreAllMocks();
		expect(localStorage.getItem(LEGACY_SLOT)).toBe("sk-ant-only-copy");
		expect(await countSecrets()).toBe(0);
	});

	it("does not report an unreadable record dropped when its transaction aborts", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);
		await corruptStoredRecord("anthropic");
		abortWriteTo("secrets");

		// The drop is what lets the panel offer a clean re-entry, so reporting it done while
		// the damaged record survives would leave the user re-entering a key into a vault that
		// keeps answering with the broken one.
		await expect(adapter.getKey("anthropic")).rejects.toMatchObject({
			reason: "unavailable",
		});

		vi.restoreAllMocks();
		expect(await countSecrets()).toBe(1);
	});

	it("does not resurrect a key when a read races a delete", async () => {
		localStorage.setItem(LEGACY_SLOT, SECRET);
		const adapter = new BrowserKeychainAdapter();

		// A migrating read and a delete issued together: whichever order they run in, the
		// user pressed "remove", so the key must not survive.
		await Promise.all([adapter.getKey("anthropic"), adapter.deleteKey("anthropic")]);

		expect(await adapter.hasKey("anthropic")).toBe(false);
		expect(await adapter.getKey("anthropic")).toBeNull();
		expect(localStorage.getItem(LEGACY_SLOT)).toBeNull();
	});

	it("converges on one wrapping key when two providers initialize the vault at once", async () => {
		const adapter = new BrowserKeychainAdapter();

		// Separate providers run concurrently, each opening its own connection, which is the
		// same race two tabs run on first use.
		await Promise.all([
			adapter.setKey("anthropic", SECRET),
			adapter.setKey("openai", "sk-openai-concurrent"),
		]);

		// A second wrapping key would have orphaned whichever secret was written under the first.
		expect(await countWrapKeys()).toBe(1);
		expect(await adapter.getKey("anthropic")).toBe(SECRET);
		expect(await adapter.getKey("openai")).toBe("sk-openai-concurrent");
	});
});
