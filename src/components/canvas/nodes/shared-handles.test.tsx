import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// `Handle` is stubbed to a plain element that forwards `id`/`className` so we can assert on
// the exact classes NodeHandles computes, without needing a ReactFlow/store provider tree.
vi.mock("@xyflow/react", () => ({
	Handle: ({ id, className }: { id: string; className?: string }) => (
		<div data-testid={`handle-${id}`} className={className} />
	),
	Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
}));

import { useCanvasInstanceStore } from "@/stores/canvas-instance-store";
import { NodeHandles } from "./shared-handles";

const HANDLE_IDS = [
	"top-target",
	"top-source",
	"bottom-target",
	"bottom-source",
	"left-target",
	"left-source",
	"right-target",
	"right-source",
	"top-left-target",
	"top-left-source",
	"top-right-target",
	"top-right-source",
	"bottom-left-target",
	"bottom-left-source",
	"bottom-right-target",
	"bottom-right-source",
];

function classTokens(id: string): string[] {
	return (screen.getByTestId(`handle-${id}`).className ?? "").split(/\s+/).filter(Boolean);
}

afterEach(() => {
	useCanvasInstanceStore.setState({ isConnecting: false });
});

describe("NodeHandles", () => {
	it("hides every handle idle with a plain opacity-0 utility (no !important)", () => {
		render(<NodeHandles />);

		for (const id of HANDLE_IDS) {
			const classes = classTokens(id);
			expect(classes).toContain("opacity-0");
			expect(classes).not.toContain("!opacity-0");
			expect(classes).not.toContain("opacity-100");
			expect(classes).not.toContain("!opacity-100");
		}
	});

	it("reveals every handle via a plain group-hover:opacity-100 utility (no !important)", () => {
		render(<NodeHandles />);

		for (const id of HANDLE_IDS) {
			const classes = classTokens(id);
			expect(classes).toContain("group-hover:opacity-100");
			expect(classes).not.toContain("!group-hover:opacity-100");
		}
	});

	it("forces every handle visible with a plain opacity-100 utility while isConnecting", () => {
		render(<NodeHandles />);

		act(() => {
			useCanvasInstanceStore.setState({ isConnecting: true });
		});

		for (const id of HANDLE_IDS) {
			const classes = classTokens(id);
			expect(classes).toContain("opacity-100");
			expect(classes).not.toContain("!opacity-100");
			// The idle classes must not linger once isConnecting takes over — they would
			// otherwise tie in specificity with the connecting class on the same element.
			expect(classes).not.toContain("opacity-0");
			expect(classes).not.toContain("group-hover:opacity-100");
		}
	});

	it("preserves pointer targeting, size, color, and transition classes in both states", () => {
		render(<NodeHandles />);
		const idleClasses = classTokens("top-target");

		act(() => {
			useCanvasInstanceStore.setState({ isConnecting: true });
		});
		const connectingClasses = classTokens("top-target");

		for (const shared of [
			"!w-1.5",
			"!h-1.5",
			"!border-none",
			"!bg-muted-foreground",
			"!pointer-events-auto",
			"transition-opacity",
			"duration-150",
		]) {
			expect(idleClasses).toContain(shared);
			expect(connectingClasses).toContain(shared);
		}
	});
});
