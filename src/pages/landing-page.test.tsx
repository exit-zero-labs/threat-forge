import { render, screen, within } from "@testing-library/react";
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
		expect(screen.getByText("Threat modeling for people who")).toBeInTheDocument();
		expect(screen.getByText("hate threat modeling tools")).toBeInTheDocument();
	});

	it("renders hero CTA buttons in correct order (browser first)", () => {
		renderLandingPage();

		// Scoped to the hero: the CTA section repeats both labels in the same order,
		// so a page-wide query stays green even with the hero buttons deleted.
		const heroLinks = within(screen.getByTestId("hero")).getAllByRole("link");
		const labels = heroLinks.map((a) => a.textContent?.trim());

		expect(labels).toEqual(["Try it in the browser", "Download"]);
	});

	it("the browser CTA links to /app", () => {
		renderLandingPage();
		const tryLinks = screen.getAllByText("Try it in the browser");
		// Both hero and CTA section have it
		for (const link of tryLinks) {
			expect(link.closest("a")).toHaveAttribute("href", "/app");
		}
	});

	it("the download CTA links to /downloads", () => {
		renderLandingPage();
		const downloadLinks = screen.getAllByText("Download");
		for (const link of downloadLinks) {
			expect(link.closest("a")).toHaveAttribute("href", "/downloads");
		}
	});

	it("renders all four feature cards", () => {
		renderLandingPage();
		expect(screen.getByText("STRIDE, minus the workshop")).toBeInTheDocument();
		expect(screen.getByText("It's a file. That's the whole trick.")).toBeInTheDocument();
		expect(screen.getByText("AI that edits, not advises")).toBeInTheDocument();
		expect(screen.getByText("Runs anywhere, weighs nothing")).toBeInTheDocument();
	});

	it("renders the YAML showcase section", () => {
		renderLandingPage();
		expect(screen.getByText("Yes, it's just a file")).toBeInTheDocument();
		expect(screen.getByText("payment-service.thf")).toBeInTheDocument();
	});

	it("renders the bottom CTA section", () => {
		renderLandingPage();
		expect(screen.getByText("That's the pitch")).toBeInTheDocument();
	});

	it("does not link to GitHub in CTAs", () => {
		renderLandingPage();
		expect(screen.queryByText("View on GitHub")).not.toBeInTheDocument();
	});
});
