import type { CanvasState } from "./canvas-store-factory";
import { createActiveStoreFacade } from "./document-stores";

export type {
	DfdEdge,
	DfdEdgeData,
	DfdNode,
	DfdNodeData,
} from "./canvas-store-factory";
export {
	boundaryToNode,
	elementToNode,
	flowToEdge,
} from "./canvas-store-factory";

/** Canvas nodes, edges, and viewport for the active document. */
export const useCanvasStore = createActiveStoreFacade<CanvasState>((stores) => stores.canvas);

/**
 * Allocate the next element id for the active document. The canvas store action is the
 * canonical API; these module functions exist for callers outside the store layer
 * (`src/lib/ai-action-executor.ts`).
 */
export function generateElementId(): string {
	return useCanvasStore.getState().nextElementId();
}

/** Allocate the next data-flow id for the active document. */
export function generateFlowId(): string {
	return useCanvasStore.getState().nextFlowId();
}

/** Allocate the next trust-boundary id for the active document. */
export function generateBoundaryId(): string {
	return useCanvasStore.getState().nextBoundaryId();
}
