---
name: pr-preflight
description: Run convergent independent review lanes before ThreatForge owner validation
---

# PR preflight

Run on a complete local diff or, after explicit PR-creation authorization, a draft PR before
moving its issue to `In progress`.

1. Confirm issue linkage, acceptance criteria, required plan, and verification evidence.
2. Decide, per lane, whether it may write to the working tree, and **state that mode in the
   invocation** — a lane cannot infer it:
   - lanes you invoke read-only run in parallel
   - **a lane you invoke `MUTATING` runs alone.** Nothing else runs while it holds the tree,
     including you, and it may only be dispatched against a clean tree at a known commit
   - a shell lane invoked without a stated mode is read-only
   - **you are a writer too.** Do not start fixing an early report while another lane, or a
     command it launched, is still reading. Wait for the cohort. An edit you make and revert
     inside a lane's window is invisible to both of its snapshots and is exactly the #233 shape
3. Run in independent contexts:
   - always: `pr-reviewer`
   - always: `slop-auditor`
   - conditional: `security-auditor` for security/trust-boundary lanes
   - conditional: `threat-model-expert` for `.thf`, STRIDE, or threat-quality lanes
4. Keep reviewer ownership separate; do not collapse all checklists into one pass.
5. Reject any shell lane's report that does not attest its tree state, and re-run that lane.
   `threat-model-expert` has no shell, so give it the commit yourself and expect that back —
   a lane cannot attest a state it has no way to read.
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
stating what they owe you. Those sections are byte-identical from the heading to end of file, on
purpose, so drift between them is greppable. Enforcing them is your job, not theirs:

- A shell lane's report without an entry and exit tree state is not a result. Re-run the lane.
- Dispatch a `MUTATING` lane only against a clean tree at a known commit. That precondition is
  what makes its restoration checkable: `git status --porcelain` reports paths and status, not
  contents, so it can only confirm a restore when the state it is confirming a return to is
  *empty*. On a tree that was already dirty it cannot tell a restored file from a differently
  broken one. Committing first is the way there, and committing needs authorization you may not
  have — **when you cannot commit, every lane is read-only.** That costs mutation proofs for one
  round. It costs nothing you can lose.
- When a lane's exit state differs from its entry state, or its report contradicts the tree it
  claims to have observed, discard what it got from running something; what it found by reading
  the diff still stands. Do not reconcile a contradicted result by reasoning about which half
  was true.
- Recover only from a state you know how to recover from. A `MUTATING` lane entered on a clean
  commit, so `git checkout -- . && git clean -fd` returns it there — including the untracked
  scratch a bare reset would leave behind to fail the next lane's precondition. Confirm
  `git status --porcelain` is empty before re-dispatching. A read-only lane that dirtied the
  tree anyway is a different problem: it may have written over uncommitted work that was never
  yours, so stop and look rather than resetting.
