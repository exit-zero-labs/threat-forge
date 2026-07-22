import { describe, expect, it } from "vitest";
import { redactProviderDetail } from "./errors";

describe("redactProviderDetail", () => {
	it("masks every key-shaped token, whichever prefix family it uses", () => {
		const redacted = redactProviderDetail(
			"Incorrect API key provided: sk-abc123DEF. Related keys sk-ant-xyz_789 and sk-proj-QQ-11.",
		);
		expect(redacted).toBe(
			"Incorrect API key provided: [redacted-key]. Related keys [redacted-key] and [redacted-key].",
		);
	});

	it("leaves short clean provider text untouched", () => {
		expect(redactProviderDetail("overloaded_error: Overloaded")).toBe(
			"overloaded_error: Overloaded",
		);
	});

	it("masks key tokens whose casing a proxy or log formatter changed", () => {
		expect(redactProviderDetail("Bad key SK-ABC123 and Sk-Ant-Xyz")).toBe(
			"Bad key [redacted-key] and [redacted-key]",
		);
	});

	it("does not mask hyphenated words that merely end in sk-", () => {
		expect(redactProviderDetail("task-123 failed on desk-check")).toBe(
			"task-123 failed on desk-check",
		);
	});

	it("caps the detail at 200 characters and marks the cut", () => {
		const redacted = redactProviderDetail("x".repeat(500));
		expect(redacted).toHaveLength(201);
		expect(redacted).toBe(`${"x".repeat(200)}…`);
	});

	it("masks before truncating so a cut cannot leave a recognizable key prefix", () => {
		// The key starts just before the cap: truncating first would leave "sk-"
		// and the opening of the key visible; masking first cannot.
		const redacted = redactProviderDetail(`${"x".repeat(196)} sk-secret123456789`);
		expect(redacted).not.toContain("sk-");
		expect(redacted).toBe(`${"x".repeat(196)} [re…`);
	});

	it("never cuts inside a surrogate pair at the cap", () => {
		// "😀" is one astral code point, two UTF-16 units; 199 x's put the cap
		// boundary between them. A naive slice would keep a lone high surrogate.
		const redacted = redactProviderDetail(`${"x".repeat(199)}😀${"y".repeat(50)}`);
		expect(redacted).toBe(`${"x".repeat(199)}…`);
		// No lone high surrogate survives anywhere in the result.
		expect(/[\ud800-\udbff](?![\udc00-\udfff])/u.test(redacted)).toBe(false);
	});
});
