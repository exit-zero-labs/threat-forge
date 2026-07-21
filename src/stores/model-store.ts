import { createActiveStoreFacade } from "./document-stores";
import type { ModelState } from "./model-store-factory";

/** The threat model, file metadata, and selection for the active document. */
export const useModelStore = createActiveStoreFacade<ModelState>((stores) => stores.model);

/**
 * Reset the active document's history-capture debounce so the next edit starts a new undo
 * step. Kept as a module function for callers that are not React components or stores.
 */
export function resetCaptureDebounce(): void {
	useModelStore.getState().resetCaptureDebounce();
}
