import { type GithubRelease, parseGithubRelease } from "../src/lib/github-release-schema";

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

/**
 * How long the last-known-good copy stays readable after the release that
 * produced it. It has to outlive several of GitHub's hourly unauthenticated
 * rate-limit buckets to be worth having — a colo refused across two consecutive
 * hours would expire a one-hour ceiling and go back to failing — and it must not
 * outlive a genuine release by much more than a day, because within the ceiling a
 * refused colo shows release N-1. 24 hours covers 24 consecutive refused buckets,
 * far beyond anything observed. It is a ceiling, not a durability promise: the
 * edge cache is per-colo and evictable, so raising it lengthens the worst case
 * without making the entry any more likely to still be there.
 */
const FALLBACK_TTL_SECONDS = 86_400;

/**
 * Query that distinguishes the last-known-good entry from the freshness entry.
 * It stays on this path rather than becoming a path of its own for two reasons:
 * every incoming request is normalized to the bare path before any lookup, so no
 * client request can ever be keyed onto it; and `run_worker_first`
 * (`wrangler.jsonc`) matches by path, so a request for this exact URL still
 * enters this handler and is normalized away, where a distinct path would fall
 * through to the assets binding and be served as a 404 page.
 */
const FALLBACK_CACHE_QUERY = "fallback=last-known-good";

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

/** Why a lookup could not produce a validated release. Fixed tokens, never free text. */
type UnavailableReason =
	| "fetch-failed"
	| "upstream-status"
	| "invalid-json"
	| "schema-rejected"
	| "fallback-unreadable";

/**
 * `wrangler.jsonc` enables Workers Logs at full head sampling with `persist: true`,
 * and diagnosing the shared-egress rate limiting behind this route required adding
 * a line like this temporarily under `wrangler dev --remote`. Making it permanent is
 * what distinguishes "the fallback is carrying the page" from "the fallback is
 * masking a broken payload contract", which a response header could not tell an
 * operator because headers are not aggregated and logs are.
 *
 * It carries a fixed reason token and, for a rejected status, the numeric status.
 * Never the upstream body, the raw payload, or a caught exception: a log is a sink
 * those could leave the Worker through, and the guarantee above says they do not.
 */
const UNAVAILABLE_LOG = "latest-release: upstream unavailable";

function logUnavailable(reason: UnavailableReason, status?: number): void {
	console.warn(UNAVAILABLE_LOG, { reason, ...(status === undefined ? {} : { status }) });
}

/**
 * Ask GitHub for the latest release and return it only if it validates. Every way
 * this can fail collapses to `null`, so the caller has one degraded path rather
 * than four.
 */
async function fetchUpstreamRelease(): Promise<GithubRelease | null> {
	let upstream: Response;
	try {
		upstream = await fetch(GITHUB_LATEST_RELEASE_URL, { headers: UPSTREAM_HEADERS });
	} catch {
		logUnavailable("fetch-failed");
		return null;
	}

	if (!upstream.ok) {
		logUnavailable("upstream-status", upstream.status);
		return null;
	}

	let raw: unknown;
	try {
		raw = await upstream.json();
	} catch {
		logUnavailable("invalid-json");
		return null;
	}

	const release = parseGithubRelease(raw);
	if (!release) {
		logUnavailable("schema-rejected");
		return null;
	}

	return release;
}

/**
 * Read back the last known good release, or `null` if this colo has none it can
 * still use.
 *
 * The stored value is re-validated rather than trusted. That is the house pattern
 * and not a reflex: `src/lib/github-releases.ts` re-validates this Worker's own
 * response with the same schema "so a malformed body fails closed". The Cache API
 * is shared, zone-scoped, evictable storage addressed by URL — it is not this
 * module's private memory — and the cost is one `JSON.parse` of a few kilobytes on
 * a path that only runs while GitHub is refusing us.
 */
async function readLastKnownGood(cache: Cache, key: Request): Promise<GithubRelease | null> {
	const stored = await cache.match(key);
	if (!stored) {
		return null;
	}

	let raw: unknown;
	try {
		raw = await stored.json();
	} catch {
		logUnavailable("fallback-unreadable");
		return null;
	}

	const release = parseGithubRelease(raw);
	if (!release) {
		logUnavailable("fallback-unreadable");
		return null;
	}

	return release;
}

/**
 * Build a cache key for this route.
 *
 * Query strings do not vary the fixed upstream lookup. Normalize the cache key so a caller
 * cannot bypass the five-minute cache (and GitHub's unauthenticated rate protection) by adding
 * arbitrary query parameters.
 *
 * `query` is only ever a handler-owned constant, never anything derived from the
 * request, so the second key stays unreachable from the outside.
 */
function releaseCacheKey(requestUrl: string, query?: string): Request {
	const path = query ? `${LATEST_RELEASE_PATH}?${query}` : LATEST_RELEASE_PATH;
	return new Request(new URL(path, requestUrl));
}

/**
 * Serve the latest release for the site's own origin. Server-side fetches the
 * fixed GitHub endpoint, validates and narrows the untrusted JSON, and never
 * surfaces raw upstream errors.
 *
 * A validated 200 is stored twice: under the bare path with `max-age=300`, which
 * is what the hot path reads and how often we re-ask GitHub; and under the
 * fallback key with `max-age=86400`, which is only read when GitHub will not
 * answer. The two lifetimes are the whole point — `cache.match` treats an expired
 * entry as a miss, so a fallback stored with the freshness copy's own
 * `Cache-Control` would expire at the same instant and could never once be read.
 *
 * When GitHub will not answer, the fallback copy is served as a 200 marked
 * `no-store`, so recovery is immediate. A 502 means this colo has never stored a
 * good answer, or the one it had has aged out.
 */
export async function handleLatestRelease(
	request: Request,
	ctx: Pick<ExecutionContext, "waitUntil">,
): Promise<Response> {
	if (request.method !== "GET") {
		return errorResponse(405);
	}

	const cache = caches.default;
	const cacheKey = releaseCacheKey(request.url);
	const fallbackKey = releaseCacheKey(request.url, FALLBACK_CACHE_QUERY);
	const cached = await cache.match(cacheKey);
	if (cached) {
		return cached;
	}

	const release = await fetchUpstreamRelease();
	if (!release) {
		const lastKnownGood = await readLastKnownGood(cache, fallbackKey);
		if (!lastKnownGood) {
			return errorResponse(502);
		}
		// Re-serialized from the parsed object, so the "no upstream status, body, or
		// exception text reaches the client" guarantee holds here exactly as it does on
		// the success path: only schema fields are ever written out.
		//
		// Nothing is written to the cache on this path, deliberately. Storing this under
		// the freshness key would keep serving a stale answer for 300s after upstream
		// recovered; re-storing it under the fallback key would let a refused colo refresh
		// the entry from itself on every request and ratchet its age past the ceiling
		// forever. The fallback is only ever written from a validated upstream 200.
		return jsonResponse(lastKnownGood, {
			status: 200,
			headers: {
				"Cache-Control": "no-store",
				"X-Content-Type-Options": "nosniff",
			},
		});
	}

	const response = jsonResponse(release, {
		status: 200,
		headers: {
			"Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
			"X-Content-Type-Options": "nosniff",
		},
	});
	// Cache only this validated 200. The freshness copy is a clone so the streamed
	// body stays readable by the caller; the fallback copy is serialized afresh from
	// the same validated object rather than cloned, which is what makes it structurally
	// impossible to hand both entries the same lifetime.
	ctx.waitUntil(
		Promise.all([
			cache.put(cacheKey, response.clone()),
			cache.put(
				fallbackKey,
				jsonResponse(release, {
					status: 200,
					headers: {
						"Cache-Control": `public, max-age=${FALLBACK_TTL_SECONDS}`,
						"X-Content-Type-Options": "nosniff",
					},
				}),
			),
		]),
	);
	return response;
}
