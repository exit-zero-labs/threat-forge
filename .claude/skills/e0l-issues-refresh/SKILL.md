---
name: issues-refresh
description: Sweep the whole board and re-triage it — re-derive every non-Done issue's fields, correct drift, split what has outgrown itself, close what no longer deserves to exist, and promote what is now shaped. A long, high-reasoning periodic pass. Use to audit a board that has grown untrustworthy, after a batch of merges, or when a milestone ships.
---

# Refresh the board

`issue-triage` shapes one issue. This re-derives the whole board, because shaping goes stale: milestones ship, dependencies merge, surfaces get refactored, and an issue triaged two months ago describes a repository that no longer exists.

## Guardrails

1. **Re-derive, never rubber-stamp.** Decide each field as if seeing the issue fresh. A sweep that confirms everything it looks at has not audited anything.
2. **Do not churn what is already right.** Record an issue as verified and move on. Rewriting a correct description to look busy costs review attention and buries the changes that matter.

## Procedure

1. **Establish the ground truth first**: current `main`, every open pull request, and which milestones have shipped. Drift is measured against reality, not against the last sweep.
2. **Pull every non-`Done` issue** with its fields, labels, relationships, and status.
3. **For each, re-derive**: should it still exist · is it one thing · are `Type`/`Effort`/`Priority`/`Milestone` still right · does `AUTO`/`HITL` still hold · is its `Status` honest.
4. **Act:**
   - Stale, superseded, or unwanted → `Done` + `Reject`, reason in a comment.
   - Outgrown its `Effort`, or several things → split into sub-issues, triaged as created.
   - Shaped enough now → promote `Backlog → Ready`.
   - `In progress` with no branch or PR → not claimed; return to `Ready`.
   - `HITL` whose blocking step has resolved → re-label `AUTO`.
5. **Comment only where something changed**, saying what and why.
6. **Report**: counts by state, what changed, what you left, and what only a human can unblock.

## Checks worth running every sweep

- The `Priority` distribution test — more than roughly a fifth `High` means the field routes nothing.
- Parentless `Task` issues. GitHub cannot enforce it; this sweep is the enforcement.
- Open issues missing `Effort`, an autonomy label, or a milestone.
- `Ready` issues whose criteria only their author could check.
