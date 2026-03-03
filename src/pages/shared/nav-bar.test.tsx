import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { NavBar } from "./nav-bar";

function renderNavBar() {
	return render(
		<MemoryRouter>
			<NavBar />
		</MemoryRouter>,
	);
}

describe("NavBar", () => {
	it("renders the logo image with alt text", () => {
		renderNavBar();
		const logo = screen.getByAltText("Threat Forge");
		expect(logo).toBeInTheDocument();
		expect(logo).toHaveAttribute("src", "/logo_square.png");
	});

	it("renders the brand name linking to home", () => {
		renderNavBar();
		const homeLink = screen.getByText("Threat Forge").closest("a");
		expect(homeLink).toHaveAttribute("href", "/");
	});

	it("renders About link", () => {
		renderNavBar();
		const about = screen.getByText("About");
		expect(about.closest("a")).toHaveAttribute("href", "/about");
	});

	it("renders Try Online CTA linking to /app", () => {
		renderNavBar();
		const cta = screen.getByText("Try Online");
		expect(cta.closest("a")).toHaveAttribute("href", "/app");
	});

	it("does not render Downloads link", () => {
		renderNavBar();
		expect(screen.queryByText("Downloads")).not.toBeInTheDocument();
	});

	it("does not render GitHub link", () => {
		renderNavBar();
		expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
	});
});
