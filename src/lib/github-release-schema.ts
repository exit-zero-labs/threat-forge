import { z } from "zod";

const githubHttpsUrlSchema = z.string().refine((value) => {
	try {
		const url = new URL(value);
		return url.protocol === "https:" && url.hostname === "github.com";
	} catch {
		return false;
	}
}, "Expected an HTTPS github.com URL");

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
	browser_download_url: githubHttpsUrlSchema,
	size: z.number().int().nonnegative(),
});

export const githubReleaseSchema = z.object({
	tag_name: z.string().min(1),
	published_at: z.string().nullable(),
	html_url: githubHttpsUrlSchema,
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
