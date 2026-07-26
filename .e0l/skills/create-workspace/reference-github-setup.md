<!-- @format -->

# GitHub setup for a new repo

Reference for the `create-workspace` skill. The taxonomy itself is normative in `first-principles/planning.md`; this is the mechanical setup.

## Project board

Create from the canonical template so field IDs and option sets cannot drift per repo:

```bash
gh project copy <template#> --source-owner exit-zero-labs \
  --target-owner exit-zero-labs --title "<Repo Name>"
```

If the installed `gh` lacks `project copy`, create the board and add fields with `gh project field-create`.

## Fields

| Field | Type | Options |
| --- | --- | --- |
| `Status` | single-select | Backlog, Ready, In progress, Done |
| `Effort` | single-select | High, Medium, Low |
| `Priority` | single-select | P0, P1, P2 |

Delete the template's seeded `Size` field. It duplicates `Effort` and encodes magnitude where the taxonomy wants reasoning class ([ADR-0003](../../../docs/decisions/0003-effort-field.md)).

`Type` needs no setup — `Feature`, `Bug`, and `Task` are org-level native issue types.

## Milestones

```bash
gh api -X POST repos/exit-zero-labs/<repo>/milestones -f title='M0 • POC' -f description='...'
```

Create `M0 • POC`, `M1 • Alpha`, `M2 • Beta`, `M3 • Release 1`. Descriptions come from the ladder definitions in `planning.md` — each states its exit criteria, because a milestone with no exit criterion never closes.

Exactly four states, no more ([ADR-0010](../../../docs/decisions/0010-four-state-status.md)). `Backlog → Ready` is the AI triage gate and the reason the board is safe to pick from unattended.

## Labels

Exactly three:

```bash
gh label create AUTO   --color 0e8a16 --description "An agent can take this to a verification-complete PR unattended"
gh label create HITL   --color d93f0b --description "Requires a human at some step; the body must say why and what they do"
gh label create Reject --color b60205 --description "Closed without doing the work; the issue says why. Applied to a Done issue."
```

Everything else — Effort, Priority, Status, Type, Milestone — is a field, not a label. A new label needs the same justification bar as a new field: it must change a routing or gating decision.

## Templates

`.github/ISSUE_TEMPLATE/` carries `feature`, `bug`, and `task`, plus a `config.yml` with `blank_issues_enabled: false`. Low-effort issues carry their verification and validation criteria inline; High and Medium reference the committed plan.

`.github/pull_request_template.md` carries What, Why, How, Testing, and the verification/validation split. The validation section includes the anti-slop self-review and documentation-freshness lines — as human aids, since no deterministic gate reads a checkbox.

## Branch protection

Require a passing CI run and one approving review on `main`. That gate is what lets agents open, iterate, and merge autonomously without the review disappearing.
