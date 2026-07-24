import { addPaletteItem, createModel, expect, test } from "./fixtures";

/**
 * Regression coverage for #213: every DFD connection point renders an overlapping
 * source/target handle pair at identical coordinates. Whichever one paints on top wins the
 * browser's `elementFromPoint` hit test at that pixel — for both directions, since both
 * points use the same DOM order — so a real pointer drag that starts on one node's source
 * handle and releases over another node's target handle at the same corner/cardinal
 * position never resolves to the target underneath and no edge is created.
 *
 * Covers both cross-node connection directions, a same-node self-loop (which drops onto a
 * different overlapping point but hits the identical collision), and re-targeting each side
 * of an existing edge's reconnect anchors (target and source) onto an overlapping handle.
 * Every connection point renders `target` before `source` in the DOM, so `source` always
 * paints on top by default: the source-suppression branch (exercised by tests 1-4) is what
 * makes a source→target drop resolve correctly and is directly proven by connection
 * success. The target-suppression branch only matters for a drag that starts from a
 * `target`-typed origin — reachable only via the source-side reconnect anchor (test 5) —
 * and dropping onto the resulting source handle would already succeed from DOM order alone,
 * so that test also asserts the suppression's CSS effect directly via `getComputedStyle`
 * mid-drag rather than relying on connection outcome as its oracle.
 *
 * These tests perform a real mouse drag (move → down → move → up) between two separated
 * nodes' handles, located by their `data-nodeid`/`data-handleid` attributes — no synthetic
 * DOM dispatch, no direct Zustand store writes, no mocked callbacks.
 */
test.describe("Canvas pointer connections", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/app");
		await createModel(page);
	});

	/**
	 * Adds two nodes and drags the second clear of the first so they no longer overlap.
	 *
	 * Separates the nodes on a *purely horizontal* axis, away from the bottom-right corner.
	 * A diagonal separation risks landing the destination node's handle under the MiniMap
	 * panel, which sits above the canvas in paint order: `elementFromPoint` at the drop
	 * point would then hit the MiniMap instead of a handle, and ReactFlow silently falls
	 * back to its distance-based closest-handle match — which already prefers the opposite
	 * handle type — masking the exact hit-testing collision (#213) this test exists to
	 * catch.
	 */
	async function createSeparatedNodes(page: import("@playwright/test").Page) {
		await addPaletteItem(page, "palette-item-web-server");
		await addPaletteItem(page, "palette-item-sql-database");

		const nodes = page.locator("[data-testid^='node-']");
		const firstNode = nodes.first();
		const secondNode = nodes.nth(1);

		// Both palette double-clicks drop their node at the canvas center, so the two nodes
		// land stacked on top of each other. Drag the second one clear of the first via
		// ReactFlow's own node-drag gesture (mirrors canvas-handles.spec.ts) so the two
		// nodes have distinct, non-overlapping handle positions for the connection gesture.
		const secondBoxBefore = await secondNode.boundingBox();
		if (!secondBoxBefore) throw new Error("second node has no bounding box");
		await page.mouse.move(
			secondBoxBefore.x + secondBoxBefore.width / 2,
			secondBoxBefore.y + secondBoxBefore.height / 2,
		);
		await page.mouse.down();
		await page.mouse.move(secondBoxBefore.x + 450, secondBoxBefore.y, { steps: 10 });
		await page.mouse.up();

		const secondBoxAfter = await secondNode.boundingBox();
		if (!secondBoxAfter) throw new Error("second node has no bounding box after drag");
		expect(secondBoxAfter.x).toBeGreaterThan(secondBoxBefore.x + 150);

		// Sanity-check the two handles this test exercises are clear of the MiniMap panel,
		// so the gesture below genuinely exercises direct hit-testing rather than the
		// distance-based fallback.
		const minimapBox = await page.locator(".react-flow__minimap").boundingBox();
		const firstId = (await firstNode.getAttribute("data-testid"))?.replace(/^node-/, "");
		const secondId = (await secondNode.getAttribute("data-testid"))?.replace(/^node-/, "");
		if (!firstId || !secondId) throw new Error("node ids not found");
		if (minimapBox) {
			for (const [nodeId, handleId] of [
				[firstId, "right-target"],
				[secondId, "left-target"],
			] as const) {
				const box = await page
					.locator(`[data-nodeid="${nodeId}"][data-handleid="${handleId}"]`)
					.boundingBox();
				if (!box) throw new Error(`${handleId} has no bounding box`);
				const overlapsMinimap =
					box.x < minimapBox.x + minimapBox.width &&
					box.x + box.width > minimapBox.x &&
					box.y < minimapBox.y + minimapBox.height &&
					box.y + box.height > minimapBox.y;
				expect(overlapsMinimap).toBe(false);
			}
		}

		return { firstId, secondId };
	}

	/** Drags from one handle's center to another's via real, stepped pointer movement. */
	async function dragHandleToHandle(
		page: import("@playwright/test").Page,
		fromHandle: import("@playwright/test").Locator,
		toHandle: import("@playwright/test").Locator,
	) {
		const fromBox = await fromHandle.boundingBox();
		const toBox = await toHandle.boundingBox();
		if (!fromBox || !toBox) throw new Error("handle has no bounding box");

		await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
		await page.mouse.down();
		await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 10 });
		await page.mouse.up();
	}

	test("dragging from a source handle to an overlapping target handle creates exactly one edge", async ({
		page,
	}) => {
		const { firstId, secondId } = await createSeparatedNodes(page);

		// First node is on the left, second is on the right — first's right-source handle
		// faces second's left-target handle, matching the issue's reproduction steps exactly.
		const fromHandle = page.locator(
			`[data-nodeid="${firstId}"][data-handleid="right-source"]`,
		);
		const toHandle = page.locator(`[data-nodeid="${secondId}"][data-handleid="left-target"]`);

		await dragHandleToHandle(page, fromHandle, toHandle);

		await expect(page.locator(".react-flow__edge")).toHaveCount(1);
		await expect(page.getByLabel(`Edge from ${firstId} to ${secondId}`)).toBeVisible();
	});

	test("dragging the reverse direction from the other node's source handle also creates exactly one edge", async ({
		page,
	}) => {
		const { firstId, secondId } = await createSeparatedNodes(page);

		// Reverse direction, using the same two overlapping connection points: starting the
		// drag from the second node's (left) source handle and releasing over the first
		// node's (right) target handle. Both directions must remain available at every point.
		const fromHandle = page.locator(
			`[data-nodeid="${secondId}"][data-handleid="left-source"]`,
		);
		const toHandle = page.locator(`[data-nodeid="${firstId}"][data-handleid="right-target"]`);

		await dragHandleToHandle(page, fromHandle, toHandle);

		await expect(page.locator(".react-flow__edge")).toHaveCount(1);
		await expect(page.getByLabel(`Edge from ${secondId} to ${firstId}`)).toBeVisible();
	});

	test("dragging from a node's own source handle to another overlapping target handle on itself creates a self-loop edge", async ({
		page,
	}) => {
		await addPaletteItem(page, "palette-item-web-server");
		const node = page.locator("[data-testid^='node-']").first();
		const nodeId = (await node.getAttribute("data-testid"))?.replace(/^node-/, "");
		if (!nodeId) throw new Error("node id not found");

		// Self-loops connect two different cardinal points on the same node
		// (canvas-utils.ts's default self-loop pair is right-source -> top-target), so the
		// drop point still lands on the top point's own overlapping target/source pair —
		// the same hit-testing collision (#213) as the cross-node case above.
		const fromHandle = page.locator(`[data-nodeid="${nodeId}"][data-handleid="right-source"]`);
		const toHandle = page.locator(`[data-nodeid="${nodeId}"][data-handleid="top-target"]`);

		await dragHandleToHandle(page, fromHandle, toHandle);

		await expect(page.locator(".react-flow__edge")).toHaveCount(1);
		await expect(page.getByLabel(`Edge from ${nodeId} to ${nodeId}`)).toBeVisible();
	});

	test("dragging an existing edge's target reconnect anchor onto an overlapping target handle re-targets it without duplicating the edge", async ({
		page,
	}) => {
		const { firstId, secondId } = await createSeparatedNodes(page);

		const fromHandle = page.locator(
			`[data-nodeid="${firstId}"][data-handleid="right-source"]`,
		);
		const initialTarget = page.locator(
			`[data-nodeid="${secondId}"][data-handleid="left-target"]`,
		);
		await dragHandleToHandle(page, fromHandle, initialTarget);
		await expect(page.locator(".react-flow__edge")).toHaveCount(1);

		// ReactFlow renders a small circular reconnect anchor
		// (`.react-flow__edgeupdater-target`) at the edge's current target endpoint; dragging
		// it to a different handle re-targets the edge in place. The new drop point
		// (top-left-target) is itself an overlapping target/source pair on the second node,
		// staying clear of the always-present right panel (unlike the node's other corner/side
		// handles further right), so this exercises the same suppression logic mid-reconnect,
		// not just on initial connect. Dragging this anchor reports `connectingHandleType ===
		// "source"` (the type of the anchor's fixed opposite end) — see the sibling test below
		// for the complementary "target" branch, exercised by the source-side anchor.
		const reconnectAnchor = page.locator(".react-flow__edgeupdater-target");
		const newTarget = page.locator(
			`[data-nodeid="${secondId}"][data-handleid="top-left-target"]`,
		);
		await dragHandleToHandle(page, reconnectAnchor, newTarget);

		// Reconnecting must retarget the existing edge, never add a second one.
		await expect(page.locator(".react-flow__edge")).toHaveCount(1);
		await expect(page.getByLabel(`Edge from ${firstId} to ${secondId}`)).toBeVisible();

		// Verify the persisted model actually recorded the new handle (not just that some
		// edge still renders) by round-tripping through a real save.
		const downloadPromise = page.waitForEvent("download");
		await page.getByTestId("btn-save").click();
		const download = await downloadPromise;
		const readable = await download.createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of readable) {
			chunks.push(chunk as Buffer);
		}
		const content = Buffer.concat(chunks).toString("utf-8");

		expect(content).toContain("target_handle: top-left-target");
		expect(content).not.toContain("target_handle: left-target");
	});

	test("dragging an existing edge's source reconnect anchor onto an overlapping source handle re-targets it without duplicating the edge", async ({
		page,
	}) => {
		const { firstId, secondId } = await createSeparatedNodes(page);

		const fromHandle = page.locator(
			`[data-nodeid="${firstId}"][data-handleid="right-source"]`,
		);
		const initialTarget = page.locator(
			`[data-nodeid="${secondId}"][data-handleid="left-target"]`,
		);
		await dragHandleToHandle(page, fromHandle, initialTarget);
		await expect(page.locator(".react-flow__edge")).toHaveCount(1);

		// The complementary reconnect anchor (`.react-flow__edgeupdater-source`) sits at the
		// edge's current source endpoint. Dragging it reports `connectingHandleType ===
		// "target"` (the type of its fixed opposite end) — the one branch of the pointer-events
		// suppression the sibling test above cannot exercise. Note that source-type handles
		// already paint on top of target-type ones in the DOM (see shared-handles.tsx render
		// order), so — unlike the sibling test — a real drop here would still land on a source
		// handle even without this suppression; the mid-drag `getComputedStyle` check below is
		// what actually proves this branch's CSS effect, since connection success alone would
		// not discriminate it. The new drop point (top-left-source, on the first node) is a
		// different overlapping target/source pair than the edge's current source, staying
		// clear of the minimap and right panel.
		const reconnectAnchor = page.locator(".react-flow__edgeupdater-source");
		const newSource = page.locator(
			`[data-nodeid="${firstId}"][data-handleid="top-left-source"]`,
		);
		const anchorBox = await reconnectAnchor.boundingBox();
		const newSourceBox = await newSource.boundingBox();
		if (!anchorBox || !newSourceBox) throw new Error("handle has no bounding box");

		await page.mouse.move(anchorBox.x + anchorBox.width / 2, anchorBox.y + anchorBox.height / 2);
		await page.mouse.down();
		// A small move past the library's 1px drag threshold is enough to fire
		// `onReconnectStart` and update `connectingHandleType` before the class list is read.
		await page.mouse.move(
			anchorBox.x + anchorBox.width / 2 + 5,
			anchorBox.y + anchorBox.height / 2 + 5,
			{ steps: 2 },
		);

		// Prove the CSS suppression itself fires for this branch: the target half of the
		// drop point's pair must be non-interactive mid-drag, while the source half (the type
		// this drag can actually complete on) stays interactive.
		const midDragStyles = await page.evaluate(
			({ nodeId }) => {
				const targetEl = document.querySelector(
					`[data-nodeid="${nodeId}"][data-handleid="top-left-target"]`,
				);
				const sourceEl = document.querySelector(
					`[data-nodeid="${nodeId}"][data-handleid="top-left-source"]`,
				);
				return {
					targetPointerEvents: targetEl ? getComputedStyle(targetEl).pointerEvents : null,
					sourcePointerEvents: sourceEl ? getComputedStyle(sourceEl).pointerEvents : null,
				};
			},
			{ nodeId: firstId },
		);
		expect(midDragStyles.targetPointerEvents).toBe("none");
		expect(midDragStyles.sourcePointerEvents).toBe("auto");

		await page.mouse.move(
			newSourceBox.x + newSourceBox.width / 2,
			newSourceBox.y + newSourceBox.height / 2,
			{ steps: 10 },
		);
		await page.mouse.up();

		// Reconnecting must retarget the existing edge, never add a second one.
		await expect(page.locator(".react-flow__edge")).toHaveCount(1);
		await expect(page.getByLabel(`Edge from ${firstId} to ${secondId}`)).toBeVisible();

		// Verify the persisted model actually recorded the new handle (not just that some
		// edge still renders) by round-tripping through a real save.
		const downloadPromise = page.waitForEvent("download");
		await page.getByTestId("btn-save").click();
		const download = await downloadPromise;
		const readable = await download.createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of readable) {
			chunks.push(chunk as Buffer);
		}
		const content = Buffer.concat(chunks).toString("utf-8");

		expect(content).toContain("source_handle: top-left-source");
		expect(content).not.toContain("source_handle: right-source");
	});
});
