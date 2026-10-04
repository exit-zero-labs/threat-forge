# Issue 349 — Native continuation receipts and invalidation

## Issue contract

- **Issue:** https://github.com/exit-zero-labs/threat-forge/issues/349
- **Parent initiative:** https://github.com/exit-zero-labs/threat-forge/issues/348 (native Feature)
- **Type:** Task
- **Effort:** High
- **Priority:** High
- **Autonomy:** AUTO
- **Dependencies:** None
- **Architecture and constraints:** [Independent provider plan](348-provider-compatibility.md).
- **Non-goals:** Hosted proxy, configurable provider URLs, schema/persistence changes, silent model substitution and deployment.

## Objective and executable steps

- Own `src/lib/ai/protocol/{messages,events,budget,client}.ts`, associated tests, `src/lib/ai/loop/turn-machine.ts`, runner tests, and `src/stores/ai-turn-store.test.ts`; add a narrowly scoped provider receipt module only if it owns the two existing consumers.
- Add receipt attachment without changing text flattening or existing chat persistence. Record actual prepared-prefix provenance, maintain exact current-turn receipt ownership, strip stale prior-turn replay data in an outgoing projection, and refuse current-turn prefix invalidation.
- Acceptance: signed material survives two tool iterations; document prompt changes do not resend stale signed history; budgeting never pairs a tool result with missing call/reasoning; provider/model/session switching never sends incompatible continuation; late callbacks cannot attach to another chat; reload retains readable old text.
- Targeted check: named protocol/message/budget/client/runner/store Vitest files. Owner validation: switch chats/documents, edit the document between turns, Stop, then submit a follow-up.

## Verification and review

Run the targeted checks above, then the shared `npm run ci:local` gate once for the coherent change. Use the parent plan's independent PR, slop and security review lanes. Owner intent validation and paid/native execution are distinct from deterministic local proof.

## Replan log

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-10-03 | Initial independent plan | Parent planning lane prepared this step against c00e63b4; owner approved plan-only publication. |
