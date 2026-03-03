import { describe, expect, it } from "vitest";
import {
	angleToHandlePosition,
	getSelfLoopHandlePair,
	getSmartHandlePair,
	isDuplicateEdge,
	isSelfLoop,
	nodeToRect,
	oppositeHandle,
} from "./canvas-utils";

describe("getSmartHandlePair", () => {
	it("returns right-source → left-target when target is to the right", () => {
		const result = getSmartHandlePair(
			{ x: 0, y: 0, width: 140, height: 50 },
			{ x: 300, y: 0, width: 140, height: 50 },
		);
		expect(result.sourceHandle).toBe("right-source");
		expect(result.targetHandle).toBe("left-target");
	});

	it("returns left-source → right-target when target is to the left", () => {
		const result = getSmartHandlePair(
			{ x: 300, y: 0, width: 140, height: 50 },
			{ x: 0, y: 0, width: 140, height: 50 },
		);
		expect(result.sourceHandle).toBe("left-source");
		expect(result.targetHandle).toBe("right-target");
	});

	it("returns bottom-source → top-target when target is below", () => {
		const result = getSmartHandlePair(
			{ x: 0, y: 0, width: 140, height: 50 },
			{ x: 0, y: 300, width: 140, height: 50 },
		);
		expect(result.sourceHandle).toBe("bottom-source");
		expect(result.targetHandle).toBe("top-target");
	});

	it("returns top-source → bottom-target when target is above", () => {
		const result = getSmartHandlePair(
			{ x: 0, y: 300, width: 140, height: 50 },
			{ x: 0, y: 0, width: 140, height: 50 },
		);
		expect(result.sourceHandle).toBe("top-source");
		expect(result.targetHandle).toBe("bottom-target");
	});

	it("uses diagonal handle when dx equals dy (bottom-right octant)", () => {
		const result = getSmartHandlePair(
			{ x: 0, y: 0, width: 100, height: 100 },
			{ x: 200, y: 200, width: 100, height: 100 },
		);
		// dx === dy → 45° angle → bottom-right octant
		expect(result.sourceHandle).toBe("bottom-right-source");
		expect(result.targetHandle).toBe("top-left-target");
	});

	it("returns bottom-left → top-right when target is below-left", () => {
		const result = getSmartHandlePair(
			{ x: 300, y: 0, width: 100, height: 100 },
			{ x: 0, y: 300, width: 100, height: 100 },
		);
		expect(result.sourceHandle).toBe("bottom-left-source");
		expect(result.targetHandle).toBe("top-right-target");
	});

	it("returns top-right → bottom-left when target is above-right", () => {
		const result = getSmartHandlePair(
			{ x: 0, y: 300, width: 100, height: 100 },
			{ x: 300, y: 0, width: 100, height: 100 },
		);
		expect(result.sourceHandle).toBe("top-right-source");
		expect(result.targetHandle).toBe("bottom-left-target");
	});

	it("returns top-left → bottom-right when target is above-left", () => {
		const result = getSmartHandlePair(
			{ x: 300, y: 300, width: 100, height: 100 },
			{ x: 0, y: 0, width: 100, height: 100 },
		);
		expect(result.sourceHandle).toBe("top-left-source");
		expect(result.targetHandle).toBe("bottom-right-target");
	});
});

describe("angleToHandlePosition", () => {
	it("maps 0 radians to right", () => {
		expect(angleToHandlePosition(0)).toBe("right");
	});

	it("maps π/2 to bottom (y+ is down)", () => {
		expect(angleToHandlePosition(Math.PI / 2)).toBe("bottom");
	});

	it("maps -π/2 to top", () => {
		expect(angleToHandlePosition(-Math.PI / 2)).toBe("top");
	});

	it("maps π/4 to bottom-right", () => {
		expect(angleToHandlePosition(Math.PI / 4)).toBe("bottom-right");
	});
});

describe("oppositeHandle", () => {
	it("maps top to bottom", () => {
		expect(oppositeHandle("top")).toBe("bottom");
	});

	it("maps top-right to bottom-left", () => {
		expect(oppositeHandle("top-right")).toBe("bottom-left");
	});

	it("maps right to left", () => {
		expect(oppositeHandle("right")).toBe("left");
	});

	it("maps bottom-left to top-right", () => {
		expect(oppositeHandle("bottom-left")).toBe("top-right");
	});
});

describe("nodeToRect", () => {
	it("uses measured dimensions when available", () => {
		const rect = nodeToRect({
			position: { x: 10, y: 20 },
			measured: { width: 200, height: 80 },
		});
		expect(rect).toEqual({ x: 10, y: 20, width: 200, height: 80 });
	});

	it("falls back to node width/height", () => {
		const rect = nodeToRect({
			position: { x: 5, y: 10 },
			width: 300,
			height: 100,
		});
		expect(rect).toEqual({ x: 5, y: 10, width: 300, height: 100 });
	});

	it("uses defaults when no dimensions provided", () => {
		const rect = nodeToRect({
			position: { x: 0, y: 0 },
		});
		expect(rect).toEqual({ x: 0, y: 0, width: 140, height: 50 });
	});
});

describe("isDuplicateEdge", () => {
	const edges = [
		{ source: "a", target: "b" },
		{ source: "b", target: "c" },
	];

	it("returns true for existing edge", () => {
		expect(isDuplicateEdge(edges, "a", "b")).toBe(true);
	});

	it("returns false for reverse direction", () => {
		expect(isDuplicateEdge(edges, "b", "a")).toBe(false);
	});

	it("returns false for non-existent edge", () => {
		expect(isDuplicateEdge(edges, "a", "c")).toBe(false);
	});

	it("returns false for empty edges array", () => {
		expect(isDuplicateEdge([], "a", "b")).toBe(false);
	});

	it("detects duplicate self-loops with same handles", () => {
		const selfEdges = [
			{ source: "a", target: "a", sourceHandle: "right-source", targetHandle: "top-target" },
		];
		expect(isDuplicateEdge(selfEdges, "a", "a", "right-source", "top-target")).toBe(true);
	});

	it("allows self-loops with different handles", () => {
		const selfEdges = [
			{ source: "a", target: "a", sourceHandle: "right-source", targetHandle: "top-target" },
		];
		expect(isDuplicateEdge(selfEdges, "a", "a", "bottom-source", "left-target")).toBe(false);
	});
});

describe("isSelfLoop", () => {
	it("returns true when source equals target", () => {
		expect(isSelfLoop("node-1", "node-1")).toBe(true);
	});

	it("returns false when source differs from target", () => {
		expect(isSelfLoop("node-1", "node-2")).toBe(false);
	});
});

describe("getSelfLoopHandlePair", () => {
	it("returns right-source and top-target as defaults", () => {
		const pair = getSelfLoopHandlePair();
		expect(pair.sourceHandle).toBe("right-source");
		expect(pair.targetHandle).toBe("top-target");
	});
});
