import { createActiveStoreFacade } from "./document-stores";
import type { HistoryState } from "./history-store-factory";

/** Undo/redo history for the active document. */
export const useHistoryStore = createActiveStoreFacade<HistoryState>((stores) => stores.history);
