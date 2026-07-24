import { describe, expect, it } from "vitest";
import { isAllowedPathData, parseIconSvg } from "@/lib/registry/icon-source-validation";
import type { IconPath } from "@/lib/registry/types";

/**
 * Fixture sources arrive through Vite's `?raw` glob loader rather than `node:fs`,
 * matching the repository's established test pattern (the toolchain ships no `@types/node`).
 */
const validSources = import.meta.glob<string>("../../../tests/fixtures/icons/valid/*.svg", {
	query: "?raw",
	import: "default",
	eager: true,
});

const adversarialSources = import.meta.glob<string>(
	"../../../tests/fixtures/icons/adversarial/*.svg",
	{
		query: "?raw",
		import: "default",
		eager: true,
	},
);

/** Look up a fixture by basename regardless of the glob's absolute key. */
function bySource(sources: Record<string, string>, name: string): string {
	const entry = Object.entries(sources).find(([path]) => path.endsWith(`/${name}`));
	if (!entry) throw new Error(`fixture not found: ${name}`);
	return entry[1];
}

describe("parseIconSvg positive corpus", () => {
	// The reduced paths are asserted against literal expected values. Without this a
	// validator that rejected everything would still pass the adversarial suite.
	const cases: { file: string; expected: readonly IconPath[] }[] = [
		{ file: "single-path.svg", expected: [{ d: "M4 4h16v16H4Z" }] },
		{
			file: "multi-path-evenodd.svg",
			expected: [{ d: "M2 2h20v20H2Z" }, { d: "M6 6h12v12H6Z", fillRule: "evenodd" }],
		},
		{ file: "title-and-desc.svg", expected: [{ d: "M3 3h18v18H3Z" }] },
	];

	for (const { file, expected } of cases) {
		it(`accepts ${file} and reduces to the expected paths`, () => {
			const result = parseIconSvg(bySource(validSources, file));
			expect(result.ok, `${file} should be accepted`).toBe(true);
			if (result.ok) {
				expect(result.paths).toEqual(expected);
			}
		});
	}
});

describe("parseIconSvg adversarial corpus", () => {
	// Every payload class must be rejected, and the reason must name the offending construct.
	const cases: { file: string; reasonIncludes: string }[] = [
		{ file: "script-element.svg", reasonIncludes: "script" },
		{ file: "script-cdata.svg", reasonIncludes: "script" },
		{ file: "namespaced-script.svg", reasonIncludes: "xmlns:svg" },
		{ file: "onload-attribute.svg", reasonIncludes: "onload" },
		{ file: "mixed-case-event.svg", reasonIncludes: "OnMouseOver" },
		{ file: "foreign-object.svg", reasonIncludes: "foreignObject" },
		{ file: "use-xlink-remote.svg", reasonIncludes: "xmlns:xlink" },
		{ file: "use-href-protocol-relative.svg", reasonIncludes: "use" },
		{ file: "image-remote.svg", reasonIncludes: "image" },
		{ file: "image-data-uri.svg", reasonIncludes: "image" },
		{ file: "style-element-import.svg", reasonIncludes: "style" },
		{ file: "style-attribute.svg", reasonIncludes: "style" },
		{ file: "fill-url-external.svg", reasonIncludes: "fill" },
		{ file: "filter-url-external.svg", reasonIncludes: "filter" },
		{ file: "anchor-javascript.svg", reasonIncludes: "xmlns:xlink" },
		{ file: "entity-encoded-javascript.svg", reasonIncludes: "<a>" },
		{ file: "smil-animate-href.svg", reasonIncludes: "animate" },
		{ file: "smil-set-onclick.svg", reasonIncludes: "set" },
		{ file: "doctype-xxe.svg", reasonIncludes: "DOCTYPE" },
		{ file: "entity-expansion.svg", reasonIncludes: "DOCTYPE" },
		{ file: "xml-stylesheet-pi.svg", reasonIncludes: "processing instruction" },
		{ file: "comment-split-tag.svg", reasonIncludes: "well-formed" },
		{ file: "path-d-breakout.svg", reasonIncludes: "well-formed" },
		{ file: "oversized-path.svg", reasonIncludes: "bound" },
		{ file: "wrong-viewbox.svg", reasonIncludes: "viewBox" },
		{ file: "missing-viewbox.svg", reasonIncludes: "viewBox" },
		{ file: "extra-namespace.svg", reasonIncludes: "xmlns:xlink" },
		{ file: "transform-on-group.svg", reasonIncludes: "<g>" },
		{ file: "nested-svg.svg", reasonIncludes: "svg" },
		{ file: "title-with-event.svg", reasonIncludes: "title" },
	];

	it("covers every committed adversarial fixture", () => {
		const covered = new Set(cases.map((c) => c.file));
		const present = Object.keys(adversarialSources)
			.map((p) => p.split("/").pop())
			.filter((file): file is string => file !== undefined);
		for (const file of present) {
			expect(covered.has(file), `no assertion for ${file}`).toBe(true);
		}
		expect(present.length).toBe(cases.length);
	});

	for (const { file, reasonIncludes } of cases) {
		it(`rejects ${file}`, () => {
			const result = parseIconSvg(bySource(adversarialSources, file));
			expect(result.ok, `${file} must be rejected`).toBe(false);
			if (!result.ok) {
				expect(result.reason).toContain(reasonIncludes);
			}
		});
	}
});

describe("isAllowedPathData", () => {
	it("accepts path-command characters and rejects markup", () => {
		expect(isAllowedPathData("M4 4h16v16H4Z")).toBe(true);
		expect(isAllowedPathData("")).toBe(false);
		expect(isAllowedPathData("M0 0<script>")).toBe(false);
		expect(isAllowedPathData(`M0 0${" L1 1".repeat(2000)}`)).toBe(false);
	});
});
