import { afterEach, describe, expect, it, vi } from "vitest";
import type { CapabilityResolution } from "@/lib/ai-models";
import { ProtocolException } from "./errors";
import { type CapabilityResolver, preflightRequest } from "./request";
import type { ToolDescriptor } from "./tools";

const oneTool: ToolDescriptor[] = [{ name: "add_element", description: "Add an element." }];

/** A curated, tool-capable Anthropic model id. */
const KNOWN_MODEL = "claude-sonnet-4-20250514";

describe("preflightRequest", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("rejects a tool request against an unknown model before any network call", () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		const transport = vi.fn();

		let thrown: unknown;
		try {
			preflightRequest({ provider: "anthropic", modelId: "gpt-legacy-unknown", tools: oneTool });
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(ProtocolException);
		expect((thrown as ProtocolException).error.code).toBe("unsupported_capability");
		// The point of preflight: it decides without spending a request.
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(transport).not.toHaveBeenCalled();
	});

	it("rejects a tool request against a known but tool-incapable model", () => {
		// No curated model is tool-incapable, so the branch is driven through an
		// injected resolver rather than a real table entry.
		const incapable: CapabilityResolver = (): CapabilityResolution => ({
			known: true,
			capabilities: {
				toolCalling: false,
				parallelToolCalls: false,
				streaming: true,
				maxInputTokens: 8000,
			},
		});

		expect(() =>
			preflightRequest({ provider: "openai", modelId: "text-only-1", tools: oneTool }, incapable),
		).toThrow(ProtocolException);
	});

	it("allows a text-only request against an unknown model and flags it", () => {
		const outcome = preflightRequest({
			provider: "anthropic",
			modelId: "some-stale-id",
			tools: [],
		});
		expect(outcome).toEqual({ capabilityUnknown: true });
	});

	it("allows a tool request against a known tool-capable model", () => {
		const outcome = preflightRequest({
			provider: "anthropic",
			modelId: KNOWN_MODEL,
			tools: oneTool,
		});
		expect(outcome).toEqual({ capabilityUnknown: false });
	});

	it("allows a text-only request against a known model without flagging it", () => {
		const outcome = preflightRequest({ provider: "anthropic", modelId: KNOWN_MODEL, tools: [] });
		expect(outcome).toEqual({ capabilityUnknown: false });
	});
});
