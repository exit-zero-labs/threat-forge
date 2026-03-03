const RELEASES_URL = "https://api.github.com/repos/exit-zero-labs/threat-forge/releases/latest";

const CACHE_KEY = "tf-latest-release";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type OsType = "macos" | "windows" | "linux" | "unknown";

export interface ReleaseAsset {
	name: string;
	downloadUrl: string;
	size: number;
}

export interface PlatformAssets {
	macos: ReleaseAsset[];
	windows: ReleaseAsset[];
	linux: ReleaseAsset[];
}

export interface LatestRelease {
	version: string;
	publishedAt: string;
	releaseUrl: string;
	assets: PlatformAssets;
}

/**
 * Detect the user's operating system from the user agent string.
 */
export function detectOs(userAgent = navigator.userAgent): OsType {
	const ua = userAgent.toLowerCase();
	// Mobile UAs contain "mac" (iPhone/iPad) or "linux" (Android) — filter first
	if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("android")) {
		return "unknown";
	}
	if (ua.includes("mac")) return "macos";
	if (ua.includes("win")) return "windows";
	if (ua.includes("linux")) return "linux";
	return "unknown";
}

/**
 * Categorize release assets by operating system based on filename patterns.
 */
export function categorizeAssets(
	assets: Array<{ name: string; browser_download_url: string; size: number }>,
): PlatformAssets {
	const result: PlatformAssets = { macos: [], windows: [], linux: [] };

	for (const asset of assets) {
		const name = asset.name.toLowerCase();
		const entry: ReleaseAsset = {
			name: asset.name,
			downloadUrl: asset.browser_download_url,
			size: asset.size,
		};

		if (name.endsWith(".dmg")) {
			result.macos.push(entry);
		} else if (name.endsWith(".exe") || name.endsWith(".msi")) {
			result.windows.push(entry);
		} else if (name.endsWith(".deb") || name.endsWith(".appimage") || name.endsWith(".rpm")) {
			result.linux.push(entry);
		}
	}

	return result;
}

interface CachedRelease {
	data: LatestRelease;
	timestamp: number;
}

/**
 * Fetch the latest release from GitHub. Caches in sessionStorage for 5 minutes.
 */
export async function fetchLatestRelease(): Promise<LatestRelease> {
	// Check cache — wrap in try/catch in case stored JSON is malformed
	const cached = sessionStorage.getItem(CACHE_KEY);
	if (cached) {
		try {
			const parsed: CachedRelease = JSON.parse(cached);
			if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
				return parsed.data;
			}
		} catch {
			sessionStorage.removeItem(CACHE_KEY);
		}
	}

	const response = await fetch(RELEASES_URL);
	if (!response.ok) {
		throw new Error(`GitHub API error: ${response.status}`);
	}

	const json = await response.json();
	const release: LatestRelease = {
		version: json.tag_name ?? json.name ?? "unknown",
		publishedAt: json.published_at ?? "",
		releaseUrl: json.html_url ?? "",
		assets: categorizeAssets(json.assets ?? []),
	};

	// Cache result
	const cacheEntry: CachedRelease = {
		data: release,
		timestamp: Date.now(),
	};
	try {
		sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
	} catch {
		// sessionStorage may be full or unavailable — ignore
	}

	return release;
}

/**
 * Format bytes into human-readable size.
 */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	const mb = kb / 1024;
	return `${mb.toFixed(1)} MB`;
}
