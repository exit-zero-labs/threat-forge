import {
	binaryTag,
	CORE_SCHEMA,
	type DumpOptions,
	dump,
	load,
	mergeTag,
	omapTag,
	pairsTag,
	Schema,
	setTag,
	YAML11_SCHEMA,
} from "js-yaml";
import type { Threat, ThreatModel } from "@/types/threat-model";

/** The YAML 1.1 type that resolves an unquoted `2026-03-15` scalar to a JavaScript `Date`. */
const TIMESTAMP_TAG = "tag:yaml.org,2002:timestamp";

/** Sections a `.thf` document may omit when they hold nothing. */
const COLLECTION_SECTIONS = [
	"elements",
	"data_flows",
	"trust_boundaries",
	"threats",
	"diagrams",
] as const;

/** `metadata.created` and `metadata.modified` as the schema defines them: a calendar date. */
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar date followed by a time of day, e.g. `2026-03-15T00:00:00.000Z`. */
const DATE_WITH_TIME = /^(\d{4}-\d{2}-\d{2})[T ]/;

/**
 * Read schema: js-yaml's core (YAML 1.2) scalar resolution plus the non-scalar YAML 1.1
 * extensions the pre-upgrade schema carried — merge keys and `!!binary`/`!!omap`/`!!pairs`/`!!set`.
 *
 * js-yaml 5 split its single `DEFAULT_SCHEMA` into a conservative load default (`CORE_SCHEMA`)
 * and a defensive dump default (`YAML11_SCHEMA` + int/float fallback). The core resolver reads
 * `2026-03-15` and bare `y`/`no`/`on` as the strings the desktop writer intends, never a `Date`
 * or a boolean, so a desktop document opened and saved in the browser still reopens on the
 * desktop. The five explicit extension tags are re-added so a file using them resolves exactly
 * as it did before the upgrade; a plain `.thf` never uses them, but dropping them would be a
 * silent read-path behavior change.
 *
 * The timestamp type is deliberately absent: it is the one tag whose presence would coerce a
 * calendar date, so it stays out of both the read and the write schema.
 */
export const THF_YAML_SCHEMA = new Schema([
	...CORE_SCHEMA.tags,
	mergeTag,
	binaryTag,
	omapTag,
	pairsTag,
	setTag,
]);

/**
 * Write schema: js-yaml 5's YAML 1.1 schema with only the timestamp type removed.
 *
 * The dumper quotes a plain scalar exactly when it would implicitly resolve to a non-string
 * under the schema it is given. Two consequences hold this format together:
 *
 * - With the timestamp type absent, a `created: 2026-03-15` string dumps unquoted and time-free,
 *   so chrono's `NaiveDate` on the desktop still accepts it. (js-yaml 5's own dump default keeps
 *   the timestamp type, which would quote the date — this schema is why it does not.)
 * - With the YAML 1.1 boolean type present, the ambiguous key `y` (a coordinate axis) is quoted
 *   as `"y"`, so a YAML 1.1 reader cannot mistake it for `true`. The read schema resolves `y` as
 *   a plain string, so the two schemas still round-trip.
 *
 * The write path never emits a `Date`, `Map`, `Set`, or binary value, so the extension tags this
 * schema carries are inert here; they exist only to mirror the read schema's tag set.
 */
export const THF_YAML_DUMP_SCHEMA = new Schema(
	YAML11_SCHEMA.tags.filter((tag) => tag.tagName !== TIMESTAMP_TAG),
);

/** Options the browser writer passes to `dump` for every `.thf` document. */
export const THF_YAML_DUMP_OPTIONS: DumpOptions = {
	lineWidth: -1,
	noRefs: true,
	sortKeys: false,
	quoteStyle: "double",
	schema: THF_YAML_DUMP_SCHEMA,
};

/**
 * Parse `.thf` text into a `ThreatModel`.
 *
 * Verified here: the document and its `metadata` are mappings, `metadata.created` and
 * `metadata.modified` are plain `YYYY-MM-DD` strings, and each collection section is a sequence
 * when present. Schema version, duplicate IDs, dangling references, and per-entity field shapes
 * are *not* verified — the browser read path still accepts documents the desktop rejects (#116).
 *
 * Throws an `Error` whose message is safe to show the user.
 */
export function parseThreatModelYaml(text: string): ThreatModel {
	const parsed = load(text, { schema: THF_YAML_SCHEMA });
	assertThreatModelShape(parsed);

	// A `.thf` omits empty collections; materialize them so callers never see an absent array.
	parsed.elements ??= [];
	parsed.data_flows ??= [];
	parsed.trust_boundaries ??= [];
	parsed.threats ??= [];
	parsed.diagrams ??= [];

	for (const element of parsed.elements) {
		element.technologies ??= [];
	}

	return parsed;
}

/** Serialize a `ThreatModel` to `.thf` text the desktop reader accepts. */
export function serializeThreatModelYaml(model: ThreatModel): string {
	return dump(model, THF_YAML_DUMP_OPTIONS);
}

/**
 * Serialize a single `Threat` as a one-item `.thf` YAML sequence — the same shape it takes
 * inside a document's `threats:` section, ready to paste into an issue, PR, or doc. Reuses the
 * document dump options so escaping, enum casing, and nested `mitigation` match the canonical
 * writer exactly rather than a hand-built subset.
 */
export function serializeThreatYaml(threat: Threat): string {
	return dump([threat], THF_YAML_DUMP_OPTIONS);
}

function assertThreatModelShape(value: unknown): asserts value is ThreatModel {
	const document = requireMapping(value, "This file is not a ThreatForge threat model.");
	const metadata = requireMapping(
		document.metadata,
		"This file cannot be opened: it has no metadata section.",
	);

	requireCalendarDate(metadata, "created");
	requireCalendarDate(metadata, "modified");

	for (const section of COLLECTION_SECTIONS) {
		const entries = document[section];
		if (entries !== undefined && entries !== null && !Array.isArray(entries)) {
			throw new Error(`This file cannot be opened: ${section} is not a list of entries.`);
		}
	}
}

function requireMapping(value: unknown, message: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(message);
	}
	return value as Record<string, unknown>;
}

function requireCalendarDate(metadata: Record<string, unknown>, key: "created" | "modified"): void {
	const value = metadata[key];
	if (typeof value === "string" && CALENDAR_DATE.test(value)) return;

	const field = `metadata.${key}`;

	if (typeof value === "string") {
		const withTime = DATE_WITH_TIME.exec(value);
		if (withTime) {
			throw new Error(
				`This file cannot be opened: ${field} is ${quoteUntrusted(value)}, which carries a ` +
					`time of day. ThreatForge records plain calendar dates, and the desktop app rejects ` +
					`this value. Older ThreatForge web builds wrote it: change the line to read ` +
					`"${key}: ${withTime[1]}" and open the file again.`,
			);
		}
	}

	if (value === undefined || value === null) {
		throw new Error(
			`This file cannot be opened: ${field} is missing. Every threat model records a ${key} ` +
				`date in YYYY-MM-DD form.`,
		);
	}

	throw new Error(
		`This file cannot be opened: ${field} must be a calendar date in YYYY-MM-DD form` +
			`${typeof value === "string" ? `, not ${quoteUntrusted(value)}` : ""}.`,
	);
}

/** Quote a value read from an untrusted file, bounded so one long scalar cannot flood a dialog. */
function quoteUntrusted(value: string): string {
	return value.length > 40 ? `"${value.slice(0, 40)}…"` : `"${value}"`;
}
