/**
 * The turn runner: the effect layer that drives the pure reducer.
 *
 * It performs exactly four kinds of effect and holds no policy:
 *
 *  1. issue a provider request (per iteration, so budgeting re-runs as history grows);
 *  2. dispatch stream events into the reducer;
 *  3. execute the calls the reducer moved to `running`;
 *  4. commit each outcome through the transaction module.
 *
 * It cannot execute a call the reducer refused: it only *asks* to start a call
 * (`startCall`), runs it when the reducer answered `running`, and discards an
 * in-flight outcome if the turn was cancelled while it ran — which is complete,
 * because tools return documents rather than mutating, so there is nothing to
 * roll back.
 *
 * `drive()` runs the turn to its next rest point (an approval pause or
 * settlement); a user command resumes it.
 */

import type { ConversationRequest } from "@/lib/ai/protocol/client";
import type { ProtocolError } from "@/lib/ai/protocol/errors";
import type { StreamEvent } from "@/lib/ai/protocol/events";
import type { AiProvider, ProtocolMessage } from "@/lib/ai/protocol/messages";
import type { ThreatModel } from "@/types/threat-model";
import { budgetExhaustion, type TurnLimits } from "./limits";
import type { ToolOutcome, ToolRegistry } from "./tool-runtime";
import {
	type CommitInput,
	type CommitOutcome,
	createTurnUndoLedger,
	commitToolOutcome as defaultCommit,
	undoTurn as defaultUndoTurn,
	type TurnUndoLedger,
} from "./transaction";
import {
	createIdleTurnState,
	reduceTurn,
	runnableCalls,
	type TurnInput,
	type TurnState,
} from "./turn-machine";

/** Everything a single turn needs that does not change across its iterations. */
export interface TurnConfig {
	text: string;
	baseMessages: readonly ProtocolMessage[];
	provider: AiProvider;
	modelId: string;
	system: string;
	/** The frozen tool set; empty runs a text-only (fenced) turn. */
	toolSet: ToolRegistry;
	limits: TurnLimits;
	maxOutputTokens: number;
}

/** The effectful collaborators, all injectable so the runner is testable without a network. */
export interface TurnRunnerDeps {
	/** Open a provider stream, dispatching each event, resolving at the terminal event. */
	stream: (
		request: ConversationRequest,
		onEvent: (event: StreamEvent) => void,
		signal: AbortSignal,
	) => Promise<void>;
	/** Read the live document immediately before a call runs. */
	getDocument: () => ThreatModel | null;
	/** Defaults to the real transaction commit. */
	commit?: (outcome: ToolOutcome, input: CommitInput) => CommitOutcome;
	/** Defaults to the real single-entry undo. */
	undo?: (ledger: TurnUndoLedger) => boolean;
	/** Defaults to `Date.now`. */
	now?: () => number;
	/** Notified after every state change so a store can mirror it. */
	onState?: (state: TurnState) => void;
}

/** Only these codes are worth a turn-level retry; they mirror the transport's transient split. */
function isTurnRetriable(code: ProtocolError["code"]): boolean {
	return code === "rate_limited" || code === "transport";
}

export interface TurnRunner {
	getState(): TurnState;
	/** Each command returns the drive promise, which resolves at the next approval pause or settlement. */
	submit(config: TurnConfig): Promise<void>;
	approveCall(id: string): Promise<void>;
	approveBatch(ids: readonly string[]): Promise<void>;
	denyCall(id: string): Promise<void>;
	cancel(): void;
	undo(): void;
}

/** Create a runner bound to one live turn. */
export function createTurnRunner(deps: TurnRunnerDeps): TurnRunner {
	const commit = deps.commit ?? defaultCommit;
	const undoTurn = deps.undo ?? defaultUndoTurn;
	const now = deps.now ?? (() => Date.now());

	let state = createIdleTurnState();
	let config: TurnConfig | null = null;
	let controller: AbortController | null = null;
	let ledger = createTurnUndoLedger();
	let driving = false;

	function setState(next: TurnState): void {
		state = next;
		deps.onState?.(state);
	}

	function dispatch(input: TurnInput): void {
		setState(reduceTurn(state, input));
	}

	function signal(): AbortSignal {
		// A controller always exists once a turn has started; the fallback keeps the
		// type honest for the idle window before `submit`.
		return controller?.signal ?? AbortSignal.abort();
	}

	function buildRequest(cfg: TurnConfig): ConversationRequest {
		return {
			provider: cfg.provider,
			modelId: cfg.modelId,
			system: cfg.system,
			// The full turn history; `streamConversation` budgets it every iteration.
			messages: state.messages,
			tools: cfg.toolSet.list(),
			maxOutputTokens: cfg.maxOutputTokens,
		};
	}

	/** Drive the turn to its next rest point: an approval pause or settlement. */
	async function drive(): Promise<void> {
		if (driving) return;
		driving = true;
		try {
			for (;;) {
				if (state.phase === "requesting") {
					await runStream();
					continue;
				}
				if (state.phase === "executing") {
					if (runnableCalls(state).length > 0) {
						await runExecution();
					} else {
						// Nothing left to run this iteration; progress the loop with the clock.
						dispatch({ type: "advance", nowMs: now() });
					}
					continue;
				}
				return; // awaiting_approval, settled, idle, or streaming (transient)
			}
		} finally {
			driving = false;
		}
	}

	/** Open one provider request, holding a transient pre-content failure for a bounded retry. */
	async function runStream(): Promise<void> {
		if (config === null) return;
		for (;;) {
			let producedContent = false;
			let heldError: ProtocolError | undefined;

			await deps.stream(
				buildRequest(config),
				(event) => {
					if (event.type === "error" && !producedContent && isTurnRetriable(event.error.code)) {
						// Hold a transient failure that arrived before any output, so a replay
						// cannot duplicate content the consumer already saw.
						heldError = event.error;
						return;
					}
					if (event.type !== "aborted" && event.type !== "error") producedContent = true;
					dispatch(event);
				},
				signal(),
			);

			if (heldError === undefined) return;
			if (signal().aborted) {
				dispatch({ type: "cancel" });
				return;
			}
			// Retry only while the turn budget allows; otherwise surface the failure.
			if (budgetExhaustion(state.budget, config.limits, now()) !== null) {
				dispatch({ type: "error", error: heldError });
				return;
			}
			dispatch({ type: "retry" });
		}
	}

	/** Execute every approved call of the current iteration, committing each outcome. */
	async function runExecution(): Promise<void> {
		for (const call of runnableCalls(state)) {
			if (signal().aborted) return;

			dispatch({ type: "startCall", callId: call.id });
			// Proceed only if the reducer authorized the start.
			if (state.calls.find((c) => c.id === call.id)?.status !== "running") continue;

			const prepared = call.prepared;
			const document = deps.getDocument();
			if (prepared === null || document === null) {
				dispatch({
					type: "callSettled",
					callId: call.id,
					outcome: { status: "error", result: "No document is open to apply this change to." },
				});
				continue;
			}

			let outcome: ToolOutcome;
			try {
				outcome = await prepared.run({ document, signal: signal() });
			} catch {
				outcome = { status: "error", result: "The tool failed while running." };
			}

			// A stop that fired while the call ran discards the outcome — nothing was
			// committed, so there is nothing to roll back.
			if (signal().aborted) return;

			const committed = commit(outcome, { expected: document, effect: call.effect, ledger });
			const settled: ToolOutcome =
				committed.status === "refused"
					? { status: "error", result: committed.result }
					: { status: "ok", result: committed.result };
			dispatch({ type: "callSettled", callId: call.id, outcome: settled });
		}
	}

	return {
		getState: () => state,

		submit(cfg) {
			if (state.phase !== "idle" && state.phase !== "settled") return Promise.resolve();
			config = cfg;
			ledger = createTurnUndoLedger();
			controller = new AbortController();
			dispatch({
				type: "submit",
				text: cfg.text,
				baseMessages: cfg.baseMessages,
				toolSet: cfg.toolSet,
				limits: cfg.limits,
				nowMs: now(),
			});
			return drive();
		},

		approveCall(id) {
			dispatch({ type: "approveCall", callId: id });
			return drive();
		},

		approveBatch(ids) {
			dispatch({ type: "approveBatch", callIds: ids });
			return drive();
		},

		denyCall(id) {
			dispatch({ type: "denyCall", callId: id });
			return drive();
		},

		cancel() {
			// Abort first so an in-flight tool run discards its outcome, then settle.
			controller?.abort();
			dispatch({ type: "cancel" });
		},

		undo() {
			if (state.phase !== "settled") return;
			if (undoTurn(ledger)) dispatch({ type: "undoTurn" });
		},
	};
}
