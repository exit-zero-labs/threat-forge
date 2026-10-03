/**
 * A one-slot bridge so `chat-store.stopGenerating` can cancel the live AI turn
 * without a static import cycle with `ai-turn-store`.
 *
 * `stopGenerating` (issue #53's `document-registry` calls it on a document
 * switch) must keep its exact synchronous, idempotent contract while also
 * settling any live tool-loop turn. Routing that call through this registry keeps
 * `chat-store` from importing `ai-turn-store` — the store that reads `chat-store`
 * for the provider and history — so neither module depends on the other's
 * initialization order.
 */

let canceller: () => void = () => {};
let documentDisposer: (id: string) => void = () => {};

export function registerDocumentTurnDisposer(fn: (id: string) => void): void {
	documentDisposer = fn;
}

export function disposeDocumentTurns(id: string): void {
	documentDisposer(id);
}

/** Registered once by `ai-turn-store` so the chat store can reach the live runner. */
export function registerActiveTurnCanceller(fn: () => void): void {
	canceller = fn;
}

/** Cancel the live AI turn, if any. Idempotent: a no-op when no turn is running. */
export function cancelActiveTurn(): void {
	canceller();
}

// Query the document registry without importing it into chat-store. Restored
// background documents may own a storage key before their chats are bound.
let storageOwner: (key: string, exceptDocumentId: string | null) => boolean = () => false;

export function registerChatStorageOwner(fn: typeof storageOwner): void {
	storageOwner = fn;
}

export function hasOtherChatStorageOwner(key: string, exceptDocumentId: string | null): boolean {
	return storageOwner(key, exceptDocumentId);
}
