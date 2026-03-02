import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Keytip } from "./keytip";

describe("Keytip", () => {
	it("renders the shortcut text", () => {
		render(<Keytip shortcut="⌘K" />);
		expect(screen.getByText("⌘K")).toBeInTheDocument();
	});

	it("renders multi-key shortcuts", () => {
		render(<Keytip shortcut="Ctrl+Shift+S" />);
		expect(screen.getByText("Ctrl+Shift+S")).toBeInTheDocument();
	});
});
