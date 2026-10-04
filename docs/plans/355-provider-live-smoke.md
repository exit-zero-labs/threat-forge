# Issue 355 — Opt-in paid provider smoke and handoff

## Issue contract

- **Issue:** https://github.com/exit-zero-labs/threat-forge/issues/355
- **Parent initiative:** https://github.com/exit-zero-labs/threat-forge/issues/348 (native Feature)
- **Type:** Task
- **Effort:** Medium
- **Priority:** Medium
- **Autonomy:** HITL
- **Dependencies:** #354
- **Architecture and constraints:** [Independent provider plan](348-provider-compatibility.md).
- **Non-goals:** Hosted proxy, configurable provider URLs, schema/persistence changes, silent model substitution and deployment.

## Objective and executable steps

- Depends on deterministic implementation and owner authority. Own a focused live-smoke command/runbook and redacted result report. This Task is HITL; real credentials never enter Playwright's instrumented browser because repository E2E guidance explicitly prohibits that.
- Owner supplies fresh credentials through approved environment/secure storage plus an explicit model/request/output-token/spend ceiling. No use of the screenshot key, no scraping browser vaults, no replay of an ambiguous paid POST. Default command does nothing without explicit opt-in. No automatic retries and no automatic model fallback.
- Sequentially test one text response and one two-request function-call continuation for each authorized model using production request builders and decoders, with a harmless pure local test function and synthetic input. Assert requested/returned model, terminal event, parsed tool name/input, result continuity, usage and safe failures; do not assert prose wording or model quality. Record only model IDs, endpoint, status, counts, usage and redacted pass/fail.
- Acceptance: all authorized current models pass actual provider requests or record distinct access/permission/quota gaps. If secrets/spend authority is absent, leave command ready and report live verification unperformed. Desktop owner walkthrough remains a separate observable proof, not inferred from shared mapper tests.

## Verification and review

Run the targeted checks above, then the shared `npm run ci:local` gate once for the coherent change. Use the parent plan's independent PR, slop and security review lanes. Owner intent validation and paid/native execution are distinct from deterministic local proof.

## Replan log

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-10-03 | Initial independent plan | Parent planning lane prepared this step against c00e63b4; owner approved plan-only publication. |
