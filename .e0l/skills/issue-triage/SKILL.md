---
name: issue-triage
description: Triage one GitHub issue — read it against the codebase, set every field, rewrite the description, link parent and sub-issues, post a justification comment, and promote Backlog to Ready. Use whenever an issue is filed, when an agent files one itself, or when an existing issue's shaping looks stale and needs re-deriving.
---

# Triage an issue

`Backlog → Ready` is the AI triage gate. Promoting an issue asserts that an agent read it and shaped it, and it is what makes the board safe for anyone to pick from unattended. Treat it as judgement, not form-filling.

## Guardrails

1. **Never invent a criterion to make an issue look shaped.** "This needs a product decision before it can be scoped" is a successful triage. A fabricated acceptance criterion is a trap set for whoever picks it up.
2. **Read the code, not just the title.** A `Ready` issue that was never checked against the repo is worse than a `Backlog` one, because now something claims it was checked.

## Procedure

1. **Read the issue and the surfaces it touches** on current `main`. Ask first whether it should exist at all — a duplicate, or work the product no longer wants, is closed as `Done` + `Reject` with a reason, not promoted.
2. **Decide whether it is one thing.** Compound issues get split; sub-issues you create are triaged as you create them and land directly in `Ready`.
3. **Set every field**: `Type`, `Effort`, `Priority`, `Milestone`, and one of `AUTO` / `HITL`. `Effort` and `Priority` are native org issue fields, invisible to `gh project item-list` — see the reference.
4. **Rewrite the description** to state the problem and acceptance criteria. For `Effort: Low`, write the verification and validation criteria inline — the executor should never invent its own.
5. **Link relationships**: parent, sub-issues, dependencies, anything it duplicates or supersedes.
6. **Post a justification comment** — a few sentences on why this is worth doing, why now, and why the fields are what they are.
7. **Promote to `Ready`**, then read back every field you set.

## Re-triage

Re-derive from scratch rather than rubber-stamping. Say what changed and why — that trail is often worth more than the shaping itself.

Field mechanics and the promotion bar: `reference-triage-bar.md`.
