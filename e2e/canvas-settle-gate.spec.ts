import { addPaletteItem, createModel, expect, test, waitForCanvasSettled } from "./fixtures";

/**
 * Does `waitForCanvasSettled` actually block?
 *
 * A wait that only ever runs against an already-settled canvas is indistinguishable from no wait
 * at all — every gate passes when there is nothing to wait for, so a green visual suite proves
 * nothing about the gate protecting it.
 *
 * These specs put the gate in front of a canvas that is deliberately not settled and require it
 * to refuse. Every clause of the gate was checked by deleting it and watching this file: the
 * quiet period, the measurement check and the count assertion each turn exactly one spec red,
 * while the frame-to-frame comparison and the carrier reset each turn two red — they are load
 * bearing for more than one spec, not unpinned.
 *
 * One guard is deliberately unpinned, and saying so is more useful than pretending otherwise:
 * the count re-check *inside* the predicate can be deleted without turning this file red,
 * because the wrong-count spec rejects at the `toHaveCount` assertion, which runs to completion
 * before the predicate is reached. It earns its place by covering a node that unmounts after
 * that assertion resolves, which nothing here reproduces.
 *
 * Short timeouts keep a refusal costing a second rather than fifteen.
 *
 * The unsettled states are produced by mutating the DOM directly, not by loading the machine.
 * Manufacturing CPU contention to reproduce a timing bug is forbidden (`AGENTS.md`), and it would
 * be the wrong instrument anyway: it proves something about this laptop, whereas a driven
 * transform proves something about the predicate.
 */
test.describe("waitForCanvasSettled", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/app");
		await createModel(page);
		await addPaletteItem(page, "palette-item-web-server");
	});

	test("refuses a canvas whose viewport is still moving", async ({ page }) => {
		await waitForCanvasSettled(page, 1);

		const stop = await page.evaluate(() => {
			const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
			if (!viewport) return false;
			const carrier = window as unknown as { __tfStopDrift?: () => void };
			let frame = 0;
			let raf = 0;
			const step = () => {
				frame += 1;
				viewport.style.transform = `translate(${-508 + (frame % 7)}px, -346px) scale(2)`;
				raf = requestAnimationFrame(step);
			};
			raf = requestAnimationFrame(step);
			carrier.__tfStopDrift = () => cancelAnimationFrame(raf);
			return true;
		});
		expect(stop).toBe(true);

		await expect(waitForCanvasSettled(page, 1, { timeout: 1500 })).rejects.toThrow(
			/waitForFunction: Timeout/,
		);

		await page.evaluate(() => {
			(window as unknown as { __tfStopDrift?: () => void }).__tfStopDrift?.();
		});
		await waitForCanvasSettled(page, 1, { timeout: 5000 });
	});

	test("refuses a canvas that goes still between moves without settling", async ({ page }) => {
		await waitForCanvasSettled(page, 1);

		// Moving every 50ms leaves the geometry identical across two or three consecutive `raf`
		// polls, so a gate that only compared successive polls would accept this canvas. It is
		// the shape of the real hazard: `fitView` landing a few frames after the node reports
		// itself measured. Only the quiet period refuses it, which is what pins that clause.
		const started = await page.evaluate(() => {
			const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
			if (!viewport) return false;
			const carrier = window as unknown as { __tfStopStutter?: () => void };
			let step = 0;
			const timer = window.setInterval(() => {
				step += 1;
				viewport.style.transform = `translate(${-508 + (step % 5)}px, -346px) scale(2)`;
			}, 50);
			carrier.__tfStopStutter = () => window.clearInterval(timer);
			return true;
		});
		expect(started).toBe(true);

		await expect(waitForCanvasSettled(page, 1, { timeout: 1500 })).rejects.toThrow(
			/waitForFunction: Timeout/,
		);

		await page.evaluate(() => {
			(window as unknown as { __tfStopStutter?: () => void }).__tfStopStutter?.();
		});
		await waitForCanvasSettled(page, 1, { timeout: 5000 });
	});

	test("refuses a node ReactFlow has not measured", async ({ page }) => {
		await waitForCanvasSettled(page, 1);

		// `visibility: hidden` is precisely what @xyflow/react renders for a node whose dimensions
		// it has not measured yet, so setting it reproduces the pre-measurement DOM exactly.
		await page.evaluate(() => {
			const node = document.querySelector<HTMLElement>(".react-flow__node");
			if (node) node.style.visibility = "hidden";
		});

		await expect(waitForCanvasSettled(page, 1, { timeout: 1500 })).rejects.toThrow(
			/waitForFunction: Timeout/,
		);

		await page.evaluate(() => {
			const node = document.querySelector<HTMLElement>(".react-flow__node");
			if (node) node.style.visibility = "visible";
		});
		await waitForCanvasSettled(page, 1, { timeout: 5000 });
	});

	test("still enforces the quiet period on a call that follows a timed-out one", async ({
		page,
	}) => {
		await waitForCanvasSettled(page, 1);

		// The previous reading lives on `window`, so it outlives the call that wrote it. If a
		// timed-out call leaves its last reading behind, the next call matches it on its first
		// poll and returns after a single frame — a silently weakened gate that no assertion
		// about settling would notice. Drift the canvas, let a call time out against it, then
		// freeze it on a geometry that call has already seen and time the next call.
		const started = await page.evaluate(() => {
			const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
			if (!viewport) return false;
			const carrier = window as unknown as { __tfStopDrift?: () => void };
			let step = 0;
			const timer = window.setInterval(() => {
				step += 1;
				viewport.style.transform = `translate(${-508 + (step % 3)}px, -346px) scale(2)`;
			}, 30);
			carrier.__tfStopDrift = () => window.clearInterval(timer);
			return true;
		});
		expect(started).toBe(true);

		await expect(waitForCanvasSettled(page, 1, { timeout: 1200 })).rejects.toThrow(
			/waitForFunction: Timeout/,
		);
		await page.evaluate(() => {
			(window as unknown as { __tfStopDrift?: () => void }).__tfStopDrift?.();
		});

		const startedAt = Date.now();
		await waitForCanvasSettled(page, 1, { timeout: 5000 });
		// A floor, not a budget: contention can only push this up, so it cannot flake under load.
		expect(Date.now() - startedAt).toBeGreaterThanOrEqual(90);
	});

	test("refuses a canvas with the wrong number of nodes", async ({ page }) => {
		// The message Playwright builds here carries markup between its segments, so a matcher
		// spanning more than one word of it silently fails to match.
		await expect(waitForCanvasSettled(page, 2, { timeout: 1500 })).rejects.toThrow(/toHaveCount/);
		await waitForCanvasSettled(page, 1, { timeout: 5000 });
	});
});
