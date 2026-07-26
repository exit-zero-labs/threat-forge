---
name: issue-triage
description: Shape one ThreatForge issue and populate Project 2 metadata without coding
argument-hint: "[issue-number]"
---

# Issue triage

Triage one issue. Do not plan M/L work or edit production code.

1. Read `AGENTS.md`, the full issue/comments, related issues/PRs, roadmap context, and relevant
   repository evidence.
2. If the report is a vulnerability, stop public discussion and follow `SECURITY.md`.
3. Discover current Project 2 field and option IDs with `gh project field-list`; never rely on
   saved IDs.
4. Decide and explain:
   - native issue type: `Task`, `Bug`, or `Feature`
   - relevant domain labels
   - `Priority`: P0/P1/P2
   - `Effort`: High/Medium/Low, with the matching `model/opus|sonnet|haiku` label
   - exactly one autonomy label: `AUTO` or `HITL`
   - parent, dependencies, and acceptance criteria
   - `Ready` only when executable; otherwise `Backlog`
5. Low issues must contain an executable contract and must not need research — if one would, it
   is Medium. Medium issues must state that a committed plan is required. High issues must be
   parents and decompose.
6. Persist a concise `## Triage` rationale in the issue or a maintainer comment.
7. Apply one mutation at a time and read the issue/project item back after each mutation.

Never treat reporter urgency as maintainer priority without triage evidence.
