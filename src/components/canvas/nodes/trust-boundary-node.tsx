import { type NodeProps, NodeResizeControl } from "@xyflow/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { DfdNodeData } from "@/stores/canvas-store";
import { useCanvasStore } from "@/stores/canvas-store";
import { useModelStore } from "@/stores/model-store";
import { useUiStore } from "@/stores/ui-store";

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

	const selectBoundary = useCallback(() => {
		useModelStore.getState().setSelectedBoundary(id);
		useUiStore.getState().setRightPanelTab("properties");
	}, [id]);

	return (
		<>
			<NodeResizeControl
				minWidth={200}
				minHeight={150}
				className="!bg-transparent !border-none"
				style={{ pointerEvents: "auto" }}
			>
				<ResizeIcon />
			</NodeResizeControl>
			{/* Content wrapper: pointer-events:none so interior clicks pass through.
          The ReactFlow node wrapper also has pointer-events:none (set via node.style).
          Border strips and label opt back in with pointer-events:auto. */}
			<div
				className={cn(
					"h-full w-full relative rounded-lg border-2 border-dashed transition-colors",
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
				{/* Clickable border overlay — 4 thin strips along the edges */}
				{/* Top */}
				<button
					type="button"
					className="absolute inset-x-0 top-0 h-2 cursor-pointer bg-transparent border-none p-0"
					style={{ pointerEvents: "auto" }}
					onClick={selectBoundary}
					aria-label="Select boundary"
				/>
				{/* Bottom */}
				<button
					type="button"
					className="absolute inset-x-0 bottom-0 h-2 cursor-pointer bg-transparent border-none p-0"
					style={{ pointerEvents: "auto" }}
					onClick={selectBoundary}
					aria-label="Select boundary"
				/>
				{/* Left */}
				<button
					type="button"
					className="absolute inset-y-0 left-0 w-2 cursor-pointer bg-transparent border-none p-0"
					style={{ pointerEvents: "auto" }}
					onClick={selectBoundary}
					aria-label="Select boundary"
				/>
				{/* Right */}
				<button
					type="button"
					className="absolute inset-y-0 right-0 w-2 cursor-pointer bg-transparent border-none p-0"
					style={{ pointerEvents: "auto" }}
					onClick={selectBoundary}
					aria-label="Select boundary"
				/>
				{/* Name label — clickable, selects boundary */}
				<button
					type="button"
					className="relative w-full p-2 bg-transparent border-none text-left"
					style={{ pointerEvents: "auto" }}
					onClick={selectBoundary}
				>
					{isEditing ? (
						<input
							ref={inputRef}
							defaultValue={nodeData.boundaryName ?? nodeData.label}
							autoFocus
							className="bg-transparent text-xs font-semibold uppercase tracking-wider text-muted-foreground outline-none"
							onBlur={(e) => commitLabel(e.target.value)}
							onKeyDown={(e) => {
								// Stop propagation so Backspace doesn't trigger canvas node deletion
								e.stopPropagation();
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
				</button>
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
