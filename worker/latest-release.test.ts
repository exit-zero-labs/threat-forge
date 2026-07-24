import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeRequest } from "./index";
import { handleLatestRelease, LATEST_RELEASE_PATH } from "./latest-release";

const RELEASE_URL = `https://threatforge.dev${LATEST_RELEASE_PATH}`;

/** A minimal Cache API double that records what the handler stores. */
function createCache() {
	const store = new Map<string, Response>();
	return {
		match: vi.fn((request: Request) => Promise.resolve(store.get(request.url))),
		put: vi.fn((request: Request, response: Response) => {
			store.set(request.url, response);
			return Promise.resolve();
		}),
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

let cache: ReturnType<typeof createCache>;

beforeEach(() => {
	cache = createCache();
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
		expect(body).toEqual({
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
		});
		expect(JSON.stringify(body)).not.toContain("token");
		expect(JSON.stringify(body)).not.toContain("download_count");
	});

	it("stores the validated response in the edge cache", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(JSON.stringify(FULL_GITHUB_RESPONSE), { status: 200 }),
		);
		const ctx = createCtx();

		await handleLatestRelease(new Request(RELEASE_URL), ctx);
		await ctx.settle();

		expect(cache.put).toHaveBeenCalledOnce();
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
		expect(cache.store.size).toBe(1);
		expect([...cache.store.keys()]).toEqual([RELEASE_URL]);
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
