import { describe, expect, it } from "vitest";
import {
	budgetExhaustion,
	createTurnBudget,
	DEFAULT_TURN_LIMITS,
	resolveTurnLimits,
	type TurnBudget,
	type TurnLimits,
} from "./limits";

/**
 * Type-level proof that `TurnLimits` has no optional property. If a bound were
 * added as optional, `Required<TurnLimits>` would differ from `TurnLimits`,
 * `Equals` would resolve to `false`, and this assignment would fail to compile —
 * the mechanism that stops a new ceiling from silently defaulting to unbounded.
 */
type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const _noOptionalLimit: Equals<TurnLimits, Required<TurnLimits>> = true;
void _noOptionalLimit;

describe("DEFAULT_TURN_LIMITS", () => {
	it("is frozen so a caller cannot widen every turn by mutating the default", () => {
		expect(Object.isFrozen(DEFAULT_TURN_LIMITS)).toBe(true);
	});

	it("keeps its output reservation aligned with the browser adapter's max_tokens", () => {
		expect(DEFAULT_TURN_LIMITS.reserveOutputTokens).toBe(4096);
	});
});

describe("resolveTurnLimits", () => {
	it("returns the defaults when no override is given", () => {
		expect(resolveTurnLimits()).toEqual(DEFAULT_TURN_LIMITS);
	});

	it("applies an override while keeping the rest of the defaults", () => {
		const limits = resolveTurnLimits({ maxIterations: 3 });
		expect(limits.maxIterations).toBe(3);
		expect(limits.maxToolCallsPerTurn).toBe(DEFAULT_TURN_LIMITS.maxToolCallsPerTurn);
	});

	it("freezes the resolved limits", () => {
		expect(Object.isFrozen(resolveTurnLimits({ maxIterations: 3 }))).toBe(true);
	});

	it("rejects a zero ceiling rather than accepting 'never issue a request'", () => {
		expect(() => resolveTurnLimits({ maxIterations: 0 })).toThrow(/maxIterations/);
	});

	it("rejects a negative ceiling", () => {
		expect(() => resolveTurnLimits({ turnDeadlineMs: -1 })).toThrow(/turnDeadlineMs/);
	});

	it("rejects a non-finite ceiling", () => {
		expect(() => resolveTurnLimits({ maxToolCallsPerTurn: Number.POSITIVE_INFINITY })).toThrow();
	});
});

describe("budgetExhaustion", () => {
	const limits = resolveTurnLimits({
		maxIterations: 8,
		maxToolCallsPerTurn: 32,
		maxToolCallsPerIteration: 12,
		maxRetriesPerTurn: 3,
		turnDeadlineMs: 300_000,
		reserveOutputTokens: 4096,
	});

	const freshBudget = (overrides: Partial<TurnBudget> = {}): TurnBudget => ({
		...createTurnBudget(1_000),
		...overrides,
	});

	it("returns null while every bound has headroom", () => {
		expect(budgetExhaustion(freshBudget({ iterationsStarted: 1 }), limits, 2_000)).toBeNull();
	});

	it("reports iterations when the iteration ceiling is reached", () => {
		expect(budgetExhaustion(freshBudget({ iterationsStarted: 8 }), limits, 2_000)).toBe(
			"iterations",
		);
	});

	it("reports tool_calls when the per-turn tool cap is reached", () => {
		expect(
			budgetExhaustion(freshBudget({ iterationsStarted: 1, toolCallsAccepted: 32 }), limits, 2_000),
		).toBe("tool_calls");
	});

	it("reports retries when the retry budget is spent", () => {
		expect(
			budgetExhaustion(freshBudget({ iterationsStarted: 1, retriesUsed: 3 }), limits, 2_000),
		).toBe("retries");
	});

	it("reports deadline once the wall-clock ceiling elapses", () => {
		expect(budgetExhaustion(freshBudget({ iterationsStarted: 1 }), limits, 1_000 + 300_000)).toBe(
			"deadline",
		);
	});

	it("returns the first exhausted bound in priority order when several fire at once", () => {
		// iterations, tool_calls, retries, and deadline are all exhausted; the
		// documented priority makes the user-facing notice deterministic.
		const exhausted = freshBudget({
			iterationsStarted: 8,
			toolCallsAccepted: 32,
			retriesUsed: 3,
		});
		expect(budgetExhaustion(exhausted, limits, 1_000 + 300_000)).toBe("iterations");
	});

	it("falls through to tool_calls when only iterations has headroom", () => {
		const exhausted = freshBudget({
			iterationsStarted: 1,
			toolCallsAccepted: 32,
			retriesUsed: 3,
		});
		expect(budgetExhaustion(exhausted, limits, 1_000 + 300_000)).toBe("tool_calls");
	});

	it("does not read the wall clock itself — the deadline is a pure function of nowMs", () => {
		// The same budget is not-exhausted before the deadline and exhausted after,
		// with no timers involved: nowMs is the only clock the function sees.
		const budget = freshBudget({ iterationsStarted: 1 });
		expect(budgetExhaustion(budget, limits, 1_000 + 299_999)).toBeNull();
		expect(budgetExhaustion(budget, limits, 1_000 + 300_000)).toBe("deadline");
	});
});
