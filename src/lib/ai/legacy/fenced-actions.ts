/**
 * The single, bounded compatibility seam for the fenced ` ```actions ` /
 * ` ```threats ` path.
 *
 * Before native tool calling exists, the model still expresses model edits and
 * threat suggestions as fenced code blocks inside its answer text. This module
 * is the only place that fenced text may be parsed into structured suggestions,
 * so the whole legacy path can be deleted in one move.
 *
 * ## Removal — issue #64
 *
 * When #64 lands native graph tools, it deletes this module and the
 * `tools.length === 0` branch of `buildSystemPrompt` (`src/lib/ai-prompt.ts`)
 * together: flipping {@link LEGACY_FENCED_ACTIONS_ENABLED} to `false` turns the
 * parsing off, and dropping the prompt branch stops the model from emitting the
 * fences at all. Nothing else in the tree parses assistant prose, so those two
 * removals are the complete change.
 *
 * ## Contract
 *
 * These functions consume **only** accumulated `text_delta` output — the
 * assistant message's flattened text, as the chat store builds it from stream
 * events — never a raw provider payload or a tool-call block. A native tool call
 * carries validated input through `ToolDefinition.parseInput`; it never reaches
 * here.
 */

import { type AiAction, extractActions } from "@/lib/ai-actions";
import { extractThreats } from "@/lib/ai-utils";

/**
 * Whether the fenced compatibility path is active. `true` until issue #64
 * replaces fenced blocks with native tool calls, which flips this to `false`
 * (and then deletes this module). The flag exists so the removal is a single,
 * reviewable switch rather than scattered edits.
 */
export const LEGACY_FENCED_ACTIONS_ENABLED = true;

/**
 * Whether fenced parsing should run for a turn that offered `toolCount` tools.
 *
 * A tool-enabled turn (issue #62) reviews mutations through the approval ledger,
 * which binds each grant to a canonical input digest and validates the resulting
 * document before committing. Fenced parsing has neither guard, so an injected
 * assistant message could smuggle a ` ```actions ` block past the ledger into the
 * legacy Apply button. The gate keeps fenced parsing to text-only turns
 * (`toolCount === 0`), matching the branch `buildSystemPrompt` uses to decide
 * whether to emit the fenced instructions at all.
 */
export function legacyFencedEnabledForTurn(toolCount: number): boolean {
	return LEGACY_FENCED_ACTIONS_ENABLED && toolCount === 0;
}

/**
 * Parse fenced ` ```actions ` blocks out of accumulated assistant text.
 *
 * `enabled` defaults to the module flag and exists as an injection seam so a
 * test can drive the removal path (issue #64's `false`) without waiting for the
 * flag to flip — the same default-parameter pattern request preflight uses for
 * its capability resolver. When disabled, the underlying parser is never called.
 */
export function extractLegacyActions(
	assistantText: string,
	enabled: boolean = LEGACY_FENCED_ACTIONS_ENABLED,
): AiAction[] {
	if (!enabled) return [];
	return extractActions(assistantText);
}

/** Parse fenced ` ```threats ` blocks out of accumulated assistant text. */
export function extractLegacyThreats(
	assistantText: string,
	enabled: boolean = LEGACY_FENCED_ACTIONS_ENABLED,
): ReturnType<typeof extractThreats> {
	if (!enabled) return [];
	return extractThreats(assistantText);
}
