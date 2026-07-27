---
name: issue-triage
description: Shape one ThreatForge issue and populate Project 2 metadata without coding
argument-hint: "[issue-number]"
---

# Issue triage

Triage one issue. Do not plan `Medium` or `High` work, and do not edit production code.

1. Read `AGENTS.md`, the full issue/comments, related issues/PRs, roadmap context, and relevant
   repository evidence.
2. If the report is a vulnerability, stop public discussion and follow `SECURITY.md`.
3. Discover the live IDs before writing. `Status` is a project field, so `gh project field-list`
   finds it. `Priority`, `Effort`, and `Type` are **native org issue fields and do not appear
   there at all** — enumerate them from `organization.issueFields` and `organization.issueTypes`
   on the GraphQL API, and write them with `setIssueFieldValue` / `updateIssueIssueType`. Reading
   them through the project API returns nothing and raises no error, which reads as "unset" on a
   board that is fully populated.
4. Decide and explain:
   - native issue type: `Task`, `Bug`, or `Feature`
   - relevant domain labels
   - `Priority`: `Urgent`/`High`/`Medium`/`Low`, answering how soon *within* the milestone.
     `Urgent` and `High` require a comment naming what specifically goes wrong if this waits.
   - `Effort`: the reasoning class the work needs, not how long it takes — `High`/`Medium`/`Low`
     with the matching `model/opus|sonnet|haiku` label. It is a floor: cryptography, the IPC
     boundary, the `.thf` schema, and trust boundaries are `High` however small the diff looks.
   - exactly one autonomy label: `AUTO` or `HITL`
   - parent, dependencies, and acceptance criteria
   - `Ready` only when executable; otherwise `Backlog`
5. Low issues must contain an executable contract and must not need research — if one would, it
   is Medium. Medium issues must state that a committed plan is required. High issues must be
   parents and decompose.
6. Persist a concise `## Triage` rationale in the issue or a maintainer comment.
7. Apply one mutation at a time and read the issue/project item back after each mutation.

Never treat reporter urgency as maintainer priority without triage evidence.
