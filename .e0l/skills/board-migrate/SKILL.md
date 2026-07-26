---
name: board-migrate
description: Migrate a GitHub Project board to the doctrine taxonomy — milestones, the Effort field, Priority, Status, and the AUTO/HITL labels — with a snapshot taken first so every step is reversible. Use when adopting a repo's existing board, or when the taxonomy changes.
---

# Migrate a board

Brings a board onto the taxonomy in `first-principles/planning.md`. Everything touched is metadata — no issue body, comment, or state is written — so a snapshot makes it reversible.

## Guardrails

1. **Snapshot before any mutation, and never trust a previously recorded count.** Boards move. Capture at execution time into `docs/migrations/{date}-{slug}/snapshot/` and commit it.
2. **Never invent a field value.** An item with no `Size` gets no `Effort`. Back-filling a guess across hundreds of closed items destroys the signal the field exists to carry.

## Procedure

1. Assert the `project` scope: `gh auth status | grep -q "Token scopes.*project"`. Without it, project mutations fail **silently or partially** — the worst failure mode here.
2. Snapshot milestones, labels, every issue with `--state all`, plus `gh project item-list` and `field-list`.
3. **Rename milestones in place** with `PATCH /repos/{owner}/{repo}/milestones/{number}`. This preserves every issue and PR assignment, and the board's Milestone column reads through — no item edits. Never delete and recreate; that unassigns everything.
4. Create `Effort` as a new single-select. Do **not** rename `Size` and replace its options — that clears the value from every item holding one.
5. Migrate `Size` → `Effort` mechanically. Emit a dry-run list, review, then apply with a delay between calls; secondary rate limits bite at a few hundred items. Skip PR items.
6. Delete `Size`; normalise `Priority` and `Status`; `gh label edit Automatable --name AUTO` renames in place with assignments intact.
7. Verify: re-snapshot and diff. Every issue's milestone **number** unchanged with only titles differing; `Effort` set on exactly the items that had `Size`.

Mapping tables and rollback detail: `reference-rollback.md`.

Open issues left without an `Effort` go to a triage sweep that reasons about each. Do not close the migration by guessing them.
