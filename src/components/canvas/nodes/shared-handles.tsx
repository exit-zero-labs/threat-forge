import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/stores/canvas-store";

/**
 * Base handle style: small dot, hidden by default, smooth fade transition.
 * Visible on parent node hover or during connection drag (CSS handles hover,
 * `isConnecting` prop handles drag state).
 *
 * The larger pointer-events hitbox (12×12) is maintained even when the visible
 * dot is small, ensuring easy click targeting.
 */
const HANDLE_STYLE =
	"!w-1.5 !h-1.5 !border-none !bg-muted-foreground !opacity-0 transition-opacity duration-150 !pointer-events-auto";

/**
 * Shared bidirectional handles for all DFD element nodes.
 * 4 connection points: top, bottom, left, right.
 * Each point has both a source and target handle for bidirectional connections.
 *
 * Handles are invisible by default and appear on:
 * 1. Parent node hover (via CSS: `.react-flow__node:hover .react-flow__handle`)
 * 2. During connection drag (via `isConnecting` store state)
 */
export function NodeHandles() {
	const isConnecting = useCanvasStore((s) => s.isConnecting);
	const visibleClass = isConnecting ? "!opacity-100" : "";

	return (
		<>
			<Handle
				id="top-target"
				type="target"
				position={Position.Top}
				className={`${HANDLE_STYLE} ${visibleClass}`}
			/>
			<Handle
				id="top-source"
				type="source"
				position={Position.Top}
				className={`${HANDLE_STYLE} ${visibleClass}`}
			/>
			<Handle
				id="bottom-target"
				type="target"
				position={Position.Bottom}
				className={`${HANDLE_STYLE} ${visibleClass}`}
			/>
			<Handle
				id="bottom-source"
				type="source"
				position={Position.Bottom}
				className={`${HANDLE_STYLE} ${visibleClass}`}
			/>
			<Handle
				id="left-target"
				type="target"
				position={Position.Left}
				className={`${HANDLE_STYLE} ${visibleClass}`}
			/>
			<Handle
				id="left-source"
				type="source"
				position={Position.Left}
				className={`${HANDLE_STYLE} ${visibleClass}`}
			/>
			<Handle
				id="right-target"
				type="target"
				position={Position.Right}
				className={`${HANDLE_STYLE} ${visibleClass}`}
			/>
			<Handle
				id="right-source"
				type="source"
				position={Position.Right}
				className={`${HANDLE_STYLE} ${visibleClass}`}
			/>
		</>
	);
}
