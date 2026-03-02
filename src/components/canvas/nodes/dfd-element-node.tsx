import type { NodeProps } from "@xyflow/react";
import { useCallback, useRef, useState } from "react";
import { getComponentBySubtype, getIconComponent } from "@/lib/component-library";
import { cn } from "@/lib/utils";
import type { DfdNodeData } from "@/stores/canvas-store";
import { useCanvasStore } from "@/stores/canvas-store";
import { useModelStore } from "@/stores/model-store";
import { NodeHandles } from "./shared-handles";
import { ThreatBadge, useThreatCount } from "./threat-badge";

/** Shape CSS classes driven by the base DFD element type */
function shapeClass(elementType: string): string {
	switch (elementType) {
		case "data_store":
			return "border-y-2";
		case "external_entity":
			return "border-2";
		default:
			// process
			return "rounded-2xl border-2";
	}
}

/**
 * Resolve the lucide icon component for a node.
 * Priority: subtype library icon > direct icon field > no icon.
 * If both subtype and icon are set, the subtype's library icon wins.
 */
function resolveIcon(subtype?: string, icon?: string) {
	if (subtype) {
		const comp = getComponentBySubtype(subtype);
		if (comp) return getIconComponent(comp.icon);
	}
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

	const Icon = resolveIcon(nodeData.subtype, nodeData.icon);

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

	return (
		<div
			data-testid={`node-${id}`}
			className={cn(
				"group relative flex min-w-[140px] items-center justify-center bg-card px-4 py-3 shadow-md transition-colors",
				shapeClass(nodeData.elementType),
				selected ? "border-tf-signal shadow-tf-signal/20" : "border-border",
			)}
		>
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
