---
name: implement-issue
description: Orchestrate one settled ThreatForge issue through verification and preflight
argument-hint: "[issue-number]"
---

# Implement issue

1. Read `AGENTS.md`, the issue, parent, dependencies, linked PRs, and live Project 2 metadata.
2. Require a selected `Ready` issue or an explicit user override. Never select a sprint or batch.
3. Enforce the size contract:
   - XS/S: execute the issue body
   - M/L: require `docs/plans/<issue>-<slug>.md`
   - XL: stop and decompose
4. Move the issue to `In progress` before doing anything else, including planning. A claim you
   have not recorded is not a claim, and planning is work another agent can duplicate.
5. If an M/L plan is absent or stale, invoke `issue-planner` and stop after the plan is written.
   Planning and execution must happen in separate passes, and implementation begins only after the
   plan is committed.
6. Invoke `feature-implementer` with the settled issue or committed plan.
7. Add out-of-scope discoveries as linked follow-up work rather than expanding silently.
8. Invoke `anti-slop-review`, then `build-test`.
9. Invoke `pr-preflight` and resolve its must-fix and should-fix findings to convergence.
10. Prepare a handoff with changed behavior, evidence, remaining owner validation, and applicable
    specialist lanes. Stop at verification-complete `In progress`.

Do not commit, push, create a PR, or merge without separate explicit authorization.
