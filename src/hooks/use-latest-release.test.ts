import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockRelease = {
	version: "v0.1.0",
	publishedAt: "2026-03-01T00:00:00Z",
	releaseUrl: "https://github.com/exit-zero-labs/threat-forge/releases/tag/v0.1.0",
	assets: { macos: [], windows: [], linux: [] },
};

vi.mock("@/lib/github-releases", () => ({
	detectOs: () => "macos" as const,
	fetchLatestRelease: vi.fn(() => Promise.resolve(mockRelease)),
}));

const { useLatestRelease } = await import("./use-latest-release");
const { fetchLatestRelease } = await import("@/lib/github-releases");

describe("useLatestRelease", () => {
	afterEach(() => {
		vi.mocked(fetchLatestRelease).mockReset();
		vi.mocked(fetchLatestRelease).mockResolvedValue(mockRelease);
	});

	it("returns loading state initially", () => {
		const { result } = renderHook(() => useLatestRelease());
		expect(result.current.isLoading).toBe(true);
		expect(result.current.release).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("returns detected OS", () => {
		const { result } = renderHook(() => useLatestRelease());
		expect(result.current.detectedOs).toBe("macos");
	});

	it("returns release data after fetch resolves", async () => {
		const { result } = renderHook(() => useLatestRelease());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.release).toEqual(mockRelease);
		expect(result.current.error).toBeNull();
	});

	it("returns error when fetch fails", async () => {
		vi.mocked(fetchLatestRelease).mockRejectedValueOnce(new Error("Network error"));

		const { result } = renderHook(() => useLatestRelease());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.release).toBeNull();
		expect(result.current.error).toBe("Network error");
	});

	it("returns generic error message for non-Error throws", async () => {
		vi.mocked(fetchLatestRelease).mockRejectedValueOnce("something");

		const { result } = renderHook(() => useLatestRelease());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.error).toBe("Failed to fetch release");
	});
});
