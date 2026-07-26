import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSettingsStore } from "@/stores/settings-store";
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
		useSettingsStore.getState().updateSetting("reduceMotion", false);
	});

	it("renders the page heading", () => {
		renderSupportPage();
		expect(screen.getByRole("heading", { level: 1, name: "Support" })).toBeInTheDocument();
	});

	describe("first-run guidance", () => {
		it("explains that a blocked first launch is not a broken download", () => {
			renderSupportPage();
			expect(
				screen.getByRole("heading", {
					level: 2,
					name: "Opening Threat Forge for the first time",
				}),
			).toBeInTheDocument();
			expect(screen.getByText(/Nothing is wrong with your download/)).toBeInTheDocument();
		});

		it("scopes the missing-signature explanation to macOS", () => {
			// Windows installers are signed via Azure Trusted Signing, so a blanket
			// "not code-signed" claim would be false for the platform most likely to
			// show a scary dialog.
			renderSupportPage();
			expect(
				screen.getByText(/macOS builds are not signed with an Apple Developer ID/),
			).toBeInTheDocument();
			expect(
				screen.getByText(/publisher reputation is still being established/),
			).toBeInTheDocument();
		});

		it("says the Open Anyway override does not apply to the damaged-file message", () => {
			renderSupportPage();
			expect(screen.getByText(/not offered for the .damaged. message above/)).toBeInTheDocument();
		});

		it("describes Linux as needing an execute bit rather than being blocked", () => {
			renderSupportPage();
			expect(screen.getByText(/Linux does not block unsigned applications/)).toBeInTheDocument();
			expect(screen.getByText("chmod +x ./Threat.Forge_*.AppImage")).toBeInTheDocument();
		});

		it("makes each command block keyboard-reachable", () => {
			// The blocks scroll horizontally, so a keyboard user must be able to focus one
			// to read a command they are about to paste into a terminal.
			renderSupportPage();
			const region = screen.getByRole("region", {
				name: 'Command: xattr -dr com.apple.quarantine "/Applications/Threat Forge.app"',
			});
			expect(region).toHaveAttribute("tabindex", "0");
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
			const { container } = renderSupportPage(`/support#${FIRST_RUN_HELP_ANCHOR}`);

			const scroll = vi.mocked(Element.prototype.scrollIntoView);
			expect(scroll).toHaveBeenCalledTimes(1);
			// Asserting the receiver, not just the call: scrolling some other element
			// into view would satisfy a bare call-count assertion.
			expect(scroll.mock.instances[0]).toBe(container.querySelector(`#${FIRST_RUN_HELP_ANCHOR}`));
			expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
		});

		it("jumps without animating when the user has asked for reduced motion", () => {
			useSettingsStore.getState().updateSetting("reduceMotion", true);
			renderSupportPage(`/support#${FIRST_RUN_HELP_ANCHOR}`);

			expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
				behavior: "auto",
				block: "start",
			});
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
