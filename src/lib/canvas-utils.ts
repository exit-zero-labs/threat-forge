import type { Position } from "@xyflow/react";

type HandlePosition =
	| "top"
	| "top-right"
	| "right"
	| "bottom-right"
	| "bottom"
	| "bottom-left"
	| "left"
	| "top-left";

interface NodeRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface HandlePair {
	sourceHandle: string;
	targetHandle: string;
}

const POSITION_MAP: Record<HandlePosition, Position> = {
	top: "top" as Position,
	"top-right": "top" as Position,
	right: "right" as Position,
	"bottom-right": "bottom" as Position,
	bottom: "bottom" as Position,
	"bottom-left": "bottom" as Position,
	left: "left" as Position,
	"top-left": "top" as Position,
};

/** Default node dimensions when width/height are unknown */
const DEFAULT_NODE_WIDTH = 140;
const DEFAULT_NODE_HEIGHT = 50;

/** Ordered octant handles: index 0 = right (0°), each +1 = +45° clockwise. */
const OCTANT_HANDLES: HandlePosition[] = [
	"right",
	"bottom-right",
	"bottom",
	"bottom-left",
	"left",
	"top-left",
	"top",
	"top-right",
];

const OPPOSITE_MAP: Record<HandlePosition, HandlePosition> = {
	top: "bottom",
	"top-right": "bottom-left",
	right: "left",
	"bottom-right": "top-left",
	bottom: "top",
	"bottom-left": "top-right",
	left: "right",
	"top-left": "bottom-right",
};

/** Maps an angle (radians, from atan2) to the nearest octant handle position. */
export function angleToHandlePosition(angleRad: number): HandlePosition {
	const degrees = angleRad * (180 / Math.PI);
	const normalized = ((degrees % 360) + 360) % 360;
	const octant = Math.floor((normalized + 22.5) / 45) % 8;
	return OCTANT_HANDLES[octant];
}

/** Returns the opposite handle position (e.g. top-right → bottom-left). */
export function oppositeHandle(pos: HandlePosition): HandlePosition {
	return OPPOSITE_MAP[pos];
}

/**
 * Given source and target node positions/sizes, determines the optimal
 * handle pair using 8-octant angle-based routing for precise connector paths.
 */
export function getSmartHandlePair(source: NodeRect, target: NodeRect): HandlePair {
	const sourceCx = source.x + source.width / 2;
	const sourceCy = source.y + source.height / 2;
	const targetCx = target.x + target.width / 2;
	const targetCy = target.y + target.height / 2;

	const dx = targetCx - sourceCx;
	const dy = targetCy - sourceCy;

	const angle = Math.atan2(dy, dx);
	const sourcePos = angleToHandlePosition(angle);
	const targetPos = oppositeHandle(sourcePos);

	return {
		sourceHandle: `${sourcePos}-source`,
		targetHandle: `${targetPos}-target`,
	};
}

/**
 * Build a NodeRect from a ReactFlow node, using default dimensions if not present.
 */
export function nodeToRect(node: {
	position: { x: number; y: number };
	measured?: { width?: number; height?: number };
	width?: number;
	height?: number;
}): NodeRect {
	return {
		x: node.position.x,
		y: node.position.y,
		width: node.measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH,
		height: node.measured?.height ?? node.height ?? DEFAULT_NODE_HEIGHT,
	};
}

/** Checks whether an edge between source and target already exists.
 *  For self-loops, also checks handle pairs to allow multiple self-loops with different handles. */
export function isDuplicateEdge(
	edges: ReadonlyArray<{
		source: string;
		target: string;
		sourceHandle?: string | null;
		targetHandle?: string | null;
	}>,
	sourceId: string,
	targetId: string,
	sourceHandle?: string,
	targetHandle?: string,
): boolean {
	return edges.some(
		(e) =>
			e.source === sourceId &&
			e.target === targetId &&
			(sourceId !== targetId ||
				(e.sourceHandle === sourceHandle && e.targetHandle === targetHandle)),
	);
}

/** Checks whether source and target are the same node. */
export function isSelfLoop(sourceId: string, targetId: string): boolean {
	return sourceId === targetId;
}

/** Returns a default handle pair for self-loop edges (right-source → top-target). */
export function getSelfLoopHandlePair(): HandlePair {
	return {
		sourceHandle: "right-source",
		targetHandle: "top-target",
	};
}

export { POSITION_MAP, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT };
export type { HandlePosition, NodeRect };
