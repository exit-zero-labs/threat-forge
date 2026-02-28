import {
	BaseEdge,
	EdgeLabelRenderer,
	type EdgeProps,
	getBezierPath,
	useEdges,
	useReactFlow,
} from "@xyflow/react";
import { Plus } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { DfdEdgeData } from "@/stores/canvas-store";
import { useModelStore } from "@/stores/model-store";

/** Perpendicular offset in pixels between parallel edges */
const PARALLEL_OFFSET_PX = 25;

/**
 * Compute the perpendicular offset index for this edge when multiple edges
 * connect the same pair of nodes (in either direction). Returns 0 for single
 * edges, and a centered spread for multiple siblings (e.g. -1, 0, 1 for 3).
 */
function computeParallelOffset(
	allEdges: ReadonlyArray<{ id: string; source: string; target: string }>,
	currentId: string,
	source: string,
	target: string,
): number {
	const siblings = allEdges.filter(
		(e) =>
			(e.source === source && e.target === target) || (e.source === target && e.target === source),
	);
	if (siblings.length <= 1) return 0;

	const sorted = [...siblings].sort((a, b) => a.id.localeCompare(b.id));
	const index = sorted.findIndex((e) => e.id === currentId);
	const count = sorted.length;
	return index - (count - 1) / 2;
}

/**
 * Build a cubic bezier SVG path with control points shifted perpendicular
 * to the source→target direction. This visually fans out parallel edges
 * instead of drawing them on top of each other.
 *
 * Returns [path, labelX, labelY].
 */
function getOffsetBezierPath(
	sx: number,
	sy: number,
	tx: number,
	ty: number,
	sourcePosition: string,
	targetPosition: string,
	offset: number,
): [string, number, number] {
	// If no offset needed, use the standard path
	if (offset === 0) {
		const [path, lx, ly] = getBezierPath({
			sourceX: sx,
			sourceY: sy,
			sourcePosition: sourcePosition as never,
			targetX: tx,
			targetY: ty,
			targetPosition: targetPosition as never,
		});
		return [path, lx, ly];
	}

	const dx = tx - sx;
	const dy = ty - sy;
	const dist = Math.sqrt(dx * dx + dy * dy) || 1;

	// Perpendicular unit vector (rotated 90° counter-clockwise)
	const px = -dy / dist;
	const py = dx / dist;

	const perpOffset = offset * PARALLEL_OFFSET_PX;

	// Control point distance along the axis (same as default bezier)
	const controlDist = dist * 0.25;

	// Compute control points with perpendicular offset
	let cx1: number;
	let cy1: number;
	let cx2: number;
	let cy2: number;

	// Extend control points along the source/target handle direction,
	// then shift them perpendicular
	if (sourcePosition === "bottom") {
		cx1 = sx + px * perpOffset;
		cy1 = sy + controlDist + py * perpOffset;
	} else if (sourcePosition === "top") {
		cx1 = sx + px * perpOffset;
		cy1 = sy - controlDist + py * perpOffset;
	} else if (sourcePosition === "right") {
		cx1 = sx + controlDist + px * perpOffset;
		cy1 = sy + py * perpOffset;
	} else {
		// left
		cx1 = sx - controlDist + px * perpOffset;
		cy1 = sy + py * perpOffset;
	}

	if (targetPosition === "top") {
		cx2 = tx + px * perpOffset;
		cy2 = ty - controlDist + py * perpOffset;
	} else if (targetPosition === "bottom") {
		cx2 = tx + px * perpOffset;
		cy2 = ty + controlDist + py * perpOffset;
	} else if (targetPosition === "left") {
		cx2 = tx - controlDist + px * perpOffset;
		cy2 = ty + py * perpOffset;
	} else {
		// right
		cx2 = tx + controlDist + px * perpOffset;
		cy2 = ty + py * perpOffset;
	}

	const path = `M ${sx},${sy} C ${cx1},${cy1} ${cx2},${cy2} ${tx},${ty}`;
	// Label at the curve midpoint (t=0.5 of cubic bezier)
	const labelX = 0.125 * sx + 0.375 * cx1 + 0.375 * cx2 + 0.125 * tx;
	const labelY = 0.125 * sy + 0.375 * cy1 + 0.375 * cy2 + 0.125 * ty;

	return [path, labelX, labelY];
}

export function DataFlowEdge({
	id,
	source,
	target,
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
	const allEdges = useEdges();

	const parallelOffset = useMemo(
		() => computeParallelOffset(allEdges, id, source, target),
		[allEdges, id, source, target],
	);

	const [edgePath, labelX, labelY] = useMemo(
		() =>
			getOffsetBezierPath(
				sourceX,
				sourceY,
				targetX,
				targetY,
				sourcePosition,
				targetPosition,
				parallelOffset,
			),
		[sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, parallelOffset],
	);

	const [isHovered, setIsHovered] = useState(false);
	const [isEditing, setIsEditing] = useState(false);

	const hasLabel =
		edgeData?.name || edgeData?.protocol || (edgeData?.data && edgeData.data.length > 0);

	return (
		<>
			{/* Invisible wider path for easier click/hover targeting */}
			<path
				d={edgePath}
				fill="none"
				strokeWidth={16}
				className="stroke-transparent"
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
				style={{ pointerEvents: "stroke" }}
			/>
			<BaseEdge
				id={id}
				path={edgePath}
				markerEnd={markerEnd}
				className={cn(
					"!stroke-2 transition-colors",
					selected
						? "!stroke-tf-signal"
						: isHovered
							? "!stroke-muted-foreground/80"
							: "!stroke-muted-foreground/50",
				)}
			/>
			{/* Animated flow direction dashes on hover/selection */}
			{(isHovered || selected) && (
				<path
					d={edgePath}
					fill="none"
					strokeWidth={2}
					className="stroke-tf-signal/40"
					strokeDasharray="6 4"
					style={{ pointerEvents: "none" }}
				>
					<animate
						attributeName="stroke-dashoffset"
						from="0"
						to="-20"
						dur="1s"
						repeatCount="indefinite"
					/>
				</path>
			)}
			<EdgeLabelRenderer>
				{hasLabel && !isEditing && (
					<button
						type="button"
						className={cn(
							"pointer-events-all nodrag nopan absolute cursor-pointer rounded border px-1.5 py-0.5 text-left transition-colors",
							selected
								? "border-tf-signal bg-tf-signal/10 text-foreground"
								: "border-border bg-card text-muted-foreground hover:border-muted-foreground",
						)}
						style={{
							transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
						}}
						onDoubleClick={() => setIsEditing(true)}
						onClick={() => {
							if (selected) setIsEditing(true);
						}}
					>
						{edgeData?.name && (
							<div className="text-[11px] font-medium text-foreground">{edgeData.name}</div>
						)}
						{(edgeData?.protocol || (edgeData?.data && edgeData.data.length > 0)) && (
							<div className="text-[9px]">
								{edgeData?.protocol && <span>{edgeData.protocol}</span>}
								{edgeData?.protocol && edgeData?.data && edgeData.data.length > 0 && (
									<span> · </span>
								)}
								{edgeData?.data && edgeData.data.length > 0 && (
									<span>{edgeData.data.join(", ")}</span>
								)}
							</div>
						)}
					</button>
				)}
				{isEditing && (
					<EdgeLabelEditor
						edgeId={id}
						name={edgeData?.name ?? ""}
						protocol={edgeData?.protocol ?? ""}
						dataItems={edgeData?.data ?? []}
						labelX={labelX}
						labelY={labelY}
						onClose={() => setIsEditing(false)}
					/>
				)}
				{!hasLabel && !isEditing && (isHovered || selected) && (
					<button
						type="button"
						className="pointer-events-all nodrag nopan absolute flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
						style={{
							transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
						}}
						onClick={() => setIsEditing(true)}
					>
						<Plus className="h-3 w-3" />
					</button>
				)}
			</EdgeLabelRenderer>
		</>
	);
}

function EdgeLabelEditor({
	edgeId,
	name,
	protocol,
	dataItems,
	labelX,
	labelY,
	onClose,
}: {
	edgeId: string;
	name: string;
	protocol: string;
	dataItems: string[];
	labelX: number;
	labelY: number;
	onClose: () => void;
}) {
	const nameRef = useRef<HTMLInputElement>(null);
	const protocolRef = useRef<HTMLInputElement>(null);
	const dataRef = useRef<HTMLInputElement>(null);
	const { setEdges } = useReactFlow();

	const commit = useCallback(() => {
		const newName = nameRef.current?.value.trim() ?? "";
		const newProtocol = protocolRef.current?.value.trim() ?? "";
		const newData = (dataRef.current?.value ?? "")
			.split(",")
			.map((s) => s.trim())
			.filter((s) => s.length > 0);

		// Update model store
		const model = useModelStore.getState().model;
		if (model) {
			const updatedFlows = model.data_flows.map((f) =>
				f.id === edgeId ? { ...f, name: newName, protocol: newProtocol, data: newData } : f,
			);
			useModelStore
				.getState()
				.setModel({ ...model, data_flows: updatedFlows }, useModelStore.getState().filePath);
			useModelStore.getState().markDirty();
		}

		// Update canvas edge data
		setEdges((edges) =>
			edges.map((e) =>
				e.id === edgeId
					? {
							...e,
							data: {
								...e.data,
								name: newName,
								protocol: newProtocol,
								data: newData,
							},
						}
					: e,
			),
		);

		onClose();
	}, [edgeId, onClose, setEdges]);

	const containerRef = useRef<HTMLDivElement>(null);

	/** Commit when focus leaves the editor entirely (but not when tabbing between inputs) */
	const handleContainerBlur = useCallback(
		(e: React.FocusEvent) => {
			if (!containerRef.current?.contains(e.relatedTarget as Node)) {
				commit();
			}
		},
		[commit],
	);

	return (
		<div
			ref={containerRef}
			className="pointer-events-all nodrag nopan absolute flex flex-col gap-1 rounded border border-tf-signal bg-card p-2 shadow-lg"
			style={{
				transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
			}}
			onBlur={handleContainerBlur}
		>
			<input
				ref={nameRef}
				defaultValue={name}
				placeholder="Flow name (e.g. Login Request)"
				autoFocus
				className="w-44 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
				onKeyDown={(e) => {
					if (e.key === "Enter") commit();
					if (e.key === "Escape") onClose();
				}}
			/>
			<input
				ref={protocolRef}
				defaultValue={protocol}
				placeholder="Protocol (e.g. HTTPS)"
				className="w-44 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
				onKeyDown={(e) => {
					if (e.key === "Enter") commit();
					if (e.key === "Escape") onClose();
				}}
			/>
			<input
				ref={dataRef}
				defaultValue={dataItems.join(", ")}
				placeholder="Data (comma-separated)"
				className="w-44 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
				onKeyDown={(e) => {
					if (e.key === "Enter") commit();
					if (e.key === "Escape") onClose();
				}}
			/>
		</div>
	);
}
