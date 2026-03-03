import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { categorizeAssets, detectOs, fetchLatestRelease, formatBytes } from "./github-releases";

describe("detectOs", () => {
	it("detects macOS from user agent", () => {
		expect(detectOs("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("macos");
	});

	it("detects Windows from user agent", () => {
		expect(detectOs("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
	});

	it("detects Linux from user agent", () => {
		expect(detectOs("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
	});

	it("returns unknown for unrecognized user agent", () => {
		expect(detectOs("SomeBot/1.0")).toBe("unknown");
	});

	it("returns unknown for iOS user agents", () => {
		expect(detectOs("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("unknown");
	});

	it("returns unknown for iPadOS user agents", () => {
		expect(detectOs("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("unknown");
	});

	it("returns unknown for Android user agents", () => {
		expect(detectOs("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("unknown");
	});
});

describe("categorizeAssets", () => {
	const FIXTURE_ASSETS = [
		{
			name: "Threat.Forge_0.1.0_aarch64.dmg",
			browser_download_url: "https://example.com/aarch64.dmg",
			size: 10_000_000,
		},
		{
			name: "Threat.Forge_0.1.0_x64.dmg",
			browser_download_url: "https://example.com/x64.dmg",
			size: 12_000_000,
		},
		{
			name: "Threat.Forge_0.1.0_x64-setup.exe",
			browser_download_url: "https://example.com/setup.exe",
			size: 8_000_000,
		},
		{
			name: "Threat.Forge_0.1.0_x64_en-US.msi",
			browser_download_url: "https://example.com/setup.msi",
			size: 9_000_000,
		},
		{
			name: "threat-forge_0.1.0_amd64.deb",
			browser_download_url: "https://example.com/amd64.deb",
			size: 7_000_000,
		},
		{
			name: "threat-forge_0.1.0_amd64.AppImage",
			browser_download_url: "https://example.com/amd64.AppImage",
			size: 11_000_000,
		},
		{
			name: "threat-forge-0.1.0-1.x86_64.rpm",
			browser_download_url: "https://example.com/x86_64.rpm",
			size: 7_500_000,
		},
		{
			name: "latest.json",
			browser_download_url: "https://example.com/latest.json",
			size: 500,
		},
	];

	it("categorizes macOS assets (dmg)", () => {
		const result = categorizeAssets(FIXTURE_ASSETS);
		expect(result.macos).toHaveLength(2);
		expect(result.macos[0].name).toBe("Threat.Forge_0.1.0_aarch64.dmg");
		expect(result.macos[1].name).toBe("Threat.Forge_0.1.0_x64.dmg");
	});

	it("categorizes Windows assets (exe + msi)", () => {
		const result = categorizeAssets(FIXTURE_ASSETS);
		expect(result.windows).toHaveLength(2);
		expect(result.windows[0].name).toContain(".exe");
		expect(result.windows[1].name).toContain(".msi");
	});

	it("categorizes Linux assets (deb + AppImage + rpm)", () => {
		const result = categorizeAssets(FIXTURE_ASSETS);
		expect(result.linux).toHaveLength(3);
	});

	it("ignores non-installer files like latest.json", () => {
		const result = categorizeAssets(FIXTURE_ASSETS);
		const allNames = [...result.macos, ...result.windows, ...result.linux].map((a) => a.name);
		expect(allNames).not.toContain("latest.json");
	});

	it("handles empty assets", () => {
		const result = categorizeAssets([]);
		expect(result.macos).toHaveLength(0);
		expect(result.windows).toHaveLength(0);
		expect(result.linux).toHaveLength(0);
	});
});

describe("fetchLatestRelease", () => {
	beforeEach(() => {
		sessionStorage.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("fetches and parses release data", async () => {
		const mockResponse = {
			tag_name: "v0.1.0",
			published_at: "2026-03-01T00:00:00Z",
			html_url: "https://github.com/exit-zero-labs/threat-forge/releases/tag/v0.1.0",
			assets: [
				{
					name: "Threat.Forge_0.1.0_aarch64.dmg",
					browser_download_url: "https://example.com/aarch64.dmg",
					size: 10_000_000,
				},
			],
		};

		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockResponse),
		} as Response);

		const release = await fetchLatestRelease();
		expect(release.version).toBe("v0.1.0");
		expect(release.assets.macos).toHaveLength(1);
	});

	it("throws on API error", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
			ok: false,
			status: 403,
		} as Response);

		await expect(fetchLatestRelease()).rejects.toThrow("GitHub API error: 403");
	});

	it("uses cached data within TTL", async () => {
		const cachedData = {
			data: {
				version: "v0.1.0",
				publishedAt: "2026-03-01T00:00:00Z",
				releaseUrl: "https://github.com/exit-zero-labs/threat-forge/releases/tag/v0.1.0",
				assets: { macos: [], windows: [], linux: [] },
			},
			timestamp: Date.now(),
		};
		sessionStorage.setItem("tf-latest-release", JSON.stringify(cachedData));

		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const release = await fetchLatestRelease();

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(release.version).toBe("v0.1.0");
	});

	it("falls back to network fetch when cached JSON is malformed", async () => {
		sessionStorage.setItem("tf-latest-release", "not-valid-json{{{");

		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					tag_name: "v0.1.0",
					published_at: "",
					html_url: "",
					assets: [],
				}),
		} as Response);

		const release = await fetchLatestRelease();
		expect(release.version).toBe("v0.1.0");
		// Malformed entry should have been removed
		expect(sessionStorage.getItem("tf-latest-release")).not.toBe("not-valid-json{{{");
	});

	it("throws when fetch rejects (network failure)", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
		await expect(fetchLatestRelease()).rejects.toThrow("Network error");
	});

	it("refetches when cache is expired", async () => {
		const cachedData = {
			data: {
				version: "v0.0.9",
				publishedAt: "",
				releaseUrl: "",
				assets: { macos: [], windows: [], linux: [] },
			},
			timestamp: Date.now() - 6 * 60 * 1000, // 6 minutes ago
		};
		sessionStorage.setItem("tf-latest-release", JSON.stringify(cachedData));

		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					tag_name: "v0.1.0",
					published_at: "",
					html_url: "",
					assets: [],
				}),
		} as Response);

		const release = await fetchLatestRelease();
		expect(release.version).toBe("v0.1.0");
	});
});

describe("formatBytes", () => {
	it("formats bytes", () => {
		expect(formatBytes(500)).toBe("500 B");
	});

	it("formats kilobytes", () => {
		expect(formatBytes(1024)).toBe("1.0 KB");
	});

	it("formats megabytes", () => {
		expect(formatBytes(10_000_000)).toBe("9.5 MB");
	});
});
