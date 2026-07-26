<!-- @format -->

# Exit Zero Labs

The company context every repo imports. Authored here, propagated to each repo as `.e0l/AI.md`.

Exit Zero Labs is a solo software studio run by Shreyas Sane, building tasteful products that add value. Motto: **Ship Clean · Build Forward** — minimally designed, smooth and intuitive, highly functional, free of errors, and innovative in the problem they solve.

Operations are AI-native. Agents plan, design, and implement autonomously within the standards below.

## What you inherit

Everything under `.e0l/` comes from the workspace and is **generated — never edit it in place.** A change belongs in the workspace, goes through the amendment procedure, and propagates back down. Editing a vendored copy makes the drift check assert something untrue.

| Path | What |
| --- | --- |
| `.e0l/first-principles/index.md` | The standards set: product, design, coding, operations, planning, documentation |
| `.e0l/first-principles/anti-slop/` | What generated output must never look like |
| `.e0l/VERSION` | The doctrine version this repo is synced to |

## Conformance classes

Not every rule binds equally.

- **Class A, governance** — mandatory, no exceptions: the `.e0l/` mount, the `AGENTS.md` / `CLAUDE.md` / `copilot-instructions.md` topology, the board taxonomy, the anti-slop gate, branch and pull request conventions, the verification-and-validation exit condition, documentation freshness.
- **Class B, structure** — mandatory for new repos. An existing repo may hold a deviation record at its own `docs/deviations.md`, and that record must state a **revisit trigger**. A deviation without one is an exemption in disguise.
- **Class C, stack** — advisory. Deviating needs an ADR in this repo. **Vercel is prohibited** and is the one entry that takes a dated remediation issue rather than a deviation record.

## The rules that bite most often

- **No AI slop, ever.** Self-review every change against `.e0l/first-principles/anti-slop/` before calling it done. Never weaken functionality to reduce slop — that guardrail outranks the catalogue.
- **No work off-ticket.** Branches are `feat/`, `bug/`, or `task/` plus the issue number.
- **Squash merge only.** The pull request title becomes the commit message.
- **Green CI is verification, not validation.** Both are required to reach Done. Validation is a human reading the diff, and it is never automated away.
- **High and Medium effort issues need a committed plan** before code is written. Low effort issues carry their criteria in the issue body.
- **Documentation freshness is part of the change**, not a follow-up.
- **Read the neighbours before writing**, and **verify before asserting**.

## Autonomy

Issues are labelled `AUTO` or `HITL`. `HITL` is used as rarely as possible, and every `HITL` issue states why a human is needed and exactly what they do.

`--auto-mode` in a session waives the human *gate*, never the *criteria*. Verification and validation still both have to pass.
