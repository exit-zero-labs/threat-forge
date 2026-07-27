import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { routeRequest } from "./index";
import { handleLatestRelease, LATEST_RELEASE_PATH } from "./latest-release";

const RELEASE_URL = `https://threatforge.dev${LATEST_RELEASE_PATH}`;
/** The handler-owned second cache key holding the last known good release. */
const FALLBACK_URL = `${RELEASE_URL}?fallback=last-known-good`;

/**
 * The two lifetimes the handler promises, written as literals rather than imported
 * from the module under test — a test that took the number from the implementation
 * would agree with any number the implementation chose.
 */
const FRESHNESS_TTL_SECONDS = 300;
const FALLBACK_TTL_SECONDS = 86_400;

/** `Cache-Control: public, max-age=300` → `300`; no directive → `null` (never expires here). */
function storedMaxAgeSeconds(response: Response): number | null {
	const directive = response.headers.get("Cache-Control");
	const matched = directive ? /max-age=(\d+)/.exec(directive) : null;
	return matched ? Number(matched[1]) : null;
}

/**
 * A Cache API double that records what the handler stores and models the two
 * documented behaviours this route depends on
 * (https://developers.cloudflare.com/workers/runtime-apis/cache/):
 *
 *   - "cache.match generates a 504 error response when the requested content is
 *     missing or expired. The Cache API does not expose this 504 directly to the
 *     Worker script, instead returning `undefined`." An expired entry is a miss,
 *     so a fallback entry only outlives the freshness entry if it was stored with
 *     a longer lifetime of its own.
 *   - The Cache API "respects the following HTTP headers on the response passed
 *     to `put()`: Cache-Control ...". The stored response's own `max-age` is what
 *     decides that lifetime, which is why `match` reads it back rather than
 *     taking a TTL from the caller.
 *
 * Time is a virtual counter advanced by `advanceSeconds`; the handler reads no
 * clock, so stubbing a global one would mock more than the tests need.
 *
 * One deliberate divergence: an entry stored without `Cache-Control` never
 * expires here, where Cloudflare would apply its 120-minute default Edge TTL for
 * a 200. No production path stores one — only the hand-seeded cache-hit fixture
 * below does — so the divergence is unreachable from the code under test.
 */
function createCache() {
	const store = new Map<string, Response>();
	const storedAt = new Map<string, number>();
	let now = 0;
	return {
		match: vi.fn((request: Request) => {
			const stored = store.get(request.url);
			if (!stored) {
				return Promise.resolve(undefined);
			}
			const maxAge = storedMaxAgeSeconds(stored);
			if (maxAge !== null && now - (storedAt.get(request.url) ?? 0) >= maxAge) {
				return Promise.resolve(undefined);
			}
			// A fresh Response per match: production reads the fallback entry's body,
			// and handing back the same object twice would fail on a consumed body in
			// a way the real Cache API never would.
			return Promise.resolve(stored.clone());
		}),
		put: vi.fn((request: Request, response: Response) => {
			store.set(request.url, response);
			storedAt.set(request.url, now);
			return Promise.resolve();
		}),
		advanceSeconds: (seconds: number) => {
			now += seconds;
		},
		store,
	};
}

/** An ExecutionContext double whose `waitUntil` promises can be awaited. */
function createCtx() {
	const pending: Promise<unknown>[] = [];
	return {
		waitUntil: (promise: Promise<unknown>) => {
			pending.push(promise);
		},
		settle: () => Promise.all(pending),
	};
}

const FULL_GITHUB_RESPONSE = {
	tag_name: "v0.2.0",
	published_at: "2026-07-01T00:00:00Z",
	html_url: "https://github.com/exit-zero-labs/threat-forge/releases/tag/v0.2.0",
	// Deliberately noisy: extra top-level and per-asset fields the client must not receive.
	id: 123456,
	author: { login: "someone", token: "should-never-appear" },
	assets: [
		{
			name: "Threat.Forge_0.2.0_aarch64.dmg",
			browser_download_url:
				"https://github.com/exit-zero-labs/threat-forge/releases/download/v0.2.0/aarch64.dmg",
			size: 10_000_000,
			uploader: { login: "ci-bot" },
			download_count: 42,
		},
	],
};

/** Exactly what the contract lets through: schema fields only, upstream noise dropped. */
const NARROWED_RELEASE = {
	tag_name: "v0.2.0",
	published_at: "2026-07-01T00:00:00Z",
	html_url: "https://github.com/exit-zero-labs/threat-forge/releases/tag/v0.2.0",
	assets: [
		{
			name: "Threat.Forge_0.2.0_aarch64.dmg",
			browser_download_url:
				"https://github.com/exit-zero-labs/threat-forge/releases/download/v0.2.0/aarch64.dmg",
			size: 10_000_000,
		},
	],
};

function spyOnFetch() {
	return vi.spyOn(globalThis, "fetch");
}

/** Every way GitHub can refuse to give us a validated release. */
const UPSTREAM_FAILURES: readonly {
	name: string;
	apply: (fetchSpy: ReturnType<typeof spyOnFetch>) => void;
}[] = [
	{
		name: "upstream returns 403",
		apply: (fetchSpy) => {
			fetchSpy.mockResolvedValueOnce(new Response("rate limited: token abc", { status: 403 }));
		},
	},
	{
		name: "upstream returns 500",
		apply: (fetchSpy) => {
			fetchSpy.mockResolvedValueOnce(new Response("upstream exploded", { status: 500 }));
		},
	},
	{
		name: "the upstream fetch rejects",
		apply: (fetchSpy) => {
			fetchSpy.mockRejectedValueOnce(new Error("network down"));
		},
	},
	{
		name: "the upstream body is not JSON",
		apply: (fetchSpy) => {
			fetchSpy.mockResolvedValueOnce(new Response("<html>not json</html>", { status: 200 }));
		},
	},
	{
		name: "the upstream payload fails schema validation",
		apply: (fetchSpy) => {
			fetchSpy.mockResolvedValueOnce(
				new Response(JSON.stringify({ assets: [{ name: 42 }] }), { status: 200 }),
			);
		},
	},
];

let cache: ReturnType<typeof createCache>;
/**
 * The handler logs one line per failed lookup. Spying in `beforeEach` keeps the
 * failure-path tests from writing to the runner's stderr and gives every test the
 * same handle to assert on.
 */
let warnSpy: MockInstance<typeof console.warn>;

beforeEach(() => {
	cache = createCache();
	warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.stubGlobal("caches", { default: cache });
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("handleLatestRelease", () => {
	it("rejects non-GET methods without touching the cache or upstream", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const ctx = createCtx();

		const response = await handleLatestRelease(new Request(RELEASE_URL, { method: "POST" }), ctx);

		expect(response.status).toBe(405);
		expect(response.headers.get("Allow")).toBe("GET");
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(cache.match).not.toHaveBeenCalled();
	});

	it("fetches, validates, and trims the upstream response on a cache miss", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(JSON.stringify(FULL_GITHUB_RESPONSE), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		const ctx = createCtx();

		const response = await handleLatestRelease(new Request(RELEASE_URL), ctx);
		await ctx.settle();

		// Upstream URL is fixed and client-uninfluenced.
		expect(fetchSpy).toHaveBeenCalledOnce();
		const [calledUrl] = fetchSpy.mock.calls[0];
		expect(calledUrl).toBe(
			"https://api.github.com/repos/exit-zero-labs/threat-forge/releases/latest",
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");

		const body = await response.json();
		// Only the contract fields survive; upstream noise is dropped.
		expect(body).toEqual(NARROWED_RELEASE);
		expect(JSON.stringify(body)).not.toContain("token");
		expect(JSON.stringify(body)).not.toContain("download_count");
	});

	it("stores the validated response under both the freshness key and the fallback key", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(JSON.stringify(FULL_GITHUB_RESPONSE), { status: 200 }),
		);
		const ctx = createCtx();

		await handleLatestRelease(new Request(RELEASE_URL), ctx);
		await ctx.settle();

		expect(cache.put).toHaveBeenCalledTimes(2);
		// The two lifetimes must differ, or the fallback expires with the copy it
		// exists to outlive and can never once be read.
		expect(cache.store.get(RELEASE_URL)?.headers.get("Cache-Control")).toBe("public, max-age=300");
		expect(cache.store.get(FALLBACK_URL)?.headers.get("Cache-Control")).toBe(
			"public, max-age=86400",
		);
	});

	it("serves the cached response without a second upstream fetch on a cache hit", async () => {
		cache.store.set(
			RELEASE_URL,
			new Response(JSON.stringify({ tag_name: "cached" }), {
				status: 200,
				headers: { "X-From-Cache": "yes" },
			}),
		);
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const ctx = createCtx();

		const response = await handleLatestRelease(new Request(RELEASE_URL), ctx);

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(response.headers.get("X-From-Cache")).toBe("yes");
	});

	it("normalizes query strings to one cache key", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(new Response(JSON.stringify(FULL_GITHUB_RESPONSE), { status: 200 }));
		const firstCtx = createCtx();
		await handleLatestRelease(new Request(`${RELEASE_URL}?cache-bust=one`), firstCtx);
		await firstCtx.settle();

		const second = await handleLatestRelease(
			new Request(`${RELEASE_URL}?cache-bust=two`),
			createCtx(),
		);

		expect(second.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledOnce();
		// Both keys are handler-owned constants; neither carries a client query string.
		expect([...cache.store.keys()]).toEqual([RELEASE_URL, FALLBACK_URL]);
	});

	it("returns a sanitized 502 and caches nothing when upstream is not ok", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response("rate limited: token abc", { status: 403 }),
		);
		const ctx = createCtx();

		const response = await handleLatestRelease(new Request(RELEASE_URL), ctx);
		await ctx.settle();

		expect(response.status).toBe(502);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		const body = await response.json();
		expect(body).toEqual({ error: "release lookup unavailable" });
		// The upstream status and body never leak.
		expect(JSON.stringify(body)).not.toContain("403");
		expect(JSON.stringify(body)).not.toContain("token");
		expect(cache.put).not.toHaveBeenCalled();
	});

	it("returns 502 and caches nothing when the upstream fetch rejects", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network down"));
		const ctx = createCtx();

		const response = await handleLatestRelease(new Request(RELEASE_URL), ctx);
		await ctx.settle();

		expect(response.status).toBe(502);
		expect(cache.put).not.toHaveBeenCalled();
	});

	it("returns 502 when the upstream body is not JSON", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response("<html>not json</html>", { status: 200 }),
		);
		const ctx = createCtx();

		const response = await handleLatestRelease(new Request(RELEASE_URL), ctx);
		await ctx.settle();

		expect(response.status).toBe(502);
		expect(cache.put).not.toHaveBeenCalled();
	});

	it("returns 502 when the upstream JSON fails schema validation", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(JSON.stringify({ assets: [{ name: 42 }] }), { status: 200 }),
		);
		const ctx = createCtx();

		const response = await handleLatestRelease(new Request(RELEASE_URL), ctx);
		await ctx.settle();

		expect(response.status).toBe(502);
		expect(cache.put).not.toHaveBeenCalled();
	});

	it("records why a lookup failed without logging the upstream body", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response("rate limited: token abc", { status: 403 }),
		);
		const ctx = createCtx();

		await handleLatestRelease(new Request(RELEASE_URL), ctx);
		await ctx.settle();

		expect(warnSpy).toHaveBeenCalledOnce();
		const logged = JSON.stringify(warnSpy.mock.calls[0]);
		expect(logged).toContain("upstream-status");
		expect(logged).toContain("403");
		// The upstream body is not a thing a log may carry either.
		expect(logged).not.toContain("token");
	});

	it("logs nothing when the lookup succeeds", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(JSON.stringify(FULL_GITHUB_RESPONSE), { status: 200 }),
		);
		const ctx = createCtx();

		await handleLatestRelease(new Request(RELEASE_URL), ctx);
		await ctx.settle();

		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("rejects non-GitHub asset links instead of proxying them to the downloads page", async () => {
		const unsafe = structuredClone(FULL_GITHUB_RESPONSE);
		unsafe.assets[0].browser_download_url = "javascript:alert(document.domain)";
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(JSON.stringify(unsafe), { status: 200 }),
		);

		const response = await handleLatestRelease(new Request(RELEASE_URL), createCtx());

		expect(response.status).toBe(502);
		expect(cache.put).not.toHaveBeenCalled();
	});

	describe("when GitHub will not answer", () => {
		/**
		 * Populate both cache entries from a real successful lookup, then let the
		 * five-minute freshness copy expire. Only the 24-hour fallback copy survives,
		 * so the next call has to go upstream — which is what makes the assertions
		 * below about the *second* fetch meaningful rather than a still-fresh hit.
		 */
		async function seedThenExpireFreshness(
			fetchSpy: ReturnType<typeof spyOnFetch>,
			upstream: unknown = FULL_GITHUB_RESPONSE,
		): Promise<void> {
			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(upstream), { status: 200 }));
			const ctx = createCtx();
			await handleLatestRelease(new Request(RELEASE_URL), ctx);
			await ctx.settle();
			cache.advanceSeconds(FRESHNESS_TTL_SECONDS + 1);
		}

		it.each(UPSTREAM_FAILURES)(
			"serves the last known good release when $name",
			async ({ apply }) => {
				const fetchSpy = spyOnFetch();
				await seedThenExpireFreshness(fetchSpy);
				apply(fetchSpy);

				const ctx = createCtx();
				const response = await handleLatestRelease(new Request(RELEASE_URL), ctx);
				await ctx.settle();

				// The freshness copy really did expire, so this answer came from the fallback.
				expect(fetchSpy).toHaveBeenCalledTimes(2);
				expect(response.status).toBe(200);
				expect(response.headers.get("Cache-Control")).toBe("no-store");
				expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
				expect(await response.json()).toEqual(NARROWED_RELEASE);
				// Nothing new was cached: still just the two entries the seed wrote.
				expect(cache.put).toHaveBeenCalledTimes(2);
			},
		);

		it("does not leak the upstream status or body on the stale path", async () => {
			const fetchSpy = spyOnFetch();
			await seedThenExpireFreshness(fetchSpy);
			fetchSpy.mockResolvedValueOnce(new Response("rate limited: token abc", { status: 403 }));

			const ctx = createCtx();
			const response = await handleLatestRelease(new Request(RELEASE_URL), ctx);
			await ctx.settle();

			expect(response.status).toBe(200);
			const serialized = JSON.stringify(await response.json());
			expect(serialized).not.toContain("token");
			expect(serialized).not.toContain("403");
		});

		it("serves the fresh release again as soon as upstream recovers", async () => {
			const fetchSpy = spyOnFetch();
			await seedThenExpireFreshness(fetchSpy);

			fetchSpy.mockResolvedValueOnce(new Response("rate limited", { status: 403 }));
			const staleCtx = createCtx();
			const stale = await handleLatestRelease(new Request(RELEASE_URL), staleCtx);
			await staleCtx.settle();
			expect(stale.status).toBe(200);
			expect(await stale.json()).toEqual(NARROWED_RELEASE);

			fetchSpy.mockResolvedValueOnce(
				new Response(JSON.stringify({ ...FULL_GITHUB_RESPONSE, tag_name: "v0.3.0" }), {
					status: 200,
				}),
			);
			const recoveredCtx = createCtx();
			const recovered = await handleLatestRelease(new Request(RELEASE_URL), recoveredCtx);
			await recoveredCtx.settle();

			// No stale answer was left behind under the freshness key to shadow this one.
			expect(recovered.status).toBe(200);
			expect(recovered.headers.get("Cache-Control")).toBe("public, max-age=300");
			expect(await recovered.json()).toMatchObject({ tag_name: "v0.3.0" });
		});

		it("stops serving the last known good release once it is older than a day", async () => {
			const fetchSpy = spyOnFetch();
			await seedThenExpireFreshness(fetchSpy);

			fetchSpy.mockResolvedValueOnce(new Response("rate limited", { status: 403 }));
			const withinCeiling = await handleLatestRelease(new Request(RELEASE_URL), createCtx());
			expect(withinCeiling.status).toBe(200);

			// Past 24 hours from the single store, which a stale serve must not have reset.
			cache.advanceSeconds(FALLBACK_TTL_SECONDS - FRESHNESS_TTL_SECONDS);
			fetchSpy.mockResolvedValueOnce(new Response("rate limited", { status: 403 }));
			const ctx = createCtx();
			const expired = await handleLatestRelease(new Request(RELEASE_URL), ctx);
			await ctx.settle();

			expect(expired.status).toBe(502);
			expect(expired.headers.get("Cache-Control")).toBe("no-store");
			expect(await expired.json()).toEqual({ error: "release lookup unavailable" });
		});

		it.each([
			["is not JSON at all", new Response("<html>not json</html>")],
			["parses but fails the release schema", new Response(JSON.stringify({ tag_name: 42 }))],
		])("returns the sanitized 502 when the stored copy %s", async (_name, stored) => {
			cache.store.set(
				FALLBACK_URL,
				new Response(stored.body, {
					headers: { "Cache-Control": `public, max-age=${FALLBACK_TTL_SECONDS}` },
				}),
			);
			const fetchSpy = spyOnFetch();
			fetchSpy.mockResolvedValueOnce(new Response("rate limited", { status: 403 }));
			const ctx = createCtx();

			const response = await handleLatestRelease(new Request(RELEASE_URL), ctx);
			await ctx.settle();

			expect(response.status).toBe(502);
			expect(response.headers.get("Cache-Control")).toBe("no-store");
			expect(await response.json()).toEqual({ error: "release lookup unavailable" });
			expect(JSON.stringify(warnSpy.mock.calls)).toContain("fallback-unreadable");
		});
	});
});

describe("worker.fetch routing", () => {
	it("routes the API path to the release handler", async () => {
		const assetsFetch = vi.fn();
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(JSON.stringify(FULL_GITHUB_RESPONSE), { status: 200 }),
		);
		const ctx = createCtx();

		const response = await routeRequest(new Request(RELEASE_URL), { fetch: assetsFetch }, ctx);
		await ctx.settle();

		expect(response.status).toBe(200);
		expect(assetsFetch).not.toHaveBeenCalled();
	});

	it("delegates every non-API request to the static assets binding", async () => {
		const assetResponse = new Response("<!doctype html>", { status: 200 });
		const assetsFetch = vi.fn(() => Promise.resolve(assetResponse));
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const request = new Request("https://threatforge.dev/download");
		const ctx = createCtx();

		const response = await routeRequest(request, { fetch: assetsFetch }, ctx);

		expect(assetsFetch).toHaveBeenCalledWith(request);
		expect(response).toBe(assetResponse);
		// The Worker never reaches upstream for a static request.
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
