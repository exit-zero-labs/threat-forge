import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { KEY_VAULT_DB_NAME, KeyVaultError } from "./browser-key-vault";
import { BrowserKeychainAdapter } from "./browser-keychain-adapter";

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
	if (value.constructor?.name === "CryptoKey") return "CryptoKey";
	return Object.values(value).map(describeStoredValue).join(",");
}

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	localStorage.clear();
});

afterEach(() => {
	vi.restoreAllMocks();
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
});

describe("recovering from an unreadable record", () => {
	it("reports a corrupted record as no key rather than throwing at the caller", async () => {
		const adapter = new BrowserKeychainAdapter();
		await adapter.setKey("anthropic", SECRET);

		// Truncate the ciphertext so AES-GCM authentication fails on read.
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = globalThis.indexedDB.open(KEY_VAULT_DB_NAME);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
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
		await adapter.setKey("anthropic", "sk-ant-reentered");
		expect(await adapter.getKey("anthropic")).toBe("sk-ant-reentered");
	});
});
