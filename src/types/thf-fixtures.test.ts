/**
 * Browser-side regression tests against the committed `.thf` fixture corpus in
 * `tests/fixtures/thf/`. The Rust counterpart is `src-tauri/src/file_io/fixtures_test.rs`;
 * both read the same files so the two languages cannot drift apart silently.
 *
 * These assertions pin the behavior that exists today. An additive schema change must keep
 * every one of them passing without editing it.
 *
 * Fixtures arrive through Vite's `?raw` loader rather than `node:fs`, because the repository
 * has no `@types/node` and adding Node globals to a browser-targeted `tsconfig` to read four
 * files is a worse trade than a build-time import.
 */

import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import duplicateElementIdRaw from "../../tests/fixtures/thf/invalid/duplicate-element-id.thf?raw";
import missingMetadataRaw from "../../tests/fixtures/thf/invalid/missing-metadata.thf?raw";
import truncatedRaw from "../../tests/fixtures/thf/invalid/truncated.thf?raw";
import unknownFlowTargetRaw from "../../tests/fixtures/thf/invalid/unknown-flow-target.thf?raw";
import unsupportedVersionRaw from "../../tests/fixtures/thf/invalid/unsupported-version.thf?raw";
import legacySidecarRaw from "../../tests/fixtures/thf/legacy-sidecar/model.thf?raw";
import canonicalFullRaw from "../../tests/fixtures/thf/v1.0-canonical-full.thf?raw";
import minimalRaw from "../../tests/fixtures/thf/v1.0-minimal.thf?raw";
import unknownFieldsRaw from "../../tests/fixtures/thf/v1.0-unknown-fields.thf?raw";

/**
 * The exact option object `BrowserFileAdapter.saveThreatModel` passes to `yaml.dump`.
 * Kept as a literal rather than imported so this test still describes the browser writer's
 * contract if the adapter is refactored — a mismatch is a finding, not a maintenance chore.
 */
const BROWSER_DUMP_OPTIONS = {
	lineWidth: -1,
	noRefs: true,
	sortKeys: false,
	quotingType: '"',
} as const;

/** Canonical top-level section order as the Rust model declares it. */
const CANONICAL_SECTION_ORDER = [
	"version",
	"metadata",
	"elements",
	"data_flows",
	"trust_boundaries",
	"threats",
	"diagrams",
];

const VALID_FIXTURES = [
	{ name: "v1.0-minimal.thf", raw: minimalRaw },
	{ name: "v1.0-canonical-full.thf", raw: canonicalFullRaw },
	{ name: "v1.0-unknown-fields.thf", raw: unknownFieldsRaw },
	{ name: "legacy-sidecar/model.thf", raw: legacySidecarRaw },
];

/** Fixture contents with the leading `#` comment header removed, mirroring the Rust helper. */
function fixtureBody(raw: string): string {
	const lines = raw.split(/(?<=\n)/);
	let start = 0;
	while (start < lines.length && lines[start].startsWith("#")) start += 1;
	return lines.slice(start).join("");
}

/** Narrow an untyped YAML value to a mapping, failing loudly rather than casting blindly. */
function asMapping(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(
			`${label} is not a YAML mapping, got ${Array.isArray(value) ? "array" : typeof value}`,
		);
	}
	return value as Record<string, unknown>;
}

function loadMapping(raw: string): Record<string, unknown> {
	return asMapping(yaml.load(raw), "fixture document");
}

/** Top-level keys as they appear in the raw document, independent of the parser. */
function topLevelKeysFromText(body: string): string[] {
	return body
		.split("\n")
		.map((line) => /^([A-Za-z_][A-Za-z0-9_]*):/.exec(line))
		.filter((match): match is RegExpExecArray => match !== null)
		.map((match) => match[1]);
}

describe("`.thf` fixture corpus — browser read path", () => {
	it.each(VALID_FIXTURES)("parses $name into a mapping", ({ raw }) => {
		expect(() => loadMapping(raw)).not.toThrow();
	});

	it.each(VALID_FIXTURES)("preserves document key order for $name", ({ raw }) => {
		const body = fixtureBody(raw);
		expect(Object.keys(loadMapping(body))).toEqual(topLevelKeysFromText(body));
	});

	it("keeps the canonical fixture in the schema's declared section order", () => {
		expect(Object.keys(loadMapping(fixtureBody(canonicalFullRaw)))).toEqual(
			CANONICAL_SECTION_ORDER,
		);
	});

	it("rejects malformed YAML", () => {
		expect(() => yaml.load(truncatedRaw)).toThrow(yaml.YAMLException);
	});
});

describe("`.thf` fixture corpus — browser write path", () => {
	it.each(VALID_FIXTURES)("round-trips $name through the browser writer", ({ raw }) => {
		const loaded = loadMapping(fixtureBody(raw));
		const reloaded = yaml.load(yaml.dump(loaded, BROWSER_DUMP_OPTIONS));
		expect(reloaded).toEqual(loaded);
	});

	it("carries unknown sections and keys through a load/dump/load cycle", () => {
		// The browser writer dumps the plain object it loaded, so data this build does not
		// understand survives. The Rust writer deserializes into structs and drops it — see
		// `unknown_fields_fixture_parses_and_drops_the_unknown_data`. ADR-009's downgrade
		// data-loss risk is therefore specific to the desktop writer.
		const loaded = loadMapping(fixtureBody(unknownFieldsRaw));
		const reloaded = loadMapping(yaml.dump(loaded, BROWSER_DUMP_OPTIONS));

		expect(reloaded.unknown_future_section).toEqual(loaded.unknown_future_section);
		expect(asMapping(reloaded.metadata, "metadata").unknown_future_flag).toBe(true);

		const elements = reloaded.elements;
		if (!Array.isArray(elements)) throw new Error("elements did not parse to a sequence");
		expect(asMapping(elements[0], "elements[0]").unknown_future_note).toBe(
			"written by a newer ThreatForge build",
		);
	});
});

describe("`.thf` fixture corpus — characterization of current cross-emitter behavior", () => {
	// These tests pin behavior that exists today, not behavior anyone chose. They are the
	// evidence hand-off for #94 (js-yaml upgrade). Do not "fix" them here.

	it("loads an unquoted date as a Date even though Metadata.created is typed string", () => {
		const model = loadMapping(fixtureBody(canonicalFullRaw));
		const metadata = asMapping(model.metadata, "metadata");

		expect(metadata.created).toBeInstanceOf(Date);
		expect(typeof metadata.created).not.toBe("string");
	});

	it("re-emits a desktop-written date as an ISO timestamp the desktop reader rejects", () => {
		// `browser_written_iso_timestamps_are_rejected_on_read` asserts the other half: chrono's
		// NaiveDate refuses `2026-03-15T00:00:00.000Z`. Together they show that a desktop-written
		// file opened and saved in the browser can no longer be opened on the desktop.
		const dumped = yaml.dump(loadMapping(fixtureBody(canonicalFullRaw)), BROWSER_DUMP_OPTIONS);

		expect(dumped).toContain("created: 2026-03-15T00:00:00.000Z");
		expect(dumped).not.toContain("created: 2026-03-15\n");
	});

	it("does not reproduce the canonical Rust bytes", () => {
		const body = fixtureBody(canonicalFullRaw);
		const dumped = yaml.dump(loadMapping(body), BROWSER_DUMP_OPTIONS);

		expect(dumped).not.toEqual(body);

		// Quote style: serde_yaml single-quotes, js-yaml double-quotes under these options.
		expect(body).toContain("version: '1.0'");
		expect(dumped).toContain('version: "1.0"');

		// Block sequence indentation: serde_yaml emits 0, js-yaml emits 2.
		expect(body).toContain("\nelements:\n- id: web-app");
		expect(dumped).toContain("\nelements:\n  - id: web-app");

		// Float formatting: serde_yaml keeps the `.0`, JavaScript numbers lose it.
		expect(body).toContain("x: 100.0");
		expect(dumped).toContain("x: 100\n");

		// js-yaml quotes the key `y` because YAML 1.1 resolves bare `y` as a boolean.
		expect(body).toContain("\n    y: 200.0");
		expect(dumped).toContain('"y": 200');
	});

	it("applies no version or reference validation on the browser read path", () => {
		// `read_threat_model` rejects all three of these. `BrowserFileAdapter.openThreatModel`
		// calls `yaml.load` and normalizes arrays, with no equivalent check, so the browser opens
		// documents the desktop refuses.
		expect(loadMapping(unsupportedVersionRaw).version).toBe("2.0");
		expect(() => loadMapping(duplicateElementIdRaw)).not.toThrow();
		expect(() => loadMapping(unknownFlowTargetRaw)).not.toThrow();

		// Missing required sections are equally invisible: js-yaml has no schema to enforce.
		expect(loadMapping(missingMetadataRaw).metadata).toBeUndefined();
	});
});
