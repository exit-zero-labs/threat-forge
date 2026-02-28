import { type NodeProps, NodeResizeControl } from "@xyflow/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { DfdNodeData } from "@/stores/canvas-store";
import { useCanvasStore } from "@/stores/canvas-store";
import { useModelStore } from "@/stores/model-store";

/**
 * Convert a hex color (#rrggbb) + opacity (0-1) to an rgba string.
 */
function hexToRgba(hex: string, opacity: number): string {
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function TrustBoundaryNode({ id, data, selected }: NodeProps) {
	const nodeData = data as DfdNodeData;
	const [isEditing, setIsEditing] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const fillColor = nodeData.boundaryFillColor as string | undefined;
	const strokeColor = nodeData.boundaryStrokeColor as string | undefined;
	const fillOpacity = (nodeData.boundaryFillOpacity as number | undefined) ?? 0.05;
	const strokeOpacity = (nodeData.boundaryStrokeOpacity as number | undefined) ?? 0.6;

	const customStyle = useMemo(() => {
		const style: React.CSSProperties = {};
		if (fillColor) {
			style.backgroundColor = hexToRgba(fillColor, fillOpacity);
		}
		if (strokeColor) {
			style.borderColor = hexToRgba(strokeColor, strokeOpacity);
		}
		return style;
	}, [fillColor, strokeColor, fillOpacity, strokeOpacity]);

	const hasCustomColors = Boolean(fillColor || strokeColor);

	const commitLabel = useCallback(
		(value: string) => {
			const trimmed = value.trim();
			if (trimmed && trimmed !== (nodeData.boundaryName ?? nodeData.label)) {
				const model = useModelStore.getState().model;
				if (model) {
					const updatedBoundaries = model.trust_boundaries.map((b) =>
						b.id === id ? { ...b, name: trimmed } : b,
					);
					useModelStore
						.getState()
						.setModel(
							{ ...model, trust_boundaries: updatedBoundaries },
							useModelStore.getState().filePath,
						);
					useModelStore.getState().markDirty();
				}
				syncBoundaryLabel(id, trimmed);
			}
			setIsEditing(false);
		},
		[id, nodeData.boundaryName, nodeData.label],
	);

	return (
		<>
			<NodeResizeControl minWidth={200} minHeight={150} className="!bg-transparent !border-none">
				<ResizeIcon />
			</NodeResizeControl>
			{/* Outer wrapper: only the border zone (8px inset) captures pointer events.
          The interior is pointer-events:none so clicks fall through to edges/nodes. */}
			<div
				className={cn(
					"h-full w-full rounded-lg border-2 border-dashed transition-colors",
					!hasCustomColors &&
						(selected
							? "border-tf-ember/60 bg-tf-ember/5"
							: "border-muted-foreground/30 bg-muted/5"),
					hasCustomColors &&
						selected &&
						"ring-2 ring-tf-signal ring-offset-1 ring-offset-background",
				)}
				style={{
					pointerEvents: "none",
					...(hasCustomColors ? customStyle : {}),
				}}
			>
				{/* Border click zone: an 8px inset ring that captures clicks on the border */}
				<div
					className="absolute inset-0 rounded-lg"
					style={{ pointerEvents: "auto", padding: 8, background: "transparent" }}
					onMouseDown={(e) => e.stopPropagation()}
				>
					{/* Inner transparent area — clicks pass through */}
					<div className="h-full w-full" style={{ pointerEvents: "none" }} />
				</div>
				{/* Name label — always clickable */}
				<div className="relative p-2" style={{ pointerEvents: "auto" }}>
					{isEditing ? (
						<input
							ref={inputRef}
							defaultValue={nodeData.boundaryName ?? nodeData.label}
							autoFocus
							className="bg-transparent text-xs font-semibold uppercase tracking-wider text-muted-foreground outline-none"
							onBlur={(e) => commitLabel(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") commitLabel(e.currentTarget.value);
								if (e.key === "Escape") setIsEditing(false);
							}}
						/>
					) : (
						<div
							className="text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-text"
							onDoubleClick={() => setIsEditing(true)}
						>
							{nodeData.boundaryName ?? nodeData.label}
						</div>
					)}
				</div>
			</div>
		</>
	);
}

function ResizeIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="12"
			height="12"
			viewBox="0 0 24 24"
			className="absolute bottom-1 right-1 text-muted-foreground/50"
			role="img"
			aria-label="Resize handle"
		>
			<path
				fill="currentColor"
				d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM18 18H16V16H18V18ZM14 22H12V20H14V22ZM22 14H20V12H22V14Z"
			/>
		</svg>
	);
}

function syncBoundaryLabel(boundaryId: string, name: string) {
	const nodes = useCanvasStore.getState().nodes;
	const updatedNodes = nodes.map((n) =>
		n.id === boundaryId ? { ...n, data: { ...n.data, label: name, boundaryName: name } } : n,
	);
	useCanvasStore.setState({ nodes: updatedNodes });
}
