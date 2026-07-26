<!-- @format -->

# The triage bar and field mechanics

Reference for the `issue-triage` skill. The normative model is [`first-principles/planning.md`](../../../docs/first-principles/planning.md).

## The promotion bar

Promote to `Ready` only when every one of these is answerable. If one is not, leave it in `Backlog` and say in a comment what is missing — an honest hold is a successful triage.

| Question | Fails when |
| --- | --- |
| **Should this exist?** | It duplicates another issue, or the product no longer wants it → `Done` + `Reject` |
| **Is it one thing?** | It hides several unrelated pieces → split |
| **Can someone else check it?** | Acceptance criteria only their author could evaluate |
| **Is `Effort` honest?** | `Low` that might need research — that is `Medium` by definition |
| **Does `HITL` name the step?** | The label without a named human action is a parking space |
| **Is the milestone right?** | Parked in a phase that has already shipped |

## Field mechanics

**`Type`, `Milestone`** — native, set on the issue:

```bash
gh issue edit <N> --repo <owner>/<repo> --type Task            # or Bug / Feature
gh issue edit <N> --repo <owner>/<repo> --milestone "M1 • Alpha"
```

**`Effort`, `Priority`** — **native organization issue fields**, not project fields ([ADR-0009](../../../docs/decisions/0009-native-effort-issue-field.md)). They are **invisible to `gh project item-list`**, which returns no key for them and no error. A triage pass that reaches for the project API leaves them unset while believing it set them.

```bash
# Read
gh api /repos/{owner}/{repo}/issues/<N>/issue-field-values \
  -H "X-GitHub-Api-Version: 2026-03-10"

# Write — the body is the COMPLETE set, not a patch. Send every field you want to keep.
gh api -X POST /repos/{owner}/{repo}/issues/<N>/issue-field-values \
  -H "X-GitHub-Api-Version: 2026-03-10" --input - <<'JSON'
{"issue_field_values":[
  {"field_id":39469461,"value":"Medium"},
  {"field_id":39469458,"value":"High"}
]}
JSON
```

`39469461` is `Effort` (High/Medium/Low); `39469458` is `Priority` (High/Medium/Low; `Urgent` exists and is **never** assigned). Posting one alone clears the other — verified, not assumed.

**Autonomy label** — exactly one, and clear the other on re-triage:

```bash
gh issue edit <N> --repo <owner>/<repo> --add-label AUTO --remove-label HITL
```

**`Status`** — a project single-select. Re-fetch field and option ids rather than trusting saved ones:

```bash
gh project field-list <project#> --owner <owner> --format json
```

## The justification comment

A few sentences, not a template. It should say **why this is worth doing, why now, and why the fields are what they are** — particularly any field a reader would question.

It exists because triage is a decision an agent made autonomously. The comment is what a human reads to decide whether to trust the rest of it, so a comment that only restates the fields has recorded nothing.

## Order of operations

Set fields, then promote. An issue that reaches `Ready` before its fields are set is briefly claiming to be shaped when it is not — and with parallel agents reading the board, brief is long enough.

Read every field back after writing it. The issue-field endpoints fail quietly in exactly the way that makes an unread write look successful.
