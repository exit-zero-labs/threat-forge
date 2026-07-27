---
name: pr-preflight
description: Run convergent independent review lanes before ThreatForge owner validation
---

# PR preflight

Run on a complete local diff or, after explicit PR-creation authorization, a draft PR before
moving its issue to `In progress`.

1. Confirm issue linkage, acceptance criteria, required plan, and verification evidence.
2. Decide, per lane, whether it may mutate the working tree, and schedule on that decision:
   - lanes you keep read-only run in parallel
   - **a lane permitted to mutate runs alone** — nothing else runs while it holds the tree
3. Run in independent contexts:
   - always: `pr-reviewer`
   - always: `slop-auditor`
   - conditional: `security-auditor` for security/trust-boundary lanes
   - conditional: `threat-model-expert` for `.thf`, STRIDE, or threat-quality lanes
4. Keep reviewer ownership separate; do not collapse all checklists into one pass.
5. Reject any lane report that does not attest its tree state, and re-run that lane.
6. Fix must-fix and should-fix findings or record the explicit owner decision.
7. Re-run the same reviewer lanes after revisions until they converge.
8. Re-run affected verification.
9. Post or preserve a preflight record with each lane, findings, revisions, and final state.

Only then mark the issue `In progress`. Preflight is not owner validation and cannot approve or
merge the PR.

## Working-tree isolation

Lanes share one checkout. A lane that reverts a line to prove a test catches it is doing the
right thing, but a second lane running the suite in that window sees the first lane's breakage
and reports it as a defect — with a line number, a mechanism and a fix, all fabricated. The
inverse is worse: a half-applied mutation can make a suite look green to another lane, and a
false clearance is not visibly wrong. This happened on #233; see the recognition log in
`docs/quality/agentic-slop.md`.

Serialization is the mechanism, because a `git worktree` per lane starts with no `node_modules`
and nothing here runs `vitest` without one — an `npm ci` per lane per round, or a shared store
that recouples the lanes. Build that only if lane wall-clock ever dominates.

`pr-reviewer`, `slop-auditor` and `security-auditor` each carry a `## Tree hygiene` section
stating what they owe you. The three are byte-identical on purpose, so drift between them is
greppable. Enforcing it is your job, not theirs:

- A report without an entry and exit tree state is not a result. Re-run the lane.
- When a lane's exit state differs from its entry state, or its report contradicts the tree it
  claims to have observed, restore the tree yourself and re-run it. Discard what it got from
  running something; what it found by reading the diff still stands. Do not reconcile a
  contradicted result by reasoning about which half was true.
