// @vitest-environment node
//
// The Cache API is zone-scoped. If `CACHE_KEY_ORIGIN` ever stops naming a hostname this
// Worker is actually deployed on, nothing raises: `cache.match` returns `undefined`, which
// is indistinguishable from a cold colo, and `cache.put` runs inside `ctx.waitUntil` where
// its result is never read. The route would degrade to a 1:1 proxy of `api.github.com` —
// the exact rate-limit exhaustion `#284` exists to prevent — while every response still
// looked correct. The hostname is duplicated across the Worker and `wrangler.jsonc` with
// nothing tying them together, so this ties them.
//
// Node environment because Wrangler's config reader is a Node package and fails under jsdom.
// `experimental_readRawConfig` is used rather than `JSON.parse` because the config is jsonc.
// The prefix is Cloudflare reserving the right to move it on a minor bump, so a red suite
// straight after a Wrangler upgrade is likely to start here.

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { experimental_readRawConfig } from "wrangler";
import { CACHE_KEY_ORIGIN } from "./latest-release";

const repoRoot = join(import.meta.dirname, "..");

function customDomainPatterns(): string[] {
	const { rawConfig } = experimental_readRawConfig({
		config: join(repoRoot, "wrangler.jsonc"),
	});
	const routes: unknown[] = rawConfig.routes ?? [];
	return routes.filter(isCustomDomainRoute).map((route) => route.pattern);
}

function isCustomDomainRoute(route: unknown): route is { pattern: string; custom_domain: true } {
	return (
		typeof route === "object" &&
		route !== null &&
		"custom_domain" in route &&
		route.custom_domain === true &&
		"pattern" in route &&
		typeof route.pattern === "string"
	);
}

describe("CACHE_KEY_ORIGIN", () => {
	it("names a hostname this Worker is deployed on", () => {
		const patterns = customDomainPatterns();

		// Guards the guard: an empty list would make the assertion below vacuous.
		expect(patterns.length).toBeGreaterThan(0);
		expect(patterns).toContain(new URL(CACHE_KEY_ORIGIN).hostname);
	});

	it("is the zone every deployed hostname belongs to, not merely one of them", () => {
		// The assertion above is one-directional: adding a second, unrelated zone would
		// leave it passing while every request arriving there wrote a cache key off its
		// own zone — the same silent outage, reached from the other side. If a genuinely
		// separate zone is ever wanted, this fails and forces the real decision (a key
		// derived per zone) instead of a cache that quietly stops working.
		const pinned = new URL(CACHE_KEY_ORIGIN).hostname;

		for (const pattern of customDomainPatterns()) {
			expect(pattern === pinned || pattern.endsWith(`.${pinned}`)).toBe(true);
		}
	});

	it("is https, so cache writes are not silently scoped to a second key space", () => {
		expect(new URL(CACHE_KEY_ORIGIN).protocol).toBe("https:");
		expect(new URL(CACHE_KEY_ORIGIN).port).toBe("");
	});
});
