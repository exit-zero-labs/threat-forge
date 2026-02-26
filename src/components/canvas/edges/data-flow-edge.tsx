import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { DfdEdgeData } from "@/stores/canvas-store";

export function DataFlowEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	data,
	selected,
	markerEnd,
}: EdgeProps) {
	const edgeData = data as DfdEdgeData | undefined;
	const [edgePath, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		sourcePosition,
		targetX,
		targetY,
		targetPosition,
	});

	const hasLabel = edgeData?.protocol || (edgeData?.data && edgeData.data.length > 0);

	return (
		<>
			<BaseEdge
				id={id}
				path={edgePath}
				markerEnd={markerEnd}
				className={cn("!stroke-2", selected ? "!stroke-tf-signal" : "!stroke-muted-foreground/50")}
			/>
			{hasLabel && (
				<EdgeLabelRenderer>
					<div
						className={cn(
							"pointer-events-all nodrag nopan absolute rounded border bg-card px-1.5 py-0.5 text-[10px]",
							selected ? "border-tf-signal text-foreground" : "border-border text-muted-foreground",
						)}
						style={{
							transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
						}}
					>
						{edgeData?.protocol && <span>{edgeData.protocol}</span>}
						{edgeData?.protocol && edgeData?.data && edgeData.data.length > 0 && <span> · </span>}
						{edgeData?.data && edgeData.data.length > 0 && <span>{edgeData.data.join(", ")}</span>}
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
}
