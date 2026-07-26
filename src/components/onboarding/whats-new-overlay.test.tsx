import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WHATS_NEW_STORAGE_KEY as STORAGE_KEY } from "@/lib/whats-new";
import { WhatsNewOverlay } from "./whats-new-overlay";

function seenVersions(): string[] {
	return screen
		.queryAllByText(/^v\d+\.\d+\.\d+$/)
		.map((node) => node.textContent ?? "")
		.map((text) => text.slice(1));
}

describe("WhatsNewOverlay", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	it("shows only the newest entry on first launch", () => {
		render(<WhatsNewOverlay />);

		expect(screen.getByTestId("whats-new-overlay")).toBeInTheDocument();
		expect(seenVersions()).toEqual([__APP_VERSION__]);
	});

	it("announces the version the rest of the app reports", () => {
		render(<WhatsNewOverlay />);

		// The regression in #246: the overlay claimed 1.0.0 while every other version
		// surface read __APP_VERSION__.
		expect(seenVersions()).not.toContain("1.0.0");
		expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument();
	});

	it("stays hidden once the current version has been dismissed", () => {
		localStorage.setItem(STORAGE_KEY, __APP_VERSION__);

		render(<WhatsNewOverlay />);

		expect(screen.queryByTestId("whats-new-overlay")).not.toBeInTheDocument();
	});

	it("records the current version when dismissed", () => {
		render(<WhatsNewOverlay />);

		fireEvent.click(screen.getByRole("button", { name: "Got it" }));

		expect(localStorage.getItem(STORAGE_KEY)).toBe(__APP_VERSION__);
		expect(screen.queryByTestId("whats-new-overlay")).not.toBeInTheDocument();
	});

	it("shows every entry newer than the version the user last saw", () => {
		localStorage.setItem(STORAGE_KEY, "0.1.0");

		render(<WhatsNewOverlay />);

		const shown = seenVersions();
		expect(shown).toContain("0.2.0");
		expect(shown).toContain(__APP_VERSION__);
		expect(shown).not.toContain("0.1.0");
	});

	it("shows one entry when the user is a single version behind", () => {
		localStorage.setItem(STORAGE_KEY, "0.2.0");

		render(<WhatsNewOverlay />);

		expect(seenVersions()).toEqual([__APP_VERSION__]);
	});

	it("recovers when a prior build stored a version that was never released", () => {
		// Builds up to 0.2.0 wrote a hard-coded "1.0.0" here. Treating that as "already
		// seen" would suppress the overlay until the app really reached 1.0.0.
		localStorage.setItem(STORAGE_KEY, "1.0.0");

		render(<WhatsNewOverlay />);

		expect(screen.getByTestId("whats-new-overlay")).toBeInTheDocument();
		expect(seenVersions()).toEqual([__APP_VERSION__]);
	});

	it("recovers when the stored value is not a version at all", () => {
		localStorage.setItem(STORAGE_KEY, "not-a-version");

		render(<WhatsNewOverlay />);

		expect(screen.getByTestId("whats-new-overlay")).toBeInTheDocument();
		expect(seenVersions()).toEqual([__APP_VERSION__]);
	});
});
