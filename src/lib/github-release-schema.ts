import { z } from "zod";

/**
 * Release paths whose contents only someone with write access can put there.
 *
 * `/exit-zero-labs/threat-forge/` is not that boundary, which is the non-obvious part.
 * GitHub stores every pull request head as `refs/pull/N/head` **in the base repository**,
 * so a commit pushed to a fork by anyone at all becomes addressable under our own path —
 * `github.com/exit-zero-labs/threat-forge/raw/<fork-pr-sha>/anything` serves bytes that
 * contributor controls, and `/blob/` renders them. Measured against a live external-fork
 * pull request on another repository during the #286 security review. Uploading a release
 * asset, by contrast, requires write access, and nothing outside this repository's
 * maintainers can create a release page.
 *
 * The trailing slash is load-bearing on both: without it `/releases/downloadable/…` and
 * `/releases-of-someone-else/…` satisfy a prefix check.
 *
 * The page prefix stops at `/releases/` rather than `/releases/tag/`, which every real
 * `html_url` matches. Every subpath under `/releases/` needs write access to put content
 * there — `tag/` resolves only real tags, `download/` and `expanded_assets/` come from
 * asset upload — so `/releases/tag/` would buy no security and would fail the whole
 * lookup closed if GitHub ever changed the release-page shape.
 */
const ASSET_PATH_PREFIX = "/exit-zero-labs/threat-forge/releases/download/";
const RELEASE_PAGE_PATH_PREFIX = "/exit-zero-labs/threat-forge/releases/";

/**
 * Accept only URLs under one of this repository's maintainer-controlled release paths.
 *
 * The host alone is not enough. These values become links a visitor clicks — one of them
 * to run a binary — and `https://github.com/someone-else/anything/releases/download/v1/evil.dmg`
 * is on `github.com`.
 *
 * `origin` rather than `hostname` because it carries the scheme and the port together;
 * a `hostname` check accepts `https://github.com:8443/…`, which is not this origin, and
 * `origin` is an ASCII serialization, so a look-alike host either becomes its punycode
 * form — a different origin, rejected — or maps to `github.com` itself, which is not a
 * look-alike at all. Credentials are refused because a genuine API payload never
 * carries them and a URL that does is a phishing shape. `pathname` is the normalized
 * path, so `new URL` has already collapsed any `../` before the prefix is compared.
 *
 * The comparison is case-insensitive: GitHub resolves owner and repository names without
 * regard to case — `https://github.com/Exit-Zero-Labs/Threat-Forge/releases/tag/v0.3.0`
 * returns 200 directly — so a case variant is this repository rather than a different
 * one, and the namespace is single and case-insensitive, so no attacker can hold the
 * variant. `toLowerCase` rather than `toLocaleLowerCase`, which is locale-dependent.
 */
function releaseUrlUnder(prefix: string) {
	return z.string().refine((value) => {
		try {
			const url = new URL(value);
			return (
				url.origin === "https://github.com" &&
				url.username === "" &&
				url.password === "" &&
				url.pathname.toLowerCase().startsWith(prefix)
			);
		} catch {
			return false;
		}
	}, `Expected an HTTPS URL under github.com${prefix}`);
}

/**
 * Shared contract for the GitHub "latest release" JSON, reduced to the fields the
 * downloads page actually renders. This is the single source of truth for the
 * shape crossing the network trust boundary:
 *
 *   - the Cloudflare Worker (`worker/latest-release.ts`) validates the untrusted
 *     GitHub API response with this schema and serves only the narrowed result;
 *   - the frontend (`src/lib/github-releases.ts`) validates the Worker response
 *     with the same schema before mapping it into `LatestRelease`.
 *
 * Zod strips unknown keys by default, so parsing an asset drops every GitHub
 * field except the three below — the response never leaks upstream internals.
 */
export const githubReleaseAssetSchema = z.object({
	name: z.string(),
	browser_download_url: releaseUrlUnder(ASSET_PATH_PREFIX),
	size: z.number().int().nonnegative(),
});

export const githubReleaseSchema = z.object({
	tag_name: z.string().min(1),
	published_at: z.string().nullable(),
	html_url: releaseUrlUnder(RELEASE_PAGE_PATH_PREFIX),
	assets: z.array(githubReleaseAssetSchema),
});

/** The narrowed release payload the Worker returns and the frontend consumes. */
export type GithubRelease = z.infer<typeof githubReleaseSchema>;

/**
 * Validate and narrow an untrusted value to the release contract. Returns `null`
 * when the value does not match, so callers can fail closed without exposing the
 * raw parse error.
 */
export function parseGithubRelease(raw: unknown): GithubRelease | null {
	const result = githubReleaseSchema.safeParse(raw);
	return result.success ? result.data : null;
}
