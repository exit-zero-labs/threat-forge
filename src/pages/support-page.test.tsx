import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FIRST_RUN_HELP_ANCHOR } from "./shared/first-run-help";
import { SupportPage } from "./support-page";

// jsdom does not implement scrollIntoView; give every test a spyable stub.
Element.prototype.scrollIntoView = vi.fn();

function renderSupportPage(initialEntry = "/support") {
	return render(
		<MemoryRouter initialEntries={[initialEntry]}>
			<SupportPage />
		</MemoryRouter>,
	);
}

describe("SupportPage", () => {
	beforeEach(() => {
		vi.mocked(Element.prototype.scrollIntoView).mockClear();
	});

	it("renders the page heading", () => {
		renderSupportPage();
		expect(screen.getByRole("heading", { level: 1, name: "Support" })).toBeInTheDocument();
	});

	describe("first-run guidance", () => {
		it("explains that an unsigned build is not a broken download", () => {
			renderSupportPage();
			const section = screen.getByRole("heading", {
				level: 2,
				name: "Opening Threat Forge for the first time",
			});
			expect(section).toBeInTheDocument();
			expect(screen.getByText(/not yet code-signed/)).toBeInTheDocument();
			expect(screen.getByText(/Nothing is wrong with your download/)).toBeInTheDocument();
		});

		it("gives the macOS quarantine command verbatim", () => {
			renderSupportPage();
			expect(
				screen.getByText('xattr -dr com.apple.quarantine "/Applications/Threat Forge.app"'),
			).toBeInTheDocument();
		});

		it("covers every platform the release workflow builds for", () => {
			renderSupportPage();
			for (const platform of ["macOS", "Windows", "Linux"]) {
				expect(screen.getByRole("heading", { level: 3, name: platform })).toBeInTheDocument();
			}
		});

		it("anchors the section at the id the downloads page links to", () => {
			const { container } = renderSupportPage();
			expect(container.querySelector(`#${FIRST_RUN_HELP_ANCHOR}`)).not.toBeNull();
		});
	});

	describe("hash scrolling", () => {
		it("scrolls the targeted section into view", () => {
			renderSupportPage(`/support#${FIRST_RUN_HELP_ANCHOR}`);
			expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
		});

		it("does not scroll when the URL carries no hash", () => {
			renderSupportPage();
			expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
		});

		it("does not throw when the hash names no section on the page", () => {
			expect(() => renderSupportPage("/support#no-such-section")).not.toThrow();
			expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
		});
	});
});
