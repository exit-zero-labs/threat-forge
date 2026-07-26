/**
 * Bounded, projected, filterable views of a `ThreatModel` for the AI read tools.
 *
 * One module maps the document into the shapes the read tools return: the `kind`
 * vocabulary (the eight array-valued `.thf` sections), the compact projection used
 * by `search_entities`, the full projection used by `get_entity`, the per-kind
 * text-search fields, and the per-kind filter applicability table.
 *
 * Two properties are structural:
 *
 *  - **Layout and style are never projected.** Positions, sizes, colors,
 *    opacities, fonts, handles, and viewports are canvas concerns (`#205`); no
 *    read tool this issue ships can act on them, so they are excluded rather than
 *    inflating every result.
 *  - **Every document-derived scalar is sanitized and escaped** through
 *    `escapeScalar`/`escapeList`, so no field can forge a marker, and long or
 *    hostile text is bounded before it reaches a provider or the DOM.
 */

import {
	escapeList,
	escapeScalar,
	LIST_MAX_ITEMS,
	SCALAR_MAX_CODE_POINTS,
	TEXT_MAX_CODE_POINTS,
} from "@/lib/ai/tools/read-result";
import type { ThreatModel } from "@/types/threat-model";

/**
 * The document sections a read tool can query: exactly the array-valued keys of
 * `ThreatModel`. A mapped type selects them, so adding a new array section to the
 * document fails `tsc` here (via {@link SECTION_KINDS}) until it is deliberately
 * included or excluded.
 */
type ArraySectionKeys<T> = {
	[K in keyof T]-?: NonNullable<T[K]> extends readonly unknown[] ? K : never;
}[keyof T];

export type DocumentSection = ArraySectionKeys<ThreatModel>;

/** The entity type stored in a given section. */
type EntityOf<K extends DocumentSection> = NonNullable<ThreatModel[K]>[number];

/**
 * The `kind` vocabulary as an exhaustive record, so a new `ThreatModel` array
 * section fails `tsc --noEmit` here until the tool is deliberately updated.
 */
export const SECTION_KINDS: Record<DocumentSection, DocumentSection> = {
	elements: "elements",
	data_flows: "data_flows",
	trust_boundaries: "trust_boundaries",
	threats: "threats",
	layers: "layers",
	groups: "groups",
	relationships: "relationships",
	diagrams: "diagrams",
};

/** Every queryable section, in a fixed, deterministic order. */
export const DOCUMENT_SECTIONS: readonly DocumentSection[] = Object.values(SECTION_KINDS);

/** Every filter `search_entities` accepts, in a fixed canonical order. */
export type FilterName =
	| "text"
	| "references"
	| "element_type"
	| "trust_zone"
	| "protocol"
	| "authenticated"
	| "severity"
	| "category"
	| "mitigation_status";

export const ALL_FILTER_NAMES: readonly FilterName[] = [
	"text",
	"references",
	"element_type",
	"trust_zone",
	"protocol",
	"authenticated",
	"severity",
	"category",
	"mitigation_status",
];

/** The set filter values for one `search_entities` call. Keys mirror {@link FilterName}. */
export interface FilterValues {
	text?: string;
	references?: string;
	element_type?: string;
	trust_zone?: string;
	protocol?: string;
	authenticated?: boolean;
	severity?: string;
	category?: string;
	mitigation_status?: string;
}

/** A projected entity: a flat record of authored keys and escaped scalar/list values. */
export type ProjectedEntity = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Projection builder
// ---------------------------------------------------------------------------

interface Projection {
	scalar(key: string, value: string, max?: number): void;
	optionalScalar(key: string, value: string | undefined, max?: number): void;
	text(key: string, value: string): void;
	optionalText(key: string, value: string | undefined): void;
	raw(key: string, value: unknown): void;
	list(key: string, values: readonly string[]): void;
	finish(): ProjectedEntity;
}

/**
 * Accumulate a bounded projection, tracking scalar/text truncation so the entity
 * carries `"truncated": true` when a field was cut, and emitting `"<key>_total"`
 * beside a list that was capped.
 */
function newProjection(): Projection {
	const out: ProjectedEntity = {};
	let truncated = false;

	function scalar(key: string, value: string, max = SCALAR_MAX_CODE_POINTS): void {
		const escaped = escapeScalar(value, max);
		out[key] = escaped.text;
		if (escaped.truncated) truncated = true;
	}

	return {
		scalar,
		optionalScalar(key, value, max) {
			if (value !== undefined) scalar(key, value, max);
		},
		text(key, value) {
			scalar(key, value, TEXT_MAX_CODE_POINTS);
		},
		optionalText(key, value) {
			if (value !== undefined) scalar(key, value, TEXT_MAX_CODE_POINTS);
		},
		raw(key, value) {
			out[key] = value;
		},
		list(key, values) {
			const capped = escapeList(values, {
				maxItems: LIST_MAX_ITEMS,
				maxCodePoints: SCALAR_MAX_CODE_POINTS,
			});
			out[key] = capped.items;
			if (capped.total > capped.items.length) out[`${key}_total`] = capped.total;
		},
		finish() {
			if (truncated) out.truncated = true;
			return out;
		},
	};
}

/** Keep only the defined string values of a heterogeneous list, for text-search haystacks. */
function definedStrings(values: readonly (string | undefined)[]): string[] {
	return values.filter((value): value is string => typeof value === "string");
}

// ---------------------------------------------------------------------------
// Per-section specs
// ---------------------------------------------------------------------------

type FilterPredicate<E> = (entity: E, values: FilterValues) => boolean;

interface SectionSpec<E> {
	get(model: ThreatModel): readonly E[];
	id(entity: E): string;
	searchText(entity: E): string[];
	compact(entity: E): ProjectedEntity;
	full(entity: E, model: ThreatModel): ProjectedEntity;
	/** Section-specific filters; `text` is universal and handled separately. */
	filters: Partial<Record<Exclude<FilterName, "text">, FilterPredicate<E>>>;
}

const elementsSpec: SectionSpec<EntityOf<"elements">> = {
	get: (model) => model.elements,
	id: (element) => element.id,
	searchText: (element) =>
		definedStrings([
			element.id,
			element.name,
			element.type,
			element.subtype,
			element.trust_zone,
			element.description,
			...element.technologies,
			...(element.tags ?? []),
			...(element.stores ?? []),
		]),
	compact: (element) => {
		const projection = newProjection();
		projection.scalar("id", element.id);
		projection.scalar("name", element.name);
		projection.scalar("type", element.type);
		projection.scalar("trust_zone", element.trust_zone);
		projection.optionalScalar("layer", element.layer);
		projection.optionalScalar("group", element.group);
		return projection.finish();
	},
	full: (element, model) => {
		const projection = newProjection();
		projection.scalar("id", element.id);
		projection.scalar("name", element.name);
		projection.scalar("type", element.type);
		projection.scalar("trust_zone", element.trust_zone);
		projection.optionalScalar("layer", element.layer);
		projection.optionalScalar("group", element.group);
		projection.optionalScalar("subtype", element.subtype);
		projection.optionalScalar("icon", element.icon);
		projection.optionalScalar("encryption", element.encryption);
		projection.text("description", element.description);
		projection.list("technologies", element.technologies);
		projection.list("tags", element.tags ?? []);
		projection.list("stores", element.stores ?? []);
		projection.list(
			"incoming_flow_ids",
			model.data_flows.filter((flow) => flow.to === element.id).map((flow) => flow.id),
		);
		projection.list(
			"outgoing_flow_ids",
			model.data_flows.filter((flow) => flow.from === element.id).map((flow) => flow.id),
		);
		projection.list(
			"trust_boundary_ids",
			model.trust_boundaries
				.filter((boundary) => boundary.contains.includes(element.id))
				.map((boundary) => boundary.id),
		);
		projection.list(
			"threat_ids",
			model.threats.filter((threat) => threat.element === element.id).map((threat) => threat.id),
		);
		return projection.finish();
	},
	filters: {
		references: (element, values) =>
			element.layer === values.references || element.group === values.references,
		element_type: (element, values) => element.type === values.element_type,
		trust_zone: (element, values) => element.trust_zone === values.trust_zone,
	},
};

const dataFlowsSpec: SectionSpec<EntityOf<"data_flows">> = {
	get: (model) => model.data_flows,
	id: (flow) => flow.id,
	searchText: (flow) =>
		definedStrings([flow.id, flow.name, flow.protocol, flow.from, flow.to, ...flow.data]),
	compact: (flow) => {
		const projection = newProjection();
		projection.scalar("id", flow.id);
		projection.scalar("name", flow.name);
		projection.scalar("from", flow.from);
		projection.scalar("to", flow.to);
		projection.scalar("protocol", flow.protocol);
		projection.raw("authenticated", flow.authenticated);
		return projection.finish();
	},
	full: (flow, model) => {
		const projection = newProjection();
		projection.scalar("id", flow.id);
		projection.scalar("name", flow.name);
		projection.scalar("from", flow.from);
		projection.scalar("to", flow.to);
		projection.scalar("protocol", flow.protocol);
		projection.raw("authenticated", flow.authenticated);
		projection.list("data", flow.data);
		projection.list(
			"threat_ids",
			model.threats.filter((threat) => threat.flow === flow.id).map((threat) => threat.id),
		);
		return projection.finish();
	},
	filters: {
		references: (flow, values) => flow.from === values.references || flow.to === values.references,
		protocol: (flow, values) => flow.protocol.toLowerCase() === values.protocol?.toLowerCase(),
		authenticated: (flow, values) => flow.authenticated === values.authenticated,
	},
};

const trustBoundariesSpec: SectionSpec<EntityOf<"trust_boundaries">> = {
	get: (model) => model.trust_boundaries,
	id: (boundary) => boundary.id,
	searchText: (boundary) => definedStrings([boundary.id, boundary.name]),
	compact: (boundary) => {
		const projection = newProjection();
		projection.scalar("id", boundary.id);
		projection.scalar("name", boundary.name);
		projection.raw("contains_count", boundary.contains.length);
		return projection.finish();
	},
	full: (boundary) => {
		const projection = newProjection();
		projection.scalar("id", boundary.id);
		projection.scalar("name", boundary.name);
		projection.raw("contains_count", boundary.contains.length);
		projection.list("contains", boundary.contains);
		return projection.finish();
	},
	filters: {
		references: (boundary, values) => {
			const reference = values.references;
			return reference !== undefined && boundary.contains.includes(reference);
		},
	},
};

const threatsSpec: SectionSpec<EntityOf<"threats">> = {
	get: (model) => model.threats,
	id: (threat) => threat.id,
	searchText: (threat) =>
		definedStrings([
			threat.id,
			threat.title,
			threat.category,
			threat.severity,
			threat.description,
			threat.mitigation?.description,
		]),
	compact: (threat) => {
		const projection = newProjection();
		projection.scalar("id", threat.id);
		projection.scalar("title", threat.title);
		projection.scalar("category", threat.category);
		projection.scalar("severity", threat.severity);
		projection.optionalScalar("element", threat.element);
		projection.optionalScalar("flow", threat.flow);
		projection.scalar("mitigation_status", threat.mitigation?.status ?? "none");
		return projection.finish();
	},
	full: (threat) => {
		const projection = newProjection();
		projection.scalar("id", threat.id);
		projection.scalar("title", threat.title);
		projection.scalar("category", threat.category);
		projection.scalar("severity", threat.severity);
		projection.optionalScalar("element", threat.element);
		projection.optionalScalar("flow", threat.flow);
		projection.scalar("mitigation_status", threat.mitigation?.status ?? "none");
		projection.text("description", threat.description);
		projection.optionalText("mitigation_description", threat.mitigation?.description);
		return projection.finish();
	},
	filters: {
		references: (threat, values) =>
			threat.element === values.references || threat.flow === values.references,
		severity: (threat, values) => threat.severity === values.severity,
		category: (threat, values) => threat.category === values.category,
		mitigation_status: (threat, values) =>
			(threat.mitigation?.status ?? "none") === values.mitigation_status,
	},
};

const layersSpec: SectionSpec<EntityOf<"layers">> = {
	get: (model) => model.layers ?? [],
	id: (layer) => layer.id,
	searchText: (layer) => definedStrings([layer.id, layer.name, layer.description]),
	compact: (layer) => {
		const projection = newProjection();
		projection.scalar("id", layer.id);
		projection.scalar("name", layer.name);
		return projection.finish();
	},
	full: (layer) => {
		const projection = newProjection();
		projection.scalar("id", layer.id);
		projection.scalar("name", layer.name);
		projection.optionalText("description", layer.description);
		return projection.finish();
	},
	filters: {},
};

const groupsSpec: SectionSpec<EntityOf<"groups">> = {
	get: (model) => model.groups ?? [],
	id: (group) => group.id,
	searchText: (group) => definedStrings([group.id, group.name, group.type, group.description]),
	compact: (group) => {
		const projection = newProjection();
		projection.scalar("id", group.id);
		projection.scalar("name", group.name);
		projection.optionalScalar("type", group.type);
		projection.optionalScalar("parent", group.parent);
		return projection.finish();
	},
	full: (group) => {
		const projection = newProjection();
		projection.scalar("id", group.id);
		projection.scalar("name", group.name);
		projection.optionalScalar("type", group.type);
		projection.optionalScalar("parent", group.parent);
		projection.optionalText("description", group.description);
		return projection.finish();
	},
	filters: {
		references: (group, values) => group.parent === values.references,
	},
};

const relationshipsSpec: SectionSpec<EntityOf<"relationships">> = {
	get: (model) => model.relationships ?? [],
	id: (relationship) => relationship.id,
	searchText: (relationship) =>
		definedStrings([
			relationship.id,
			relationship.type,
			relationship.name,
			relationship.description,
		]),
	compact: (relationship) => {
		const projection = newProjection();
		projection.scalar("id", relationship.id);
		projection.scalar("type", relationship.type);
		projection.scalar("from", relationship.from);
		projection.scalar("to", relationship.to);
		projection.optionalScalar("name", relationship.name);
		return projection.finish();
	},
	full: (relationship) => {
		const projection = newProjection();
		projection.scalar("id", relationship.id);
		projection.scalar("type", relationship.type);
		projection.scalar("from", relationship.from);
		projection.scalar("to", relationship.to);
		projection.optionalScalar("name", relationship.name);
		projection.optionalText("description", relationship.description);
		return projection.finish();
	},
	filters: {
		references: (relationship, values) =>
			relationship.from === values.references || relationship.to === values.references,
	},
};

const diagramsSpec: SectionSpec<EntityOf<"diagrams">> = {
	get: (model) => model.diagrams,
	id: (diagram) => diagram.id,
	searchText: (diagram) =>
		definedStrings([diagram.id, diagram.name, diagram.kind, diagram.description]),
	compact: (diagram) => {
		const projection = newProjection();
		projection.scalar("id", diagram.id);
		projection.scalar("name", diagram.name);
		projection.optionalScalar("kind", diagram.kind);
		return projection.finish();
	},
	full: (diagram) => {
		const projection = newProjection();
		projection.scalar("id", diagram.id);
		projection.scalar("name", diagram.name);
		projection.optionalScalar("kind", diagram.kind);
		projection.optionalText("description", diagram.description);
		return projection.finish();
	},
	filters: {},
};

// ---------------------------------------------------------------------------
// Type-erased operations, keyed by kind
// ---------------------------------------------------------------------------

/**
 * The per-section operations the read tools call. It deals only in `ThreatModel`,
 * a string id, and {@link FilterValues} — never a raw entity — so the
 * type-erased boundary never needs an unsound entity cast.
 */
interface SectionOps {
	count(model: ThreatModel): number;
	getFull(model: ThreatModel, id: string): ProjectedEntity | undefined;
	filterCompact(model: ThreatModel, values: FilterValues): ProjectedEntity[];
	readonly applicableFilters: readonly FilterName[];
}

/** Bind a concrete section spec into type-erased ops, keeping full typing inside the closure. */
function toOps<E>(spec: SectionSpec<E>): SectionOps {
	const applicableFilters = ALL_FILTER_NAMES.filter(
		(name) => name === "text" || spec.filters[name] !== undefined,
	);

	function matches(entity: E, values: FilterValues): boolean {
		if (values.text !== undefined) {
			const haystack = spec.searchText(entity).join("\n").toLowerCase();
			if (!haystack.includes(values.text.toLowerCase())) return false;
		}
		for (const name of ALL_FILTER_NAMES) {
			if (name === "text") continue;
			if (values[name] === undefined) continue;
			const predicate = spec.filters[name];
			if (predicate && !predicate(entity, values)) return false;
		}
		return true;
	}

	return {
		applicableFilters,
		count: (model) => spec.get(model).length,
		getFull(model, id) {
			// Exact `===` match against the current document — no trimming, no case
			// folding — and the first match wins for a hand-edited duplicate id.
			const entity = spec.get(model).find((candidate) => spec.id(candidate) === id);
			return entity === undefined ? undefined : spec.full(entity, model);
		},
		filterCompact(model, values) {
			return spec
				.get(model)
				.filter((entity) => matches(entity, values))
				.map((entity) => spec.compact(entity));
		},
	};
}

const SECTION_OPS: Record<DocumentSection, SectionOps> = {
	elements: toOps(elementsSpec),
	data_flows: toOps(dataFlowsSpec),
	trust_boundaries: toOps(trustBoundariesSpec),
	threats: toOps(threatsSpec),
	layers: toOps(layersSpec),
	groups: toOps(groupsSpec),
	relationships: toOps(relationshipsSpec),
	diagrams: toOps(diagramsSpec),
};

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

/** The filters that apply to `kind`, in canonical order — the `invalid_filter` source of truth. */
export function applicableFilters(kind: DocumentSection): readonly FilterName[] {
	return SECTION_OPS[kind].applicableFilters;
}

/**
 * The first set filter (in canonical order) that does not apply to `kind`, or
 * `null` when every set filter applies. Fixed order makes the reported filter
 * deterministic when a model sets two inapplicable filters at once.
 */
export function firstInapplicableFilter(
	kind: DocumentSection,
	values: FilterValues,
): FilterName | null {
	const applicable = SECTION_OPS[kind].applicableFilters;
	for (const name of ALL_FILTER_NAMES) {
		if (values[name] !== undefined && !applicable.includes(name)) return name;
	}
	return null;
}

/** Count the entities in a section of the current document. */
export function countEntities(model: ThreatModel, kind: DocumentSection): number {
	return SECTION_OPS[kind].count(model);
}

/** The full projection of the entity with `id` in `kind`, or `undefined` if none exists. */
export function getFullEntity(
	model: ThreatModel,
	kind: DocumentSection,
	id: string,
): ProjectedEntity | undefined {
	return SECTION_OPS[kind].getFull(model, id);
}

/**
 * Every entity in `kind` matching `values`, in document order, projected to its
 * compact shape. Filters combine with AND and run against raw document values.
 */
export function filterCompactEntities(
	model: ThreatModel,
	kind: DocumentSection,
	values: FilterValues,
): ProjectedEntity[] {
	return SECTION_OPS[kind].filterCompact(model, values);
}
