import type { Position } from "@xyflow/react";

type HandlePosition = "top" | "bottom" | "left" | "right";

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
	bottom: "bottom" as Position,
	left: "left" as Position,
	right: "right" as Position,
};

/** Default node dimensions when width/height are unknown */
const DEFAULT_NODE_WIDTH = 140;
const DEFAULT_NODE_HEIGHT = 50;

/**
 * Given source and target node positions/sizes, determines the optimal
 * handle pair (top/bottom/left/right) to minimize path length and avoid
 * edges crossing through nodes.
 */
export function getSmartHandlePair(source: NodeRect, target: NodeRect): HandlePair {
	const sourceCx = source.x + source.width / 2;
	const sourceCy = source.y + source.height / 2;
	const targetCx = target.x + target.width / 2;
	const targetCy = target.y + target.height / 2;

	const dx = targetCx - sourceCx;
	const dy = targetCy - sourceCy;

	let sourcePos: HandlePosition;
	let targetPos: HandlePosition;

	// Determine primary axis based on relative position
	if (Math.abs(dx) > Math.abs(dy)) {
		// Horizontal: source on the side closer to target, target on opposite side
		if (dx > 0) {
			sourcePos = "right";
			targetPos = "left";
		} else {
			sourcePos = "left";
			targetPos = "right";
		}
	} else {
		// Vertical: source below/above depending on direction
		if (dy > 0) {
			sourcePos = "bottom";
			targetPos = "top";
		} else {
			sourcePos = "top";
			targetPos = "bottom";
		}
	}

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

/** Checks whether an edge between source and target already exists. */
export function isDuplicateEdge(
	edges: ReadonlyArray<{ source: string; target: string }>,
	sourceId: string,
	targetId: string,
): boolean {
	return edges.some((e) => e.source === sourceId && e.target === targetId);
}

/** Checks whether source and target are the same node. */
export function isSelfLoop(sourceId: string, targetId: string): boolean {
	return sourceId === targetId;
}

export { POSITION_MAP, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT };
export type { HandlePosition, NodeRect };
