/**
 * AI Action Protocol — parser for AI-suggested model edits.
 *
 * The AI outputs actions in fenced `actions` code blocks as JSON arrays. Each
 * action describes a mutation to apply to the threat model, and every one of
 * them is untrusted input: it is generated text that a prompt-injected document
 * can influence. Validation lives in `src/lib/ai/schemas/actions.ts`, where the
 * accepted shape, the TypeScript type, and the JSON Schema advertised to the
 * model all come from one Zod declaration.
 *
 * Issue #64 replaces this fenced path with native tool calls.
 */

import { type LegacyAction, parseLegacyAction } from "@/lib/ai/schemas/actions";

/** Union of all action payloads. */
export type AiAction = LegacyAction;

/** Supported action types. */
export type AiActionType = AiAction["action"];

export type AddElementPayload = Extract<AiAction, { action: "add_element" }>;
export type UpdateElementPayload = Extract<AiAction, { action: "update_element" }>;
export type DeleteElementPayload = Extract<AiAction, { action: "delete_element" }>;
export type AddDataFlowPayload = Extract<AiAction, { action: "add_data_flow" }>;
export type UpdateDataFlowPayload = Extract<AiAction, { action: "update_data_flow" }>;
export type DeleteDataFlowPayload = Extract<AiAction, { action: "delete_data_flow" }>;
export type AddTrustBoundaryPayload = Extract<AiAction, { action: "add_trust_boundary" }>;
export type UpdateTrustBoundaryPayload = Extract<AiAction, { action: "update_trust_boundary" }>;
export type DeleteTrustBoundaryPayload = Extract<AiAction, { action: "delete_trust_boundary" }>;
export type AddThreatPayload = Extract<AiAction, { action: "add_threat" }>;
export type UpdateThreatPayload = Extract<AiAction, { action: "update_threat" }>;
export type DeleteThreatPayload = Extract<AiAction, { action: "delete_threat" }>;

/** Read one fenced block's JSON. A block whose body is not valid JSON contributes nothing. */
function parseBlockItems(blockBody: string): unknown[] {
	try {
		const parsed: unknown = JSON.parse(blockBody);
		return Array.isArray(parsed) ? parsed : [parsed];
	} catch {
		// A block the model truncated or malformed is skipped; the surrounding
		// response still renders and any other block still applies.
		return [];
	}
}

/**
 * Extract and validate AI actions from a response containing fenced `actions` blocks.
 *
 * An entry that fails validation is dropped rather than repaired: a partially
 * applied action would change the document in a way the user never approved.
 * The drop is currently silent — the user simply sees one fewer suggestion —
 * because there is no channel back to the model until the tool loop in #62.
 */
export function extractActions(text: string): AiAction[] {
	const blockRegex = /```actions\n([\s\S]*?)```/g;
	const actions: AiAction[] = [];

	let match = blockRegex.exec(text);
	while (match) {
		for (const item of parseBlockItems(match[1])) {
			const result = parseLegacyAction(item);
			if (result.ok) actions.push(result.value);
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
