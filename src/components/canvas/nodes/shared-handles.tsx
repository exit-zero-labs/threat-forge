import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";

const HANDLE_CLASS = "!bg-muted-foreground !w-2 !h-2 !border-none";
const HIDDEN_HANDLE_CLASS = cn(HANDLE_CLASS, "!opacity-0 !w-1 !h-1");

/**
 * Shared bidirectional handles for all DFD element nodes.
 * 6 connection points: 2 horizontal midpoints (left, right) + 4 corners.
 * Each point has both a source and target handle for bidirectional connections.
 */
export function NodeHandles() {
	return (
		<>
			{/* Horizontal midpoint handles */}
			<Handle id="left-target" type="target" position={Position.Left} className={HANDLE_CLASS} />
			<Handle
				id="left-source"
				type="source"
				position={Position.Left}
				className={HIDDEN_HANDLE_CLASS}
			/>
			<Handle
				id="right-target"
				type="target"
				position={Position.Right}
				className={HIDDEN_HANDLE_CLASS}
			/>
			<Handle id="right-source" type="source" position={Position.Right} className={HANDLE_CLASS} />

			{/* Corner handles */}
			<Handle
				id="top-left-target"
				type="target"
				position={Position.Top}
				style={{ left: 0 }}
				className={HANDLE_CLASS}
			/>
			<Handle
				id="top-left-source"
				type="source"
				position={Position.Top}
				style={{ left: 0 }}
				className={HIDDEN_HANDLE_CLASS}
			/>
			<Handle
				id="top-right-target"
				type="target"
				position={Position.Top}
				style={{ left: "100%" }}
				className={HANDLE_CLASS}
			/>
			<Handle
				id="top-right-source"
				type="source"
				position={Position.Top}
				style={{ left: "100%" }}
				className={HIDDEN_HANDLE_CLASS}
			/>
			<Handle
				id="bottom-left-source"
				type="source"
				position={Position.Bottom}
				style={{ left: 0 }}
				className={HANDLE_CLASS}
			/>
			<Handle
				id="bottom-left-target"
				type="target"
				position={Position.Bottom}
				style={{ left: 0 }}
				className={HIDDEN_HANDLE_CLASS}
			/>
			<Handle
				id="bottom-right-source"
				type="source"
				position={Position.Bottom}
				style={{ left: "100%" }}
				className={HANDLE_CLASS}
			/>
			<Handle
				id="bottom-right-target"
				type="target"
				position={Position.Bottom}
				style={{ left: "100%" }}
				className={HIDDEN_HANDLE_CLASS}
			/>
		</>
	);
}
