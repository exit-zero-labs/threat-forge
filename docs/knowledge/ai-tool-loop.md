# The bounded AI tool loop

One cancellable, explicitly bounded state machine drives a multi-turn tool
conversation. It consumes the `StreamEvent` union from the protocol layer (see
[`ai-protocol.md`](ai-protocol.md)), presents every model-requested mutation for
review, executes only what the user authorized, returns structured results so the
model can correct itself, and leaves the document in a consistent, single-undo
state whether the turn completes, fails, is cancelled, or hits its ceiling.

The core security property:

> No byte sequence originating in model output, in a tool result, or in document
> content can cause a tool to execute that the user did not authorize in this
> turn, or cause an authorization granted for one call to apply to a different
> call, a different input, or a different iteration.

Implementation: `src/lib/ai/loop/`. Adversarial proof: `injection.test.ts`.

## The turn is a pure reducer

`reduceTurn(state, input)` (`turn-machine.ts`) is total, pure, and the only writer
of call status and phase. It performs no I/O, holds no timers, and touches no
store. The runner (`turn-runner.ts`) performs effects by reading the state the
reducer produced; it can never execute a call the reducer refused to move to
`running`. Every security property is therefore provable with synchronous array
inputs and no mocks.

Authorization state — grants and denials — lives inside `TurnState`, not beside
it. No code path outside a user command can produce a grant.

## Phases

| Phase | Meaning | Stop control |
|-------|---------|--------------|
| `idle` | no turn in flight | send enabled |
| `requesting` | a provider request is open, no `message_start` yet; the only phase in which a retry is legal | Stop |
| `streaming` | between `message_start` and a terminal event | Stop |
| `awaiting_approval` | the stream closed with `tool_use` and at least one call is `pending` | Stop |
| `executing` | at least one call is `approved` or `running` | Stop |
| `settled` | terminal, carrying `outcome: completed \| cancelled \| bounded \| failed` | send re-enabled |

The reducer accepts protocol `StreamEvent`s and a small set of commands: `submit`,
`approveCall`, `approveBatch`, `denyCall`, `startCall`, `callSettled`, `advance`,
`retry`, `cancel`, and `undoTurn`. Commands the runner issues (`startCall`,
`callSettled`, `advance`, `retry`) carry the clock as `nowMs`, so the reducer
never reads `Date.now()`. `advance` is the runner's per-iteration progression
signal: when an iteration's calls are all terminal, it answers them with
`tool_result` blocks and either starts the next iteration or settles `bounded`.

A settled turn is terminal. The one exception is `undoTurn`, which flips the
turn's applied calls to `undone`; every other late input is dropped and recorded
as a `post_settlement_event` violation, so a provider quirk or an injected late
frame cannot revive it.

## Call statuses

| Status | Scope | Meaning |
|--------|-------|---------|
| `pending` | per-call | awaiting review; shows **Approve** / **Deny** |
| `approved` | per-call, per-batch, or per-session (static read-only policy) | queued for execution under a grant |
| `running` | per-call | the tool is executing |
| `succeeded` | per-call | executed and committed; contributes a `tool_result` |
| `failed` | per-call | the tool or the commit failed; the structured failure is returned so the model may retry |
| `undone` | **per-turn** | every succeeded call flips together, because the turn is one undo entry |
| `denied` | per-call (`user_declined`) or per-turn (`turn_cancelled`, `limit_exceeded`) | never executed and can never execute later this turn |

`denied` is a deliberate seventh status. A user refusal must not render as an
execution error, and must not invite the model to retry, so it is not folded into
`failed`.

Every call the assistant message opened — including `denied`, unknown-tool, and
never-run calls — is answered with a synthesized `tool_result` before the turn's
messages are written. Without this the next request is rejected by both providers.

## Authorization

A grant (`authorization.ts`) is bound to one call id, one tool name, one canonical
input digest, and one iteration, and is single-use. Grants come from exactly three
constructors: `grantForCall`, `grantForBatch` (an explicit id list captured when
the user clicked, never a predicate), and `autoGrantReadOnly` (the static
read-only policy, which refuses any `mutate` or `destructive` tool).

`authorizeStart(state, callId)` is the only predicate that lets a call reach
`running`. It re-checks the tool, denial stickiness, the grant's presence, its
digest, its iteration, and its single-use consumption. Its refusals, and the
reducer's own refusals, are one closed union:

| Violation | Meaning |
|-----------|---------|
| `no_grant` | no grant for this call |
| `digest_mismatch` | the grant's input digest no longer matches the call |
| `foreign_iteration` | the grant was issued in a different iteration |
| `grant_already_consumed` | the grant was already spent |
| `unknown_tool` | the tool is not in the turn's frozen tool set |
| `denied_replay` | the user already declined an identical `(tool, input)` this turn |
| `limit_exceeded` | a tool-call cap was reached; the call was never prepared |
| `duplicate_call_id` | the model reused a call id |
| `post_settlement_event` | an input arrived after the turn settled |

Denials are sticky by `(toolName, inputDigest)`: a re-request with identical input
is auto-denied without re-prompting, while a re-request with different input is a
new call that prompts normally. Destructive tools are never covered by a batch
approval, and read-only auto-approval is keyed exclusively to a static local
registry field, proven unreachable for `mutate` and `destructive` tools.

## Bounds

Every ceiling is one field of a frozen `TurnLimits` (`limits.ts`) and is enforced
in exactly one function, `budgetExhaustion`, which returns the first exhausted
bound in a fixed priority order (`iterations` → `tool_calls` → `retries` →
`deadline`).

| Bound | Default | Reason |
|-------|---------|--------|
| `maxIterations` | 8 | worst-case provider requests one user message may cost |
| `maxToolCallsPerTurn` | 32 | total tool calls across the turn |
| `maxToolCallsPerIteration` | 12 | reviewable in one set of cards |
| `maxRetriesPerTurn` | 3 | turn-wide retry budget on top of the transport's per-request retry |
| `turnDeadlineMs` | 300000 | wall-clock ceiling so a stalled turn ends |
| `reserveOutputTokens` | 4096 | output tokens history budgeting reserves |

When a bound is hit the turn settles `bounded` with an informational notice —
never an error banner — and keeps whatever was committed.

## Transaction and undo

`commitToolOutcome` (`transaction.ts`) is the only path from a tool result to the
document. It refuses in four cases and commits in one:

1. the tool failed — nothing committed;
2. a `read` tool returned a document — refused `read_tool_mutated`;
3. the live document changed under the call — refused `document_changed`;
4. the proposed document fails `validateThreatModel` — refused `invalid_document`,
   returning the validator's message so the model can fix the reference it broke;
5. otherwise the pre-turn snapshot is pushed **once per turn** and the document is
   swapped in with `restoreSnapshot` (not `setModel`, so selection survives).

A tool returns a whole next document, so atomicity is structural: there is no
half-applied intermediate, cancelling mid-call discards a value rather than
undoing writes, and a failing tool commits nothing because it returned nothing.

`undoTurn` reverts the whole turn in one step, and `turnUndoAvailability` reports
`undoable` only while the turn's snapshot is still the top of the history stack
(a deep-equality check defeats the 20-entry trim aliasing an old index to a newer
entry). See ADR-011.

## The `#64` boundary

`#64` supplies tools; the loop supplies the machine. A tool is declared with
`defineExecutableTool` and exposed to the loop as an erased `RegisteredTool`
(`tool-runtime.ts`):

- `effect: "read" | "mutate"` and `destructive: boolean` are **static, local,
  model-independent** declarations — the only inputs to auto-approval policy.
- `prepare(raw)` is the only way to obtain a runnable `PreparedCall`; it closes
  over the tool's typed input, so an unvalidated input is unrepresentable at the
  execution boundary. `PreparedCall` carries a plain-text `summary` (rendered as
  text, never Markdown), a canonical `inputDigest`, and `run(ctx)`.
- `run(ctx)` receives the current document and the turn's abort signal and returns
  a `ToolOutcome`: an `ok` result optionally carrying a whole next document, or an
  `error` result returned to the model verbatim.

`createToolRegistry` freezes the tool list and resolves names by exact string
match — no trimming, case folding, or normalization. `#64` extends this registry;
it does not rewire the loop. The twelve shipped tools
(`src/lib/ai/tools/graph-action-tools.ts`) adapt the existing fenced actions: each
delegates `run` to the pure `applyAction`, all are `mutate`, and the four
`delete_*` tools are `destructive`.
