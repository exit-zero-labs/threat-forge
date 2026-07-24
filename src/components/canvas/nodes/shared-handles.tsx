import { Handle, Position } from "@xyflow/react";
import { useCanvasInstanceStore } from "@/stores/canvas-instance-store";

/**
 * Base handle style: small dot, smooth fade transition. Pointer-events is deliberately
 * excluded here alongside opacity — both are applied per-render below so idle/connecting
 * and target/source states never emit conflicting same-specificity utilities on the same
 * element (see the pointer-events note further down for why this matters for #213).
 */
const HANDLE_STYLE =
	"!w-1.5 !h-1.5 !border-none !bg-muted-foreground transition-opacity duration-150";

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

/** Pointer events enabled — the normal state, so idle handles stay clickable. */
const HANDLE_POINTER_AUTO = "!pointer-events-auto";

/**
 * Pointer events disabled for the duration of a same-type overlap suppression (#213): every
 * connection point renders a target and a source handle at identical coordinates, and
 * whichever one is later in the DOM always paints on top, winning the browser's
 * `elementFromPoint` hit test regardless of which type the in-progress drag actually needs.
 * Setting `pointer-events: none` on the handle sharing the dragged handle's type makes the
 * browser skip it and resolve the opposite-type handle underneath instead, since strict
 * connection mode can only ever complete a connection on the opposite type anyway.
 */
const HANDLE_POINTER_NONE = "!pointer-events-none";

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
	const connectingHandleType = useCanvasInstanceStore((s) => s.connectingHandleType);
	const visibilityCls = isConnecting ? HANDLE_CONNECTING_CLASS : HANDLE_IDLE_CLASS;

	// While connecting, suppress pointer events only on the handle type matching the one the
	// drag started from — the opposite type stays interactive so it wins the hit test at
	// every overlapping point. Outside of a drag (or when the type is unknown) both stay
	// interactive, preserving today's idle/hover behavior.
	const targetPointerCls =
		isConnecting && connectingHandleType === "target" ? HANDLE_POINTER_NONE : HANDLE_POINTER_AUTO;
	const sourcePointerCls =
		isConnecting && connectingHandleType === "source" ? HANDLE_POINTER_NONE : HANDLE_POINTER_AUTO;

	const targetCls = `${HANDLE_STYLE} ${targetPointerCls} ${visibilityCls}`;
	const sourceCls = `${HANDLE_STYLE} ${sourcePointerCls} ${visibilityCls}`;

	return (
		<>
			{/* Cardinal handles */}
			<Handle id="top-target" type="target" position={Position.Top} className={targetCls} />
			<Handle id="top-source" type="source" position={Position.Top} className={sourceCls} />
			<Handle id="bottom-target" type="target" position={Position.Bottom} className={targetCls} />
			<Handle id="bottom-source" type="source" position={Position.Bottom} className={sourceCls} />
			<Handle id="left-target" type="target" position={Position.Left} className={targetCls} />
			<Handle id="left-source" type="source" position={Position.Left} className={sourceCls} />
			<Handle id="right-target" type="target" position={Position.Right} className={targetCls} />
			<Handle id="right-source" type="source" position={Position.Right} className={sourceCls} />

			{/* Corner handles — positioned via style offset from their nearest side */}
			<Handle
				id="top-left-target"
				type="target"
				position={Position.Top}
				className={targetCls}
				style={{ left: "15%" }}
			/>
			<Handle
				id="top-left-source"
				type="source"
				position={Position.Top}
				className={sourceCls}
				style={{ left: "15%" }}
			/>
			<Handle
				id="top-right-target"
				type="target"
				position={Position.Top}
				className={targetCls}
				style={{ left: "85%" }}
			/>
			<Handle
				id="top-right-source"
				type="source"
				position={Position.Top}
				className={sourceCls}
				style={{ left: "85%" }}
			/>
			<Handle
				id="bottom-left-target"
				type="target"
				position={Position.Bottom}
				className={targetCls}
				style={{ left: "15%" }}
			/>
			<Handle
				id="bottom-left-source"
				type="source"
				position={Position.Bottom}
				className={sourceCls}
				style={{ left: "15%" }}
			/>
			<Handle
				id="bottom-right-target"
				type="target"
				position={Position.Bottom}
				className={targetCls}
				style={{ left: "85%" }}
			/>
			<Handle
				id="bottom-right-source"
				type="source"
				position={Position.Bottom}
				className={sourceCls}
				style={{ left: "85%" }}
			/>
		</>
	);
}
