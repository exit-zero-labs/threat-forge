import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { KEY_VAULT_DB_NAME, KeyVaultError } from "./browser-key-vault";
import { BrowserKeychainAdapter } from "./browser-keychain-adapter";
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
	const db = await new Promise<IDBDatabase>((resolve, reject) => {
		const request = globalThis.indexedDB.open(KEY_VAULT_DB_NAME);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
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
	const db = await openVaultDb();
	try {
		return await new Promise<number>((resolve, reject) => {
			const request = db.transaction("wrap-key", "readonly").objectStore("wrap-key").count();
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

		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = globalThis.indexedDB.open(KEY_VAULT_DB_NAME);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const wrapKey = await new Promise<unknown>((resolve, reject) => {
			const request = db.transaction("wrap-key", "readonly").objectStore("wrap-key").getAll();
			request.onsuccess = () => resolve(request.result[0]);
			request.onerror = () => reject(request.error);
		});
		db.close();

		expect(wrapKey).toBeInstanceOf(CryptoKey);
		expect((wrapKey as CryptoKey).extractable).toBe(false);
		// The property that makes `extractable: false` meaningful: the material cannot be
		// read back out even by code running on this origin.
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

		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = globalThis.indexedDB.open(KEY_VAULT_DB_NAME);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
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
			const request = globalThis.indexedDB.open(KEY_VAULT_DB_NAME, 1);
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

describe("recovering from an unreadable record", () => {
	it("reports a corrupted record as no key rather than throwing at the caller", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);

		// Truncate the ciphertext so AES-GCM authentication fails on read.
		const db = await openVaultDb();
		await new Promise<void>((resolve, reject) => {
			const store = db.transaction("secrets", "readwrite").objectStore("secrets");
			const read = store.get("anthropic");
			read.onsuccess = () => {
				const record = read.result as { iv: Uint8Array; ciphertext: Uint8Array };
				const write = store.put(
					{ iv: record.iv, ciphertext: record.ciphertext.slice(0, 4) },
					"anthropic",
				);
				write.onsuccess = () => resolve();
				write.onerror = () => reject(write.error);
			};
			read.onerror = () => reject(read.error);
		});
		db.close();

		// The user sees the ordinary "no key configured" path and can simply re-enter it.
		expect(await adapter.getKey("anthropic")).toBeNull();
		// ...and the two predicates agree, so the settings panel cannot show the provider as
		// configured while every request fails for want of a key.
		expect(await adapter.hasKey("anthropic")).toBe(false);

		await adapter.setKey("anthropic", "sk-ant-reentered");
		expect(await adapter.getKey("anthropic")).toBe("sk-ant-reentered");
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
});

describe("storage that never responds", () => {
	/** Yield one real host task. `MessageChannel` is used because `setTimeout` is faked here. */
	function yieldRealTask(): Promise<void> {
		return new Promise((resolve) => {
			const channel = new MessageChannel();
			channel.port1.onmessage = () => {
				channel.port1.close();
				resolve();
			};
			channel.port2.postMessage(null);
		});
	}

	it("gives up on a wedged open rather than hanging the caller forever", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		// Safari and Firefox private mode are both known to accept `open()` and then fire no
		// event at all. An unbounded wait leaves the settings panel spinning forever, and
		// because adapter calls are serialized per provider, wedges every later call too.
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
		const error = await Promise.race([pending, yieldRealTask().then(() => "still pending")]);

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
	function refuseLegacyRemoval(): void {
		vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => undefined);
	}

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
		expect((error as KeyVaultError).reason).toBe("legacy-retained");
		// The encrypted copy is still removed; only the claim of completeness is withheld.
		expect(localStorage.getItem(LEGACY_SLOT)).toBe("sk-ant-old-cleartext");
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
