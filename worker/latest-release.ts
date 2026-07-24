import { parseGithubRelease } from "../src/lib/github-release-schema";

/**
 * Fixed upstream endpoint. The client cannot influence the URL, path, method, or
 * headers of this request — the route only ever asks GitHub for this repository's
 * latest release, so it cannot be turned into an open proxy.
 */
const GITHUB_LATEST_RELEASE_URL =
	"https://api.github.com/repos/exit-zero-labs/threat-forge/releases/latest";

/** The one path this Worker owns; everything else delegates to static assets. */
export const LATEST_RELEASE_PATH = "/api/latest-release";

/**
 * Short edge cache to keep GitHub's per-IP unauthenticated rate limit from being
 * exhausted, matching the frontend session cache TTL (5 minutes).
 */
const CACHE_TTL_SECONDS = 300;

/** GitHub rejects unauthenticated API requests that omit a User-Agent. */
const UPSTREAM_HEADERS: HeadersInit = {
	Accept: "application/vnd.github+json",
	"User-Agent": "threat-forge-web",
};

function jsonResponse(body: unknown, init: ResponseInit): Response {
	return new Response(JSON.stringify(body), {
		...init,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			...init.headers,
		},
	});
}

/**
 * A user-safe error that never carries the upstream status, body, or exception.
 * The client only learns the lookup failed, which is enough to fall back to the
 * static GitHub-releases link on the downloads page.
 */
function errorResponse(status: number): Response {
	return jsonResponse(
		{ error: "release lookup unavailable" },
		{
			status,
			headers: {
				"Cache-Control": "no-store",
				"X-Content-Type-Options": "nosniff",
				...(status === 405 ? { Allow: "GET" } : {}),
			},
		},
	);
}

/**
 * Serve the latest release for the site's own origin. Server-side fetches the
 * fixed GitHub endpoint, validates and narrows the untrusted JSON, caches only a
 * successful validated response, and never surfaces raw upstream errors.
 */
export async function handleLatestRelease(
	request: Request,
	ctx: Pick<ExecutionContext, "waitUntil">,
): Promise<Response> {
	if (request.method !== "GET") {
		return errorResponse(405);
	}

	const cache = caches.default;
	// Query strings do not vary the fixed upstream lookup. Normalize the cache key so a caller
	// cannot bypass the five-minute cache (and GitHub's unauthenticated rate protection) by adding
	// arbitrary query parameters.
	const cacheKey = new Request(new URL(LATEST_RELEASE_PATH, request.url));
	const cached = await cache.match(cacheKey);
	if (cached) {
		return cached;
	}

	let upstream: Response;
	try {
		upstream = await fetch(GITHUB_LATEST_RELEASE_URL, { headers: UPSTREAM_HEADERS });
	} catch {
		return errorResponse(502);
	}

	if (!upstream.ok) {
		return errorResponse(502);
	}

	let raw: unknown;
	try {
		raw = await upstream.json();
	} catch {
		return errorResponse(502);
	}

	const release = parseGithubRelease(raw);
	if (!release) {
		return errorResponse(502);
	}

	const response = jsonResponse(release, {
		status: 200,
		headers: {
			"Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
			"X-Content-Type-Options": "nosniff",
		},
	});
	// Cache only this validated 200; store a clone so the streamed body stays
	// readable by the caller.
	ctx.waitUntil(cache.put(cacheKey, response.clone()));
	return response;
}
