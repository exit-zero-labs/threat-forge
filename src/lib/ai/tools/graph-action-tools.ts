/**
 * The twelve existing fenced actions, adapted to the loop's tool interface.
 *
 * The loop ships with real production tools rather than waiting for issue #64:
 * `LEGACY_ACTION_TOOLS` already carry generated schemas and `applyAction`
 * already executes them, so each becomes a {@link RegisteredTool} whose `run`
 * delegates to the existing pure `applyAction`. No graph mutation is
 * reimplemented here, and no schema is redeclared — the validation, the JSON
 * schema, and the summary text all come from code that already exists.
 *
 * Every one of the twelve is `effect: "mutate"`. The four `delete_*` tools are
 * `destructive: true`, so they are excluded from any batch approval. When #64
 * lands native graph tools it *extends* this registry rather than rewiring the
 * loop.
 */

import type { PreparedCallResult, RegisteredTool, ToolRegistry } from "@/lib/ai/loop/tool-runtime";
import { canonicalJson, createToolRegistry } from "@/lib/ai/loop/tool-runtime";
import { LEGACY_ACTION_TOOLS } from "@/lib/ai/schemas/actions";
import { applyAction } from "@/lib/ai-action-executor";
import { type AiAction, describeAction } from "@/lib/ai-actions";

/** The four actions that destroy information, and so are never batch-approved. */
const DESTRUCTIVE_ACTIONS = new Set<string>([
	"delete_element",
	"delete_data_flow",
	"delete_trust_boundary",
	"delete_threat",
]);

/**
 * A one-line, input-free explanation of why `applyAction` returned `null`, so the
 * model can correct the id it named. This closes the "drop is currently silent"
 * gap the fenced path documents.
 */
function unresolvedMessage(action: AiAction): string {
	if ("id" in action) {
		return `Could not apply "${action.action}": no entity with id "${action.id}" exists in the current model, or the update referenced a missing layer or group.`;
	}
	if (action.action === "add_data_flow") {
		return `Could not add the data flow: one or both endpoints ("${action.data_flow.from}", "${action.data_flow.to}") do not exist in the current model.`;
	}
	return `Could not apply "${action.action}".`;
}

/**
 * Adapt each legacy action tool into an executable tool.
 *
 * `definition` is the union of the twelve legacy `ToolDefinition`s, so
 * `definition.parseInput(raw).value` narrows to `AiAction` — the exact type
 * `applyAction` and `describeAction` accept — with no cast. `run` computes the
 * next document and returns it; it never touches a store, because committing is
 * the loop's job (see `../loop/transaction.ts`).
 */
export const GRAPH_ACTION_TOOLS: readonly RegisteredTool[] = LEGACY_ACTION_TOOLS.map(
	(definition): RegisteredTool => ({
		name: definition.name,
		description: definition.description,
		effect: "mutate",
		destructive: DESTRUCTIVE_ACTIONS.has(definition.name),
		jsonSchema: definition.jsonSchema,
		prepare(raw: unknown): PreparedCallResult {
			const parsed = definition.parseInput(raw);
			if (!parsed.ok) return { ok: false, issues: parsed.issues };

			const action: AiAction = parsed.value;
			return {
				ok: true,
				call: {
					summary: describeAction(action),
					inputDigest: canonicalJson(action),
					run: async (ctx) => {
						const next = applyAction(ctx.document, action);
						if (next === null) return { status: "error", result: unresolvedMessage(action) };
						// State what changed in one line; never echo the model's full input back.
						return { status: "ok", result: describeAction(action), document: next };
					},
				},
			};
		},
	}),
);

/** A frozen registry of the twelve graph action tools, ready to drive a turn. */
export function createGraphToolRegistry(): ToolRegistry {
	return createToolRegistry(GRAPH_ACTION_TOOLS);
}
