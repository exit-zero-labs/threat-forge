import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ChatViewport } from "./chat-viewport";

beforeEach(() => {
	Element.prototype.scrollTo = vi.fn();
});

it("preserves reading position after a touch gesture starts on message content", () => {
	const { rerender } = render(
		<ChatViewport activity={1}>
			<p>Earlier message</p>
		</ChatViewport>,
	);
	const viewport = screen.getByRole("region", { name: "Conversation" });
	Object.defineProperties(viewport, {
		scrollHeight: { value: 1000 },
		clientHeight: { value: 200 },
	});
	viewport.scrollTo = vi.fn((options) => {
		if (typeof options === "object") viewport.scrollTop = Math.min(options.top ?? 0, 800);
	});
	viewport.scrollTop = 800;
	fireEvent.touchMove(screen.getByText("Earlier message"));
	viewport.scrollTop = 300;
	fireEvent.scroll(viewport);
	expect(screen.getByRole("button", { name: "Jump to latest" })).toBeInTheDocument();
	rerender(
		<ChatViewport activity={2}>
			<p>Earlier message</p>
			<p>Incoming response</p>
		</ChatViewport>,
	);
	expect(viewport.scrollTop).toBe(300);
	fireEvent.click(screen.getByRole("button", { name: "Jump to latest" }));
	expect(viewport.scrollTop).toBe(800);
});

for (const gesture of ["wheel", "keyboard", "touch", "pointer"] as const) {
	it(`keeps following after a ${gesture} gesture on a transcript that cannot scroll`, () => {
		const { rerender } = render(
			<ChatViewport activity={1}>
				<p>Short answer</p>
			</ChatViewport>,
		);
		const viewport = screen.getByRole("region", { name: "Conversation" });
		Object.defineProperties(viewport, {
			scrollHeight: { value: 100, configurable: true },
			clientHeight: { value: 200 },
		});
		viewport.scrollTo = vi.fn();
		if (gesture === "wheel") fireEvent.wheel(viewport, { deltaY: -100 });
		if (gesture === "keyboard") fireEvent.keyDown(viewport, { key: "PageUp" });
		if (gesture === "touch") fireEvent.touchMove(screen.getByText("Short answer"));
		if (gesture === "pointer") fireEvent.pointerDown(viewport);
		Object.defineProperty(viewport, "scrollHeight", { value: 1000 });
		rerender(
			<ChatViewport activity={2}>
				<p>Long incoming answer</p>
			</ChatViewport>,
		);
		expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "instant" });
	});
}

it("offers a way back to following even when a scrollable upward gesture does not move", () => {
	const { rerender } = render(
		<ChatViewport activity={1}>
			<p>Earlier answer</p>
		</ChatViewport>,
	);
	const viewport = screen.getByRole("region", { name: "Conversation" });
	Object.defineProperties(viewport, {
		scrollHeight: { value: 1000 },
		clientHeight: { value: 200 },
	});
	viewport.scrollTo = vi.fn();
	fireEvent.wheel(viewport, { deltaY: -100 });
	rerender(
		<ChatViewport activity={2}>
			<p>Incoming answer</p>
		</ChatViewport>,
	);
	expect(viewport.scrollTo).not.toHaveBeenCalled();
	expect(screen.getByRole("button", { name: "Jump to latest" })).toBeInTheDocument();
});
