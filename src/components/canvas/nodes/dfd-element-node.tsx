import type { NodeProps } from "@xyflow/react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
	getComponentByType,
	getIconComponent,
	getShapeForType,
	type ShapeCategory,
} from "@/lib/component-library";
import { cn } from "@/lib/utils";
import type { DfdNodeData } from "@/stores/canvas-store";
import { useCanvasStore } from "@/stores/canvas-store";
import { useModelStore } from "@/stores/model-store";
import { NodeHandles } from "./shared-handles";
import { ThreatBadge, useThreatCount } from "./threat-badge";

/**
 * Convert a hex color (#rrggbb) + opacity (0-1) to an rgba string.
 */
function hexToRgba(hex: string, opacity: number): string {
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** Shape CSS classes driven by the ShapeCategory */
function shapeClass(shape: ShapeCategory): string {
	switch (shape) {
		case "database":
			return "border-y-2";
		case "rect":
			return "border-2";
		case "hexagon":
			return "";
		default:
			// rounded
			return "rounded-2xl border-2";
	}
}

/**
 * Resolve the lucide icon component for a node.
 * Priority: subtype library icon > component type icon > direct icon field > no icon.
 */
function resolveIcon(elementType: string, subtype?: string, icon?: string) {
	if (subtype) {
		// Check if parent component has this subtype defined
		const parentComp = getComponentByType(elementType);
		const subtypeDef = parentComp?.subtypes?.find((st) => st.id === subtype);
		if (subtypeDef) return getIconComponent(subtypeDef.icon);
		// Fall back to looking up subtype as a component ID
		const comp = getComponentByType(subtype);
		if (comp) return getIconComponent(comp.icon);
	}
	// Try the component type's default icon
	const comp = getComponentByType(elementType);
	if (comp) return getIconComponent(comp.icon);
	// Fall back to direct icon field
	if (icon) {
		return getIconComponent(icon);
	}
	return undefined;
}

export function DfdElementNode({ id, data, selected }: NodeProps) {
	const nodeData = data as DfdNodeData;
	const [isEditing, setIsEditing] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const threatCount = useThreatCount(id);

	// Glow when a connected edge is selected
	const connectedToSelectedEdge = useCanvasStore((s) =>
		s.edges.some((e) => e.selected && (e.source === id || e.target === id)),
	);

	const shape = getShapeForType(nodeData.elementType);
	const Icon = resolveIcon(nodeData.elementType, nodeData.subtype, nodeData.icon);

	const fillColor = nodeData.elementFillColor as string | undefined;
	const strokeColor = nodeData.elementStrokeColor as string | undefined;
	const fillOpacity = (nodeData.elementFillOpacity as number | undefined) ?? 0.15;
	const strokeOpacity = (nodeData.elementStrokeOpacity as number | undefined) ?? 1.0;

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
			if (trimmed && trimmed !== nodeData.label) {
				useModelStore.getState().updateElement(id, { name: trimmed });
				syncNodeLabel(id, trimmed);
			}
			setIsEditing(false);
		},
		[id, nodeData.label],
	);

	const isHexagon = shape === "hexagon";

	const hexBorderColor = strokeColor
		? hexToRgba(strokeColor, strokeOpacity)
		: selected
			? "hsl(var(--tf-signal))"
			: "hsl(var(--border))";
	const hexFillColor = fillColor ? hexToRgba(fillColor, fillOpacity) : "hsl(var(--card))";

	const innerContent = (
		<>
			<NodeHandles />

			<div className="text-center">
				{isEditing ? (
					<input
						ref={inputRef}
						defaultValue={nodeData.label}
						autoFocus
						className="w-full bg-transparent text-center text-sm font-medium text-foreground outline-none"
						onBlur={(e) => commitLabel(e.target.value)}
						onKeyDown={(e) => {
							e.stopPropagation();
							if (e.key === "Enter") commitLabel(e.currentTarget.value);
							if (e.key === "Escape") setIsEditing(false);
						}}
					/>
				) : (
					<div
						className="flex items-center justify-center gap-1.5 text-sm font-medium text-foreground cursor-text"
						onDoubleClick={() => setIsEditing(true)}
					>
						{Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
						<span>{nodeData.label}</span>
					</div>
				)}
				{nodeData.trustZone && (
					<div className="mt-0.5 text-[10px] text-muted-foreground">{nodeData.trustZone}</div>
				)}
				{nodeData.technologies.length > 0 && (
					<div className="mt-1 flex flex-wrap justify-center gap-0.5">
						{nodeData.technologies.map((tech) => (
							<span
								key={tech}
								className="rounded bg-secondary px-1 py-px text-[9px] text-muted-foreground"
							>
								{tech}
							</span>
						))}
					</div>
				)}
			</div>

			{threatCount > 0 && <ThreatBadge count={threatCount} />}
		</>
	);

	if (isHexagon) {
		const hexClip = "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";

		return (
			<div
				data-testid={`node-${id}`}
				className="relative"
				style={{
					filter:
						connectedToSelectedEdge && !selected
							? "drop-shadow(0 0 6px hsl(var(--tf-signal) / 0.3)) drop-shadow(0 4px 3px rgba(0,0,0,0.07))"
							: "drop-shadow(0 4px 3px rgba(0,0,0,0.07)) drop-shadow(0 2px 2px rgba(0,0,0,0.06))",
				}}
			>
				{/* Hexagonal fill background */}
				<div
					className="absolute inset-0"
					style={{ clipPath: hexClip, backgroundColor: hexFillColor }}
				/>
				{/* Hexagonal stroke via SVG — CSS border doesn't follow clip-path in WebKit */}
				<svg
					className="absolute inset-0 h-full w-full overflow-visible"
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					<polygon
						points="25,0 75,0 100,50 75,100 25,100 0,50"
						fill="none"
						stroke={hexBorderColor}
						strokeWidth="2"
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
				{/* Content — positioned above the fill and stroke layers */}
				<div
					className={cn(
						"group relative flex min-w-[140px] items-center justify-center px-8 py-3 transition-colors",
					)}
				>
					{innerContent}
				</div>
			</div>
		);
	}

	return (
		<div
			data-testid={`node-${id}`}
			className={cn(
				"group relative flex min-w-[140px] items-center justify-center bg-card px-4 py-3 shadow-md transition-colors",
				shapeClass(shape),
				!hasCustomColors && (selected ? "border-tf-signal shadow-tf-signal/20" : "border-border"),
				hasCustomColors && selected && "ring-2 ring-tf-signal ring-offset-1 ring-offset-background",
				connectedToSelectedEdge && !selected && "ring-2 ring-tf-signal/30",
			)}
			style={hasCustomColors ? customStyle : undefined}
		>
			{innerContent}
		</div>
	);
}

function syncNodeLabel(elementId: string, name: string) {
	const nodes = useCanvasStore.getState().nodes;
	const updatedNodes = nodes.map((n) =>
		n.id === elementId ? { ...n, data: { ...n.data, label: name } } : n,
	);
	useCanvasStore.setState({ nodes: updatedNodes });
}
