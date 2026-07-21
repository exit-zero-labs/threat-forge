import yaml from "js-yaml";
import { parseThreatModelYaml } from "@/lib/thf-yaml";
import type { ThreatModel } from "@/types/threat-model";

/**
 * Browser read-path validation for `.thf` documents.
 *
 * This is the TypeScript mirror of the desktop reader `read_threat_model`
 * (`src-tauri/src/file_io/reader.rs`). The two must not be able to disagree silently about what
 * counts as a valid document; the shared fixture corpus enforces that. Every invalid fixture in
 * `tests/fixtures/thf/invalid/` that `read_threat_model` rejects must be rejected here with a
 * corresponding class, and every valid fixture it accepts must be accepted here. The per-fixture
 * manifest lives in `src/lib/thf-validation.test.ts`; the Rust counterpart is
 * `invalid_fixtures_are_rejected_with_the_expected_error` in
 * `src-tauri/src/file_io/fixtures_test.rs`. When a new reader rule and its fixture land, the
 * manifest turns a not-yet-mirrored fixture into a failing test, forcing this module to grow in
 * lockstep — the anti-staleness mechanism, not a frozen rule list. The architecture rules from #57
 * (`#123`) were added this way: duplicate IDs in `layers`/`groups`/`relationships`, group and
 * relationship namespace collisions, `element.layer`/`element.group`/`group.parent` and
 * relationship-endpoint references, and iterative group-cycle detection.
 *
 * Two intentional, documented differences from the desktop reader remain (see
 * `docs/knowledge/file-format.md`):
 *
 * - Message parity is byte-identical only for the content-determined classes
 *   (`unsupported-version`, `duplicate-id`, `invalid-reference`, `circular-group-nesting`), whose
 *   desktop `Display` strings carry no filesystem path or parser text. For `parse` and
 *   `missing-section` the desktop message embeds a path and `serde_yaml` internals that do not
 *   exist in the browser, so parity there is class-level with an actionable, path-free,
 *   secret-free message.
 * - Shape narrowing is skeleton-depth: it verifies the version, metadata, and the entry fields the
 *   semantic checks read (an `id` per collection entry, flow/relationship endpoints, layer/group
 *   membership, group parents, boundary members, threat references). Unknown fields are tolerated,
 *   matching serde's non-`deny_unknown_fields` behavior.
 */

/** The one schema version this build understands, mirroring `validate_version` in `reader.rs`. */
const SUPPORTED_VERSIONS = ["1.0"] as const;

/** A path-free, parser-free message for a document `js-yaml` could not parse at all. */
const PARSE_MESSAGE = "This file is not a valid ThreatForge document: it could not be parsed.";

export type ThfValidationErrorKind =
	| "parse"
	| "missing-section"
	| "unsupported-version"
	| "duplicate-id"
	| "invalid-reference"
	| "circular-group-nesting";

/**
 * A read-path rejection carrying the class the corpus contract test asserts against `reader.rs`.
 * The `message` is always safe to show the user: no filesystem path, no parser internals, no
 * secrets.
 */
export class ThfValidationError extends Error {
	readonly kind: ThfValidationErrorKind;

	constructor(kind: ThfValidationErrorKind, message: string) {
		super(message);
		this.name = "ThfValidationError";
		this.kind = kind;
	}
}

/**
 * Parse and validate `.thf` text the way the desktop reader does: parse, narrow the shape, then run
 * the version and reference checks. Returns the parsed object unchanged (unknown fields intact) or
 * throws a `ThfValidationError`.
 *
 * This is the single browser read entry point, used by both `BrowserFileAdapter.openThreatModel`
 * and the corpus contract test so a divergence surfaces in one place.
 */
export function readThreatModelText(text: string): ThreatModel {
	let model: ThreatModel;
	try {
		// `parseThreatModelYaml` (#115) owns YAML parsing, the metadata/date guard, and the
		// array defaults. Reusing it keeps the shape narrowing in one place rather than parallel.
		model = parseThreatModelYaml(text);
	} catch (err) {
		if (err instanceof yaml.YAMLException) {
			throw new ThfValidationError("parse", PARSE_MESSAGE);
		}
		// A shape-narrowing failure. `parseThreatModelYaml` already produced a user-safe, path-free
		// message (missing `metadata`, a non-list section, or a malformed date).
		throw new ThfValidationError(
			"missing-section",
			err instanceof Error ? err.message : PARSE_MESSAGE,
		);
	}

	return validateThreatModel(model);
}

/**
 * Run the desktop reader's semantic checks against an already shape-narrowed model, in
 * `read_threat_model` order: version exact-match, then duplicate IDs and reference integrity.
 * Returns the same object (unknown fields intact — never a reconstructed copy) or throws.
 *
 * Exported so the semantic layer can be exercised directly, independently of YAML parsing.
 */
export function validateThreatModel(model: ThreatModel): ThreatModel {
	validateVersion(requireString(model.version, "version"));
	validateReferences(model);
	return model;
}

/** Exact-match version gate. Mirrors `validate_version` (`reader.rs`) and ADR-009's fail-closed rule. */
function validateVersion(version: string): void {
	if (!SUPPORTED_VERSIONS.includes(version as (typeof SUPPORTED_VERSIONS)[number])) {
		throw new ThfValidationError(
			"unsupported-version",
			`Unsupported schema version '${version}'. Supported versions: ${formatIdList(SUPPORTED_VERSIONS)}`,
		);
	}
}

/**
 * Mirror of `validate_references` (`reader.rs`), in the reader's exact order, first failure wins:
 *
 * 1. Duplicate IDs within `elements`, `data_flows`, `layers`, `groups`, `relationships`.
 * 2. Namespace collisions: a group ID that collides with an element or trust-boundary ID (shared
 *    ReactFlow node ID space), a relationship ID that collides with a data-flow ID (shared edge ID
 *    space). Both are scoped to the new sections so no pre-existing file is invalidated.
 * 3. Reference integrity: data-flow endpoints, `element.layer`/`element.group`, `group.parent`,
 *    relationship endpoints (element IDs only), then a group-nesting cycle check, then
 *    trust-boundary members and threat targets.
 *
 * `layers`, `groups`, and `relationships` are optional and default to empty, matching the reader's
 * `#[serde(default)]` vectors. No check the desktop lacks is added here.
 */
function validateReferences(model: ThreatModel): void {
	const layers = entriesOf(model.layers, "layers");
	const groups = entriesOf(model.groups, "groups");
	const relationships = entriesOf(model.relationships, "relationships");

	const elementIds = model.elements.map((entry, index) =>
		requireString(asRecord(entry, `elements[${index}]`).id, `elements[${index}].id`),
	);
	const flowIds = model.data_flows.map((entry, index) =>
		requireString(asRecord(entry, `data_flows[${index}]`).id, `data_flows[${index}].id`),
	);
	const layerIds = layers.map((entry, index) =>
		requireString(asRecord(entry, `layers[${index}]`).id, `layers[${index}].id`),
	);
	const groupIds = groups.map((entry, index) =>
		requireString(asRecord(entry, `groups[${index}]`).id, `groups[${index}].id`),
	);
	const relationshipIds = relationships.map((entry, index) =>
		requireString(asRecord(entry, `relationships[${index}]`).id, `relationships[${index}].id`),
	);
	const boundaryIds = model.trust_boundaries.map((entry, index) =>
		requireString(
			asRecord(entry, `trust_boundaries[${index}]`).id,
			`trust_boundaries[${index}].id`,
		),
	);

	// 1. Duplicate IDs within each section, in reader order.
	assertNoDuplicateIds(elementIds, "elements");
	assertNoDuplicateIds(flowIds, "data_flows");
	assertNoDuplicateIds(layerIds, "layers");
	assertNoDuplicateIds(groupIds, "groups");
	assertNoDuplicateIds(relationshipIds, "relationships");

	// 2. Namespace collisions. Groups share the node ID space with elements and trust boundaries.
	for (const id of groupIds) {
		if (elementIds.includes(id) || boundaryIds.includes(id)) {
			throw duplicateIdError(id, "groups");
		}
	}
	// Relationships share the edge ID space with data flows.
	for (const id of relationshipIds) {
		if (flowIds.includes(id)) {
			throw duplicateIdError(id, "relationships");
		}
	}

	// 3. Reference integrity — data flow endpoints resolve to elements.
	model.data_flows.forEach((entry, index) => {
		const record = asRecord(entry, `data_flows[${index}]`);
		const id = flowIds[index];
		requireKnownId(
			requireString(record.from, `data_flows[${index}].from`),
			elementIds,
			`data_flows[${id}].from`,
		);
		requireKnownId(
			requireString(record.to, `data_flows[${index}].to`),
			elementIds,
			`data_flows[${id}].to`,
		);
	});

	// Element layer and group membership references.
	model.elements.forEach((entry, index) => {
		const record = asRecord(entry, `elements[${index}]`);
		const id = elementIds[index];
		if (record.layer !== undefined && record.layer !== null) {
			requireKnownId(
				requireString(record.layer, `elements[${index}].layer`),
				layerIds,
				`elements[${id}].layer`,
			);
		}
		if (record.group !== undefined && record.group !== null) {
			requireKnownId(
				requireString(record.group, `elements[${index}].group`),
				groupIds,
				`elements[${id}].group`,
			);
		}
	});

	// Group parent references.
	groups.forEach((entry, index) => {
		const record = asRecord(entry, `groups[${index}]`);
		const id = groupIds[index];
		if (record.parent !== undefined && record.parent !== null) {
			requireKnownId(
				requireString(record.parent, `groups[${index}].parent`),
				groupIds,
				`groups[${id}].parent`,
			);
		}
	});

	// Relationship endpoints resolve to elements, matching data flows.
	relationships.forEach((entry, index) => {
		const record = asRecord(entry, `relationships[${index}]`);
		const id = relationshipIds[index];
		requireKnownId(
			requireString(record.from, `relationships[${index}].from`),
			elementIds,
			`relationships[${id}].from`,
		);
		requireKnownId(
			requireString(record.to, `relationships[${index}].to`),
			elementIds,
			`relationships[${id}].to`,
		);
	});

	// Circular group nesting (parents already validated above), iterative like the reader.
	assertNoGroupCycle(groups, groupIds);

	// Trust boundary members resolve to elements.
	model.trust_boundaries.forEach((entry, index) => {
		const record = asRecord(entry, `trust_boundaries[${index}]`);
		const id = boundaryIds[index];
		for (const contained of requireStringList(
			record.contains,
			`trust_boundaries[${index}].contains`,
		)) {
			requireKnownId(contained, elementIds, `trust_boundaries[${id}].contains`);
		}
	});

	// Threat targets resolve to elements and flows.
	model.threats.forEach((entry, index) => {
		const record = asRecord(entry, `threats[${index}]`);
		const id = requireString(record.id, `threats[${index}].id`);
		if (record.element !== undefined && record.element !== null) {
			requireKnownId(
				requireString(record.element, `threats[${index}].element`),
				elementIds,
				`threats[${id}].element`,
			);
		}
		if (record.flow !== undefined && record.flow !== null) {
			requireKnownId(
				requireString(record.flow, `threats[${index}].flow`),
				flowIds,
				`threats[${id}].flow`,
			);
		}
	});
}

/**
 * Detect a group-nesting cycle, including self-parenting. Parents are validated to exist before
 * this runs, so each walk is bounded by the number of groups. Iterative with a visited set — no
 * recursion — mirroring the reader's traversal exactly.
 */
function assertNoGroupCycle(groups: readonly unknown[], groupIds: readonly string[]): void {
	const parentOf = new Map<string, string>();
	groups.forEach((entry, index) => {
		const parent = asRecord(entry, `groups[${index}]`).parent;
		if (typeof parent === "string") {
			parentOf.set(groupIds[index], parent);
		}
	});

	for (const startId of groupIds) {
		const visited = new Set<string>([startId]);
		let current = startId;
		for (;;) {
			const parent = parentOf.get(current);
			if (parent === undefined) break;
			if (visited.has(parent)) {
				throw new ThfValidationError(
					"circular-group-nesting",
					`Circular group nesting detected at group '${parent}'`,
				);
			}
			visited.add(parent);
			current = parent;
		}
	}
}

/** Mirror of the reader's per-section `HashSet` duplicate check. */
function assertNoDuplicateIds(ids: readonly string[], section: string): void {
	const seen = new Set<string>();
	for (const id of ids) {
		if (seen.has(id)) {
			throw duplicateIdError(id, section);
		}
		seen.add(id);
	}
}

/** The reader's `DuplicateId` message, shared by the within-section and namespace-collision checks. */
function duplicateIdError(id: string, section: string): ThfValidationError {
	return new ThfValidationError("duplicate-id", `Duplicate ID '${id}' in section '${section}'`);
}

/**
 * Narrow an optional collection section to its entries. Absent sections default to empty, matching
 * the reader's `#[serde(default)]` vectors; a present-but-non-list section fails closed.
 */
function entriesOf(value: unknown, section: string): unknown[] {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) {
		throw new ThfValidationError(
			"missing-section",
			`This file cannot be opened: ${section} is not a list.`,
		);
	}
	return value;
}

/** Membership check with the reader's message, including its `", "`-joined valid-ID list. */
function requireKnownId(reference: string, valid: readonly string[], field: string): void {
	if (!valid.includes(reference)) {
		throw new ThfValidationError(
			"invalid-reference",
			`Invalid reference in '${field}': '${reference}' not found. Valid IDs: ${formatIdList(valid)}`,
		);
	}
}

/**
 * Render a string list the way Rust's `{:?}` renders `Vec<String>`: each element double-quoted and
 * joined with `", "`, e.g. `["a", "b"]`. `JSON.stringify` on the array would drop the space after
 * the comma and drift from the desktop `Display` output.
 */
function formatIdList(ids: readonly string[]): string {
	const quoted = ids.map((id) => `"${id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
	return `[${quoted.join(", ")}]`;
}

/** Narrow an untrusted collection entry to a record, failing closed as a shape violation. */
function asRecord(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new ThfValidationError(
			"missing-section",
			`This file cannot be opened: ${label} is not a valid entry.`,
		);
	}
	return value as Record<string, unknown>;
}

/** Require a string field the semantic checks read, failing closed as a shape violation. */
function requireString(value: unknown, label: string): string {
	if (typeof value !== "string") {
		throw new ThfValidationError(
			"missing-section",
			`This file cannot be opened: ${label} is missing or is not text.`,
		);
	}
	return value;
}

/**
 * Require a (possibly absent) list of strings. Mirrors the reader's `Vec<String>` fields, which
 * default to empty when the key is absent and reject a non-sequence at parse time.
 */
function requireStringList(value: unknown, label: string): string[] {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) {
		throw new ThfValidationError(
			"missing-section",
			`This file cannot be opened: ${label} is not a list.`,
		);
	}
	return value.map((item, index) => requireString(item, `${label}[${index}]`));
}
