import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuideOverlay } from "./guide-overlay";

describe("GuideOverlay", () => {
	const onClickOutside = vi.fn();

	beforeEach(() => {
		onClickOutside.mockClear();
	});

	afterEach(() => {
		cleanup();
	});

	it("renders overlay when target element exists", () => {
		// Create a target element
		const target = document.createElement("div");
		target.setAttribute("data-testid", "test-target");
		target.getBoundingClientRect = vi.fn(
			() =>
				({
					top: 100,
					left: 100,
					width: 200,
					height: 50,
					right: 300,
					bottom: 150,
					x: 100,
					y: 100,
					toJSON: () => {},
				}) as DOMRect,
		);
		document.body.appendChild(target);

		render(
			<GuideOverlay targetSelector="[data-testid='test-target']" onClickOutside={onClickOutside} />,
		);

		expect(screen.getByTestId("guide-overlay")).toBeDefined();

		document.body.removeChild(target);
	});

	it("returns null when target element not found", () => {
		const { container } = render(
			<GuideOverlay targetSelector="[data-testid='nonexistent']" onClickOutside={onClickOutside} />,
		);

		expect(container.innerHTML).toBe("");
	});

	it("calls onClickOutside when clicking overlay", () => {
		const target = document.createElement("div");
		target.setAttribute("data-testid", "click-target");
		target.getBoundingClientRect = vi.fn(
			() =>
				({
					top: 50,
					left: 50,
					width: 100,
					height: 100,
					right: 150,
					bottom: 150,
					x: 50,
					y: 50,
					toJSON: () => {},
				}) as DOMRect,
		);
		document.body.appendChild(target);

		render(
			<GuideOverlay
				targetSelector="[data-testid='click-target']"
				onClickOutside={onClickOutside}
			/>,
		);

		fireEvent.click(screen.getByTestId("guide-overlay"));
		expect(onClickOutside).toHaveBeenCalledOnce();

		document.body.removeChild(target);
	});

	it("calls onClickOutside when pressing Escape", () => {
		const target = document.createElement("div");
		target.setAttribute("data-testid", "esc-target");
		target.getBoundingClientRect = vi.fn(
			() =>
				({
					top: 50,
					left: 50,
					width: 100,
					height: 100,
					right: 150,
					bottom: 150,
					x: 50,
					y: 50,
					toJSON: () => {},
				}) as DOMRect,
		);
		document.body.appendChild(target);

		render(
			<GuideOverlay targetSelector="[data-testid='esc-target']" onClickOutside={onClickOutside} />,
		);

		fireEvent.keyDown(screen.getByTestId("guide-overlay"), { key: "Escape" });
		expect(onClickOutside).toHaveBeenCalledOnce();

		document.body.removeChild(target);
	});

	it("renders SVG mask for spotlight effect", () => {
		const target = document.createElement("div");
		target.setAttribute("data-testid", "svg-target");
		target.getBoundingClientRect = vi.fn(
			() =>
				({
					top: 100,
					left: 100,
					width: 200,
					height: 50,
					right: 300,
					bottom: 150,
					x: 100,
					y: 100,
					toJSON: () => {},
				}) as DOMRect,
		);
		document.body.appendChild(target);

		render(
			<GuideOverlay targetSelector="[data-testid='svg-target']" onClickOutside={onClickOutside} />,
		);

		const overlay = screen.getByTestId("guide-overlay");
		const svg = overlay.querySelector("svg");
		expect(svg).not.toBeNull();
		expect(svg?.querySelector("mask")).not.toBeNull();

		document.body.removeChild(target);
	});
});
