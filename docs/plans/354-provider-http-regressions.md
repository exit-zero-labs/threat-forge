# Issue 354 — Request-validating real HTTP and browser regressions

## Issue contract

- **Issue:** https://github.com/exit-zero-labs/threat-forge/issues/354
- **Parent initiative:** https://github.com/exit-zero-labs/threat-forge/issues/348 (native Feature)
- **Type:** Task
- **Effort:** Medium
- **Priority:** Medium
- **Autonomy:** AUTO
- **Dependencies:** #349, #350, #351, #352, #353
- **Architecture and constraints:** [Independent provider plan](348-provider-compatibility.md).
- **Non-goals:** Hosted proxy, configurable provider URLs, schema/persistence changes, silent model substitution and deployment.

## Objective and executable steps

- Depends on 1–5. Own new narrowly scoped AI HTTP tests, provider contract fixtures, Rust relay integration tests, AI E2E specs/helpers, scenario catalog and its runbook entry. Do not add a framework or new hosted dependency.
- Run disposable loopback HTTP servers in tests with fake keys. Browser transport uses real fetch, stream reader and byte framing; a test-only interception forwards the asserted official URL to loopback, never making production endpoints configurable. Rust uses a private test seam around the same relay request/stream logic, guarded from production. Servers close in finally/teardown and no detached process remains.
- Server expectations independently reject illegal model/body combinations before returning SSE. Include the observed Chat-tools + absent/medium-reasoning 400 as a negative request validator case and reject migrated requests with Chat field names, stored remote-state fields, strict-default drift, invalid call pairing, or missing signed continuation. The corrected production builder must pass that validator; a permissive canned responder is insufficient.
- HTTP matrix: streamed text; two requests with a tool result; multiple/interleaved tools; UTF-8/JSON split across chunks; empty thinking with signature; delayed signature fragments; HTTP400/401/403/404/413/429/500/503; malformed/truncated frames; closed/absent response body; pre-first-event transient retry; post-output failure without retry; redirect to a trap server receiving zero credentials; abort before/during stream and while awaiting approval; oversized error/stream bounds. Use counted requests and fake clocks where possible, no synthetic load or machine-speed thresholds.
- Browser UI cases cover both providers with fake keys: greeting with tools advertised, approval, denial, cancellation, Undo, request 2 exact continuation, chat/document switching, stale model selection, and safe errors. Reuse shared fixtures, semantic selectors, evidence manifest, and named agent scenario runner. Browser HTTP integration is local wire evidence; it does not prove provider access or a native Tauri launch.
- Acceptance: negative validator rejects the old request, corrected builder succeeds over actual HTTP, second-request assertions check material continuity, redirects deliver no headers to the trap, tests leave no servers. Tests fail if reasoning receipt replay, strict:false, or fixed endpoint is removed; demonstrate by a bounded isolated mutation-check lane against a clean known revision when permitted, never simultaneous lanes mutating a tree.

## Verification and review

Run the targeted checks above, then the shared `npm run ci:local` gate once for the coherent change. Use the parent plan's independent PR, slop and security review lanes. Owner intent validation and paid/native execution are distinct from deterministic local proof.

## Replan log

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-10-03 | Initial independent plan | Parent planning lane prepared this step against c00e63b4; owner approved plan-only publication. |
