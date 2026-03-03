import { fireEvent, render, screen } from "@testing-library/react";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import {
	buildEdgeMenuItems,
	buildNodeMenuItems,
	CanvasContextMenu,
	type ContextMenuItem,
} from "./canvas-context-menu";

function makeItems(overrides?: Partial<ContextMenuItem>[]): ContextMenuItem[] {
	return [
		{ label: "Edit", icon: Pencil, onClick: vi.fn(), ...overrides?.[0] },
		{ label: "Duplicate", icon: Copy, onClick: vi.fn(), ...overrides?.[1] },
		{ label: "Delete", icon: Trash2, onClick: vi.fn(), variant: "danger", ...overrides?.[2] },
	];
}

describe("CanvasContextMenu", () => {
	it("renders all menu items", () => {
		const items = makeItems();
		render(<CanvasContextMenu x={100} y={200} items={items} onClose={vi.fn()} />);

		expect(screen.getByText("Edit")).toBeInTheDocument();
		expect(screen.getByText("Duplicate")).toBeInTheDocument();
		expect(screen.getByText("Delete")).toBeInTheDocument();
	});

	it("calls onClick and onClose when item is clicked", () => {
		const items = makeItems();
		const onClose = vi.fn();
		render(<CanvasContextMenu x={0} y={0} items={items} onClose={onClose} />);

		fireEvent.click(screen.getByText("Edit"));

		expect(items[0].onClick).toHaveBeenCalledOnce();
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("closes on Escape key", () => {
		const onClose = vi.fn();
		render(<CanvasContextMenu x={0} y={0} items={makeItems()} onClose={onClose} />);

		fireEvent.keyDown(document, { key: "Escape" });

		expect(onClose).toHaveBeenCalledOnce();
	});

	it("closes on click outside", () => {
		const onClose = vi.fn();
		render(<CanvasContextMenu x={0} y={0} items={makeItems()} onClose={onClose} />);

		fireEvent.mouseDown(document.body);

		expect(onClose).toHaveBeenCalledOnce();
	});

	it("does not close on click inside the menu", () => {
		const onClose = vi.fn();
		render(<CanvasContextMenu x={0} y={0} items={makeItems()} onClose={onClose} />);

		// Click on a menu button — onClick fires + onClose fires once (from the item click handler)
		fireEvent.mouseDown(screen.getByText("Edit"));
		// mouseDown inside menu should NOT trigger the click-outside handler
		// onClose should still be 0 because mouseDown on a child is inside the ref
		expect(onClose).not.toHaveBeenCalled();
	});
});

describe("buildNodeMenuItems", () => {
	it("returns 4 items with correct labels", () => {
		const items = buildNodeMenuItems({
			onEditProperties: vi.fn(),
			onDelete: vi.fn(),
			onDuplicate: vi.fn(),
			onViewThreats: vi.fn(),
		});

		expect(items).toHaveLength(4);
		expect(items.map((i) => i.label)).toEqual([
			"Edit Properties",
			"View Threats",
			"Duplicate",
			"Delete",
		]);
	});

	it("marks Delete as danger variant", () => {
		const items = buildNodeMenuItems({
			onEditProperties: vi.fn(),
			onDelete: vi.fn(),
			onDuplicate: vi.fn(),
			onViewThreats: vi.fn(),
		});
		const deleteItem = items.find((i) => i.label === "Delete");
		expect(deleteItem?.variant).toBe("danger");
	});

	it("excludes View Threats for text annotations", () => {
		const items = buildNodeMenuItems({
			onEditProperties: vi.fn(),
			onDelete: vi.fn(),
			onDuplicate: vi.fn(),
			onViewThreats: vi.fn(),
			isTextAnnotation: true,
		});

		expect(items).toHaveLength(3);
		expect(items.map((i) => i.label)).toEqual(["Edit Properties", "Duplicate", "Delete"]);
	});
});

describe("buildEdgeMenuItems", () => {
	it("returns 3 items with correct labels", () => {
		const items = buildEdgeMenuItems({
			onEditProperties: vi.fn(),
			onDelete: vi.fn(),
			onReverseDirection: vi.fn(),
		});

		expect(items).toHaveLength(3);
		expect(items.map((i) => i.label)).toEqual(["Edit Properties", "Reverse Direction", "Delete"]);
	});
});
