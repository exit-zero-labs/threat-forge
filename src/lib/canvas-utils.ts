import type { Position } from "@xyflow/react";

type HandlePosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "left" | "right";

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
	"top-left": "top" as Position,
	"top-right": "top" as Position,
	"bottom-left": "bottom" as Position,
	"bottom-right": "bottom" as Position,
	left: "left" as Position,
	right: "right" as Position,
};

/** Default node dimensions when width/height are unknown */
const DEFAULT_NODE_WIDTH = 140;
const DEFAULT_NODE_HEIGHT = 50;

/**
 * Given source and target node positions/sizes, determines the optimal
 * handle pair from the 6 available handles (left, right, top-left, top-right,
 * bottom-left, bottom-right) to minimize path length.
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

	if (Math.abs(dx) > Math.abs(dy)) {
		// Primarily horizontal — use left/right midpoints
		if (dx > 0) {
			sourcePos = "right";
			targetPos = "left";
		} else {
			sourcePos = "left";
			targetPos = "right";
		}
	} else {
		// Primarily vertical — use corner handles
		if (dy > 0) {
			// Target is below
			sourcePos = dx >= 0 ? "bottom-right" : "bottom-left";
			targetPos = dx >= 0 ? "top-left" : "top-right";
		} else {
			// Target is above
			sourcePos = dx >= 0 ? "top-right" : "top-left";
			targetPos = dx >= 0 ? "bottom-left" : "bottom-right";
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
