/**
 * The tool runtime interface — the boundary issue #64 must satisfy.
 *
 * This is the smallest contract a tool needs to be driven by the loop, with no
 * graph vocabulary in it. The loop never inspects a document's contents; it only
 * asks a tool to `prepare` raw model output into a runnable {@link PreparedCall}
 * and later replaces the document wholesale with whatever `run` returns.
 *
 * Two properties are structural rather than defended:
 *
 *  - **An unvalidated input is unrepresentable at the execution boundary.**
 *    `prepare` is the only way to obtain a `PreparedCall`, and it closes over the
 *    tool's *typed* input — there is no signature anywhere that accepts raw model
 *    JSON and runs it, and no cast is needed to achieve that.
 *  - **`effect` and `destructive` are static, local, model-independent
 *    declarations.** They are the only inputs to the auto-approval policy
 *    (`./authorization.ts`), and nothing the model, a tool result, or the
 *    document says can change them.
 *
 * A tool's `summary` and its `run` result are rendered as **text**, never as
 * Markdown or HTML — they are derived from untrusted model input.
 */

import type { z } from "zod";
import type { AdvertisedTool } from "@/lib/ai/protocol/tools";
import { defineTool } from "@/lib/ai/protocol/tools";
import type { ThreatModel } from "@/types/threat-model";

/**
 * Whether a tool reads the document or mutates it. Static and local: the auto
 * approval of read-only tools keys on this field and nothing else.
 */
export type ToolEffect = "read" | "mutate";

/** The document as it stands immediately before a call runs, plus the turn's stop signal. */
export interface ToolExecutionContext {
	/** Read immediately before `run`, so a tool computes against current state. */
	readonly document: ThreatModel;
	readonly signal: AbortSignal;
}

/**
 * What a tool's `run` resolved to.
 *
 * An `ok` outcome with no `document` changed nothing; the loop never inspects the
 * document's contents, only replaces it wholesale when one is present. An `error`
 * outcome commits nothing and its `result` is handed back to the model verbatim
 * so it can correct itself.
 */
export type ToolOutcome =
	| { status: "ok"; result: string; document?: ThreatModel }
	| { status: "error"; result: string };

/**
 * A validated, runnable call.
 *
 * It closes over its own typed input, so obtaining one is proof the input passed
 * the tool's schema. `inputDigest` is the identity an approval binds to.
 */
export interface PreparedCall {
	/** Plain text, no markup, for the approval card. Derived from validated input. */
	readonly summary: string;
	/** Canonical JSON of the validated input. The identity an approval binds to. */
	readonly inputDigest: string;
	run(ctx: ToolExecutionContext): Promise<ToolOutcome>;
}

/** `prepare` accepted the input, or reported model-facing issues that did not. */
export type PreparedCallResult = { ok: true; call: PreparedCall } | { ok: false; issues: string[] };

/**
 * A tool's advertised identity and effect, with its input shape erased.
 *
 * Extends `AdvertisedTool`, so a registry's tools can be advertised to a provider
 * directly. The loop only ever sees this erased view — never the generic input
 * type — which is why no code path in the loop can branch on a tool's fields.
 */
export interface RegisteredTool extends AdvertisedTool {
	/** Static, local, model-independent. The only input to auto-approval policy. */
	readonly effect: ToolEffect;
	/** Destroys information. Never covered by a batch approval. */
	readonly destructive: boolean;
	/** The only way to obtain something runnable from raw model output. */
	prepare(raw: unknown): PreparedCallResult;
}

/** The strict input type a Zod field shape validates to, matching `defineTool`. */
type StrictInput<Shape extends z.ZodRawShape> = z.infer<z.ZodObject<Shape, z.core.$strict>>;

/** Everything `defineExecutableTool` needs beyond the identity and schema `defineTool` owns. */
export interface ExecutableToolSpec<Shape extends z.ZodRawShape> {
	name: string;
	/** Shown to the model. Describes when to use the tool, not how it is implemented. */
	description: string;
	/** Field schemas only; wrapped in a strict object by `defineTool`. */
	input: Shape;
	effect: ToolEffect;
	/** Whether the tool destroys information; a `read` tool may never be destructive. */
	destructive: boolean;
	/** Plain-text, no-markup summary of the validated input for the approval card. */
	summarize: (input: StrictInput<Shape>) => string;
	/** Run the validated input against the current document. */
	execute: (input: StrictInput<Shape>, ctx: ToolExecutionContext) => Promise<ToolOutcome>;
}

/**
 * Declare an executable tool from one Zod shape.
 *
 * Identity, schema generation, and validation are delegated to issue #61's
 * `defineTool`; this adds the effect classification and the execution closure.
 * The erased `RegisteredTool` is produced inside the generic scope, so
 * `summarize` and `execute` see the typed input with no `as unknown as`.
 */
export function defineExecutableTool<Shape extends z.ZodRawShape>(
	spec: ExecutableToolSpec<Shape>,
): RegisteredTool {
	if (spec.effect === "read" && spec.destructive) {
		// A read tool that destroys information is a contradiction the auto-approval
		// policy must never be asked to reason about; reject it at construction.
		throw new Error(`Tool "${spec.name}" cannot be both read-only and destructive.`);
	}

	const definition = defineTool({
		name: spec.name,
		description: spec.description,
		input: spec.input,
	});

	return {
		name: spec.name,
		description: spec.description,
		effect: spec.effect,
		destructive: spec.destructive,
		jsonSchema: () => definition.jsonSchema(),
		prepare(raw) {
			const parsed = definition.parseInput(raw);
			if (!parsed.ok) return { ok: false, issues: parsed.issues };

			const input = parsed.value;
			const call: PreparedCall = {
				summary: spec.summarize(input),
				inputDigest: canonicalJson(input),
				run: (ctx) => spec.execute(input, ctx),
			};
			return { ok: true, call };
		},
	};
}

/** A frozen, name-keyed view of the tools offered to the loop. */
export interface ToolRegistry {
	/** Every tool, in registration order. */
	list(): readonly RegisteredTool[];
	/** Exact-match lookup. No trimming, no case folding, no normalization. */
	get(name: string): RegisteredTool | undefined;
}

/**
 * Build a frozen registry from a fixed tool list.
 *
 * `get` matches the requested name against a `Map` with `===` and no
 * normalization, so a homoglyph, a trailing space, or a case change resolves to
 * `undefined` rather than to a similarly named tool. Duplicate names throw at
 * construction, because a duplicate would make `get` non-deterministic.
 */
export function createToolRegistry(tools: readonly RegisteredTool[]): ToolRegistry {
	const byName = new Map<string, RegisteredTool>();
	for (const tool of tools) {
		if (byName.has(tool.name)) {
			throw new Error(`Duplicate tool name "${tool.name}" in registry.`);
		}
		byName.set(tool.name, tool);
	}

	const frozen = Object.freeze([...tools]);
	return Object.freeze({
		list: () => frozen,
		get: (name: string) => byName.get(name),
	});
}

/**
 * Deterministic JSON with recursively sorted object keys and no whitespace.
 *
 * Digests are the canonical string itself, compared with `===`; no hash function
 * is introduced, so there is no collision surface and no dependency. `undefined`
 * values and functions are dropped exactly as `JSON.stringify` drops them, which
 * is harmless because a validated tool input never contains either.
 */
export function canonicalJson(value: unknown): string {
	return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortDeep);
	if (value !== null && typeof value === "object") {
		const record = value as Record<string, unknown>;
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(record).sort()) {
			sorted[key] = sortDeep(record[key]);
		}
		return sorted;
	}
	return value;
}
