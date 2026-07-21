/**
 * User-safe provider error messages for the browser chat path.
 *
 * Mirrors `user_safe_provider_error` in `src-tauri/src/ai/providers.rs`. Both
 * platforms talk to the same providers and must fail the same way, so the
 * status taxonomy is kept identical in both files.
 *
 * The provider's response body is never included. An OpenAI 401 body echoes the
 * submitted API key back in its `message` field, and in the browser build this
 * string is rendered directly into the chat panel — so a mistyped key would be
 * displayed on screen, and travel into any screenshot or screen share.
 */

/** Map a provider HTTP failure to a message that is safe to show the user. */
export function userSafeProviderError(provider: string, status: number): string {
	const reason = providerErrorReason(status);
	return `${provider} API error (${status}): ${reason}`;
}

function providerErrorReason(status: number): string {
	if (status >= 500 && status <= 599) return "the provider is temporarily unavailable";
	switch (status) {
		case 400:
			return "the request was rejected as malformed";
		case 401:
			return "the API key was rejected — check the key configured for this provider";
		// Not a bad key: OpenAI returns 403 for unsupported country/region, and
		// Anthropic for permission_error. Neither is fixed by changing the key.
		case 403:
			return "the provider refused this request (key permissions or region)";
		case 404:
			return "the requested model or endpoint was not found";
		case 413:
			return "the request was too large for this model";
		case 429:
			return "the rate limit or quota was exceeded — wait and try again";
		default:
			return "the request failed";
	}
}
