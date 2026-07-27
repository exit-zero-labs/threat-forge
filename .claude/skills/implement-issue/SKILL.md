---
name: implement-issue
description: Orchestrate one settled ThreatForge issue through verification and preflight
argument-hint: "[issue-number]"
---

# Implement issue

1. Read `AGENTS.md`, the issue, parent, dependencies, linked PRs, and live Project 2 metadata.
2. Require a selected `Ready` issue, an `In progress` issue you are continuing, or an explicit
   user override. Never select a sprint or batch.
3. Establish what the effort contract requires before anything can be implemented:
   - `Low`: nothing; the issue body is the specification
   - `Medium`: a committed `docs/plans/<issue>-<slug>.md`
   - `High`: that plan, and the sub-issues it decomposes into — those are what get implemented,
     never the parent

   Treat anything touching cryptography, the IPC boundary, the `.thf` schema, or a trust
   boundary as `High` whatever the field says, and say so rather than proceeding quietly.
4. Move the issue to `In progress` before doing anything else, including planning. A claim you
   have not recorded is not a claim, and planning is work another agent can duplicate.
5. If a required plan is absent or stale, invoke `issue-planner`, then stop. Planning and
   execution happen in separate passes, so this run ends when the plan is committed; a later run
   picks the issue up from `In progress`.
6. For a `High` issue with a committed plan, reconcile the sub-issues that plan names against
   what is already linked to the parent: shape any that exist but are not executable, file the
   rest shaped and linked, then stop. Every child must be selectable on its own, or a later run
   will reject it. The planner writes them down and cannot file them; if you do not, nobody
   does.
7. Invoke `feature-implementer` with the settled issue or committed plan. A `High` parent never
   reaches this step; its sub-issues do.
8. Add out-of-scope discoveries as linked follow-up work rather than expanding silently.
9. Invoke `anti-slop-review`, then `build-test`.
10. Invoke `pr-preflight` and resolve its must-fix and should-fix findings to convergence.
11. Prepare a handoff with changed behavior, evidence, remaining owner validation, and applicable
    specialist lanes. Stop at verification-complete `In progress`.

Do not commit, push, create a PR, or merge without separate explicit authorization.
