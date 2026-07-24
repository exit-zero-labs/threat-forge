import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCanvasInstanceStore } from "./canvas-instance-store";

describe("canvas-instance-store", () => {
	beforeEach(() => {
		useCanvasInstanceStore.setState({
			rfFitView: null,
			rfZoomIn: null,
			rfZoomOut: null,
			rfPanBy: null,
			draggedType: null,
			draggedSubtype: null,
			draggedIcon: null,
			draggedName: null,
			isConnecting: false,
			connectingHandleType: null,
			altDragActive: false,
		});
	});

	describe("palette drag state", () => {
		it("records the full component descriptor for a library drag", () => {
			useCanvasInstanceStore.getState().setDraggedComponent({
				type: "cdn",
				subtype: "cloudfront",
				icon: "globe",
				name: "CloudFront",
			});

			const state = useCanvasInstanceStore.getState();
			expect(state.draggedType).toBe("cdn");
			expect(state.draggedSubtype).toBe("cloudfront");
			expect(state.draggedIcon).toBe("globe");
			expect(state.draggedName).toBe("CloudFront");
		});

		it("clears stale subtype, icon, and name when a generic drag follows a library drag", () => {
			useCanvasInstanceStore.getState().setDraggedComponent({
				type: "cdn",
				subtype: "cloudfront",
				icon: "globe",
				name: "CloudFront",
			});

			useCanvasInstanceStore.getState().setDraggedComponent({ type: "generic" });

			const state = useCanvasInstanceStore.getState();
			expect(state.draggedType).toBe("generic");
			expect(state.draggedSubtype).toBeNull();
			expect(state.draggedIcon).toBeNull();
			expect(state.draggedName).toBeNull();
		});

		it("clears every field on drop so a dragEnd fallback cannot create a second element", () => {
			useCanvasInstanceStore
				.getState()
				.setDraggedComponent({ type: "cdn", icon: "globe", name: "CloudFront" });

			useCanvasInstanceStore.getState().setDraggedComponent(null);

			const state = useCanvasInstanceStore.getState();
			expect(state.draggedType).toBeNull();
			expect(state.draggedSubtype).toBeNull();
			expect(state.draggedIcon).toBeNull();
			expect(state.draggedName).toBeNull();
		});
	});

	describe("ReactFlow instance handles", () => {
		it("exposes the handles registered by the mounted canvas", () => {
			const fitView = vi.fn();
			const zoomIn = vi.fn();
			const zoomOut = vi.fn();
			const panBy = vi.fn();

			useCanvasInstanceStore.getState().setReactFlowActions({ fitView, zoomIn, zoomOut, panBy });

			const state = useCanvasInstanceStore.getState();
			state.rfFitView?.();
			state.rfZoomIn?.();
			state.rfZoomOut?.();
			state.rfPanBy?.({ x: -16, y: 0 });

			expect(fitView).toHaveBeenCalledTimes(1);
			expect(zoomIn).toHaveBeenCalledTimes(1);
			expect(zoomOut).toHaveBeenCalledTimes(1);
			expect(panBy).toHaveBeenCalledWith({ x: -16, y: 0 });
		});

		it("starts with no handles so view commands no-op before the canvas mounts", () => {
			const state = useCanvasInstanceStore.getState();
			expect(state.rfFitView).toBeNull();
			expect(state.rfZoomIn).toBeNull();
			expect(state.rfZoomOut).toBeNull();
			expect(state.rfPanBy).toBeNull();
		});
	});

	describe("in-flight gesture flags", () => {
		it("tracks connection drags so handles stay visible for the duration", () => {
			useCanvasInstanceStore.getState().setIsConnecting(true);
			expect(useCanvasInstanceStore.getState().isConnecting).toBe(true);

			useCanvasInstanceStore.getState().setIsConnecting(false);
			expect(useCanvasInstanceStore.getState().isConnecting).toBe(false);
		});

		it("tracks which handle type a connection drag started from, defaulting to null", () => {
			expect(useCanvasInstanceStore.getState().connectingHandleType).toBeNull();

			useCanvasInstanceStore.getState().setConnectingHandleType("source");
			expect(useCanvasInstanceStore.getState().connectingHandleType).toBe("source");

			useCanvasInstanceStore.getState().setConnectingHandleType("target");
			expect(useCanvasInstanceStore.getState().connectingHandleType).toBe("target");

			useCanvasInstanceStore.getState().setConnectingHandleType(null);
			expect(useCanvasInstanceStore.getState().connectingHandleType).toBeNull();
		});

		it("tracks Alt+drag so the canvas store can hand history to the Alt+drag handler", () => {
			useCanvasInstanceStore.getState().setAltDragActive(true);
			expect(useCanvasInstanceStore.getState().altDragActive).toBe(true);

			useCanvasInstanceStore.getState().setAltDragActive(false);
			expect(useCanvasInstanceStore.getState().altDragActive).toBe(false);
		});
	});
});
