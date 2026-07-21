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
import architectureCanonicalFullRaw from "../../tests/fixtures/thf/architecture-canonical-full.thf?raw";
import architectureOnlyRaw from "../../tests/fixtures/thf/architecture-only.thf?raw";
import circularGroupNestingRaw from "../../tests/fixtures/thf/invalid/circular-group-nesting.thf?raw";
import duplicateElementIdRaw from "../../tests/fixtures/thf/invalid/duplicate-element-id.thf?raw";
import duplicateGroupIdRaw from "../../tests/fixtures/thf/invalid/duplicate-group-id.thf?raw";
import duplicateLayerIdRaw from "../../tests/fixtures/thf/invalid/duplicate-layer-id.thf?raw";
import duplicateRelationshipIdRaw from "../../tests/fixtures/thf/invalid/duplicate-relationship-id.thf?raw";
import groupIdCollidesWithElementRaw from "../../tests/fixtures/thf/invalid/group-id-collides-with-element.thf?raw";
import missingMetadataRaw from "../../tests/fixtures/thf/invalid/missing-metadata.thf?raw";
import relationshipIdCollidesWithFlowRaw from "../../tests/fixtures/thf/invalid/relationship-id-collides-with-flow.thf?raw";
import truncatedRaw from "../../tests/fixtures/thf/invalid/truncated.thf?raw";
import unknownElementGroupRaw from "../../tests/fixtures/thf/invalid/unknown-element-group.thf?raw";
import unknownElementLayerRaw from "../../tests/fixtures/thf/invalid/unknown-element-layer.thf?raw";
import unknownFlowTargetRaw from "../../tests/fixtures/thf/invalid/unknown-flow-target.thf?raw";
import unknownGroupParentRaw from "../../tests/fixtures/thf/invalid/unknown-group-parent.thf?raw";
import unknownRelationshipEndpointRaw from "../../tests/fixtures/thf/invalid/unknown-relationship-endpoint.thf?raw";
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
	 * For the content-determined classes (`unsupported-version`, `duplicate-id`,
	 * `invalid-reference`, `circular-group-nesting`), the exact `Error.message`. It equals the
	 * desktop `#[error(...)]` `Display` output byte for byte (see `src-tauri/src/errors.rs`).
	 * Omitted for `parse` and `missing-section`, whose desktop messages carry a path and parser
	 * text and so cannot match byte for byte — parity there is class-level only.
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

	// Architecture rules (#57 / #123). All are content-determined, so all pin an exact message.
	{
		// reader.rs: DuplicateId { id: "data", section: "layers" }
		name: "invalid/duplicate-layer-id.thf",
		raw: duplicateLayerIdRaw,
		kind: "duplicate-id",
		message: `Duplicate ID 'data' in section 'layers'`,
	},
	{
		// reader.rs: DuplicateId { id: "cluster", section: "groups" }
		name: "invalid/duplicate-group-id.thf",
		raw: duplicateGroupIdRaw,
		kind: "duplicate-id",
		message: `Duplicate ID 'cluster' in section 'groups'`,
	},
	{
		// reader.rs: DuplicateId { id: "rel-1", section: "relationships" }
		name: "invalid/duplicate-relationship-id.thf",
		raw: duplicateRelationshipIdRaw,
		kind: "duplicate-id",
		message: `Duplicate ID 'rel-1' in section 'relationships'`,
	},
	{
		// reader.rs: namespace collision — a group ID that is also an element ID. Section "groups".
		name: "invalid/group-id-collides-with-element.thf",
		raw: groupIdCollidesWithElementRaw,
		kind: "duplicate-id",
		message: `Duplicate ID 'web-app' in section 'groups'`,
	},
	{
		// reader.rs: namespace collision — a relationship ID that is also a data-flow ID.
		name: "invalid/relationship-id-collides-with-flow.thf",
		raw: relationshipIdCollidesWithFlowRaw,
		kind: "duplicate-id",
		message: `Duplicate ID 'flow-1' in section 'relationships'`,
	},
	{
		// reader.rs: InvalidReference { field: "elements[app].layer", reference: "presentation" }
		name: "invalid/unknown-element-layer.thf",
		raw: unknownElementLayerRaw,
		kind: "invalid-reference",
		message: `Invalid reference in 'elements[app].layer': 'presentation' not found. Valid IDs: ["data"]`,
	},
	{
		// reader.rs: InvalidReference { field: "elements[app].group", reference: "backend" }
		name: "invalid/unknown-element-group.thf",
		raw: unknownElementGroupRaw,
		kind: "invalid-reference",
		message: `Invalid reference in 'elements[app].group': 'backend' not found. Valid IDs: ["frontend"]`,
	},
	{
		// reader.rs: InvalidReference { field: "groups[cluster-1].parent", reference: "missing-cluster" }
		name: "invalid/unknown-group-parent.thf",
		raw: unknownGroupParentRaw,
		kind: "invalid-reference",
		message: `Invalid reference in 'groups[cluster-1].parent': 'missing-cluster' not found. Valid IDs: ["cluster-1"]`,
	},
	{
		// reader.rs: InvalidReference { field: "relationships[rel-1].to", reference: "missing-service" }
		name: "invalid/unknown-relationship-endpoint.thf",
		raw: unknownRelationshipEndpointRaw,
		kind: "invalid-reference",
		message: `Invalid reference in 'relationships[rel-1].to': 'missing-service' not found. Valid IDs: ["app"]`,
	},
	{
		// reader.rs: CircularGroupNesting { id: "group-a" } — group-a and group-b are each other's parent.
		name: "invalid/circular-group-nesting.thf",
		raw: circularGroupNestingRaw,
		kind: "circular-group-nesting",
		message: `Circular group nesting detected at group 'group-a'`,
	},
];

const VALID_FIXTURES = [
	{ name: "v1.0-minimal.thf", raw: minimalRaw },
	{ name: "v1.0-canonical-full.thf", raw: canonicalFullRaw },
	{ name: "v1.0-unknown-fields.thf", raw: unknownFieldsRaw },
	{ name: "legacy-sidecar/model.thf", raw: legacySidecarRaw },
	// Architecture fixtures (#57 / #123): every layer/group/relationship reference resolves.
	{ name: "architecture-canonical-full.thf", raw: architectureCanonicalFullRaw },
	{ name: "architecture-only.thf", raw: architectureOnlyRaw },
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

	it("rejects a group that is its own parent (self-nesting cycle)", () => {
		// The two-node cycle is covered by `circular-group-nesting.thf`; this pins the self-parent
		// branch of the iterative walk, where the very first parent is already the start node.
		const model = makeModel({
			groups: [{ id: "solo", name: "Solo", parent: "solo" }],
		});
		const error = catchValidationError(() => validateThreatModel(model));
		expect(error.kind).toBe("circular-group-nesting");
		expect(error.message).toBe(`Circular group nesting detected at group 'solo'`);
	});

	it("accepts a valid multi-level group parent chain", () => {
		// A non-cyclic chain a -> b -> c must pass; the iterative walk must terminate, not loop.
		const model = makeModel({
			groups: [
				{ id: "a", name: "A", parent: "b" },
				{ id: "b", name: "B", parent: "c" },
				{ id: "c", name: "C" },
			],
		});
		expect(() => validateThreatModel(model)).not.toThrow();
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
