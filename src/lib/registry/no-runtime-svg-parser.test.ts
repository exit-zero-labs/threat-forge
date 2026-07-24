import { describe, expect, it } from "vitest";

/**
 * The SVG source validator is a contribution/CI-time tool and must never reach a shipped
 * bundle. This test reads every production source module as raw text and asserts that the
 * only modules importing `icon-source-validation` are test files. This prevents the sole
 * validator module from entering a runtime bundle; code review still owns detecting any new,
 * independently implemented parser or upload path.
 */
const sources = import.meta.glob<string>("/src/**/*.{ts,tsx}", {
	query: "?raw",
	import: "default",
	eager: true,
});

const IMPORT_PATTERN = /icon-source-validation/;

describe("no runtime SVG parser", () => {
	it("only test modules import the SVG source validator", () => {
		const offenders: string[] = [];
		for (const [path, contents] of Object.entries(sources)) {
			if (path.endsWith("icon-source-validation.ts")) continue; // the module itself
			const isTest = path.endsWith(".test.ts") || path.endsWith(".test.tsx");
			if (!isTest && IMPORT_PATTERN.test(contents)) {
				offenders.push(path);
			}
		}
		expect(
			offenders,
			`icon-source-validation must not be imported by shipped modules: ${offenders.join(", ")}`,
		).toEqual([]);
	});

	it("scans a non-empty set of source modules", () => {
		expect(Object.keys(sources).length).toBeGreaterThan(0);
	});
});
