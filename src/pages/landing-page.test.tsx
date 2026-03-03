import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LandingPage } from "./landing-page";

function renderLandingPage() {
	return render(
		<MemoryRouter>
			<LandingPage />
		</MemoryRouter>,
	);
}

describe("LandingPage", () => {
	it("renders the hero headline", () => {
		renderLandingPage();
		expect(screen.getByText("Threat modeling")).toBeInTheDocument();
		expect(screen.getByText("for a modern age")).toBeInTheDocument();
	});

	it("renders hero CTA buttons in correct order (Try in Browser first)", () => {
		renderLandingPage();

		const heroLinks = screen
			.getAllByRole("link")
			.filter(
				(a) =>
					a.textContent?.includes("Try in Browser") || a.textContent?.includes("Download for Free"),
			);

		// "Try in Browser" should come before "Download for Free" in DOM order
		const tryIndex = heroLinks.findIndex((a) => a.textContent?.includes("Try in Browser"));
		const downloadIndex = heroLinks.findIndex((a) => a.textContent?.includes("Download for Free"));
		expect(tryIndex).toBeLessThan(downloadIndex);
	});

	it("Try in Browser links to /app", () => {
		renderLandingPage();
		const tryLinks = screen.getAllByText("Try in Browser");
		// Both hero and CTA section have it
		for (const link of tryLinks) {
			expect(link.closest("a")).toHaveAttribute("href", "/app");
		}
	});

	it("Download for Free links to /downloads", () => {
		renderLandingPage();
		const downloadLinks = screen.getAllByText("Download for Free");
		for (const link of downloadLinks) {
			expect(link.closest("a")).toHaveAttribute("href", "/downloads");
		}
	});

	it("renders all four feature cards", () => {
		renderLandingPage();
		expect(screen.getByText("STRIDE Analysis")).toBeInTheDocument();
		expect(screen.getByText("Git-Friendly YAML")).toBeInTheDocument();
		expect(screen.getByText("AI-Enhanced")).toBeInTheDocument();
		expect(screen.getByText("Cross-Platform")).toBeInTheDocument();
	});

	it("renders the YAML showcase section", () => {
		renderLandingPage();
		expect(screen.getByText("Your threat models belong in git")).toBeInTheDocument();
		expect(screen.getByText("payment-service.thf")).toBeInTheDocument();
	});

	it("renders the bottom CTA section", () => {
		renderLandingPage();
		expect(screen.getByText("Start threat modeling today")).toBeInTheDocument();
	});

	it("does not link to GitHub in CTAs", () => {
		renderLandingPage();
		expect(screen.queryByText("View on GitHub")).not.toBeInTheDocument();
	});
});
