---
name: pr-cycle
description: Coordinate an explicitly authorized ThreatForge PR lifecycle through owner validation
argument-hint: "[issue-or-pr]"
---

# PR cycle

This skill performs GitHub side effects only when the user explicitly authorizes each requested
class: commit, push, PR creation, approval, merge, or release.

1. Confirm the issue/plan contract and current authorization.
2. Complete implementation verification and `anti-slop-review`.
3. Run `pr-preflight` to convergence.
4. If authorized, create a Conventional Commit linked to the issue.
5. If authorized, push and create/update a draft PR with the repository template.
6. Wait for required CI; repair failures without bypassing checks.
7. Move to `In review` when verification and preflight are complete.
8. Present owner validation steps and unresolved decisions.
9. Only an authorized owner may approve and squash-merge after validation.
10. Confirm Project 2 reaches `Done`; repair metadata drift if automation misses it.

Never force-push, use `--no-verify`, dismiss valid review, bypass the ruleset, or treat green CI
as merge authorization.
