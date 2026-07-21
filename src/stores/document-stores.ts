import { type UseBoundStore, useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import { type CanvasState, createCanvasStore } from "./canvas-store-factory";
import { createHistoryStore, type HistoryState } from "./history-store-factory";
import { createModelStore, type ModelState } from "./model-store-factory";

/**
 * The document-scoped store bundle. One bundle exists per open document; nothing in it is
 * ever copied between documents, so a value that belongs to one document cannot surface in
 * another.
 */
export interface DocumentStores {
	model: StoreApi<ModelState>;
	canvas: StoreApi<CanvasState>;
	history: StoreApi<HistoryState>;
}

/** Build a fresh, fully wired bundle. History first, then model, then canvas. */
export function createDocumentStores(): DocumentStores {
	const history = createHistoryStore();
	const model = createModelStore({ history });
	const canvas = createCanvasStore({ model, history });
	return { model, canvas, history };
}

/**
 * The active bundle pointer. It is a store rather than a plain variable so React consumers
 * re-render — and re-subscribe to the new bundle — when the active document changes.
 *
 * It is seeded with a scratch bundle at module load so that the store facades always resolve
 * to a real, consistently wired bundle even before any document exists.
 */
const activeStoresHolder = createStore<{ stores: DocumentStores }>(() => ({
	stores: createDocumentStores(),
}));

export function getActiveStores(): DocumentStores {
	return activeStoresHolder.getState().stores;
}

export function useActiveStores(): DocumentStores {
	return useStore(activeStoresHolder, (state) => state.stores);
}

export function setActiveStores(stores: DocumentStores): void {
	activeStoresHolder.setState({ stores });
}

function identity<T>(state: T): T {
	return state;
}

/**
 * Build the module-level facade for one kind of document store.
 *
 * The facade has the same shape as a `zustand` bound store, so consumers keep using
 * `useXStore(selector)`, `useXStore.getState()`, and `useXStore.setState(...)` unchanged.
 * The difference is that every call resolves the currently active bundle instead of a single
 * store captured at module load.
 */
export function createActiveStoreFacade<T>(
	select: (stores: DocumentStores) => StoreApi<T>,
): UseBoundStore<StoreApi<T>> {
	function useActiveStore<U>(selector?: (state: T) => U): T | U {
		// Subscribing to the active bundle first is what makes a document switch re-render and
		// re-subscribe; reading `getActiveStores()` here would serve a stale snapshot instead.
		const api = select(useActiveStores());
		const resolve: (state: T) => T | U = selector ?? identity;
		return useStore(api, resolve);
	}

	const facade = Object.assign(useActiveStore, {
		getState: () => select(getActiveStores()).getState(),
		getInitialState: () => select(getActiveStores()).getInitialState(),
		subscribe: (listener: (state: T, prevState: T) => void) =>
			select(getActiveStores()).subscribe(listener),
		setState: (...args: Parameters<StoreApi<T>["setState"]>) =>
			select(getActiveStores()).setState(...args),
	});

	// `useActiveStore` implements both `UseBoundStore` call signatures — whole state without a
	// selector, the selected slice with one — which a single implementation signature cannot
	// express in TypeScript.
	return facade as UseBoundStore<StoreApi<T>>;
}
