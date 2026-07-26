<!-- @format -->

# Board migration — mappings and rollback

Reference for the `board-migrate` skill.

## Field mappings

`Size` → `Effort`, mechanically. Effort is a reasoning class, not a magnitude — see `first-principles/planning.md`.

| Source `Size` | `Effort` |
| --- | --- |
| `XS`, `S` | `Low` |
| `M` | `Medium` |
| `L`, `XL` | `High` |

Items with no `Size` get no `Effort`. Pull request items are skipped — effort is a property of the issue.

`Status` normalises to exactly four states — `Backlog` / `Ready` / `In progress` / `Done` ([ADR-0010](../../../docs/decisions/0010-four-state-status.md)):

| From | To |
| --- | --- |
| `To triage`, `Triage` | `Backlog` — the same state; the split was never used |
| `In review` | `In progress` — still the author's problem until merged |
| everything else | unchanged |

Rejection is the **`Reject` label on a `Done` issue**, not a state.

**This migration is destructive by construction.** Replacing a single-select's options assigns new option ids and clears the value on every item, so it must snapshot, replace, then re-apply. `board-set-status.py` does exactly that.

`Priority` normalises to `P0` / `P1` / `P2`, deliberately not High/Medium/Low, so that no board carries two fields both offering the value "High".

## Milestone ladder

| Position | Title |
| --- | --- |
| 0 | `M0 • POC` |
| 1 | `M1 • Alpha` |
| 2 | `M2 • Beta` |
| 3 | `M3 • Release 1` |
| n | `M{x} • Release {n}` |

Separator is `•` with spaces either side. A board that used `·` normalises.

Non-product repos use an operations ladder instead (`Doctrine v1`, `Doctrine v2`, …). The product ladder has no closable meaning for them.

## Why renaming in place is safe

`PATCH /repos/{owner}/{repo}/milestones/{number}` changes only the title. Issue and pull request assignments are held by milestone **number**, not title, and the board's Milestone column reads through to the issue. So a full retroactive rename across hundreds of items costs one API call per milestone and zero item edits.

Deleting and recreating a milestone unassigns every issue and pull request on it. There is no undo.

## Rollback

```bash
Tooling/Scripts/board-rollback.sh <snapshot-dir>
```

Replays the snapshot:

1. Milestone titles restored by number from `{repo}-milestones-all.json`.
2. `AUTO` renamed back to `Automatable`.
3. `Effort` values cleared, and the field deleted.
4. `Size` recreated from `project-N-fields.json`, then its per-item values restored from `project-N-items.json`.

Nothing in the migration writes an issue body, comment, or state, so even a partial rollback loses no content — only field metadata, all of which is in the snapshot.

## Verifying a rollback

Re-snapshot into `snapshot-after/` and diff against `snapshot/`. The only acceptable differences are `updatedAt` timestamps.
