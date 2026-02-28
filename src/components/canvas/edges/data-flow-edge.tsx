import {
	BaseEdge,
	EdgeLabelRenderer,
	type EdgeProps,
	getBezierPath,
	useReactFlow,
	useViewport,
} from "@xyflow/react";
import { Plus } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { DfdEdgeData } from "@/stores/canvas-store";
import { useModelStore } from "@/stores/model-store";
import { useUiStore } from "@/stores/ui-store";

/**
 * Build two quadratic bezier segments that route through a waypoint.
 * source → waypoint → target, producing a smooth path.
 */
function getWaypointPath(
	sx: number,
	sy: number,
	tx: number,
	ty: number,
	wx: number,
	wy: number,
): string {
	// Quadratic bezier using waypoint as control point, ending at target
	const mid2x = (wx + tx) / 2;
	const mid2y = (wy + ty) / 2;
	return `M ${sx},${sy} Q ${wx},${wy} ${mid2x},${mid2y} T ${tx},${ty}`;
}

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
	const { setEdges } = useReactFlow();

	// Default label position (midpoint of standard bezier)
	const [defaultPath, defaultLabelX, defaultLabelY] = getBezierPath({
		sourceX,
		sourceY,
		sourcePosition,
		targetX,
		targetY,
		targetPosition,
	});

	const hasLabel =
		edgeData?.name || edgeData?.protocol || (edgeData?.data && edgeData.data.length > 0);

	// Custom label position (user-dragged offset from default)
	const offsetX = (edgeData?.labelOffsetX as number) ?? 0;
	const offsetY = (edgeData?.labelOffsetY as number) ?? 0;
	const hasCustomPosition = offsetX !== 0 || offsetY !== 0;

	const labelX = defaultLabelX + offsetX;
	const labelY = defaultLabelY + offsetY;

	// When a label exists and has been dragged, route edge through the label as a waypoint
	const edgePath =
		hasLabel && hasCustomPosition
			? getWaypointPath(sourceX, sourceY, targetX, targetY, labelX, labelY)
			: defaultPath;

	const [isHovered, setIsHovered] = useState(false);
	const [isEditing, setIsEditing] = useState(false);
	const { zoom } = useViewport();

	// --- Draggable label logic ---
	const isDragging = useRef(false);
	const didDrag = useRef(false);
	const dragStartPos = useRef({ x: 0, y: 0 });
	const dragStartOffset = useRef({ x: 0, y: 0 });
	const wasSelectedBefore = useRef(false);

	const onLabelMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (e.button !== 0) return;
			// Stop event from reaching ReactFlow pane (prevents deselection)
			e.stopPropagation();
			e.nativeEvent.stopImmediatePropagation();

			wasSelectedBefore.current = !!selected;

			// Always select the edge when clicking its label
			useModelStore.getState().setSelectedEdge(id);
			useUiStore.getState().setRightPanelTab("properties");

			isDragging.current = true;
			didDrag.current = false;
			dragStartPos.current = { x: e.clientX, y: e.clientY };
			dragStartOffset.current = { x: offsetX, y: offsetY };

			// Capture zoom at drag start for consistent scaling
			const currentZoom = zoom;

			const onMouseMove = (ev: MouseEvent) => {
				if (!isDragging.current) return;
				// Convert screen pixels to flow coordinates by dividing by zoom
				const dx = (ev.clientX - dragStartPos.current.x) / currentZoom;
				const dy = (ev.clientY - dragStartPos.current.y) / currentZoom;
				// Only start dragging after a small threshold to distinguish from clicks
				if (!didDrag.current && Math.abs(dx) + Math.abs(dy) < 3) return;
				didDrag.current = true;
				// Update edge data with new offset
				setEdges((edges) =>
					edges.map((edge) =>
						edge.id === id
							? {
									...edge,
									data: {
										...edge.data,
										labelOffsetX: dragStartOffset.current.x + dx,
										labelOffsetY: dragStartOffset.current.y + dy,
									},
								}
							: edge,
					),
				);
			};

			const onMouseUp = () => {
				isDragging.current = false;
				document.removeEventListener("mousemove", onMouseMove);
				document.removeEventListener("mouseup", onMouseUp);
				if (didDrag.current) {
					useModelStore.getState().markDirty();
					// Re-assert selection after drag (ReactFlow may have cleared it)
					useModelStore.getState().setSelectedEdge(id);
				}
			};

			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		},
		[id, selected, offsetX, offsetY, setEdges, zoom],
	);

	const onLabelClick = useCallback((e: React.MouseEvent) => {
		// Stop click from reaching ReactFlow pane
		e.stopPropagation();
		// Only open editor on a pure click (no drag) when already selected before this click
		if (wasSelectedBefore.current && !didDrag.current) {
			setIsEditing(true);
		}
	}, []);

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
							"pointer-events-all nodrag nopan absolute rounded border px-1.5 py-0.5 text-left transition-colors",
							selected
								? "border-tf-signal bg-tf-signal/10 text-foreground cursor-grab active:cursor-grabbing"
								: "border-border bg-card text-muted-foreground hover:border-muted-foreground cursor-pointer",
						)}
						style={{
							transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
						}}
						onDoubleClick={() => setIsEditing(true)}
						onClick={onLabelClick}
						onMouseDown={onLabelMouseDown}
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
