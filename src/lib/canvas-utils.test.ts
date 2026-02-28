import { describe, expect, it } from "vitest";
import { getSmartHandlePair, isDuplicateEdge, isSelfLoop, nodeToRect } from "./canvas-utils";

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

	it("returns bottom-right corner handles when target is directly below", () => {
		const result = getSmartHandlePair(
			{ x: 0, y: 0, width: 140, height: 50 },
			{ x: 0, y: 300, width: 140, height: 50 },
		);
		// dx === 0, dy > 0, dx >= 0 → bottom-right-source / top-left-target
		expect(result.sourceHandle).toBe("bottom-right-source");
		expect(result.targetHandle).toBe("top-left-target");
	});

	it("returns top-right corner handles when target is directly above", () => {
		const result = getSmartHandlePair(
			{ x: 0, y: 300, width: 140, height: 50 },
			{ x: 0, y: 0, width: 140, height: 50 },
		);
		// dx === 0, dy < 0, dx >= 0 → top-right-source / bottom-left-target
		expect(result.sourceHandle).toBe("top-right-source");
		expect(result.targetHandle).toBe("bottom-left-target");
	});

	it("uses corner handles when dx equals dy (vertical tie-break)", () => {
		const result = getSmartHandlePair(
			{ x: 0, y: 0, width: 100, height: 100 },
			{ x: 200, y: 200, width: 100, height: 100 },
		);
		// dx === dy, both are 200, Math.abs(dx) > Math.abs(dy) is false,
		// falls through to vertical: dy > 0, dx >= 0 → bottom-right-source / top-left-target
		expect(result.sourceHandle).toBe("bottom-right-source");
		expect(result.targetHandle).toBe("top-left-target");
	});

	it("returns bottom-right/top-left when target is below-right", () => {
		const result = getSmartHandlePair(
			{ x: 0, y: 0, width: 100, height: 50 },
			{ x: 50, y: 300, width: 100, height: 50 },
		);
		expect(result.sourceHandle).toBe("bottom-right-source");
		expect(result.targetHandle).toBe("top-left-target");
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
});

describe("isSelfLoop", () => {
	it("returns true when source equals target", () => {
		expect(isSelfLoop("node-1", "node-1")).toBe(true);
	});

	it("returns false when source differs from target", () => {
		expect(isSelfLoop("node-1", "node-2")).toBe(false);
	});
});
