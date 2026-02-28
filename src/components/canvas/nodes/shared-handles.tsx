import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";

const HANDLE_CLASS = "!bg-muted-foreground !w-2 !h-2 !border-none";
const HIDDEN_HANDLE_CLASS = cn(HANDLE_CLASS, "!opacity-0 !w-1 !h-1");

/**
 * Shared bidirectional handles for all DFD element nodes.
 * Each side has both a source and target handle with unique IDs,
 * allowing connections in any direction.
 */
export function NodeHandles() {
	return (
		<>
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
		</>
	);
}
