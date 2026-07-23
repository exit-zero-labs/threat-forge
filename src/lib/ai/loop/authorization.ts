/**
 * Authorization as pure data plus pure predicates.
 *
 * The security invariant this module exists to guarantee:
 *
 * > No byte sequence originating in model output, in a tool result, or in
 * > document content can cause a tool to execute that the user did not authorize
 * > in this turn, or cause an authorization granted for one call to apply to a
 * > different call, a different input, or a different iteration.
 *
 * A grant is created only by a user command (`grantForCall` / `grantForBatch`) or
 * by the static read-only policy (`autoGrantReadOnly`), and it binds to exactly
 * one call id, one tool name, one canonical input digest, and one iteration.
 * {@link authorizeStart} is the only predicate that lets a call move to `running`,
 * and it re-checks every one of those bindings, so a grant cannot be widened.
 *
 * The proofs live in `./authorization.test.ts` (each violation code) and
 * `./injection.test.ts` (the adversarial corpus).
 */

import type { RegisteredTool } from "./tool-runtime";
import type { CallRecord, TurnState } from "./turn-machine";

/** How an approval was obtained. `auto` is the static read-only policy only. */
export type GrantScope = "call" | "batch" | "auto";

/**
 * A single-use authorization bound to one call.
 *
 * Every field is part of the identity the grant authorizes; {@link authorizeStart}
 * checks all of them, so a grant issued for one call, input, or iteration can
 * never be spent on another.
 */
export interface ApprovalGrant {
	readonly callId: string;
	readonly toolName: string;
	readonly inputDigest: string;
	readonly scope: GrantScope;
	readonly iteration: number;
}

/** Why a call did not run. Only `user_declined` makes an input sticky-denied. */
export type DenialReason = "user_declined" | "turn_cancelled" | "limit_exceeded";

/**
 * A user refusal that sticks for the rest of the turn.
 *
 * Sticky by `(toolName, inputDigest)`: a re-request with identical input is
 * auto-denied without re-prompting, so the model cannot wear the user down, while
 * a re-request with *different* input is a new call that prompts normally, so the
 * model can still correct itself.
 */
export interface DenialRecord {
	readonly toolName: string;
	readonly inputDigest: string;
	readonly reason: DenialReason;
}

/**
 * Every way authorization can refuse. Closed so each surface must handle each
 * case. {@link authorizeStart} returns `no_grant`, `digest_mismatch`,
 * `foreign_iteration`, `grant_already_consumed`, `unknown_tool`, and
 * `denied_replay`; the reducer records `limit_exceeded`, `duplicate_call_id`, and
 * `post_settlement_event` directly. `duplicate_call_id` is required by step 4's
 * reused-id rejection (the issue's eight-code list has no way to record a model
 * that reuses a call id); it is the one member added beyond that list.
 */
export type TurnViolation =
	| "no_grant"
	| "digest_mismatch"
	| "foreign_iteration"
	| "grant_already_consumed"
	| "unknown_tool"
	| "denied_replay"
	| "limit_exceeded"
	| "duplicate_call_id"
	| "post_settlement_event";

export type AuthorizeStartResult =
	| { ok: true; grant: ApprovalGrant }
	| { ok: false; violation: TurnViolation };

/** Grant one call, bound to its current input digest and the current iteration. */
export function grantForCall(call: CallRecord, iteration: number): ApprovalGrant {
	return {
		callId: call.id,
		toolName: call.toolName,
		inputDigest: call.inputDigest,
		scope: "call",
		iteration,
	};
}

/**
 * Grant an explicit list of calls captured when the user clicked "Approve all".
 *
 * The caller resolves the clicked ids to records and excludes destructive calls
 * before calling this; passing pre-resolved records rather than a predicate is
 * what stops a call that arrived *after* the click from being swept into the
 * batch (see `injection.test.ts` case 6).
 */
export function grantForBatch(calls: readonly CallRecord[], iteration: number): ApprovalGrant[] {
	return calls.map((call) => ({
		callId: call.id,
		toolName: call.toolName,
		inputDigest: call.inputDigest,
		scope: "batch",
		iteration,
	}));
}

/** The identity a read-only auto-grant binds to, supplied by the reducer at record creation. */
export interface AutoGrantTarget {
	readonly callId: string;
	readonly inputDigest: string;
}

/**
 * Auto-grant a read-only tool.
 *
 * Refuses any tool whose `effect` is not `read`, and any `destructive` tool
 * unconditionally. It reads only the tool's static classification — never model
 * output, a tool result, or document content — so a mutating approval can never
 * be manufactured through this path. Both refusals throw because reaching them
 * means a caller tried to auto-grant something the policy forbids, which is a
 * programming error, not a runtime condition.
 */
export function autoGrantReadOnly(
	tool: RegisteredTool,
	target: AutoGrantTarget,
	iteration: number,
): ApprovalGrant {
	if (tool.effect !== "read") {
		throw new Error(`autoGrantReadOnly refused mutating tool "${tool.name}".`);
	}
	if (tool.destructive) {
		throw new Error(`autoGrantReadOnly refused destructive tool "${tool.name}".`);
	}
	return {
		callId: target.callId,
		toolName: tool.name,
		inputDigest: target.inputDigest,
		scope: "auto",
		iteration,
	};
}

/** Whether `(toolName, inputDigest)` was already refused by the user this turn. */
export function isDenied(
	denials: readonly DenialRecord[],
	toolName: string,
	inputDigest: string,
): boolean {
	return denials.some((d) => d.toolName === toolName && d.inputDigest === inputDigest);
}

/**
 * Decide whether the call `callId` may move to `running`.
 *
 * The checks run in a fixed order so a refusal reports the most specific reason:
 * an unknown tool, then a sticky denial, then the grant's presence, digest,
 * iteration, and single-use consumption. A refusal records a typed
 * {@link TurnViolation} and never mutates state; only an `ok` result lets the
 * reducer start the call.
 */
export function authorizeStart(state: TurnState, callId: string): AuthorizeStartResult {
	const call = state.calls.find((c) => c.id === callId);
	// A start for a call that does not exist is treated as an ungranted start
	// rather than crashing: the runner only starts calls the reducer created, so
	// this is defensive.
	if (call === undefined) return { ok: false, violation: "no_grant" };

	// The tool must be in the turn's frozen tool set by exact name.
	if (state.toolSet.get(call.toolName) === undefined) {
		return { ok: false, violation: "unknown_tool" };
	}

	// A sticky denial overrides any grant: an input the user refused can never run
	// this turn, even if a stale grant for the same call id somehow exists.
	if (isDenied(state.denials, call.toolName, call.inputDigest)) {
		return { ok: false, violation: "denied_replay" };
	}

	const grant = state.grants.find((g) => g.callId === callId);
	if (grant === undefined) return { ok: false, violation: "no_grant" };
	if (grant.inputDigest !== call.inputDigest) return { ok: false, violation: "digest_mismatch" };
	if (grant.iteration !== state.iteration) return { ok: false, violation: "foreign_iteration" };
	// Single-use: once a call has left `approved` its grant has already been spent.
	if (call.status !== "approved") return { ok: false, violation: "grant_already_consumed" };

	return { ok: true, grant };
}
