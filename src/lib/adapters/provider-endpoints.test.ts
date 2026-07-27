/**
 * Endpoint drift guard.
 *
 * Three places have to agree on where a keyed AI request may be sent: this
 * package's browser endpoint table, the Rust relay's constants, and the Tauri
 * CSP `connect-src` allowlist. Drift between them is silent — a request is
 * blocked by CSP, or a platform quietly talks to a host the other two do not
 * name — so the two non-TypeScript sources are read from disk here rather than
 * restated, which is what makes this a drift test instead of a copy of itself.
 *
 * Both sources arrive through Vite's `?raw` loader rather than `node:fs`, matching
 * `src/types/thf-fixtures.test.ts`. E2E tooling has Node types, but the browser-targeted root
 * project deliberately excludes their globals; the loader still reads the committed files.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ProtocolException } from "@/lib/ai/protocol/errors";
import { LATEST_RELEASE_ENDPOINT } from "@/lib/github-releases";
import webHeadersSource from "../../../public/_headers?raw";
import rustRelaySource from "../../../src-tauri/src/ai/providers.rs?raw";
import tauriConfigSource from "../../../src-tauri/tauri.conf.json?raw";
import { PROVIDER_ENDPOINTS, providerEndpoint } from "./provider-endpoints";

/** `pub const ANTHROPIC_API_URL: &str = "https://…";` */
const RUST_ENDPOINT_CONSTANT = /pub const (\w+_API_URL): &str = "([^"]+)";/g;

const tauriConfigSchema = z.object({
	app: z.object({ security: z.object({ csp: z.string() }) }),
});

function rustEndpointUrls(): string[] {
	return [...rustRelaySource.matchAll(RUST_ENDPOINT_CONSTANT)].map((match) => match[2]);
}

/** The `https:` origins a CSP's `connect-src` directive permits. */
function connectSrcOrigins(csp: string): string[] {
	const connectSrc = csp
		.split(";")
		.map((directive) => directive.trim())
		.find((directive) => directive.startsWith("connect-src "));
	expect(connectSrc, "the CSP must declare a connect-src directive").toBeDefined();
	return (connectSrc ?? "")
		.split(/\s+/)
		.filter((source) => source.startsWith("https://"))
		.map((source) => new URL(source).origin);
}

/** The `connect-src` https origins the desktop (Tauri) CSP permits. */
function tauriCspConnectSrcOrigins(): string[] {
	const config = tauriConfigSchema.parse(JSON.parse(tauriConfigSource));
	return connectSrcOrigins(config.app.security.csp);
}

/**
 * The single CSP the deployed web build serves for every route via `_headers`.
 *
 * Asserts the file declares exactly one policy and that it sits under the `/*`
 * catch-all. Cloudflare applies the most specific matching rule, so a second,
 * looser block for a narrower path (`/downloads`, say) would override this one
 * for the route that actually performs the release-lookup fetch while every
 * assertion below still read the strict `/*` policy and passed.
 */
function webCsp(): string {
	const matches = [...webHeadersSource.matchAll(/Content-Security-Policy:\s*([^\n]+)/g)];
	expect(matches, "public/_headers must declare exactly one Content-Security-Policy").toHaveLength(
		1,
	);
	const policy = matches[0];
	expect(policy, "public/_headers must declare a Content-Security-Policy").toBeDefined();

	const pathRules = webHeadersSource
		.split("\n")
		.filter((line) => line.length > 0 && !line.startsWith("#") && !/^\s/.test(line));
	expect(pathRules, "the CSP must be served under the /* catch-all only").toEqual(["/*"]);

	return policy?.[1]?.trim() ?? "";
}

const tableUrls = Object.values(PROVIDER_ENDPOINTS).map((endpoint) => endpoint.url);

describe("provider endpoint drift", () => {
	it("reads two endpoint constants out of the Rust relay", () => {
		// Without this the regex could silently match nothing and every comparison
		// below would pass vacuously.
		expect(rustEndpointUrls()).toHaveLength(Object.keys(PROVIDER_ENDPOINTS).length);
	});

	it("names the same endpoints as the Rust relay", () => {
		expect([...tableUrls].sort()).toEqual([...rustEndpointUrls()].sort());
	});

	it("only names origins the desktop CSP allows the webview to reach", () => {
		const allowed = tauriCspConnectSrcOrigins();
		for (const url of tableUrls) {
			expect(allowed, `${url} is not in the desktop CSP connect-src allowlist`).toContain(
				new URL(url).origin,
			);
		}
	});

	it("leaves no provider origin the desktop CSP allows that nothing sends to", () => {
		const tableOrigins = tableUrls.map((url) => new URL(url).origin);
		expect([...tauriCspConnectSrcOrigins()].sort()).toEqual([...new Set(tableOrigins)].sort());
	});

	it("lets the web build reach every provider origin the endpoint table names", () => {
		const allowed = connectSrcOrigins(webCsp());
		for (const url of tableUrls) {
			expect(allowed, `${url} is not in the web CSP connect-src allowlist`).toContain(
				new URL(url).origin,
			);
		}
	});

	it("allows the web build no https connect origin beyond the endpoint table", () => {
		// Every https origin the web CSP permits must be a key-bearing provider
		// endpoint. There is no exempt set: #232 removed the last non-key origin
		// (the analytics beacon), so a stray host added to either side fails here
		// rather than being waved through as "harmless".
		const tableOrigins = new Set(tableUrls.map((url) => new URL(url).origin));
		expect([...connectSrcOrigins(webCsp())].sort()).toEqual([...tableOrigins].sort());
	});

	it("admits no third-party script origin into the web build", () => {
		// script-src is the primary defense for the browser BYOK key, not a
		// secondary one: script on this origin reaches the same wrapping key and
		// decrypts exactly as the app does. Any origin beyond 'self' — and any
		// 'unsafe-inline' or 'unsafe-eval' — is therefore trusted with the key.
		//
		// Matched across the whole script family rather than `script-src` alone.
		// CSP3 lets `script-src-elem` override `script-src` for <script> elements,
		// so pinning only `script-src` would let a third-party origin back in via
		// `script-src-elem` with this test still green — the failure mode where a
		// passing security guard vouches for the hole it was written to close.
		const scriptDirectives = webCsp()
			.split(";")
			.map((directive) => directive.trim())
			.filter((directive) => /^script-src(-elem|-attr)?\s/.test(directive));
		expect(
			scriptDirectives,
			"the web CSP must set `script-src 'self'` and no -elem/-attr override",
		).toEqual(["script-src 'self'"]);
	});

	it("fails the web build's non-connect vectors closed", () => {
		// Exact directive equality, not substring: `default-src 'self'` is a
		// substring of `default-src 'self' https://evil.example`, so `toContain`
		// would pass against a widened fallback.
		const directives = new Set(
			webCsp()
				.split(";")
				.map((directive) => directive.trim()),
		);
		for (const directive of [
			"default-src 'self'",
			"object-src 'none'",
			"base-uri 'self'",
			"form-action 'self'",
			"frame-ancestors 'none'",
		]) {
			expect([...directives], `the web CSP must set exactly ${directive}`).toContainEqual(
				directive,
			);
		}
	});

	it("hardens the desktop CSP with base-uri and form-action", () => {
		const config = tauriConfigSchema.parse(JSON.parse(tauriConfigSource));
		for (const directive of ["base-uri 'self'", "form-action 'self'"]) {
			expect(config.app.security.csp, `the desktop CSP must set ${directive}`).toContain(directive);
		}
	});

	it("sends every provider request over https", () => {
		for (const url of tableUrls) {
			expect(new URL(url).protocol).toBe("https:");
		}
	});

	it("puts the API key in a header and never in the URL", () => {
		for (const endpoint of Object.values(PROVIDER_ENDPOINTS)) {
			expect(endpoint.url).not.toContain("sk-");
			const headers = endpoint.buildHeaders("sk-test-secret-value");
			const carriers = Object.values(headers).filter((value) =>
				value.includes("sk-test-secret-value"),
			);
			expect(carriers).toHaveLength(1);
		}
	});
});

describe("the endpoint table as a trust boundary", () => {
	it("cannot be repointed at another host", () => {
		expect(() => {
			// @ts-expect-error the table is `Readonly`; this is the runtime half of
			// the same guarantee, since a type is not a defense against a module
			// that was compiled against an older shape.
			PROVIDER_ENDPOINTS.anthropic.url = "https://evil.example/v1/messages";
		}).toThrow(TypeError);
		expect(PROVIDER_ENDPOINTS.anthropic.url).toBe("https://api.anthropic.com/v1/messages");
	});

	it("cannot gain a provider that neither Rust nor the CSP knows about", () => {
		expect(() => {
			// @ts-expect-error same: `Readonly<Record<AiProvider, …>>` rejects this at
			// compile time, and the freeze rejects it at run time.
			PROVIDER_ENDPOINTS.mistral = {
				url: "https://evil.example",
				label: "x",
				buildHeaders: () => ({}),
			};
		}).toThrow(TypeError);
	});

	it("resolves each known provider to its own endpoint", () => {
		expect(providerEndpoint("anthropic")).toBe(PROVIDER_ENDPOINTS.anthropic);
		expect(providerEndpoint("openai")).toBe(PROVIDER_ENDPOINTS.openai);
	});

	it("refuses a provider name that is only an inherited property", () => {
		// A plain index would return `Object.prototype.constructor` here — a truthy
		// value whose `url` is `undefined`, which `fetch` resolves against the page
		// origin instead of refusing.
		// @ts-expect-error not an `AiProvider`; the guard exists for a value that
		// reached the transport without passing the type.
		expect(() => providerEndpoint("constructor")).toThrow(ProtocolException);
		// @ts-expect-error as above.
		expect(() => providerEndpoint("toString")).toThrow(ProtocolException);
	});
});

describe("the release lookup stays same-origin under the web CSP", () => {
	// Issue #172: the downloads page reads the latest release through the app's
	// own Cloudflare Worker route, not GitHub directly, so the web CSP needs no
	// `api.github.com` exception — that origin is a write-capable multi-tenant API
	// and a poor thing to leave in the key-exfiltration backstop.
	it("points the release lookup at the app origin, not a third-party API", () => {
		expect(LATEST_RELEASE_ENDPOINT.startsWith("/")).toBe(true);
		expect(LATEST_RELEASE_ENDPOINT).not.toContain("://");
		expect(LATEST_RELEASE_ENDPOINT).not.toContain("api.github.com");
	});

	it("keeps api.github.com out of the web CSP connect-src", () => {
		expect(connectSrcOrigins(webCsp())).not.toContain("https://api.github.com");
	});
});
