import type { NodeProps } from "@xyflow/react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { DfdNodeData } from "@/stores/canvas-store";
import { useCanvasStore } from "@/stores/canvas-store";
import { useModelStore } from "@/stores/model-store";

const DEFAULT_FONT_SIZE = 14;
const DEFAULT_FONT_WEIGHT = "normal";

/**
 * Convert a hex color (#rrggbb) + opacity (0-1) to an rgba string.
 * Returns undefined for invalid/empty hex values (falls back to CSS inheritance).
 */
function hexToRgba(hex: string, opacity: number): string | undefined {
	if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return undefined;
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function TextAnnotationNode({ id, data, selected }: NodeProps) {
	const nodeData = data as DfdNodeData;
	const [isEditing, setIsEditing] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const fontSize = (nodeData.fontSize as number) ?? DEFAULT_FONT_SIZE;
	const fontWeight = (nodeData.fontWeight as string) ?? DEFAULT_FONT_WEIGHT;
	const fillColor = nodeData.elementFillColor as string | undefined;
	const fillOpacity = (nodeData.elementFillOpacity as number | undefined) ?? 1.0;

	const textColor = fillColor ? hexToRgba(fillColor, fillOpacity) : undefined;

	const commitLabel = useCallback(
		(value: string) => {
			const trimmed = value.trim();
			if (trimmed && trimmed !== nodeData.label) {
				useModelStore.getState().updateElement(id, { name: trimmed });
				const nodes = useCanvasStore.getState().nodes;
				const updatedNodes = nodes.map((n) =>
					n.id === id ? { ...n, data: { ...n.data, label: trimmed } } : n,
				);
				useCanvasStore.setState({ nodes: updatedNodes });
			}
			setIsEditing(false);
		},
		[id, nodeData.label],
	);

	return (
		<div
			data-testid={`node-${id}`}
			className={cn(
				"group relative cursor-grab px-2 py-1 transition-colors",
				selected && "ring-2 ring-tf-signal ring-offset-1 ring-offset-background rounded",
			)}
			style={{
				fontSize: `${fontSize}px`,
				fontWeight,
				color: textColor ?? "hsl(var(--foreground))",
			}}
		>
			{/* No handles — text elements are not connectable */}
			{isEditing ? (
				<input
					ref={inputRef}
					defaultValue={nodeData.label}
					autoFocus
					className="w-full bg-transparent text-inherit outline-none"
					style={{ fontSize: "inherit", fontWeight: "inherit" }}
					onBlur={(e) => commitLabel(e.target.value)}
					onKeyDown={(e) => {
						e.stopPropagation();
						if (e.key === "Enter") commitLabel(e.currentTarget.value);
						if (e.key === "Escape") setIsEditing(false);
					}}
				/>
			) : (
				<span className="cursor-text whitespace-nowrap" onDoubleClick={() => setIsEditing(true)}>
					{nodeData.label}
				</span>
			)}
		</div>
	);
}
