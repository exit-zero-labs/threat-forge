import { describe, expect, it } from "vitest";
import { userSafeProviderError } from "./ai-provider-errors";

/**
 * A realistic OpenAI 401 body. The provider echoes the submitted key and the
 * account URL back to the caller. In the browser build this path renders
 * directly into the chat panel, so none of it may survive into the message.
 */
const OPENAI_401_BODY =
	'{"error":{"message":"Incorrect API key provided: sk-proj-AbC123XyZ9. You can find your API key at https://platform.openai.com/account/api-keys","type":"invalid_request_error","code":"invalid_api_key"}}';

describe("userSafeProviderError", () => {
	it("produces a message carrying none of the provider body", () => {
		const message = userSafeProviderError("OpenAI", 401);

		expect(message).not.toContain("sk-proj");
		expect(message).not.toContain("platform.openai.com");
		expect(message).not.toContain("invalid_api_key");
		expect(message).not.toContain(OPENAI_401_BODY);

		expect(message).toBe(
			"OpenAI API error (401): the API key was rejected — check the key configured for this provider",
		);
	});

	it("does not blame the key for a 403", () => {
		// OpenAI returns 403 for unsupported region, Anthropic for permission_error.
		const message = userSafeProviderError("OpenAI", 403);
		expect(message).toContain("key permissions or region");
		expect(message).not.toContain("check the key configured");
	});

	it.each([
		[400, "malformed"],
		[401, "API key was rejected"],
		[403, "key permissions or region"],
		[404, "model or endpoint was not found"],
		[413, "too large"],
		[429, "rate limit or quota"],
		[500, "temporarily unavailable"],
		[503, "temporarily unavailable"],
	])("maps %i to its own reason", (status, expected) => {
		expect(userSafeProviderError("Anthropic", status)).toContain(expected);
	});

	it("falls back for unmapped statuses", () => {
		const message = userSafeProviderError("Anthropic", 418);
		expect(message).toContain("the request failed");
		expect(message).toContain("418");
	});

	it("stays in step with the Rust taxonomy", () => {
		// Both platforms talk to the same providers; a user switching between the
		// desktop app and the web build must not get contradictory explanations.
		// If this drifts, update src-tauri/src/ai/providers.rs to match.
		expect(userSafeProviderError("Anthropic", 429)).toBe(
			"Anthropic API error (429): the rate limit or quota was exceeded — wait and try again",
		);
	});
});
