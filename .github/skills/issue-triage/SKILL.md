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
   - `Size`: XS/S/M/L/XL
   - exactly one autonomy label: `agent-ready` or `human-blocked`
   - parent, dependencies, and acceptance criteria
   - `Ready` only when executable; otherwise `Backlog`
5. XS/S issues must contain an executable contract. M/L issues must state that a committed plan
   is required. XL issues must be parents and decompose.
6. Persist a concise `## Triage` rationale in the issue or a maintainer comment.
7. Apply one mutation at a time and read the issue/project item back after each mutation.

Never treat reporter urgency as maintainer priority without triage evidence.
