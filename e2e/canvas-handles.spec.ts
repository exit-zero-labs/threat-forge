import { addPaletteItem, createModel, expect, test } from "./fixtures";

/**
 * Regression coverage for #134: connection handles must be hidden idle and revealed on node
 * hover using a cascade-correct (non-`!important`) utility combination, and must stay visible
 * on every node — not just the one under the pointer — for the duration of a connection drag.
 */
test.describe("Canvas Connection Handles", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/app");
		await createModel(page);
	});

	test("handle opacity is 0 idle and 1 on node hover", async ({ page }) => {
		await addPaletteItem(page, "palette-item-web-server");

		const node = page.locator("[data-testid^='node-']").first();
		const handle = node.locator(".react-flow__handle").first();

		await expect(handle).toHaveCSS("opacity", "0");

		await node.hover();
		await expect(handle).toHaveCSS("opacity", "1");

		// Moving away drops the hover-driven visibility back to idle.
		await page.mouse.move(0, 0);
		await expect(handle).toHaveCSS("opacity", "0");
	});

	test("handles on an unhovered node stay visible for the duration of a connection drag", async ({
		page,
	}) => {
		await addPaletteItem(page, "palette-item-web-server");
		await addPaletteItem(page, "palette-item-sql-database");

		const nodes = page.locator("[data-testid^='node-']");
		const sourceNode = nodes.first();
		const targetNode = nodes.nth(1);

		// Both palette double-clicks drop their node at the canvas center, so the two nodes
		// land stacked on top of each other. Drag the second one clear of the first via
		// ReactFlow's own node-drag gesture so the connection-drag gesture below cannot land
		// on it by coincidence — that would make the "unhovered" premise false.
		const targetBoxBefore = await targetNode.boundingBox();
		if (!targetBoxBefore) throw new Error("target node has no bounding box");
		await page.mouse.move(
			targetBoxBefore.x + targetBoxBefore.width / 2,
			targetBoxBefore.y + targetBoxBefore.height / 2,
		);
		await page.mouse.down();
		await page.mouse.move(targetBoxBefore.x + 400, targetBoxBefore.y + 250, { steps: 10 });
		await page.mouse.up();

		const targetBoxAfter = await targetNode.boundingBox();
		if (!targetBoxAfter) throw new Error("target node has no bounding box after drag");
		expect(targetBoxAfter.x).toBeGreaterThan(targetBoxBefore.x + 200);

		// A handle on the node the drag starts from.
		const sourceHandle = sourceNode.locator(".react-flow__handle").first();
		// A handle on the OTHER (now clearly separated, never hovered) node — used to prove
		// visibility is driven by the global `isConnecting` state, not by that node's own hover.
		const otherHandle = targetNode.locator(".react-flow__handle").nth(3);

		await expect(otherHandle).toHaveCSS("opacity", "0");

		const box = await sourceHandle.boundingBox();
		if (!box) throw new Error("source handle has no bounding box");

		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		// Real pointer movement away from the source handle, staying clear of the target
		// node — this is what ReactFlow's onConnectStart/connection-line gesture requires to
		// enter connecting state, not a sleep or a store write.
		await page.mouse.move(box.x + 60, box.y + 40, { steps: 10 });

		await expect(otherHandle).toHaveCSS("opacity", "1");

		// Release over empty canvas to cancel the connection instead of creating an edge, so
		// the gesture does not leak into other tests via a persisted edge/document state.
		await page.mouse.up();
	});
});
