import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";

const HANDLE_CLASS = "!bg-muted-foreground !w-2 !h-2 !border-none";
const HIDDEN_HANDLE_CLASS = cn(HANDLE_CLASS, "!opacity-0 !w-1 !h-1");
const CORNER_HANDLE_CLASS = "!bg-muted-foreground/60 !w-1.5 !h-1.5 !border-none";
const HIDDEN_CORNER_CLASS = cn(CORNER_HANDLE_CLASS, "!opacity-0 !w-1 !h-1");

/**
 * Shared bidirectional handles for all DFD element nodes.
 * 8 connection points: 4 cardinal (center of each side) + 4 corners.
 * Each point has both a source and target handle for bidirectional connections.
 */
export function NodeHandles() {
	return (
		<>
			{/* Cardinal handles — center of each side */}
			<Handle id="top-target" type="target" position={Position.Top} className={HANDLE_CLASS} />
			<Handle
				id="top-source"
				type="source"
				position={Position.Top}
				className={HIDDEN_HANDLE_CLASS}
			/>
			<Handle id="left-target" type="target" position={Position.Left} className={HANDLE_CLASS} />
			<Handle
				id="left-source"
				type="source"
				position={Position.Left}
				className={HIDDEN_HANDLE_CLASS}
			/>
			<Handle
				id="bottom-target"
				type="target"
				position={Position.Bottom}
				className={HIDDEN_HANDLE_CLASS}
			/>
			<Handle
				id="bottom-source"
				type="source"
				position={Position.Bottom}
				className={HANDLE_CLASS}
			/>
			<Handle
				id="right-target"
				type="target"
				position={Position.Right}
				className={HIDDEN_HANDLE_CLASS}
			/>
			<Handle id="right-source" type="source" position={Position.Right} className={HANDLE_CLASS} />

			{/* Corner handles — positioned near each corner via style override */}
			<Handle
				id="top-left-target"
				type="target"
				position={Position.Top}
				style={{ left: "10%" }}
				className={CORNER_HANDLE_CLASS}
			/>
			<Handle
				id="top-left-source"
				type="source"
				position={Position.Top}
				style={{ left: "10%" }}
				className={HIDDEN_CORNER_CLASS}
			/>
			<Handle
				id="top-right-target"
				type="target"
				position={Position.Top}
				style={{ left: "90%" }}
				className={CORNER_HANDLE_CLASS}
			/>
			<Handle
				id="top-right-source"
				type="source"
				position={Position.Top}
				style={{ left: "90%" }}
				className={HIDDEN_CORNER_CLASS}
			/>
			<Handle
				id="bottom-left-source"
				type="source"
				position={Position.Bottom}
				style={{ left: "10%" }}
				className={CORNER_HANDLE_CLASS}
			/>
			<Handle
				id="bottom-left-target"
				type="target"
				position={Position.Bottom}
				style={{ left: "10%" }}
				className={HIDDEN_CORNER_CLASS}
			/>
			<Handle
				id="bottom-right-source"
				type="source"
				position={Position.Bottom}
				style={{ left: "90%" }}
				className={CORNER_HANDLE_CLASS}
			/>
			<Handle
				id="bottom-right-target"
				type="target"
				position={Position.Bottom}
				style={{ left: "90%" }}
				className={HIDDEN_CORNER_CLASS}
			/>
		</>
	);
}
