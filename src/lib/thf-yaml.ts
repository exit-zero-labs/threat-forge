import yaml, { type DumpOptions } from "js-yaml";
import type { ThreatModel } from "@/types/threat-model";

declare module "js-yaml" {
	/**
	 * `@types/js-yaml@4` under-declares two members every js-yaml instance carries at runtime:
	 * the type lists a `Schema` was built from, and the tag a `Type` resolves. Deriving a schema
	 * from `DEFAULT_SCHEMA` needs both. `thf-yaml.test.ts` asserts the derived schema still holds
	 * every default tag but the timestamp, so a js-yaml release that drops either member fails a
	 * test rather than silently producing an empty schema.
	 */
	interface Schema {
		readonly implicit: Type[];
		readonly explicit: Type[];
	}

	interface Type {
		readonly tag: string;
	}
}

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
 * js-yaml's default schema with the YAML 1.1 timestamp type removed.
 *
 * The desktop writer emits `created: 2026-03-15` unquoted, and YAML 1.1 resolves that scalar to
 * a timestamp. With the timestamp type in play, `yaml.load` returns a `Date` and `yaml.dump`
 * re-emits it as `2026-03-15T00:00:00.000Z`, which chrono's `NaiveDate` refuses — a desktop
 * document opened and saved in the browser could no longer be opened on the desktop.
 *
 * Without the type, a date-shaped scalar reads back as the string its declared type promises, and
 * writes back unquoted: the dumper only quotes a plain scalar that would implicitly resolve to a
 * non-string under the schema it is given. Read and write therefore share this one schema, and
 * `created`/`modified` survive a round trip byte for byte.
 *
 * Only the timestamp type is dropped. Merge keys, `!!binary`, `!!omap`, `!!pairs`, and `!!set`
 * keep working.
 */
export const THF_YAML_SCHEMA = new yaml.Schema({
	implicit: yaml.DEFAULT_SCHEMA.implicit.filter((type) => type.tag !== TIMESTAMP_TAG),
	explicit: yaml.DEFAULT_SCHEMA.explicit,
});

/** Options the browser writer passes to `yaml.dump` for every `.thf` document. */
export const THF_YAML_DUMP_OPTIONS: DumpOptions = {
	lineWidth: -1,
	noRefs: true,
	sortKeys: false,
	quotingType: '"',
	schema: THF_YAML_SCHEMA,
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
	const parsed = yaml.load(text, { schema: THF_YAML_SCHEMA });
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
	return yaml.dump(model, THF_YAML_DUMP_OPTIONS);
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
