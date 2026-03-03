import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/stores/settings-store";
import { PageShell } from "./page-shell";

function renderShell(title = "Test Page") {
	return render(
		<MemoryRouter>
			<PageShell title={title}>
				<p>Page content</p>
			</PageShell>
		</MemoryRouter>,
	);
}

describe("PageShell", () => {
	afterEach(() => {
		document.documentElement.style.fontSize = "";
		useSettingsStore.getState().updateSetting("fontSize", "default");
	});

	it("renders children", () => {
		renderShell();
		expect(screen.getByText("Page content")).toBeInTheDocument();
	});

	it("sets document title", () => {
		renderShell("My Test Title");
		expect(document.title).toBe("My Test Title");
	});

	it("enables scrolling on mount", () => {
		renderShell();
		expect(document.documentElement.style.overflow).toBe("auto");
		expect(document.body.style.overflow).toBe("auto");
	});

	it("renders nav bar", () => {
		renderShell();
		expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
	});

	it("renders footer", () => {
		renderShell();
		expect(screen.getByRole("contentinfo")).toBeInTheDocument();
	});

	it("opens settings modal when Appearance button is clicked", () => {
		renderShell();

		fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));

		expect(screen.getByRole("dialog", { name: "Appearance" })).toBeInTheDocument();
	});

	it("applies font size to document element", () => {
		useSettingsStore.getState().updateSetting("fontSize", "large");
		renderShell();
		expect(document.documentElement.style.fontSize).toBe("18px");
	});

	it("closes settings modal when close button is clicked", () => {
		renderShell();

		fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
		expect(screen.getByRole("dialog")).toBeInTheDocument();

		fireEvent.click(screen.getByLabelText("Close"));
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
});
