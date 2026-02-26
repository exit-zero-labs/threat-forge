import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { DfdNodeData } from "@/stores/canvas-store";

export function DataStoreNode({ data, selected }: { data: DfdNodeData; selected?: boolean }) {
	return (
		<div
			className={cn(
				"flex min-w-[140px] items-center justify-center border-y-2 bg-card px-4 py-3 shadow-md transition-colors",
				selected ? "border-tf-signal shadow-tf-signal/20" : "border-border",
			)}
		>
			<Handle type="target" position={Position.Top} className="!bg-muted-foreground !w-2 !h-2" />
			<Handle type="target" position={Position.Left} className="!bg-muted-foreground !w-2 !h-2" />

			<div className="text-center">
				<div className="text-sm font-medium text-foreground">{data.label}</div>
				{data.trustZone && (
					<div className="mt-0.5 text-[10px] text-muted-foreground">{data.trustZone}</div>
				)}
			</div>

			<Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !w-2 !h-2" />
			<Handle type="source" position={Position.Right} className="!bg-muted-foreground !w-2 !h-2" />
		</div>
	);
}
