/**
 * Tool contracts for the twelve model-edit actions.
 *
 * These are the first entries in the tool registry and the schemas the fenced
 * ` ```actions ` path validates against (`src/lib/ai-actions.ts`). Issue #64
 * turns them into native tool calls; until then the `action` literal is the
 * fenced protocol's discriminator, and a native tool would carry that
 * information in the tool name instead.
 *
 * Update payloads are derived from the domain types in
 * `src/types/threat-model.ts` rather than restated, so a field added to
 * `Element`, `DataFlow`, `TrustBoundary`, or `Threat` fails `tsc --noEmit` here
 * until it is either made writable or deliberately excluded. `id` is the single
 * excluded field: it is the document's reference key, and rewriting it leaves
 * data flows, threats, and trust-boundary membership pointing at an entity that
 * no longer exists — a file that saves cleanly and then fails to reopen.
 */

import { z } from "zod";
import { defineTool, parseToolInput, type ToolInputParseResult } from "@/lib/ai/protocol/tools";
import type {
	DataFlow,
	Element,
	Mitigation,
	MitigationStatus,
	Position,
	Severity,
	Size,
	StrideCategory,
	Threat,
	TrustBoundary,
} from "@/types/threat-model";

/** A schema per field of `T`, matching each field's exact type. */
type SchemaFor<T> = { [K in keyof T]-?: z.ZodType<T[K]> };

/**
 * A schema per field of `T`, each also admitting `undefined`.
 *
 * Applied with `satisfies` to an update payload's shape, this makes the
 * compiler enforce both directions: a domain field with no schema is a missing
 * property, and a schema field the domain type does not declare is an excess
 * property.
 */
type OptionalSchemaFor<T> = { [K in keyof T]-?: z.ZodType<T[K] | undefined> };

/**
 * Written as an exhaustive record so the compiler rejects a `StrideCategory`
 * that gains a member without the model being told it exists.
 */
const STRIDE_CATEGORIES: Record<StrideCategory, StrideCategory> = {
	Spoofing: "Spoofing",
	Tampering: "Tampering",
	Repudiation: "Repudiation",
	"Information Disclosure": "Information Disclosure",
	"Denial of Service": "Denial of Service",
	"Elevation of Privilege": "Elevation of Privilege",
};

const MITIGATION_STATUSES: Record<MitigationStatus, MitigationStatus> = {
	not_started: "not_started",
	in_progress: "in_progress",
	mitigated: "mitigated",
	accepted: "accepted",
	transferred: "transferred",
};

const SEVERITIES: Record<Severity, Severity> = {
	critical: "critical",
	high: "high",
	medium: "medium",
	low: "low",
	info: "info",
};

/**
 * A `Set` rather than an `in` check, because `in` walks the prototype chain and
 * `"constructor" in SEVERITIES` is true — and `"constructor"` survives the
 * lowercasing below, so it would be accepted as a severity.
 */
const SEVERITY_VALUES = new Set<string>(Object.values(SEVERITIES));

/**
 * Severity is matched without regard to case, and the model's spelling is kept
 * verbatim — the behavior the fenced action path has always had. The guard
 * therefore admits strings such as `"High"` that are not literally members of
 * `Severity`. Normalizing them is a separate change because it would rewrite
 * values the user already reviewed and applied.
 */
function denotesSeverity(value: string): value is Severity {
	return SEVERITY_VALUES.has(value.toLowerCase());
}

const strideCategorySchema = z.enum(STRIDE_CATEGORIES);

const severitySchema = z
	.string()
	.refine(denotesSeverity, { message: "must be critical, high, medium, low, or info" })
	.describe("One of critical, high, medium, low, info. Matched without regard to case.");

const positionSchema = z.strictObject({
	x: z.number(),
	y: z.number(),
} satisfies SchemaFor<Position>);

const sizeSchema = z.strictObject({
	width: z.number(),
	height: z.number(),
} satisfies SchemaFor<Size>);

const mitigationSchema = z.strictObject({
	status: z.enum(MITIGATION_STATUSES),
	description: z.string(),
} satisfies SchemaFor<Mitigation>);

const elementUpdateShape = {
	name: z.string().optional(),
	type: z.string().optional(),
	trust_zone: z.string().optional(),
	subtype: z.string().optional(),
	icon: z.string().optional(),
	description: z.string().optional(),
	technologies: z.array(z.string()).optional(),
	stores: z.array(z.string()).optional(),
	encryption: z.string().optional(),
	// Architecture references from #57. There is no add_layer/add_group action,
	// so the model can only point at human-created layers and groups — and the
	// executor validates both refs against the document, because the reader now
	// rejects dangling ones and an unvalidated write would produce a saved file
	// that cannot be reopened (the #98 failure class, by a new route).
	layer: z.string().optional(),
	group: z.string().optional(),
	tags: z.array(z.string()).optional(),
	position: positionSchema.optional(),
	fill_color: z.string().optional(),
	stroke_color: z.string().optional(),
	fill_opacity: z.number().optional(),
	stroke_opacity: z.number().optional(),
	font_size: z.number().optional(),
	font_weight: z.string().optional(),
} satisfies OptionalSchemaFor<Omit<Element, "id">>;

const dataFlowUpdateShape = {
	flow_number: z.number().optional(),
	name: z.string().optional(),
	from: z.string().optional(),
	to: z.string().optional(),
	protocol: z.string().optional(),
	data: z.array(z.string()).optional(),
	authenticated: z.boolean().optional(),
	label_offset: positionSchema.optional(),
	source_handle: z.string().optional(),
	target_handle: z.string().optional(),
	stroke_color: z.string().optional(),
	stroke_opacity: z.number().optional(),
} satisfies OptionalSchemaFor<Omit<DataFlow, "id">>;

const trustBoundaryUpdateShape = {
	name: z.string().optional(),
	contains: z.array(z.string()).optional(),
	position: positionSchema.optional(),
	size: sizeSchema.optional(),
	fill_color: z.string().optional(),
	stroke_color: z.string().optional(),
	fill_opacity: z.number().optional(),
	stroke_opacity: z.number().optional(),
} satisfies OptionalSchemaFor<Omit<TrustBoundary, "id">>;

const threatUpdateShape = {
	title: z.string().optional(),
	category: strideCategorySchema.optional(),
	element: z.string().optional(),
	flow: z.string().optional(),
	severity: severitySchema.optional(),
	description: z.string().optional(),
	mitigation: mitigationSchema.optional(),
} satisfies OptionalSchemaFor<Omit<Threat, "id">>;

/** Every action addresses an existing entity by id, and an empty id addresses nothing. */
const entityIdSchema = z.string().min(1).describe("Id of an entity that exists in the model.");

/*
 * The `add_*` payloads are a deliberate subset of their domain types rather than
 * a derived full set: they carry exactly the fields the executor writes and the
 * system prompt advertises. The remaining fields are styling and layout that
 * belong to the canvas, and an element is created before it has any. Because
 * the schemas are strict, an add payload carrying one of them is now rejected
 * where it was previously accepted and silently ignored.
 */

const addElementTool = defineTool({
	name: "add_element",
	description:
		"Add a process, data store, external entity, or text annotation to the model. " +
		"The id is assigned by ThreatForge.",
	input: {
		action: z.literal("add_element"),
		element: z.strictObject({
			type: z
				.string()
				.min(1)
				.describe('One of "process", "data_store", "external_entity", or "text".'),
			name: z.string().min(1),
			trust_zone: z.string().optional(),
			description: z.string().optional(),
			technologies: z.array(z.string()).optional(),
			position: positionSchema
				.optional()
				.describe("Canvas position in pixels; x grows right and y grows down."),
		}),
	},
});

const updateElementTool = defineTool({
	name: "update_element",
	description: "Change fields on an existing element. Send only the fields that change.",
	input: {
		action: z.literal("update_element"),
		id: entityIdSchema,
		updates: z.strictObject(elementUpdateShape),
	},
});

const deleteElementTool = defineTool({
	name: "delete_element",
	description: "Remove an element, the data flows touching it, and its trust-boundary membership.",
	input: { action: z.literal("delete_element"), id: entityIdSchema },
});

const addDataFlowTool = defineTool({
	name: "add_data_flow",
	description: "Connect two existing elements with a data flow.",
	input: {
		action: z.literal("add_data_flow"),
		data_flow: z.strictObject({
			name: z.string().optional(),
			from: entityIdSchema.describe("Id of the source element."),
			to: entityIdSchema.describe("Id of the destination element."),
			protocol: z.string().optional(),
			data: z.array(z.string()).optional().describe("Kinds of data carried, such as credentials."),
			authenticated: z.boolean().optional(),
		}),
	},
});

const updateDataFlowTool = defineTool({
	name: "update_data_flow",
	description:
		"Change fields on an existing data flow. Both endpoints must still resolve afterwards.",
	input: {
		action: z.literal("update_data_flow"),
		id: entityIdSchema,
		updates: z.strictObject(dataFlowUpdateShape),
	},
});

const deleteDataFlowTool = defineTool({
	name: "delete_data_flow",
	description: "Remove a data flow.",
	input: { action: z.literal("delete_data_flow"), id: entityIdSchema },
});

const addTrustBoundaryTool = defineTool({
	name: "add_trust_boundary",
	description: "Group elements inside a trust boundary. Members that do not exist are dropped.",
	input: {
		action: z.literal("add_trust_boundary"),
		trust_boundary: z.strictObject({
			name: z.string().min(1),
			contains: z.array(z.string()).optional().describe("Ids of the elements inside."),
			position: positionSchema.optional(),
		}),
	},
});

const updateTrustBoundaryTool = defineTool({
	name: "update_trust_boundary",
	description: "Change fields on an existing trust boundary.",
	input: {
		action: z.literal("update_trust_boundary"),
		id: entityIdSchema,
		updates: z.strictObject(trustBoundaryUpdateShape),
	},
});

const deleteTrustBoundaryTool = defineTool({
	name: "delete_trust_boundary",
	description: "Remove a trust boundary. Its members stay in the model.",
	input: { action: z.literal("delete_trust_boundary"), id: entityIdSchema },
});

const addThreatTool = defineTool({
	name: "add_threat",
	description: "Record a STRIDE threat against an element or a data flow.",
	input: {
		action: z.literal("add_threat"),
		threat: z.strictObject({
			title: z.string().min(1),
			category: strideCategorySchema,
			element: z.string().optional().describe("Id of the element this threat applies to."),
			flow: z.string().optional().describe("Id of the data flow this threat applies to."),
			severity: severitySchema,
			description: z.string().min(1),
			mitigation: mitigationSchema.optional(),
		}),
	},
});

const updateThreatTool = defineTool({
	name: "update_threat",
	description: "Change fields on an existing threat, including its mitigation status.",
	input: {
		action: z.literal("update_threat"),
		id: entityIdSchema,
		updates: z.strictObject(threatUpdateShape),
	},
});

const deleteThreatTool = defineTool({
	name: "delete_threat",
	description: "Remove a threat.",
	input: { action: z.literal("delete_threat"), id: entityIdSchema },
});

/**
 * The registry. Order is the order the actions are advertised to the model, and
 * groups each entity's add/update/delete together.
 */
export const LEGACY_ACTION_TOOLS = [
	addElementTool,
	updateElementTool,
	deleteElementTool,
	addDataFlowTool,
	updateDataFlowTool,
	deleteDataFlowTool,
	addTrustBoundaryTool,
	updateTrustBoundaryTool,
	deleteTrustBoundaryTool,
	addThreatTool,
	updateThreatTool,
	deleteThreatTool,
] as const;

/**
 * One schema for any action, so an unrecognized `action` value produces a single
 * "no matching discriminator" issue instead of twelve unrelated ones.
 */
const legacyActionSchema = z.discriminatedUnion("action", [
	addElementTool.inputSchema,
	updateElementTool.inputSchema,
	deleteElementTool.inputSchema,
	addDataFlowTool.inputSchema,
	updateDataFlowTool.inputSchema,
	deleteDataFlowTool.inputSchema,
	addTrustBoundaryTool.inputSchema,
	updateTrustBoundaryTool.inputSchema,
	deleteTrustBoundaryTool.inputSchema,
	addThreatTool.inputSchema,
	updateThreatTool.inputSchema,
	deleteThreatTool.inputSchema,
]);

export type LegacyAction = z.infer<typeof legacyActionSchema>;

/** Validate one raw action object emitted by the model. */
export function parseLegacyAction(raw: unknown): ToolInputParseResult<LegacyAction> {
	return parseToolInput(legacyActionSchema, raw);
}
