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
4. If an M/L plan is absent or stale, invoke `issue-planner` and stop after the plan is written.
   Planning and execution must happen in separate passes, and implementation begins only after the
   plan is committed.
5. Move active work to `In progress`, then invoke `feature-implementer` with the settled issue or
   committed plan.
6. Add out-of-scope discoveries as linked follow-up work rather than expanding silently.
7. Invoke `anti-slop-review`, then `build-test`.
8. Invoke `pr-preflight` and resolve its must-fix and should-fix findings to convergence.
9. Prepare a handoff with changed behavior, evidence, remaining owner validation, and applicable
   specialist lanes. Stop at verification-complete `In review`.

Do not commit, push, create a PR, or merge without separate explicit authorization.
