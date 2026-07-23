/**
 * The only path from a tool's result to the document.
 *
 * `commitToolOutcome` is where AGENTS.md's four-property rule is enforced on a
 * tool's *output*: a mutation is applied only when it validated (`prepare`
 * accepted the input) **and** re-validates as a document (`validateThreatModel`
 * accepts the result), it is transactional (a whole document is swapped in, so
 * there is never a half-applied intermediate), and it is undoable (one lazily
 * pushed snapshot per turn). It refuses in four cases and commits in one, and it
 * never inspects the document's contents — it replaces it wholesale.
 *
 * The commit uses `restoreSnapshot`, not `setModel`, because `setModel` clears
 * every selection field (`model-store-factory.ts`); an applied AI mutation must
 * not deselect whatever the user had selected.
 */

import { buildLayoutFromModel } from "@/lib/model-layout-utils";
import { ThfValidationError, validateThreatModel } from "@/lib/thf-validation";
import { useCanvasStore } from "@/stores/canvas-store";
import { useHistoryStore } from "@/stores/history-store";
import { useModelStore } from "@/stores/model-store";
import type { ThreatModel } from "@/types/threat-model";
import { canonicalJson, type ToolEffect, type ToolOutcome } from "./tool-runtime";

/** Why a commit was refused. Each is fed back to the model as corrective feedback. */
export type CommitRefusal =
	/** The tool itself failed; its own error text is returned. */
	| "tool_error"
	/** A `read` tool returned a document — a fail-closed check on #64-supplied code. */
	| "read_tool_mutated"
	/** The live document drifted from what the call read, so the write is stale. */
	| "document_changed"
	/** The proposed document would fail to reopen; the validator's message is returned. */
	| "invalid_document";

/**
 * What one commit resolved to.
 *
 * `committed` and `unchanged` are both successes the runner reports to the model
 * as `ok`; `refused` is reported as an error so the model can correct itself.
 */
export type CommitOutcome =
	| { status: "committed"; document: ThreatModel; result: string }
	| { status: "unchanged"; result: string }
	| { status: "refused"; refusal: CommitRefusal; result: string };

/**
 * Per-turn undo bookkeeping.
 *
 * One snapshot is pushed per turn, lazily, at the first successful commit. After
 * the push, `undoDepth` records `history.past.length` and `baseline` records the
 * exact document that was pushed, so {@link turnUndoAvailability} can tell an
 * undoable turn from one whose history entry a later edit or the 20-entry trim
 * has superseded.
 */
export interface TurnUndoLedger {
	pushed: boolean;
	undoDepth: number;
	baseline: ThreatModel | null;
}

export function createTurnUndoLedger(): TurnUndoLedger {
	return { pushed: false, undoDepth: 0, baseline: null };
}

/** Whether a call was one this pre-commit path may apply. */
export interface CommitInput {
	/** The document read immediately before the call ran. */
	readonly expected: ThreatModel;
	/** The static effect of the tool that produced the outcome. */
	readonly effect: ToolEffect;
	/** Per-turn undo bookkeeping, mutated in place on the first successful commit. */
	readonly ledger: TurnUndoLedger;
}

/**
 * Apply a tool outcome to the document, or refuse it.
 *
 * The four refusals, in order:
 *
 *  1. the tool failed — nothing to apply;
 *  2. a `read` tool returned a document — refused, nothing applied;
 *  3. the live document changed under the call — refused, nothing applied;
 *  4. the proposed document fails `validateThreatModel` — refused, the validator
 *     message is returned so the model can correct the reference it broke.
 *
 * Otherwise the pre-turn snapshot is pushed (once per turn) and the document is
 * swapped in with selection intact.
 */
export function commitToolOutcome(outcome: ToolOutcome, input: CommitInput): CommitOutcome {
	if (outcome.status === "error") {
		return { status: "refused", refusal: "tool_error", result: outcome.result };
	}
	if (outcome.document === undefined) {
		// An `ok` outcome that changed nothing — a read tool's result, or a mutate
		// tool that found nothing to do. A success, but nothing to commit.
		return { status: "unchanged", result: outcome.result };
	}
	if (input.effect === "read") {
		// A read-only tool must never mutate. This guards a #64 tool that is wrong
		// or compromised, on the tool's declared effect, not on model output.
		return {
			status: "refused",
			refusal: "read_tool_mutated",
			result: "A read-only tool returned a document change, which is not allowed.",
		};
	}
	if (useModelStore.getState().model !== input.expected) {
		// Reference equality is enough: every mutation replaces the model wholesale.
		return {
			status: "refused",
			refusal: "document_changed",
			result:
				"The document changed while this tool was running. Re-read the current model and try again.",
		};
	}
	try {
		validateThreatModel(outcome.document);
	} catch (error) {
		const message =
			error instanceof ThfValidationError
				? error.message
				: "The proposed change would produce a document that cannot be reopened.";
		return { status: "refused", refusal: "invalid_document", result: message };
	}

	pushTurnSnapshotOnce(input);
	useModelStore.getState().restoreSnapshot(outcome.document);
	useCanvasStore.getState().syncFromModel();
	return { status: "committed", document: outcome.document, result: outcome.result };
}

/**
 * Push the turn's single history snapshot, capturing the document as it stood
 * immediately before this first successful commit.
 */
function pushTurnSnapshotOnce(input: CommitInput): void {
	if (input.ledger.pushed) return;
	useHistoryStore.getState().pushSnapshot(input.expected);
	input.ledger.pushed = true;
	input.ledger.undoDepth = useHistoryStore.getState().past.length;
	input.ledger.baseline = input.expected;
}

/** Whether the whole turn can still be undone as one entry. */
export type UndoAvailability = "undoable" | "already_undone" | "superseded";

/**
 * Decide whether the turn's single undo entry is still the one at the top of the
 * history stack.
 *
 * The deep-equality check is what stops the 20-entry trim from making an old
 * turn's index alias a newer entry and undoing the wrong thing.
 */
export function turnUndoAvailability(ledger: TurnUndoLedger): UndoAvailability {
	if (!ledger.pushed || ledger.baseline === null) return "already_undone";
	const past = useHistoryStore.getState().past;
	if (past.length < ledger.undoDepth) return "already_undone";
	if (past.length === ledger.undoDepth) {
		const top = past[past.length - 1];
		if (top !== undefined && canonicalJson(top) === canonicalJson(ledger.baseline)) {
			return "undoable";
		}
		return "superseded";
	}
	return "superseded";
}

/**
 * Undo the whole turn in one step, using the same sequence the keyboard undo path
 * uses. Returns whether an undo was performed. The caller flips the turn's applied
 * calls to `undone` (via the reducer's `undoTurn`) after this resolves.
 */
export function undoTurn(ledger: TurnUndoLedger): boolean {
	if (turnUndoAvailability(ledger) !== "undoable") return false;
	const current = useModelStore.getState().model;
	if (current === null) return false;

	const snapshot = useHistoryStore.getState().undo(current);
	if (snapshot === null) return false;

	const layout = buildLayoutFromModel(snapshot);
	if (layout) useCanvasStore.getState().setPendingLayout(layout);
	useModelStore.getState().restoreSnapshot(snapshot);
	useCanvasStore.getState().syncFromModel();
	return true;
}
