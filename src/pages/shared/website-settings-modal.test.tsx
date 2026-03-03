import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "@/stores/settings-store";
import { DEFAULT_USER_SETTINGS } from "@/types/settings";
import { WebsiteSettingsModal } from "./website-settings-modal";

beforeEach(() => {
	useSettingsStore.setState({
		settings: { ...DEFAULT_USER_SETTINGS },
	});
});

function renderModal(open = true, onClose = vi.fn()) {
	return { onClose, ...render(<WebsiteSettingsModal open={open} onClose={onClose} />) };
}

describe("WebsiteSettingsModal", () => {
	it("renders nothing when closed", () => {
		renderModal(false);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("renders dialog when open", () => {
		renderModal(true);
		expect(screen.getByRole("dialog", { name: "Appearance" })).toBeInTheDocument();
	});

	it("has correct ARIA attributes", () => {
		renderModal(true);
		const dialog = screen.getByRole("dialog");
		expect(dialog).toHaveAttribute("aria-modal", "true");
		expect(dialog).toHaveAttribute("aria-labelledby", "settings-modal-title");
	});

	it("renders Appearance heading", () => {
		renderModal(true);
		expect(screen.getByText("Appearance")).toBeInTheDocument();
	});

	it("renders reduce motion toggle", () => {
		renderModal(true);
		expect(screen.getByText("Reduce motion")).toBeInTheDocument();
		const toggle = screen.getByRole("switch");
		expect(toggle).toHaveAttribute("aria-checked", "false");
	});

	it("toggles reduce motion setting", () => {
		renderModal(true);
		const toggle = screen.getByRole("switch");

		fireEvent.click(toggle);
		expect(useSettingsStore.getState().settings.reduceMotion).toBe(true);
		expect(toggle).toHaveAttribute("aria-checked", "true");
	});

	it("renders font size selector", () => {
		renderModal(true);
		expect(screen.getByText("Font size")).toBeInTheDocument();
		expect(screen.getByText("Small")).toBeInTheDocument();
		expect(screen.getByText("Default")).toBeInTheDocument();
		expect(screen.getByText("Large")).toBeInTheDocument();
	});

	it("changes font size setting", () => {
		renderModal(true);

		fireEvent.click(screen.getByText("Large"));
		expect(useSettingsStore.getState().settings.fontSize).toBe("large");
	});

	it("renders theme picker (mode selector)", () => {
		renderModal(true);
		expect(screen.getByText("Mode")).toBeInTheDocument();
		expect(screen.getByText("Light")).toBeInTheDocument();
		expect(screen.getByText("Dark")).toBeInTheDocument();
		expect(screen.getByText("System")).toBeInTheDocument();
	});

	it("calls onClose when X button is clicked", () => {
		const { onClose } = renderModal(true);

		fireEvent.click(screen.getByLabelText("Close"));
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("calls onClose when backdrop is clicked", () => {
		const onClose = vi.fn();
		const { container } = render(<WebsiteSettingsModal open={true} onClose={onClose} />);

		// The backdrop is the outermost fixed overlay div
		const backdrop = container.firstElementChild as HTMLElement;
		fireEvent.click(backdrop);
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("calls onClose when Escape key is pressed", () => {
		const onClose = vi.fn();
		render(<WebsiteSettingsModal open={true} onClose={onClose} />);

		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("close button has aria-label", () => {
		renderModal(true);
		expect(screen.getByLabelText("Close")).toBeInTheDocument();
	});

	it("does not call onClose on Escape after modal is closed", () => {
		const onClose = vi.fn();
		const { rerender } = render(<WebsiteSettingsModal open={true} onClose={onClose} />);
		rerender(<WebsiteSettingsModal open={false} onClose={onClose} />);

		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).not.toHaveBeenCalled();
	});
});
