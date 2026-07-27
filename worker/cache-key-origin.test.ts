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

	it("is https, so cache writes are not silently scoped to a second key space", () => {
		expect(new URL(CACHE_KEY_ORIGIN).protocol).toBe("https:");
		expect(new URL(CACHE_KEY_ORIGIN).port).toBe("");
	});
});
