import { render, screen } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import type { DfdNodeData } from "@/stores/canvas-store";
import { DfdElementNode } from "./dfd-element-node";

// `Handle` only needs to render something inert here — this file asserts on the wrapper's
// ancestry, not on handle visibility (covered by shared-handles.test.tsx).
vi.mock("@xyflow/react", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@xyflow/react")>();
	return {
		...actual,
		Handle: ({ id }: { id: string }) => <div data-testid={`handle-${id}`} />,
	};
});

function makeProps(elementType: string): NodeProps {
	const data: DfdNodeData = {
		label: "Test Element",
		elementType,
		trustZone: "",
		description: "",
		technologies: [],
	};
	return {
		id: "n1",
		data,
		type: "dfdElement",
		dragging: false,
		zIndex: 0,
		selectable: true,
		deletable: true,
		selected: false,
		draggable: true,
		isConnectable: true,
		positionAbsoluteX: 0,
		positionAbsoluteY: 0,
	};
}

describe("DfdElementNode group ancestor", () => {
	it("wraps the rounded/rect shape branch's handles in a .group ancestor", () => {
		// "generic" resolves to the default "rounded" shape — the non-hexagon branch.
		render(<DfdElementNode {...makeProps("generic")} />);

		const handle = screen.getByTestId("handle-top-target");
		expect(handle.closest(".group")).not.toBeNull();
	});

	it("wraps the hexagon shape branch's handles in a .group ancestor", () => {
		// "load_balancer" is defined with shape: "hexagon" in the component library.
		render(<DfdElementNode {...makeProps("load_balancer")} />);

		const handle = screen.getByTestId("handle-top-target");
		expect(handle.closest(".group")).not.toBeNull();
	});
});
