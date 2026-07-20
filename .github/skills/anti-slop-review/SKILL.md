---
name: anti-slop-review
description: Self-review ThreatForge changes for AI engineering slop without removing behavior
---

# Anti-slop review

Run after implementation and before any completion claim or PR handoff.

1. Read `AGENTS.md` and `docs/quality/agentic-slop.md`.
2. Inspect the complete diff and every changed file in context.
3. Compare the result with the issue or committed plan.
4. Check architecture/code, tests, docs, and operational surfaces for documented recognition
   patterns.
5. Protect real functionality, validation, accessibility, compatibility, and boundary defense.
6. Fix `must-fix` and `should-fix` findings when the fix is behavior-preserving and in scope.
7. Raise rather than guess when a fix changes product intent or scope.
8. Re-run the smallest checks that prove each correction.

Do not manufacture findings. Report:

- findings fixed
- findings raised for owner decision
- targeted verification rerun
- `clean`, `minor`, or `needs-work`
