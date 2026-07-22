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
 * Both sources arrive through Vite's `?raw` loader rather than `node:fs`,
 * matching `src/types/thf-fixtures.test.ts`: the repository has no
 * `@types/node`, and the loader still reads the committed file, so an edit to
 * either one shows up here.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import rustRelaySource from "../../../src-tauri/src/ai/providers.rs?raw";
import tauriConfigSource from "../../../src-tauri/tauri.conf.json?raw";
import { PROVIDER_ENDPOINTS } from "./provider-endpoints";

/** `pub const ANTHROPIC_API_URL: &str = "https://…";` */
const RUST_ENDPOINT_CONSTANT = /pub const (\w+_API_URL): &str = "([^"]+)";/g;

const tauriConfigSchema = z.object({
	app: z.object({ security: z.object({ csp: z.string() }) }),
});

function rustEndpointUrls(): string[] {
	return [...rustRelaySource.matchAll(RUST_ENDPOINT_CONSTANT)].map((match) => match[2]);
}

/** The `https:` origins the Tauri CSP permits the webview to connect to. */
function cspConnectSrcOrigins(): string[] {
	const config = tauriConfigSchema.parse(JSON.parse(tauriConfigSource));
	const connectSrc = config.app.security.csp
		.split(";")
		.map((directive) => directive.trim())
		.find((directive) => directive.startsWith("connect-src "));
	expect(connectSrc, "the CSP must declare a connect-src directive").toBeDefined();
	return (connectSrc ?? "")
		.split(/\s+/)
		.filter((source) => source.startsWith("https://"))
		.map((source) => new URL(source).origin);
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

	it("only names origins the Tauri CSP allows the webview to reach", () => {
		const allowed = cspConnectSrcOrigins();
		for (const url of tableUrls) {
			expect(allowed, `${url} is not in the CSP connect-src allowlist`).toContain(
				new URL(url).origin,
			);
		}
	});

	it("leaves no provider origin allowed by the CSP that nothing sends to", () => {
		const tableOrigins = tableUrls.map((url) => new URL(url).origin);
		expect([...cspConnectSrcOrigins()].sort()).toEqual([...new Set(tableOrigins)].sort());
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
