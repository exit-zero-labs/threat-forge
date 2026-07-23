/**
 * Production transport wiring.
 *
 * `getChatTransport` must wrap the platform transport in the retry decorator, so a
 * transient failure before the first frame is retried on the real browser and
 * desktop paths — not just in the decorator's own unit tests. Asserting the
 * factory itself is what catches a "retry removed from production" regression that
 * `retry.ts`'s tests would not.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAnthropicRequestBody } from "@/lib/ai/providers/anthropic";
import { ANTHROPIC_TEXT_STREAM } from "@/lib/ai/providers/test-fixtures/anthropic-fixtures";
import { fakeErrorResponse, fakeStream } from "@/lib/ai/providers/test-fixtures/fake-stream";
import { BrowserKeychainAdapter } from "./browser-keychain-adapter";
import type { ProviderStreamRequest, TransportCallbacks } from "./chat-adapter";

// Force the browser path so the factory builds the real BrowserChatTransport.
vi.mock("@/lib/platform", () => ({ isTauri: () => false }));

const request: ProviderStreamRequest = {
	provider: "anthropic",
	body: buildAnthropicRequestBody({
		modelId: "claude-sonnet-4-20250514",
		system: "system prompt",
		messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
		tools: [],
		maxOutputTokens: 1024,
	}),
};

function recordingCallbacks() {
	return {
		onFrame: vi.fn(),
		onHttpError: vi.fn(),
		onTransportError: vi.fn(),
		onClose: vi.fn(),
	} satisfies TransportCallbacks;
}

beforeEach(async () => {
	// The factory memoizes its transport in a module-level binding; reset the module
	// registry so each test starts from a fresh, unwrapped-then-wrapped factory.
	vi.resetModules();
	vi.stubGlobal("fetch", vi.fn());
	await new BrowserKeychainAdapter().setKey("anthropic", "sk-ant-wiring-test");
});

afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.clear();
});

describe("getChatTransport", () => {
	it("wraps the platform transport so production retries a transient 429", async () => {
		// First attempt: a retriable 429. Second: the real stream. If the factory did
		// not wrap the transport in retry, the 429 would surface and fetch run once.
		vi.mocked(fetch)
			.mockResolvedValueOnce(fakeErrorResponse('{"type":"error"}', { status: 429 }))
			.mockResolvedValueOnce(fakeStream(ANTHROPIC_TEXT_STREAM));
		const { getChatTransport } = await import("./get-chat-transport");
		const transport = await getChatTransport();
		const callbacks = recordingCallbacks();

		await transport.open(request, callbacks);

		expect(fetch).toHaveBeenCalledTimes(2);
		// The held 429 was retried, not surfaced; the second attempt streamed to done.
		expect(callbacks.onHttpError).not.toHaveBeenCalled();
		expect(callbacks.onFrame).toHaveBeenCalled();
		expect(callbacks.onClose).toHaveBeenCalledWith("done");
	});

	it("memoizes the wrapped transport across calls", async () => {
		const { getChatTransport } = await import("./get-chat-transport");
		const first = await getChatTransport();
		const second = await getChatTransport();
		expect(second).toBe(first);
	});
});
