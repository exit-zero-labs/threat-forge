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

import { dump, load, YAMLException } from "js-yaml";
import { describe, expect, it } from "vitest";
import { readThreatModelText } from "@/lib/thf-validation";
import {
	parseThreatModelYaml,
	serializeThreatModelYaml,
	THF_YAML_DUMP_OPTIONS,
	THF_YAML_SCHEMA,
} from "@/lib/thf-yaml";
import duplicateElementIdRaw from "../../tests/fixtures/thf/invalid/duplicate-element-id.thf?raw";
import missingMetadataRaw from "../../tests/fixtures/thf/invalid/missing-metadata.thf?raw";
import truncatedRaw from "../../tests/fixtures/thf/invalid/truncated.thf?raw";
import unknownFlowTargetRaw from "../../tests/fixtures/thf/invalid/unknown-flow-target.thf?raw";
import unsupportedVersionRaw from "../../tests/fixtures/thf/invalid/unsupported-version.thf?raw";
import legacySidecarRaw from "../../tests/fixtures/thf/legacy-sidecar/model.thf?raw";
import browserRoundTripRaw from "../../tests/fixtures/thf/v1.0-browser-roundtrip.thf?raw";
import canonicalFullRaw from "../../tests/fixtures/thf/v1.0-canonical-full.thf?raw";
import minimalRaw from "../../tests/fixtures/thf/v1.0-minimal.thf?raw";
import unknownFieldsRaw from "../../tests/fixtures/thf/v1.0-unknown-fields.thf?raw";

/**
 * The options `serializeThreatModelYaml` passes to `dump`, imported so a divergence between this
 * test and the browser writer is a mismatch in one place rather than two copies to keep in sync.
 * The `schema` field — js-yaml 5's YAML 1.1 schema with the timestamp type removed — is what keeps
 * `created`/`modified` from round-tripping into `Date` objects and back out as ISO stamps.
 */
const BROWSER_DUMP_OPTIONS = THF_YAML_DUMP_OPTIONS;

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

/** Load a fixture through the same schema the browser reader uses, then narrow it to a mapping. */
function loadMapping(raw: string): Record<string, unknown> {
	return asMapping(load(raw, { schema: THF_YAML_SCHEMA }), "fixture document");
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
		expect(() => load(truncatedRaw)).toThrow(YAMLException);
	});
});

describe("`.thf` fixture corpus — browser write path", () => {
	it.each(VALID_FIXTURES)("round-trips $name through the browser writer", ({ raw }) => {
		const loaded = parseThreatModelYaml(fixtureBody(raw));
		const reloaded = parseThreatModelYaml(serializeThreatModelYaml(loaded));
		expect(reloaded).toEqual(loaded);
	});

	it("carries unknown sections and keys through a load/dump/load cycle", () => {
		// The browser writer dumps the plain object it loaded, so data this build does not
		// understand survives. The Rust writer deserializes into structs and drops it — see
		// `unknown_fields_fixture_parses_and_drops_the_unknown_data`. ADR-009's downgrade
		// data-loss risk is therefore specific to the desktop writer.
		const loaded = loadMapping(fixtureBody(unknownFieldsRaw));
		const reloaded = loadMapping(dump(loaded, BROWSER_DUMP_OPTIONS));

		expect(reloaded.unknown_future_section).toEqual(loaded.unknown_future_section);
		expect(asMapping(reloaded.metadata, "metadata").unknown_future_flag).toBe(true);

		const elements = reloaded.elements;
		if (!Array.isArray(elements)) throw new Error("elements did not parse to a sequence");
		expect(asMapping(elements[0], "elements[0]").unknown_future_note).toBe(
			"written by a newer ThreatForge build",
		);
	});
});

describe("`.thf` fixture corpus — cross-emitter date round trip", () => {
	// The inversion of the former characterization tests. A desktop document opened and saved in
	// the browser must reopen on the desktop unchanged. The Rust counterpart is
	// `browser_written_dates_reopen_on_the_desktop`; together they prove both directions.

	it("loads an unquoted date as the string Metadata.created is typed as", () => {
		// Inverts "loads an unquoted date as a Date even though Metadata.created is typed string".
		const model = parseThreatModelYaml(fixtureBody(canonicalFullRaw));

		expect(typeof model.metadata.created).toBe("string");
		expect(model.metadata.created).toBe("2026-03-15");
		expect(model.metadata.modified).toBe("2026-03-20");
		expect(model.metadata.created).not.toBeInstanceOf(Date);
	});

	it("re-emits a desktop-written date unchanged so the desktop reader still accepts it", () => {
		// Inverts "re-emits a desktop-written date as an ISO timestamp the desktop reader rejects".
		// chrono's `NaiveDate` accepts `2026-03-15` but rejects `2026-03-15T00:00:00.000Z`, so the
		// scalar must survive the browser write unquoted and time-free.
		const dumped = serializeThreatModelYaml(parseThreatModelYaml(fixtureBody(canonicalFullRaw)));

		expect(dumped).toContain("created: 2026-03-15\n");
		expect(dumped).toContain("modified: 2026-03-20\n");
		expect(dumped).not.toContain("2026-03-15T00:00:00.000Z");
	});

	it("keeps created and modified byte-identical across desktop → browser → desktop", () => {
		// `v1.0-browser-roundtrip.thf` is `v1.0-canonical-full.thf` after one browser open+save.
		// The date lines must match the desktop-authored original byte for byte.
		const desktop = fixtureBody(canonicalFullRaw);
		const browser = fixtureBody(browserRoundTripRaw);

		for (const line of ["  created: 2026-03-15\n", "  modified: 2026-03-20\n"]) {
			expect(desktop).toContain(line);
			expect(browser).toContain(line);
		}
		// And the browser writer reproduces its own output on a second pass — a stable fixed point.
		const reserialized = serializeThreatModelYaml(parseThreatModelYaml(browser));
		expect(reserialized).toBe(browser);
	});

	it("round-trips browser → desktop → browser without touching the dates", () => {
		// The committed browser output must parse, and re-serializing it must be a no-op, so a file
		// that originated in the browser survives a desktop open and save unchanged in its dates.
		const browserModel = parseThreatModelYaml(fixtureBody(browserRoundTripRaw));

		expect(browserModel.metadata.created).toBe("2026-03-15");
		expect(browserModel.metadata.modified).toBe("2026-03-20");
		expect(serializeThreatModelYaml(browserModel)).toBe(fixtureBody(browserRoundTripRaw));
	});

	it("rejects an already-corrupted ISO-timestamp date with an actionable message", () => {
		// Acceptance criterion: files already broken by the old browser writer must fail loudly.
		const corrupted = fixtureBody(canonicalFullRaw).replace(
			"created: 2026-03-15",
			"created: 2026-03-15T00:00:00.000Z",
		);

		expect(() => parseThreatModelYaml(corrupted)).toThrow(/metadata\.created/);
		expect(() => parseThreatModelYaml(corrupted)).toThrow(/2026-03-15/);
	});

	it("does not reproduce the canonical Rust bytes except for the dates it now matches", () => {
		// The browser writer still diverges from serde_yaml on quote style, indentation, and float
		// form — the fidelity work #94 tracks. The one field it used to corrupt, the date, now
		// matches; everything else still differs, so the emitters are not interchangeable.
		const body = fixtureBody(canonicalFullRaw);
		const dumped = serializeThreatModelYaml(parseThreatModelYaml(body));

		expect(dumped).not.toEqual(body);

		// The date is the field this issue fixed: both emitters now write it the same way.
		expect(body).toContain("created: 2026-03-15\n");
		expect(dumped).toContain("created: 2026-03-15\n");

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

	it("now applies the same version and reference validation as the desktop read path", () => {
		// Inversion of the former "still applies no version or reference validation on the browser
		// read path". #116 gave the browser read path the version gate and reference checks
		// `read_threat_model` enforces, via `readThreatModelText`. Against main's behavior
		// (`parseThreatModelYaml`, the shape-only reader) these three documents opened cleanly; they
		// are now rejected. The exhaustive per-fixture parity manifest lives in
		// `src/lib/thf-validation.test.ts` — this is the corpus-suite pointer to the fixed behavior.
		expect(() => readThreatModelText(unsupportedVersionRaw)).toThrow(/Unsupported schema version/);
		expect(() => readThreatModelText(duplicateElementIdRaw)).toThrow(/Duplicate ID/);
		expect(() => readThreatModelText(unknownFlowTargetRaw)).toThrow(/Invalid reference/);

		// A document with no metadata section is still rejected (shape narrowing, unchanged by #116).
		expect(() => readThreatModelText(missingMetadataRaw)).toThrow(/metadata/);
	});
});
