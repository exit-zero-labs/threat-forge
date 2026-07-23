/**
 * Where the browser transport sends a provider request, and with which headers.
 *
 * On desktop this table does not exist: `endpoint_for` and `auth_headers` in
 * `src-tauri/src/ai/providers.rs` own both facts so the API key never enters
 * the webview, and the frontend cannot supply a URL or a header at all. In the
 * browser there is no Rust process to hold either, so the same two facts live
 * here — and only here, so that no caller can direct a keyed request at an
 * arbitrary URL.
 *
 * Three places must agree on these origins: this table, the Rust constants, and
 * the Tauri CSP `connect-src` allowlist in `src-tauri/tauri.conf.json`. A
 * mismatch is invisible until a user's request is silently blocked by CSP or
 * sent somewhere unintended, so `./provider-endpoints.test.ts` reads the other
 * two from disk and fails on drift.
 *
 * User-configurable and self-hosted base URLs (Ollama, Azure, OpenRouter,
 * proxies) are deliberately out of scope: allowing one would mean a key could
 * be sent to a host the user did not vet, and would require the CSP allowlist
 * to be widened past the two official endpoints.
 */

import { ProtocolException } from "@/lib/ai/protocol/errors";
import type { AiProvider } from "@/lib/ai/protocol/messages";
import { buildAnthropicBrowserHeaders } from "@/lib/ai/providers/anthropic";
import { buildOpenAiBrowserHeaders } from "@/lib/ai/providers/openai";

export interface ProviderEndpoint {
	/** Absolute POST target for a streaming chat request. */
	url: string;
	/** Human-readable provider name for user-facing error sentences. */
	label: string;
	/** Request headers, including the BYOK credential, for a direct browser call. */
	buildHeaders: (apiKey: string) => Record<string, string>;
}

/**
 * Frozen at both levels: this table is the browser build's sole authority on
 * where a keyed request may go, and an unfrozen entry would let any module that
 * can reach it redirect the user's key to another host without touching this
 * file, the Rust constants, or the CSP allowlist.
 */
export const PROVIDER_ENDPOINTS: Readonly<Record<AiProvider, Readonly<ProviderEndpoint>>> =
	Object.freeze({
		anthropic: Object.freeze({
			url: "https://api.anthropic.com/v1/messages",
			label: "Anthropic",
			buildHeaders: buildAnthropicBrowserHeaders,
		}),
		openai: Object.freeze({
			url: "https://api.openai.com/v1/chat/completions",
			label: "OpenAI",
			buildHeaders: buildOpenAiBrowserHeaders,
		}),
	});

/**
 * Resolve the endpoint for a provider.
 *
 * The lookup is guarded with `Object.hasOwn` rather than indexed directly. The
 * argument is typed, but it arrives inside a request object a caller built, and
 * a bare index resolves inherited `Object.prototype` members: a provider of
 * `"constructor"` or `"toString"` would yield a truthy non-endpoint whose `url`
 * is `undefined` and whose `buildHeaders` is not a function, turning a wrong
 * provider name into a `fetch` to a relative URL instead of a refusal.
 */
export function providerEndpoint(provider: AiProvider): ProviderEndpoint {
	if (!Object.hasOwn(PROVIDER_ENDPOINTS, provider)) {
		throw new ProtocolException({
			code: "transport",
			message: "ThreatForge has no endpoint configured for the selected AI provider.",
		});
	}
	return PROVIDER_ENDPOINTS[provider];
}
