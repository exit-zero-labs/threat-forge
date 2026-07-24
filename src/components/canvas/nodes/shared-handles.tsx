import { Handle, Position } from "@xyflow/react";
import { useCanvasInstanceStore } from "@/stores/canvas-instance-store";

/**
 * Base handle style: small dot, smooth fade transition. Opacity is deliberately
 * excluded here — it is applied per-render below so the idle and connecting
 * states never emit conflicting same-specificity utilities on the same element.
 *
 * Pointer events remain enabled while the dot is transparent, so the handle
 * stays available as a connection target in its idle state.
 */
const HANDLE_STYLE =
	"!w-1.5 !h-1.5 !border-none !bg-muted-foreground !pointer-events-auto transition-opacity duration-150";

/**
 * Idle visibility: hidden until the ancestor `.group` node wrapper is hovered.
 * Plain (non-`!important`) utilities — `group-hover:opacity-100` naturally
 * outranks a bare `opacity-0` in specificity (descendant + `:hover` vs. a single
 * class), so no `!important` is needed to reveal handles on hover. See #134.
 */
const HANDLE_IDLE_CLASS = "opacity-0 group-hover:opacity-100";

/**
 * Connecting visibility: forces all handles visible during a connection drag.
 * Applied instead of, never alongside, `HANDLE_IDLE_CLASS` so the two never
 * compete for the same element at the same specificity.
 */
const HANDLE_CONNECTING_CLASS = "opacity-100";

/**
 * Shared bidirectional handles for all DFD element nodes.
 * 8 connection points: 4 cardinal (top, bottom, left, right) + 4 corners.
 * Each point has both a source and target handle for bidirectional connections.
 *
 * Handles are invisible by default and appear on:
 * 1. Parent node hover (via `group-hover:opacity-100`, requires a `.group` ancestor)
 * 2. During connection drag (via `isConnecting` store state)
 */
export function NodeHandles() {
	const isConnecting = useCanvasInstanceStore((s) => s.isConnecting);
	const cls = `${HANDLE_STYLE} ${isConnecting ? HANDLE_CONNECTING_CLASS : HANDLE_IDLE_CLASS}`;

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
