# 264 — Preflight review lanes share one working tree

## The failure this fixes

Round-two preflight on #233 ran `pr-reviewer`, `slop-auditor` and `security-auditor`
concurrently against a single checkout, with two of them instructed to mutate it. The
`slop-auditor` ran the test suite during the `pr-reviewer`'s revert-and-observe cycle, saw the
reviewer's deliberate breakage, and reported it as a flaky-suite `must-fix` — with a
reproduction count, a line number, a plausible mechanism and a verified fix. All fabricated.
The full account is on #264.

Acting on it would have meant editing a healthy suite to chase a defect that never existed. The
inverse is worse: a mutating lane can make a suite look **green** to a concurrent lane, and a
"all tests pass" report on someone else's half-applied mutation is a false clearance.

## Root cause

`.claude/skills/pr-preflight/SKILL.md` says to run the lanes "in independent contexts" and means
*conversational* context — which worked, the lanes did converge independently on a real defect.
It says nothing about the **working tree**, which they share. Separately, `pr-reviewer` and
`security-auditor` are told to prove a test fails before trusting it, which is correct technique
and requires mutation. The skill instructs mutation and parallelism without reconciling them.

## Decision: serialize mutating lanes, keep read-only lanes parallel

The issue offered three options. Choosing (2), with (1) rejected on measured cost:

- **(1) A worktree per mutating lane** preserves parallelism and removes interference entirely,
  but a `git worktree` starts with no `node_modules`, and nothing here runs `vitest` without one.
  That means a per-lane `npm ci` each round, or a shared store that couples the lanes back
  together on the one axis the worktree was meant to separate. Neither has been built or
  measured, and writing down a mechanism whose cost I have not paid is the speculative doctrine
  the anti-slop rules forbid. Recorded as an option with its cost named, not mandated.
- **(3) Hoisting mutation into a phase after convergence** loses the property that the lane which
  found a defect is the one that proves it. Round three of #233 yielded exactly one class of
  finding — correct code that no test pins — and every one of them was established by the finding
  lane reverting a line and watching the suite stay green. That coupling is worth keeping.
- **(2) Serializing mutating lanes** costs wall-clock time and nothing else. It is what round
  three actually did, and round three produced no fabricated findings.

Read-only lanes keep running in parallel, because the interference is caused by writes, not by
concurrency.

## The rules, and where each one lives

`AGENTS.md` already owns a "Review lanes" section describing context independence. Tree
isolation is the same idea applied to a different resource, so it belongs there rather than in a
new document. The operational procedure belongs in the preflight skill. The four lane
definitions carry only what must hold when the lane is invoked *outside* preflight.

| Rule | Home |
|------|------|
| Lanes are isolated in tree state as well as context; mutating lanes serialize | `AGENTS.md` § Review lanes |
| Declare mutation up front; the orchestrator serializes on that declaration | `.claude/skills/pr-preflight/SKILL.md` |
| Attest the observed tree state in every report | each lane + skill |
| Restore and **confirm** restoration before reporting | each lane + skill |
| Scratch files must not land where a test runner collects them | each lane + skill |
| The fabricated-finding failure as a recognition pattern | `docs/quality/agentic-slop.md` |

## Acceptance criteria mapping

- [ ] Skill states the isolation model and what a lane may do to the tree — `SKILL.md`
- [ ] Mechanism written down, not implied — serialization is named, with the declaration that
      drives it and the worktree alternative and its cost
- [ ] Every report states the tree state observed — `HEAD` sha plus `git status --porcelain`,
      required by the skill and by each lane with `Bash`
- [ ] Restoration confirmed, not attempted — `git status --porcelain` compared against the
      state recorded at entry, with the comparison in the report
- [ ] Scratch files kept outside every glob in `vitest.config.ts`'s `include` — the issue named
      only `src/**/*.test.{ts,tsx}`, but `worker/` and `scripts/` are collected too, so the rule
      points at the config rather than restating a list that will drift
- [ ] Recognition pattern added to `docs/quality/agentic-slop.md`

## Scope boundary

`threat-model-expert` has no `Bash` tool, so it cannot mutate and cannot run a suite. It gets no
tree-hygiene rules; adding them would be defense against an impossible state. It does get the
attestation line, because its report still cites file contents and needs to say which commit.

This is a process change. There is no product behavior to test; verification is that the
documents say what they claim, the referenced globs and paths resolve, and the markdown gate
passes.

## Change log

- 2026-07-27 — written after #233 preflight; option (1) rejected on the `node_modules` cost
  above rather than on preference.
- 2026-07-27 — self-review corrected five things in the first draft, all of them the same
  species the issue is about. The skill told the orchestrator to *ask* each lane whether it
  would mutate, which is not something you can do before launching one; it now decides and
  schedules. "Every lane report states `git status --porcelain`" was false for
  `threat-model-expert`, which has no shell. A rule discarding a whole report over a leftover
  scratch file would have thrown away real findings; only results obtained by *running*
  something are discarded now. The scratch-file rule named one `vitest` include glob when there
  are three, so it points at the config instead of restating it. And the three lane blocks were
  three prose variations of the same rules — now byte-identical, with one lane-specific line
  each, so drift is greppable. The skill no longer restates them at all.
