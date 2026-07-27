/**
 * Test-side control over the encrypted browser key vault (#133).
 *
 * Before #133 a browser key was a `localStorage` slot, so `localStorage.clear()` was enough
 * to leave a test with no key stored. The key now lives in a dedicated IndexedDB database,
 * which `localStorage.clear()` does not touch — a suite that still relies on it would carry
 * a key between cases and quietly stop testing the unconfigured path. Replacing the factory
 * is what actually empties the vault.
 *
 * The direct-access helpers live here rather than in one suite because more than one suite
 * has to damage a real vault: the adapter tests and the settings panel's damaged-vault test
 * both need to remove the wrapping key while the encrypted records survive (#234).
 */

import { IDBFactory } from "fake-indexeddb";
import { KEY_VAULT_DB_NAME } from "../browser-key-vault";

/** Discard every stored key by giving the process a fresh, empty IndexedDB. */
export function resetKeyVault(): void {
	globalThis.indexedDB = new IDBFactory();
}

/** Open the vault database directly, to inspect or damage it the way a test needs. */
export async function openVaultDb(): Promise<IDBDatabase> {
	return new Promise<IDBDatabase>((resolve, reject) => {
		const request = globalThis.indexedDB.open(KEY_VAULT_DB_NAME);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/** Replace the contents of the wrap-key store, simulating a damaged vault. */
export async function writeWrapKeyStore(entries: [unknown, string][]): Promise<void> {
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
