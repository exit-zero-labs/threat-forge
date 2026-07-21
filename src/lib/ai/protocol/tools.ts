/**
 * Tool definitions with a single schema source.
 *
 * One Zod shape per tool yields three things that would otherwise drift: the
 * runtime validator, the static input type, and the JSON Schema advertised to
 * the provider. A handwritten JSON Schema beside a handwritten validator can
 * describe a tool the validator rejects, which the model then keeps retrying.
 */

import { z } from "zod";

/**
 * The JSON Schema subset providers accept for a tool input.
 *
 * Anthropic (`input_schema`) and OpenAI (`function.parameters`) both require an
 * object schema, so the emitter narrows to that rather than passing arbitrary
 * generated JSON Schema through.
 */
export interface ToolInputJsonSchema {
	type: "object";
	properties: Record<string, unknown>;
	/** Omitted when every property is optional. */
	required?: string[];
	additionalProperties: false;
}

export type ToolInputParseResult<T> =
	| { ok: true; value: T }
	| {
			ok: false;
			/**
			 * One human-readable line per problem, path-prefixed. These are written to
			 * be handed back to the model as a tool result so it can correct itself,
			 * so they name the offending field rather than describing internals.
			 */
			issues: string[];
	  };

/**
 * A tool's advertised identity with its input shape erased.
 *
 * `ToolDefinition` satisfies this, so a heterogeneous tool list — the twelve
 * legacy actions, and #64's native tools — can be passed to surfaces that only
 * need the identity and not the generic input type: request preflight (which
 * only asks whether any tool is offered) and the system prompt (which decides
 * whether to emit the fenced-action instructions).
 */
export interface ToolDescriptor {
	readonly name: string;
	readonly description: string;
}

export interface ToolDefinition<Shape extends z.ZodRawShape> extends ToolDescriptor {
	/**
	 * Exposed so related tools can be combined — the legacy action registry
	 * builds one discriminated union from all twelve.
	 */
	readonly inputSchema: z.ZodObject<Shape, z.core.$strict>;
	/** Generated fresh on each call; callers may keep or mutate the result. */
	jsonSchema(): ToolInputJsonSchema;
	/** The only supported way to turn raw model output into a typed input. */
	parseInput(raw: unknown): ToolInputParseResult<z.infer<z.ZodObject<Shape, z.core.$strict>>>;
}

export interface ToolSpec<Shape extends z.ZodRawShape> {
	name: string;
	/** Shown to the model. Describes when to use the tool, not how it is implemented. */
	description: string;
	/**
	 * Field schemas only. `defineTool` wraps them in `z.strictObject` itself so a
	 * tool cannot be declared with a permissive top-level object that silently
	 * accepts model-invented keys.
	 */
	input: Shape;
}

const PROTOTYPE_KEY = "__proto__";

/** Narrow to a non-null, non-array object so own keys reflect real fields. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Report `__proto__` keys anywhere in a raw payload.
 *
 * Zod's strict-object check skips `__proto__` deliberately, so a payload
 * carrying it parses successfully with the key silently dropped, while every
 * other unrecognized key rejects the whole object. Silent dropping is the wrong
 * outcome here: a caller that applies the parsed value would perform a partial
 * mutation the model asked for and nobody reviewed. Rejecting restores the
 * all-or-nothing contract.
 *
 * The walk is iterative because model output nests arbitrarily and `JSON.parse`
 * will happily build a structure deep enough to overflow a recursive walker.
 */
function findPrototypeKeyIssues(raw: unknown): string[] {
	const issues: string[] = [];
	const pending: Array<{ value: unknown; path: string }> = [{ value: raw, path: "" }];

	for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
		const { value, path } = current;

		if (Array.isArray(value)) {
			value.forEach((item: unknown, index) => {
				pending.push({ value: item, path: `${path}[${index}]` });
			});
			continue;
		}
		if (!isPlainRecord(value)) continue;

		for (const key of Object.getOwnPropertyNames(value)) {
			const childPath = path === "" ? key : `${path}.${key}`;
			if (key === PROTOTYPE_KEY) {
				issues.push(`${childPath}: "${PROTOTYPE_KEY}" is not an accepted key`);
				continue;
			}
			pending.push({ value: value[key], path: childPath });
		}
	}

	return issues;
}

function formatIssuePath(path: ReadonlyArray<PropertyKey>): string {
	let formatted = "";
	for (const segment of path) {
		if (typeof segment === "number") {
			formatted += `[${segment}]`;
			continue;
		}
		const name = String(segment);
		formatted = formatted === "" ? name : `${formatted}.${name}`;
	}
	return formatted;
}

function formatIssues(error: z.ZodError): string[] {
	return error.issues.map((issue) => {
		const path = formatIssuePath(issue.path);
		return path === "" ? issue.message : `${path}: ${issue.message}`;
	});
}

/**
 * Convert a generated schema into the provider-facing shape.
 *
 * `additionalProperties` is asserted rather than assumed: it is the property
 * that stops a model from inventing fields, and a Zod release that changed the
 * default would otherwise silently widen every tool. `$schema` is dropped
 * because neither provider consumes it.
 */
function toToolInputJsonSchema(schema: z.ZodType, toolName: string): ToolInputJsonSchema {
	const generated = z.toJSONSchema(schema, { io: "input" });

	if (generated.type !== "object" || generated.properties === undefined) {
		throw new Error(`Tool "${toolName}": generated schema is not an object schema`);
	}
	if (generated.additionalProperties !== undefined && generated.additionalProperties !== false) {
		throw new Error(`Tool "${toolName}": generated schema permits additional properties`);
	}

	return {
		type: "object",
		properties: generated.properties,
		...(generated.required === undefined ? {} : { required: generated.required }),
		additionalProperties: false,
	};
}

/**
 * Validate raw model output against a tool-input schema.
 *
 * Exported because a schema built by combining several tool inputs — the legacy
 * action registry unions all twelve — must be parsed with the same
 * `__proto__` handling and the same issue formatting as a single tool.
 */
export function parseToolInput<Schema extends z.ZodType>(
	schema: Schema,
	raw: unknown,
): ToolInputParseResult<z.infer<Schema>> {
	const prototypeIssues = findPrototypeKeyIssues(raw);
	if (prototypeIssues.length > 0) return { ok: false, issues: prototypeIssues };

	const result = schema.safeParse(raw);
	if (result.success) return { ok: true, value: result.data };
	return { ok: false, issues: formatIssues(result.error) };
}

/** Declare a tool whose input contract is enforced and advertised from one Zod shape. */
export function defineTool<Shape extends z.ZodRawShape>(
	spec: ToolSpec<Shape>,
): ToolDefinition<Shape> {
	const inputSchema = z.strictObject(spec.input);

	return {
		name: spec.name,
		description: spec.description,
		inputSchema,
		jsonSchema: () => toToolInputJsonSchema(inputSchema, spec.name),
		parseInput: (raw) => parseToolInput(inputSchema, raw),
	};
}
