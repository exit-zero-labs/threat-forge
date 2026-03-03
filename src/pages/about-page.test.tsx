import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AboutPage } from "./about-page";

function renderAbout() {
	return render(
		<MemoryRouter>
			<AboutPage />
		</MemoryRouter>,
	);
}

describe("AboutPage", () => {
	it("renders the page heading", () => {
		renderAbout();
		expect(screen.getByRole("heading", { name: "About Threat Forge" })).toBeInTheDocument();
	});

	it("renders all section headings", () => {
		renderAbout();
		expect(screen.getByText("Why Threat Forge exists")).toBeInTheDocument();
		expect(screen.getByText("Open source")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Exit Zero Labs" })).toBeInTheDocument();
		expect(screen.getByText("Get involved")).toBeInTheDocument();
	});

	it("renders Exit Zero Labs LLC with company link in about section", () => {
		renderAbout();
		// The about section has a specific styling class; use it to scope
		const aboutLinks = screen.getAllByText("Exit Zero Labs LLC");
		const aboutLink = aboutLinks.find((el) =>
			el.closest("a")?.className.includes("underline decoration-border"),
		);
		expect(aboutLink).toBeTruthy();
		expect(aboutLink?.closest("a")).toHaveAttribute("href", "https://www.exitzerolabs.com");
	});

	it("renders GitHub links in Get Involved section", () => {
		renderAbout();
		const starLink = screen.getByText("Star the repo on GitHub").closest("a");
		expect(starLink).toHaveAttribute("href", "https://github.com/exit-zero-labs/threat-forge");

		const issuesLink = screen.getByText("Report bugs or request features").closest("a");
		expect(issuesLink).toHaveAttribute(
			"href",
			"https://github.com/exit-zero-labs/threat-forge/issues",
		);

		const contributeLink = screen.getByText("Contribute code or documentation").closest("a");
		expect(contributeLink).toHaveAttribute(
			"href",
			"https://github.com/exit-zero-labs/threat-forge/blob/main/CONTRIBUTING.md",
		);
	});

	it("sets document title", () => {
		renderAbout();
		expect(document.title).toBe("About — Threat Forge");
	});
});
