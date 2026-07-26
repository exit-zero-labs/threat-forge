---
name: doctrine-amend
description: Amend the Exit Zero Labs first principles in the correct order — decision record, edit, changelog, version bump, export, propagation. Use when a standard needs to change, a new principle is added, or a conformance class shifts. Enforces the ordering that keeps the doctrine auditable.
---

# Amend the doctrine

Amendment is a procedure, not an edit. Out of order, it produces a doctrine whose history cannot be reconstructed — the failure the three retired directives demonstrated.

## Guardrails

1. **Supersede, never rewrite a shipped decision.** An ADR is amended only to add a `Superseded by ADR-NNNN` status line. Editing the reasoning away destroys the record of why the old choice was made.
2. **Never bump the version without running the export.** The `manifest.json` diff is the reviewable proof of what actually propagates; a bump without it is a claim nobody checked.

## Procedure

1. Open an issue on the workspace board. Set Type, Effort, and `AUTO` or `HITL`.
2. Write `docs/decisions/NNNN-{slug}.md`: status and date, context, decision, consequences, **and the alternative rejected and why**. Without that last part it is an announcement, not a record.
3. Edit the affected files in `docs/first-principles/`.
4. Append one row to `docs/CHANGELOG.md`, newest first.
5. Bump `.e0l/VERSION` by conformance class — **MAJOR** for Class A, **MINOR** for a new principle or Class B/C, **PATCH** for wording. See `reference-versioning.md`.
6. Run `Tooling/Scripts/e0l-export.sh`. Review the `manifest.json` diff: it should change exactly what you edited.
7. Verify: `bun Tooling/anti-slop/scan.ts` and `bun Tooling/Scripts/check-links.ts` over the changed docs, then `Tooling/Scripts/e0l-verify.sh`.
8. Open the PR. After merge, run `propagate-doctrine`.

If the amendment changes what a repo must do, update that repo's row in `Tooling/conformance.yml` in the same change — a deviation whose revisit trigger has fired is debt, and the ledger is where it becomes visible.
