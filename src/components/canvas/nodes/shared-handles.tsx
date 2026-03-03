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
 * 8 connection points: 4 cardinal (top, bottom, left, right) + 4 corners.
 * Each point has both a source and target handle for bidirectional connections.
 *
 * Handles are invisible by default and appear on:
 * 1. Parent node hover (via CSS: `.react-flow__node:hover .react-flow__handle`)
 * 2. During connection drag (via `isConnecting` store state)
 */
export function NodeHandles() {
	const isConnecting = useCanvasStore((s) => s.isConnecting);
	const visibleClass = isConnecting ? "!opacity-100" : "";
	const cls = `${HANDLE_STYLE} ${visibleClass}`;

	return (
		<>
			{/* Cardinal handles */}
			<Handle id="top-target" type="target" position={Position.Top} className={cls} />
			<Handle id="top-source" type="source" position={Position.Top} className={cls} />
			<Handle id="bottom-target" type="target" position={Position.Bottom} className={cls} />
			<Handle id="bottom-source" type="source" position={Position.Bottom} className={cls} />
			<Handle id="left-target" type="target" position={Position.Left} className={cls} />
			<Handle id="left-source" type="source" position={Position.Left} className={cls} />
			<Handle id="right-target" type="target" position={Position.Right} className={cls} />
			<Handle id="right-source" type="source" position={Position.Right} className={cls} />

			{/* Corner handles — positioned via style offset from their nearest side */}
			<Handle
				id="top-left-target"
				type="target"
				position={Position.Top}
				className={cls}
				style={{ left: "15%" }}
			/>
			<Handle
				id="top-left-source"
				type="source"
				position={Position.Top}
				className={cls}
				style={{ left: "15%" }}
			/>
			<Handle
				id="top-right-target"
				type="target"
				position={Position.Top}
				className={cls}
				style={{ left: "85%" }}
			/>
			<Handle
				id="top-right-source"
				type="source"
				position={Position.Top}
				className={cls}
				style={{ left: "85%" }}
			/>
			<Handle
				id="bottom-left-target"
				type="target"
				position={Position.Bottom}
				className={cls}
				style={{ left: "15%" }}
			/>
			<Handle
				id="bottom-left-source"
				type="source"
				position={Position.Bottom}
				className={cls}
				style={{ left: "15%" }}
			/>
			<Handle
				id="bottom-right-target"
				type="target"
				position={Position.Bottom}
				className={cls}
				style={{ left: "85%" }}
			/>
			<Handle
				id="bottom-right-source"
				type="source"
				position={Position.Bottom}
				className={cls}
				style={{ left: "85%" }}
			/>
		</>
	);
}
