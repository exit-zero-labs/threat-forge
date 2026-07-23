/**
 * The turn's bounds, in one frozen object, enforced in one function.
 *
 * Every ceiling the acceptance criteria name is a field of {@link TurnLimits} and
 * every ceiling is enforced by {@link budgetExhaustion} alone, so "the loop is
 * bounded" is provable by reading one function rather than auditing scattered
 * comparisons. `TurnLimits` has no optional field: a future bound cannot be added
 * without updating every construction site, which is what stops a new ceiling
 * from silently defaulting to "unbounded".
 */

/**
 * The bounds one turn runs under. All fields are required and positive.
 *
 * A bound cannot be added as optional, so the compiler forces every caller that
 * builds limits to acknowledge it — the mechanism that keeps "bounded" honest as
 * the loop grows.
 */
export interface TurnLimits {
	/** Hardest ceiling: provider requests one user message may cost. */
	readonly maxIterations: number;
	/** Tool calls executed across the whole turn, summed over iterations. */
	readonly maxToolCallsPerTurn: number;
	/** Tool calls one assistant message may open before the excess is refused. */
	readonly maxToolCallsPerIteration: number;
	/** Turn-wide retries, on top of the transport's per-request retry. */
	readonly maxRetriesPerTurn: number;
	/**
	 * Wall-clock ceiling on cumulative turn time, checked at each iteration
	 * boundary — so a turn that keeps iterating past it stops. A mid-stream stall
	 * inside one request is bounded instead by the transport's read-gap timeout
	 * (`browser-chat-adapter.ts` / the desktop relay), not by this field.
	 */
	readonly turnDeadlineMs: number;
	/** Output tokens reserved from the model's window when budgeting history. */
	readonly reserveOutputTokens: number;
}

/**
 * The production ceilings. Each number carries the reasoning for its value, not a
 * restatement of the field name.
 *
 * Frozen so a caller cannot mutate the shared default and widen every turn.
 */
export const DEFAULT_TURN_LIMITS: TurnLimits = Object.freeze({
	// Eight provider requests is the worst case a single user message can cost a
	// BYOK user; past that a turn is looping rather than converging.
	maxIterations: 8,
	// maxIterations times a typical few calls; a whole turn that asks for more
	// than this is not editing a diagram, it is churning.
	maxToolCallsPerTurn: 32,
	// One assistant message asking for more than a dozen edits at once is past
	// what a user can review in one set of approval cards.
	maxToolCallsPerIteration: 12,
	// One turn-wide retry budget on top of the transport's per-request retry, so
	// an eight-iteration turn cannot multiply into eight retry storms.
	maxRetriesPerTurn: 3,
	// Five minutes of cumulative turn time, evaluated at each iteration boundary:
	// long enough for a slow multi-iteration turn, short enough that a turn cannot
	// keep iterating indefinitely. Mid-request stalls are the transport's timeout.
	turnDeadlineMs: 300_000,
	// Matches the `max_tokens: 4096` the browser adapter already sends, so history
	// budgeting reserves exactly what the answer may consume.
	reserveOutputTokens: 4096,
});

/**
 * Build a limits object, rejecting any non-positive value.
 *
 * A zero or negative ceiling is refused rather than accepted: `maxIterations: 0`
 * would mean "never issue a request", which is indistinguishable from a hung turn
 * and is never what a caller intends.
 */
export function resolveTurnLimits(overrides?: Partial<TurnLimits>): TurnLimits {
	const merged: TurnLimits = { ...DEFAULT_TURN_LIMITS, ...overrides };
	for (const [key, value] of Object.entries(merged)) {
		if (!Number.isFinite(value) || value <= 0) {
			throw new Error(`Turn limit "${key}" must be a positive number, received ${value}.`);
		}
	}
	return Object.freeze(merged);
}

/**
 * What one turn has consumed so far. The reducer owns every field; the runner
 * only reads them.
 */
export interface TurnBudget {
	/** Provider requests started, including the first. */
	iterationsStarted: number;
	/** Tool calls that passed validation and were counted against the turn cap. */
	toolCallsAccepted: number;
	/** Turn-wide retries spent re-issuing a request after a retriable failure. */
	retriesUsed: number;
	/** `nowMs` captured when the turn began, for the deadline check. */
	startedAtMs: number;
}

/** Which bound a turn hit, or `null` when it may continue. */
export type BudgetExhaustion = "iterations" | "tool_calls" | "retries" | "deadline";

/** A fresh budget for a turn that begins at `startedAtMs`. */
export function createTurnBudget(startedAtMs: number): TurnBudget {
	return { iterationsStarted: 0, toolCallsAccepted: 0, retriesUsed: 0, startedAtMs };
}

/**
 * The single place a turn's ceiling is enforced.
 *
 * Returns the **first** exhausted bound in a fixed priority order —
 * `iterations` then `tool_calls` then `retries` then `deadline` — so that when
 * several are exhausted at once the user-facing notice is deterministic. `nowMs`
 * is a parameter rather than a `Date.now()` call, so the deadline is testable
 * without fake timers.
 */
export function budgetExhaustion(
	budget: TurnBudget,
	limits: TurnLimits,
	nowMs: number,
): BudgetExhaustion | null {
	if (budget.iterationsStarted >= limits.maxIterations) return "iterations";
	if (budget.toolCallsAccepted >= limits.maxToolCallsPerTurn) return "tool_calls";
	if (budget.retriesUsed >= limits.maxRetriesPerTurn) return "retries";
	if (nowMs - budget.startedAtMs >= limits.turnDeadlineMs) return "deadline";
	return null;
}
