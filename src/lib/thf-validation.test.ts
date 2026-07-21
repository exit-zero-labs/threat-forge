/**
 * Contract test for the browser read-path validator against the shared `.thf` fixture corpus in
 * `tests/fixtures/thf/`. This is the lockstep guarantee: the browser validator must agree with the
 * desktop reader `read_threat_model` (`src-tauri/src/file_io/reader.rs`) on every corpus fixture.
 *
 * The invalid-fixture manifest below mirrors the Rust match arms in
 * `invalid_fixtures_are_rejected_with_the_expected_error` (`src-tauri/src/file_io/fixtures_test.rs`).
 * It is the shared checklist a future schema change (e.g. #57's architecture sections) extends: a
 * new `invalid/<rule>.thf` fixture the validator does not yet handle is a failing test here,
 * forcing the browser validator to grow in the same change rather than drifting from `reader.rs`.
 *
 * `reader.rs` lumps both `truncated` and `missing-metadata` under `YamlParse`. The browser
 * distinguishes them — a `js-yaml` parse failure (`parse`) vs. a shape-narrowing failure
 * (`missing-section`) — and both remain fail-closed. The three content-determined fixtures map 1:1
 * and additionally pin the byte-identical `Error.message`.
 */

import { describe, expect, it } from "vitest";
import {
	readThreatModelText,
	ThfValidationError,
	type ThfValidationErrorKind,
	validateThreatModel,
} from "@/lib/thf-validation";
import type { ThreatModel } from "@/types/threat-model";
import duplicateElementIdRaw from "../../tests/fixtures/thf/invalid/duplicate-element-id.thf?raw";
import missingMetadataRaw from "../../tests/fixtures/thf/invalid/missing-metadata.thf?raw";
import truncatedRaw from "../../tests/fixtures/thf/invalid/truncated.thf?raw";
import unknownFlowTargetRaw from "../../tests/fixtures/thf/invalid/unknown-flow-target.thf?raw";
import unsupportedVersionRaw from "../../tests/fixtures/thf/invalid/unsupported-version.thf?raw";
import legacySidecarRaw from "../../tests/fixtures/thf/legacy-sidecar/model.thf?raw";
import canonicalFullRaw from "../../tests/fixtures/thf/v1.0-canonical-full.thf?raw";
import minimalRaw from "../../tests/fixtures/thf/v1.0-minimal.thf?raw";
import unknownFieldsRaw from "../../tests/fixtures/thf/v1.0-unknown-fields.thf?raw";

interface InvalidCase {
	name: string;
	raw: string;
	/** The rejection class this fixture maps to, mirroring the `reader.rs` match arm. */
	kind: ThfValidationErrorKind;
	/**
	 * For the three content-determined classes, the exact `Error.message`. It equals the desktop
	 * `#[error(...)]` `Display` output byte for byte (see `src-tauri/src/errors.rs`). Omitted for
	 * `parse` and `missing-section`, whose desktop messages carry a path and parser text and so
	 * cannot match byte for byte — parity there is class-level only.
	 */
	message?: string;
}

const INVALID_CASES: InvalidCase[] = [
	{
		// reader.rs: ThreatForgeError::UnsupportedVersion { version: "2.0", supported: ["1.0"] }
		name: "invalid/unsupported-version.thf",
		raw: unsupportedVersionRaw,
		kind: "unsupported-version",
		message: `Unsupported schema version '2.0'. Supported versions: ["1.0"]`,
	},
	{
		// reader.rs: ThreatForgeError::DuplicateId { id: "app", section: "elements" }
		name: "invalid/duplicate-element-id.thf",
		raw: duplicateElementIdRaw,
		kind: "duplicate-id",
		message: `Duplicate ID 'app' in section 'elements'`,
	},
	{
		// reader.rs: ThreatForgeError::InvalidReference { field: "data_flows[flow-1].to", ... }
		name: "invalid/unknown-flow-target.thf",
		raw: unknownFlowTargetRaw,
		kind: "invalid-reference",
		message: `Invalid reference in 'data_flows[flow-1].to': 'missing-db' not found. Valid IDs: ["app"]`,
	},
	{
		// reader.rs: ThreatForgeError::YamlParse (malformed YAML) — browser class: parse.
		name: "invalid/truncated.thf",
		raw: truncatedRaw,
		kind: "parse",
	},
	{
		// reader.rs: ThreatForgeError::YamlParse (required section absent) — browser class:
		// missing-section (a shape-narrowing failure, distinct from a raw parse failure).
		name: "invalid/missing-metadata.thf",
		raw: missingMetadataRaw,
		kind: "missing-section",
	},
];

const VALID_FIXTURES = [
	{ name: "v1.0-minimal.thf", raw: minimalRaw },
	{ name: "v1.0-canonical-full.thf", raw: canonicalFullRaw },
	{ name: "v1.0-unknown-fields.thf", raw: unknownFieldsRaw },
	{ name: "legacy-sidecar/model.thf", raw: legacySidecarRaw },
];

/** Run `fn`, returning the `ThfValidationError` it throws or failing loudly if it does not. */
function catchValidationError(fn: () => unknown): ThfValidationError {
	try {
		fn();
	} catch (err) {
		if (err instanceof ThfValidationError) return err;
		throw new Error(`expected a ThfValidationError, got: ${String(err)}`);
	}
	throw new Error("expected a ThfValidationError, but nothing was thrown");
}

/** Narrow an untyped value to a mapping so unknown-field preservation can be inspected. */
function asMapping(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} is not a mapping`);
	}
	return value as Record<string, unknown>;
}

describe("browser `.thf` read validation — parity with read_threat_model", () => {
	it.each(INVALID_CASES)("rejects $name as $kind", ({ raw, kind, message }) => {
		const error = catchValidationError(() => readThreatModelText(raw));
		expect(error.kind).toBe(kind);
		if (message !== undefined) {
			// Byte-identical to the desktop `Display` string for the same document.
			expect(error.message).toBe(message);
		}
	});

	it.each(VALID_FIXTURES)("accepts valid fixture $name", ({ raw }) => {
		expect(() => readThreatModelText(raw)).not.toThrow();
	});

	it("returns the parsed object unchanged, preserving unknown sections and keys", () => {
		// The browser writer's documented forward-compat behavior (ADR-009, and the pinned
		// `carries unknown sections and keys` test) depends on the validator being non-destructive:
		// it returns the same parsed object rather than a reconstructed, stripped ThreatModel.
		const model = readThreatModelText(unknownFieldsRaw);
		const record = asMapping(model, "model");

		expect(record.unknown_future_section).toEqual([
			{ id: "future-1", name: "Section introduced by a newer build" },
		]);
		expect(asMapping(record.metadata, "metadata").unknown_future_flag).toBe(true);

		const elements = record.elements;
		if (!Array.isArray(elements)) throw new Error("elements did not parse to a sequence");
		expect(asMapping(elements[0], "elements[0]").unknown_future_note).toBe(
			"written by a newer ThreatForge build",
		);
	});
});

describe("browser `.thf` read validation — semantic layer", () => {
	// `validateThreatModel` runs the checks in `read_threat_model` order; these pin the order and
	// the message parity for each content-determined class directly, without a fixture file.
	function makeModel(overrides: Partial<ThreatModel> = {}): ThreatModel {
		return {
			version: "1.0",
			metadata: {
				title: "t",
				author: "a",
				created: "2026-01-01",
				modified: "2026-01-01",
				description: "",
			},
			elements: [],
			data_flows: [],
			trust_boundaries: [],
			threats: [],
			diagrams: [],
			...overrides,
		};
	}

	const appElement = {
		id: "app",
		type: "process",
		name: "App",
		trust_zone: "",
		description: "",
		technologies: [],
	};

	const selfFlow = (id: string) => ({
		id,
		name: "",
		from: "app",
		to: "app",
		protocol: "",
		data: [],
		authenticated: false,
	});

	it("accepts a well-formed model and returns the same object reference", () => {
		const model = makeModel();
		expect(validateThreatModel(model)).toBe(model);
	});

	it("rejects a duplicate flow ID with the reader's section name", () => {
		const model = makeModel({
			elements: [appElement],
			data_flows: [selfFlow("flow-1"), selfFlow("flow-1")],
		});
		const error = catchValidationError(() => validateThreatModel(model));
		expect(error.kind).toBe("duplicate-id");
		expect(error.message).toBe(`Duplicate ID 'flow-1' in section 'data_flows'`);
	});

	it("rejects a trust boundary that contains an unknown element", () => {
		const model = makeModel({
			elements: [appElement],
			trust_boundaries: [{ id: "b1", name: "B", contains: ["ghost"] }],
		});
		const error = catchValidationError(() => validateThreatModel(model));
		expect(error.kind).toBe("invalid-reference");
		expect(error.message).toBe(
			`Invalid reference in 'trust_boundaries[b1].contains': 'ghost' not found. Valid IDs: ["app"]`,
		);
	});
});

describe("browser `.thf` read validation — skeleton shape depth", () => {
	// The validator narrows the entry fields the semantic checks read. A document the desktop reader
	// would reject at serde deserialization (a missing required `id`, a non-string endpoint) is
	// rejected here as a shape failure — class-level parity, both fail closed.
	it("rejects an element with no id", () => {
		const raw = [
			'version: "1.0"',
			"metadata:",
			'  title: "t"',
			'  author: "a"',
			"  created: 2026-01-01",
			"  modified: 2026-01-01",
			"elements:",
			"  - type: process",
			'    name: "App"',
			"",
		].join("\n");
		expect(catchValidationError(() => readThreatModelText(raw)).kind).toBe("missing-section");
	});

	it("rejects a data flow whose target is not text", () => {
		const raw = [
			'version: "1.0"',
			"metadata:",
			'  title: "t"',
			'  author: "a"',
			"  created: 2026-01-01",
			"  modified: 2026-01-01",
			"elements:",
			"  - id: app",
			"    type: process",
			'    name: "App"',
			"data_flows:",
			"  - id: flow-1",
			"    from: app",
			"    to: 42",
			"    protocol: HTTP",
			"",
		].join("\n");
		expect(catchValidationError(() => readThreatModelText(raw)).kind).toBe("missing-section");
	});
});
