import { describe, expect, it } from "vitest";
import { parseGithubRelease } from "./github-release-schema";

/**
 * A payload shaped like GitHub's, with the URLs left to each test. Kept minimal
 * on purpose: what is under test here is the URL contract, and every other field
 * is exercised end to end by `worker/latest-release.test.ts`.
 */
function releaseWith(overrides: {
	htmlUrl?: string;
	downloadUrl?: string;
}): Record<string, unknown> {
	return {
		tag_name: "v0.3.0",
		published_at: "2026-07-01T00:00:00Z",
		html_url:
			overrides.htmlUrl ?? "https://github.com/exit-zero-labs/threat-forge/releases/tag/v0.3.0",
		assets: [
			{
				name: "Threat.Forge_0.3.0_aarch64.dmg",
				browser_download_url:
					overrides.downloadUrl ??
					"https://github.com/exit-zero-labs/threat-forge/releases/download/v0.3.0/aarch64.dmg",
				size: 10_000_000,
			},
		],
	};
}

describe("parseGithubRelease", () => {
	it("accepts a genuine release payload", () => {
		const parsed = parseGithubRelease(releaseWith({}));

		expect(parsed?.tag_name).toBe("v0.3.0");
		expect(parsed?.assets).toHaveLength(1);
	});

	describe("release URLs are pinned to this repository", () => {
		// This value becomes a button a visitor clicks to run a binary. `github.com`
		// alone does not say whose binary it is.
		const wrongRepo = "https://github.com/someone-else/anything/releases/download/v1/evil.dmg";

		it("rejects an asset URL hosted on github.com but owned by someone else", () => {
			expect(parseGithubRelease(releaseWith({ downloadUrl: wrongRepo }))).toBeNull();
		});

		it("rejects a release page URL owned by someone else", () => {
			expect(parseGithubRelease(releaseWith({ htmlUrl: wrongRepo }))).toBeNull();
		});

		it("rejects a repository whose name merely starts with ours", () => {
			expect(
				parseGithubRelease(
					releaseWith({
						downloadUrl:
							"https://github.com/exit-zero-labs/threat-forge-evil/releases/download/v1/evil.dmg",
					}),
				),
			).toBeNull();
		});

		it("rejects a path that only reaches ours before normalization", () => {
			expect(
				parseGithubRelease(
					releaseWith({
						downloadUrl: "https://github.com/exit-zero-labs/threat-forge/../evil/x.dmg",
					}),
				),
			).toBeNull();
		});

		it("accepts a case variant, which GitHub resolves to the same repository", () => {
			expect(
				parseGithubRelease(
					releaseWith({
						downloadUrl:
							"https://github.com/Exit-Zero-Labs/Threat-Forge/releases/download/v1/x.dmg",
					}),
				),
			).not.toBeNull();
		});
	});

	describe("our own repository path is not the trust boundary", () => {
		/**
		 * GitHub stores every pull request head as `refs/pull/N/head` in the base
		 * repository, so a commit anyone pushes to a fork becomes addressable under our
		 * own path. `/raw/<sha>/…` then serves that contributor's bytes. Pinning to the
		 * repository alone would have accepted these; pinning to the paths that need
		 * write access does not.
		 */
		it("rejects an asset URL served from a fork pull-request commit", () => {
			expect(
				parseGithubRelease(
					releaseWith({
						downloadUrl:
							"https://github.com/exit-zero-labs/threat-forge/raw/65fb1e0aa1c3f1e6d1a4c5b2e9f0d7a8b3c4d5e6/evil.dmg",
					}),
				),
			).toBeNull();
		});

		it("rejects a release page URL pointing at repository content", () => {
			expect(
				parseGithubRelease(
					releaseWith({
						htmlUrl:
							"https://github.com/exit-zero-labs/threat-forge/blob/65fb1e0aa1c3f1e6d1a4c5b2e9f0d7a8b3c4d5e6/README.md",
					}),
				),
			).toBeNull();
		});

		it("rejects an asset URL that is a release page rather than an upload", () => {
			expect(
				parseGithubRelease(
					releaseWith({
						downloadUrl: "https://github.com/exit-zero-labs/threat-forge/releases/tag/v0.3.0",
					}),
				),
			).toBeNull();
		});

		it("rejects a sibling path that merely starts with the download prefix", () => {
			// Without the trailing slash on the prefix this passes.
			expect(
				parseGithubRelease(
					releaseWith({
						downloadUrl:
							"https://github.com/exit-zero-labs/threat-forge/releases/downloadable/v1/x.dmg",
					}),
				),
			).toBeNull();
		});
	});

	describe("origin", () => {
		it("rejects a non-443 port, which a hostname check would have allowed", () => {
			expect(
				parseGithubRelease(
					releaseWith({
						downloadUrl:
							"https://github.com:8443/exit-zero-labs/threat-forge/releases/download/v1/x.dmg",
					}),
				),
			).toBeNull();
		});

		it("rejects embedded credentials", () => {
			expect(
				parseGithubRelease(
					releaseWith({
						downloadUrl:
							"https://user:password@github.com/exit-zero-labs/threat-forge/releases/download/v1/x.dmg",
					}),
				),
			).toBeNull();
		});

		it("rejects a password with no username, which only the second clause catches", () => {
			// The realistic phishing shape above carries both, so removing either clause
			// alone still rejects it. Each half needs a URL only it can refuse.
			expect(
				parseGithubRelease(
					releaseWith({
						downloadUrl:
							"https://:password@github.com/exit-zero-labs/threat-forge/releases/download/v1/x.dmg",
					}),
				),
			).toBeNull();
		});

		it("rejects a username with no password, which only the first clause catches", () => {
			expect(
				parseGithubRelease(
					releaseWith({
						downloadUrl:
							"https://user@github.com/exit-zero-labs/threat-forge/releases/download/v1/x.dmg",
					}),
				),
			).toBeNull();
		});

		it("rejects a lookalike host", () => {
			expect(
				parseGithubRelease(
					releaseWith({
						downloadUrl:
							"https://github.com.evil.test/exit-zero-labs/threat-forge/releases/download/v1/x.dmg",
					}),
				),
			).toBeNull();
		});

		it("rejects a non-HTTPS scheme", () => {
			expect(
				parseGithubRelease(
					releaseWith({
						downloadUrl: "http://github.com/exit-zero-labs/threat-forge/releases/download/v1/x.dmg",
					}),
				),
			).toBeNull();
		});

		it("rejects a value that is not a URL at all", () => {
			expect(
				parseGithubRelease(releaseWith({ downloadUrl: "javascript:alert(document.domain)" })),
			).toBeNull();
		});
	});
});
