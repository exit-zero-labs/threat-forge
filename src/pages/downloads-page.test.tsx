import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { LatestRelease, OsType } from "@/lib/github-releases";

const mockRelease: LatestRelease = {
	version: "v0.2.0",
	publishedAt: "2026-03-01T00:00:00Z",
	releaseUrl: "https://github.com/exit-zero-labs/threat-forge/releases/tag/v0.2.0",
	assets: {
		macos: [
			{ name: "ThreatForge-0.2.0.dmg", downloadUrl: "https://example.com/mac.dmg", size: 15000000 },
		],
		windows: [
			{ name: "ThreatForge-0.2.0.msi", downloadUrl: "https://example.com/win.msi", size: 12000000 },
		],
		linux: [
			{
				name: "ThreatForge-0.2.0.deb",
				downloadUrl: "https://example.com/linux.deb",
				size: 10000000,
			},
		],
	},
};

let mockDetectedOs: OsType = "macos";
let mockIsLoading = false;
let mockError: string | null = null;
let mockReleaseData: LatestRelease | null = mockRelease;

vi.mock("@/hooks/use-latest-release", () => ({
	useLatestRelease: () => ({
		release: mockReleaseData,
		detectedOs: mockDetectedOs,
		isLoading: mockIsLoading,
		error: mockError,
	}),
}));

const { DownloadsPage } = await import("./downloads-page");

function renderDownloadsPage() {
	return render(
		<MemoryRouter>
			<DownloadsPage />
		</MemoryRouter>,
	);
}

describe("DownloadsPage", () => {
	it("renders page heading", () => {
		renderDownloadsPage();
		expect(screen.getByText("Download Threat Forge")).toBeInTheDocument();
	});

	it("renders release version link", () => {
		renderDownloadsPage();
		expect(screen.getByText("v0.2.0")).toBeInTheDocument();
	});

	it("renders all three platform cards", () => {
		renderDownloadsPage();
		expect(screen.getByText("macOS")).toBeInTheDocument();
		expect(screen.getByText("Windows")).toBeInTheDocument();
		expect(screen.getByText("Linux")).toBeInTheDocument();
	});

	it("highlights the detected OS card with Recommended badge", () => {
		mockDetectedOs = "macos";
		renderDownloadsPage();
		expect(screen.getByText("Recommended")).toBeInTheDocument();
	});

	it("shows prominent download button on highlighted card", () => {
		mockDetectedOs = "windows";
		renderDownloadsPage();
		expect(screen.getByText("Download for Windows")).toBeInTheDocument();
	});

	it("does not show Recommended badge when OS is unknown", () => {
		mockDetectedOs = "unknown";
		renderDownloadsPage();
		expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
	});

	it("shows loading skeleton when loading", () => {
		mockIsLoading = true;
		mockReleaseData = null;
		renderDownloadsPage();

		// Should not show platform cards during loading
		expect(screen.queryByText("macOS")).not.toBeInTheDocument();

		// Reset
		mockIsLoading = false;
		mockReleaseData = mockRelease;
	});

	it("shows error fallback when fetch fails", () => {
		mockError = "Network error";
		mockReleaseData = null;
		renderDownloadsPage();

		expect(screen.getByText(/Could not load releases/)).toBeInTheDocument();
		expect(screen.getByText("Download from GitHub")).toBeInTheDocument();

		// Reset
		mockError = null;
		mockReleaseData = mockRelease;
	});

	it("shows web version fallback link", () => {
		renderDownloadsPage();
		expect(screen.getByText("try the web version")).toBeInTheDocument();
	});

	it("renders asset file names and sizes in platform cards", () => {
		mockDetectedOs = "linux";
		renderDownloadsPage();
		expect(screen.getByText("ThreatForge-0.2.0.dmg")).toBeInTheDocument();
		expect(screen.getByText("ThreatForge-0.2.0.msi")).toBeInTheDocument();
		expect(screen.getByText("ThreatForge-0.2.0.deb")).toBeInTheDocument();
	});

	it("shows 'No builds available yet' when a platform has no assets", () => {
		mockReleaseData = {
			...mockRelease,
			assets: { macos: [], windows: mockRelease.assets.windows, linux: mockRelease.assets.linux },
		};
		renderDownloadsPage();
		expect(screen.getByText("No builds available yet.")).toBeInTheDocument();

		// Reset
		mockReleaseData = mockRelease;
	});
});
