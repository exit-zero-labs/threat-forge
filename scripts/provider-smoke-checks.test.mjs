import { describe, expect, it } from "vitest";
import { verifyObservedModel } from "./provider-smoke-checks.ts";

describe("live probe model identity", () => {
	it.each([
		["gpt-6.1-sol", "gpt-6.1-sol"],
		["gpt-6.1-sol", "gpt-6.1-sol-2026-09-01"],
		["claude-sonnet-5-5", "claude-sonnet-5-5-20260901"],
	])("accepts %s as %s", (requested, observed) =>
		expect(verifyObservedModel(requested, observed)).toBe(observed),
	);
	it.each(["gpt-6-luna", "gpt-6.1-sol-extra", "gpt-6.1-sol-20260901", null, undefined, 1])(
		"refuses unknown or mismatched observed identity %s",
		(observed) => expect(() => verifyObservedModel("gpt-6.1-sol", observed)).toThrow(/model/),
	);
});
