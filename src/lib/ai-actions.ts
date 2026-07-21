/**
 * AI Action Protocol — types and parser for AI-suggested model edits.
 *
 * The AI outputs actions in fenced `actions` code blocks as JSON arrays.
 * Each action describes a mutation to apply to the threat model.
 */

import type {
	DataFlow,
	Element,
	MitigationStatus,
	Severity,
	StrideCategory,
	TrustBoundary,
} from "@/types/threat-model";

/** Supported action types. */
export type AiActionType =
	| "add_element"
	| "update_element"
	| "delete_element"
	| "add_data_flow"
	| "update_data_flow"
	| "delete_data_flow"
	| "add_trust_boundary"
	| "update_trust_boundary"
	| "delete_trust_boundary"
	| "add_threat"
	| "update_threat"
	| "delete_threat";

/** Payload for adding a new element. */
export interface AddElementPayload {
	action: "add_element";
	element: {
		type: string;
		name: string;
		trust_zone?: string;
		description?: string;
		technologies?: string[];
		position?: { x: number; y: number };
	};
}

/** Payload for updating an existing element. */
export interface UpdateElementPayload {
	action: "update_element";
	id: string;
	updates: Partial<Omit<Element, "id">>;
}

/** Payload for deleting an element. */
export interface DeleteElementPayload {
	action: "delete_element";
	id: string;
}

/** Payload for adding a new data flow. */
export interface AddDataFlowPayload {
	action: "add_data_flow";
	data_flow: {
		name?: string;
		from: string;
		to: string;
		protocol?: string;
		data?: string[];
		authenticated?: boolean;
	};
}

/** Payload for updating a data flow. */
export interface UpdateDataFlowPayload {
	action: "update_data_flow";
	id: string;
	updates: Partial<Omit<DataFlow, "id">>;
}

/** Payload for deleting a data flow. */
export interface DeleteDataFlowPayload {
	action: "delete_data_flow";
	id: string;
}

/** Payload for adding a trust boundary. */
export interface AddTrustBoundaryPayload {
	action: "add_trust_boundary";
	trust_boundary: {
		name: string;
		contains?: string[];
		position?: { x: number; y: number };
	};
}

/** Payload for updating a trust boundary. */
export interface UpdateTrustBoundaryPayload {
	action: "update_trust_boundary";
	id: string;
	updates: Partial<Omit<TrustBoundary, "id">>;
}

/** Payload for deleting a trust boundary. */
export interface DeleteTrustBoundaryPayload {
	action: "delete_trust_boundary";
	id: string;
}

/** Payload for adding a threat. */
export interface AddThreatPayload {
	action: "add_threat";
	threat: {
		title: string;
		category: StrideCategory;
		element?: string;
		flow?: string;
		severity: Severity;
		description: string;
		mitigation?: {
			status: MitigationStatus;
			description: string;
		};
	};
}

/** Payload for updating a threat. */
export interface UpdateThreatPayload {
	action: "update_threat";
	id: string;
	updates: {
		title?: string;
		category?: StrideCategory;
		element?: string;
		flow?: string;
		severity?: Severity;
		description?: string;
		mitigation?: {
			status: MitigationStatus;
			description: string;
		};
	};
}

/** Payload for deleting a threat. */
export interface DeleteThreatPayload {
	action: "delete_threat";
	id: string;
}

/** Union of all action payloads. */
export type AiAction =
	| AddElementPayload
	| UpdateElementPayload
	| DeleteElementPayload
	| AddDataFlowPayload
	| UpdateDataFlowPayload
	| DeleteDataFlowPayload
	| AddTrustBoundaryPayload
	| UpdateTrustBoundaryPayload
	| DeleteTrustBoundaryPayload
	| AddThreatPayload
	| UpdateThreatPayload
	| DeleteThreatPayload;

const VALID_ACTION_TYPES = new Set<string>([
	"add_element",
	"update_element",
	"delete_element",
	"add_data_flow",
	"update_data_flow",
	"delete_data_flow",
	"add_trust_boundary",
	"update_trust_boundary",
	"delete_trust_boundary",
	"add_threat",
	"update_threat",
	"delete_threat",
]);

const VALID_CATEGORIES = new Set<string>([
	"Spoofing",
	"Tampering",
	"Repudiation",
	"Information Disclosure",
	"Denial of Service",
	"Elevation of Privilege",
]);

const VALID_SEVERITIES = new Set<string>(["critical", "high", "medium", "low", "info"]);

const VALID_MITIGATION_STATUSES = new Set<string>([
	"not_started",
	"in_progress",
	"mitigated",
	"accepted",
	"transferred",
]);

/** Narrow to a non-null, non-array object so `Object.keys` reflects real fields. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Checks one update field's value. */
type FieldCheck = (value: unknown) => boolean;

const isString: FieldCheck = (v) => typeof v === "string";
const isBoolean: FieldCheck = (v) => typeof v === "boolean";
const isNumber: FieldCheck = (v) => typeof v === "number" && Number.isFinite(v);
const isStringArray: FieldCheck = (v) => Array.isArray(v) && v.every((i) => typeof i === "string");
const isPosition: FieldCheck = (v) => isPlainRecord(v) && isNumber(v.x) && isNumber(v.y);
const isSize: FieldCheck = (v) => isPlainRecord(v) && isNumber(v.width) && isNumber(v.height);
const isMitigation: FieldCheck = (v) =>
	isPlainRecord(v) &&
	typeof v.status === "string" &&
	VALID_MITIGATION_STATUSES.has(v.status) &&
	typeof v.description === "string";

/** Visual styling shared by elements and boundaries. */
const STYLE_FIELDS: ReadonlyArray<[string, FieldCheck]> = [
	["fill_color", isString],
	["stroke_color", isString],
	["fill_opacity", isNumber],
	["stroke_opacity", isNumber],
];

/**
 * Fields each update action may write, and the shape each value must have.
 *
 * `id` is deliberately absent from every entry — it is the only field excluded.
 * It is the document's reference key: data flows, threats, and trust boundary
 * `contains` entries all point at it. Rewriting an id leaves those references
 * dangling while the entity still looks valid. The save itself then succeeds,
 * because `writer.rs` performs no reference validation, but `reader.rs` rejects
 * the whole document with `InvalidReference` — so the user is left holding a
 * `.thf` file they can no longer open.
 *
 * Every other schema field stays writable. Narrowing this to a "sensible"
 * subset would silently withdraw working behavior: the system prompt prints
 * each element's `position` and `subtype` back to the model, and `stores` and
 * `encryption` have no property-panel editor at all, so the assistant is the
 * only in-app way to set them.
 *
 * Values are checked as well as names. The executor spreads this object over a
 * real entity, so a well-named field carrying the wrong type propagates into
 * rendering and serialization: `technologies: "text"` reaches a `.map` call in
 * the canvas node and throws during render, and there is no error boundary to
 * contain it.
 *
 * This is a `Map` rather than an object literal on purpose. Object lookup walks
 * the prototype chain, so `updates.toString` would resolve to
 * `Object.prototype.toString` — a truthy function — and pass a naive check.
 */
const UPDATABLE_FIELDS = new Map<AiActionType, ReadonlyMap<string, FieldCheck>>([
	[
		"update_element",
		new Map<string, FieldCheck>([
			["name", isString],
			["type", isString],
			["trust_zone", isString],
			["subtype", isString],
			["icon", isString],
			["description", isString],
			["technologies", isStringArray],
			["stores", isStringArray],
			["encryption", isString],
			["position", isPosition],
			["font_size", isNumber],
			["font_weight", isString],
			...STYLE_FIELDS,
		]),
	],
	[
		"update_data_flow",
		new Map<string, FieldCheck>([
			["flow_number", isNumber],
			["name", isString],
			["from", isString],
			["to", isString],
			["protocol", isString],
			["data", isStringArray],
			["authenticated", isBoolean],
			["label_offset", isPosition],
			["source_handle", isString],
			["target_handle", isString],
			["stroke_color", isString],
			["stroke_opacity", isNumber],
		]),
	],
	[
		"update_trust_boundary",
		new Map<string, FieldCheck>([
			["name", isString],
			["contains", isStringArray],
			["position", isPosition],
			["size", isSize],
			...STYLE_FIELDS,
		]),
	],
	[
		"update_threat",
		new Map<string, FieldCheck>([
			["title", isString],
			["category", isString],
			["element", isString],
			["flow", isString],
			["severity", isString],
			["description", isString],
			["mitigation", isMitigation],
		]),
	],
]);

/**
 * Validate an update payload against its action's allowlist.
 *
 * Rejects the whole action rather than stripping the offending field: a partial
 * apply would change the document in a way the user never approved. Note the
 * rejection is currently invisible — `extractActions` drops it and the UI shows
 * only surviving actions — so the user sees one fewer suggestion with no
 * explanation. Surfacing that needs the tool-result loop in #62.
 */
function validateUpdates(type: AiActionType, updates: unknown): Record<string, unknown> | null {
	if (!isPlainRecord(updates)) return null;
	const fields = UPDATABLE_FIELDS.get(type);
	if (!fields) return null;
	for (const [key, value] of Object.entries(updates)) {
		const check = fields.get(key);
		if (!check || !check(value)) return null;
	}
	return updates;
}

/** Validate a single parsed action object. Returns the action if valid, null otherwise. */
function validateAction(obj: unknown): AiAction | null {
	if (!obj || typeof obj !== "object") return null;
	const action = obj as Record<string, unknown>;
	if (!action.action || !VALID_ACTION_TYPES.has(action.action as string)) return null;

	const type = action.action as AiActionType;

	switch (type) {
		case "add_element": {
			const el = action.element as Record<string, unknown> | undefined;
			if (!el?.type || !el?.name) return null;
			if (typeof el.type !== "string" || typeof el.name !== "string") return null;
			return action as unknown as AddElementPayload;
		}
		case "update_element": {
			if (!action.id || typeof action.id !== "string") return null;
			if (!validateUpdates(type, action.updates)) return null;
			return action as unknown as UpdateElementPayload;
		}
		case "delete_element":
		case "delete_data_flow":
		case "delete_trust_boundary":
		case "delete_threat": {
			if (!action.id || typeof action.id !== "string") return null;
			return action as unknown as AiAction;
		}
		case "add_data_flow": {
			const df = action.data_flow as Record<string, unknown> | undefined;
			if (!df?.from || !df?.to) return null;
			if (typeof df.from !== "string" || typeof df.to !== "string") return null;
			return action as unknown as AddDataFlowPayload;
		}
		case "update_data_flow": {
			if (!action.id || typeof action.id !== "string") return null;
			if (!validateUpdates(type, action.updates)) return null;
			return action as unknown as UpdateDataFlowPayload;
		}
		case "add_trust_boundary": {
			const tb = action.trust_boundary as Record<string, unknown> | undefined;
			if (!tb?.name || typeof tb.name !== "string") return null;
			return action as unknown as AddTrustBoundaryPayload;
		}
		case "update_trust_boundary": {
			if (!action.id || typeof action.id !== "string") return null;
			if (!validateUpdates(type, action.updates)) return null;
			return action as unknown as UpdateTrustBoundaryPayload;
		}
		case "add_threat": {
			const t = action.threat as Record<string, unknown> | undefined;
			if (!t?.title || !t?.category || !t?.severity || !t?.description) return null;
			if (!VALID_CATEGORIES.has(t.category as string)) return null;
			if (!VALID_SEVERITIES.has((t.severity as string).toLowerCase())) return null;
			return action as unknown as AddThreatPayload;
		}
		case "update_threat": {
			if (!action.id || typeof action.id !== "string") return null;
			const updates = validateUpdates(type, action.updates);
			if (!updates) return null;
			if (updates.category && !VALID_CATEGORIES.has(updates.category as string)) return null;
			if (updates.severity && !VALID_SEVERITIES.has((updates.severity as string).toLowerCase()))
				return null;
			return action as unknown as UpdateThreatPayload;
		}
		default:
			return null;
	}
}

/** Extract and validate AI actions from a response string containing fenced `actions` code blocks. */
export function extractActions(text: string): AiAction[] {
	const blockRegex = /```actions\n([\s\S]*?)```/g;
	const actions: AiAction[] = [];

	let match = blockRegex.exec(text);
	while (match) {
		try {
			const parsed = JSON.parse(match[1]);
			const items = Array.isArray(parsed) ? parsed : [parsed];
			for (const item of items) {
				const validated = validateAction(item);
				if (validated) actions.push(validated);
			}
		} catch {
			// Skip malformed JSON blocks
		}
		match = blockRegex.exec(text);
	}

	return actions;
}

/** Human-readable label for an action. */
export function describeAction(action: AiAction): string {
	switch (action.action) {
		case "add_element":
			return `Add element: ${action.element.name} (${action.element.type})`;
		case "update_element":
			return `Update element: ${action.id}`;
		case "delete_element":
			return `Delete element: ${action.id}`;
		case "add_data_flow":
			return `Add data flow: ${action.data_flow.from} → ${action.data_flow.to}`;
		case "update_data_flow":
			return `Update data flow: ${action.id}`;
		case "delete_data_flow":
			return `Delete data flow: ${action.id}`;
		case "add_trust_boundary":
			return `Add trust boundary: ${action.trust_boundary.name}`;
		case "update_trust_boundary":
			return `Update trust boundary: ${action.id}`;
		case "delete_trust_boundary":
			return `Delete trust boundary: ${action.id}`;
		case "add_threat":
			return `Add threat: ${action.threat.title}`;
		case "update_threat":
			return `Update threat: ${action.id}`;
		case "delete_threat":
			return `Delete threat: ${action.id}`;
	}
}
