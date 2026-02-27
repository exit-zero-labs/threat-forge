import { describe, expect, it } from "vitest";
import { extractThreats, generateThreatId, suggestionToThreat } from "./ai-utils";

describe("extractThreats", () => {
	it("extracts threats from a well-formed threats code block", () => {
		const text = `Here are some threats I identified:

\`\`\`threats
- title: "SQL Injection via user input"
  category: Tampering
  element: api-gateway
  severity: high
  description: "Malicious SQL could be injected through unvalidated input."
- title: "Man-in-the-middle attack"
  category: Information Disclosure
  element: web-app
  severity: medium
  description: "Data could be intercepted if TLS is not enforced."
\`\`\`

These threats should be addressed.`;

		const threats = extractThreats(text);
		expect(threats).toHaveLength(2);
		expect(threats[0].title).toBe("SQL Injection via user input");
		expect(threats[0].category).toBe("Tampering");
		expect(threats[0].element).toBe("api-gateway");
		expect(threats[0].severity).toBe("high");
		expect(threats[1].title).toBe("Man-in-the-middle attack");
		expect(threats[1].category).toBe("Information Disclosure");
	});

	it("returns empty array when no threats block found", () => {
		const text = "This is a regular response without any threats.";
		expect(extractThreats(text)).toHaveLength(0);
	});

	it("handles threats block with missing fields by skipping invalid entries", () => {
		const text = `\`\`\`threats
- title: "Valid threat"
  category: Spoofing
  severity: high
  description: "A valid threat description."
- title: "Invalid threat"
  category: Spoofing
\`\`\``;

		const threats = extractThreats(text);
		expect(threats).toHaveLength(1);
		expect(threats[0].title).toBe("Valid threat");
	});

	it("handles threats without element field", () => {
		const text = `\`\`\`threats
- title: "General threat"
  category: Denial of Service
  severity: low
  description: "A general system threat."
\`\`\``;

		const threats = extractThreats(text);
		expect(threats).toHaveLength(1);
		expect(threats[0].element).toBeUndefined();
	});

	it("rejects threats with invalid category", () => {
		const text = `\`\`\`threats
- title: "Bad category"
  category: InvalidCategory
  severity: high
  description: "Should be rejected."
\`\`\``;

		expect(extractThreats(text)).toHaveLength(0);
	});

	it("rejects threats with invalid severity", () => {
		const text = `\`\`\`threats
- title: "Bad severity"
  category: Spoofing
  severity: extreme
  description: "Should be rejected."
\`\`\``;

		expect(extractThreats(text)).toHaveLength(0);
	});

	it("handles multiple threats blocks in one response", () => {
		const text = `First batch:
\`\`\`threats
- title: "Threat A"
  category: Spoofing
  severity: high
  description: "First threat."
\`\`\`

Second batch:
\`\`\`threats
- title: "Threat B"
  category: Tampering
  severity: medium
  description: "Second threat."
\`\`\``;

		const threats = extractThreats(text);
		expect(threats).toHaveLength(2);
		expect(threats[0].title).toBe("Threat A");
		expect(threats[1].title).toBe("Threat B");
	});

	it("strips quotes from values", () => {
		const text = `\`\`\`threats
- title: 'Single quoted title'
  category: Repudiation
  severity: medium
  description: "Double quoted description."
\`\`\``;

		const threats = extractThreats(text);
		expect(threats).toHaveLength(1);
		expect(threats[0].title).toBe("Single quoted title");
		expect(threats[0].description).toBe("Double quoted description.");
	});
});

describe("generateThreatId", () => {
	it("generates IDs with threat- prefix", () => {
		const id = generateThreatId();
		expect(id).toMatch(/^threat-[0-9a-f]{8}$/);
	});

	it("generates unique IDs", () => {
		const ids = new Set(Array.from({ length: 100 }, () => generateThreatId()));
		expect(ids.size).toBe(100);
	});
});

describe("suggestionToThreat", () => {
	it("converts a suggestion to a full Threat object", () => {
		const threat = suggestionToThreat({
			title: "Test threat",
			category: "Spoofing",
			element: "web-app",
			severity: "high",
			description: "A test threat.",
		});

		expect(threat.id).toMatch(/^threat-/);
		expect(threat.title).toBe("Test threat");
		expect(threat.category).toBe("Spoofing");
		expect(threat.element).toBe("web-app");
		expect(threat.severity).toBe("high");
		expect(threat.description).toBe("A test threat.");
		expect(threat.mitigation).toBeUndefined();
	});
});
