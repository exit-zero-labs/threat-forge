/**
 * Test-side control over the encrypted browser key vault (#133).
 *
 * Before #133 a browser key was a `localStorage` slot, so `localStorage.clear()` was enough
 * to leave a test with no key stored. The key now lives in a dedicated IndexedDB database,
 * which `localStorage.clear()` does not touch — a suite that still relies on it would carry
 * a key between cases and quietly stop testing the unconfigured path. Replacing the factory
 * is what actually empties the vault.
 */

import { IDBFactory } from "fake-indexeddb";

/** Discard every stored key by giving the process a fresh, empty IndexedDB. */
export function resetKeyVault(): void {
	globalThis.indexedDB = new IDBFactory();
}
