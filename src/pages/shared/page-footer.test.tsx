import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PageFooter } from "./page-footer";

function renderFooter(onOpenSettings?: () => void) {
	return render(
		<MemoryRouter>
			<PageFooter onOpenSettings={onOpenSettings} />
		</MemoryRouter>,
	);
}

describe("PageFooter", () => {
	it("renders product links", () => {
		renderFooter();
		expect(screen.getByText("Downloads")).toBeInTheDocument();
		expect(screen.getByText("Web App")).toBeInTheDocument();
		expect(screen.getByText("GitHub")).toBeInTheDocument();
	});

	it("renders company links", () => {
		renderFooter();
		expect(screen.getByText("About")).toBeInTheDocument();
		expect(screen.getByText("Support")).toBeInTheDocument();
	});

	it("renders legal links", () => {
		renderFooter();
		expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
		expect(screen.getByText("Terms of Service")).toBeInTheDocument();
		expect(screen.getByText("Apache 2.0 License")).toBeInTheDocument();
	});

	it("renders copyright with Exit Zero Labs LLC", () => {
		renderFooter();
		const year = new Date().getFullYear();
		expect(screen.getByText(new RegExp(`${year}`))).toBeInTheDocument();
		expect(screen.getByText("Exit Zero Labs LLC")).toBeInTheDocument();
	});

	it("links Exit Zero Labs LLC to company website", () => {
		renderFooter();
		const companyLink = screen.getByText("Exit Zero Labs LLC").closest("a");
		expect(companyLink).toHaveAttribute("href", "https://www.exitzerolabs.com");
	});

	it("renders brand attribution with company link", () => {
		renderFooter();
		const brandLinks = screen.getAllByText("Exit Zero Labs");
		const brandLink = brandLinks[0].closest("a");
		expect(brandLink).toHaveAttribute("href", "https://www.exitzerolabs.com");
	});

	it("renders Appearance button when onOpenSettings is provided", () => {
		const handler = vi.fn();
		renderFooter(handler);

		const btn = screen.getByRole("button", { name: /Appearance/ });
		expect(btn).toBeInTheDocument();
		expect(btn).toHaveTextContent("Appearance");
	});

	it("calls onOpenSettings when Appearance button is clicked", () => {
		const handler = vi.fn();
		renderFooter(handler);

		fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
		expect(handler).toHaveBeenCalledOnce();
	});

	it("does not render Appearance button when onOpenSettings is not provided", () => {
		renderFooter();
		expect(screen.queryByRole("button", { name: /Appearance/ })).not.toBeInTheDocument();
	});
});
