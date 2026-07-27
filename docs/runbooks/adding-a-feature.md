# Adding a Feature

Use this workflow for non-trivial ThreatForge features.

## 1. Start From GitHub

1. Find or create the GitHub issue.
2. Add it to the
   [Threat Forge project](https://github.com/orgs/exit-zero-labs/projects/2).
3. Set `Status`, `Priority`, and `Effort`.
4. Link the parent initiative and any blocking issues.
5. Write measurable acceptance criteria in the issue.
6. Apply exactly one autonomy label:
   - `AUTO` when no earlier human action is needed
   - `HITL` for secrets, provisioning, external accounts, or unresolved decisions

GitHub is the only execution tracker. Do not create a second backlog in Markdown.

`Effort` is the reasoning class the work needs, not how long it takes, and it decides what you
have to do before writing code:

- `Low`: the issue body is executable.
- `Medium`: run the issue planner and commit `docs/plans/<issue>-<slug>.md` before code.
- `High`: the same plan, plus a decomposition into sub-issues that get implemented in its place.

It is a floor. Cryptography, the IPC boundary, the `.thf` schema, and trust boundaries are
`High` however small the diff looks.

## 2. Claim It and Create a Branch

Move the project item to `In progress` first. Another agent may be scanning the board for
work right now, and the status field is the only thing that stops two of you starting the
same issue.

```bash
git checkout main
git pull origin main
git checkout -b feat/short-description
```

Use Conventional Commits prefixes: `feat/`, `fix/`, `refactor/`, `chore/`, or `docs/`.

## 3. Understand Existing Code

Read the relevant knowledge docs and source before editing.

| Area | Location |
|------|----------|
| React components | `src/components/` |
| Zustand stores | `src/stores/` |
| Shared utilities | `src/lib/` |
| TypeScript types | `src/types/` |
| Rust commands | `src-tauri/src/commands/` |
| Rust models | `src-tauri/src/models/` |
| Tauri config | `src-tauri/tauri.conf.json` |

## 4. Plan Medium and High Work

Use the `issue-planner` agent and `docs/plans/0000-template.md`. The planner may write only
the plan. Implementation happens in a separate context after the plan is reviewable.

A `Low` issue skips this step; its body is the specification. A `High` issue needs the plan
*and* the sub-issues that plan decomposes it into, and the sub-issues are what you implement.

## 5. Implement and Test

- Keep the change within the issue's acceptance criteria.
- Add tests with the implementation.
- Preserve `.thf` backward compatibility; schema changes require round-trip tests and a
  migration path.
- Open linked sub-issues for discovered work that does not belong in the current change.
- Run the `anti-slop-review` skill before claiming implementation complete.

## 6. Verify

```bash
npx biome check --write .
cargo clippy --manifest-path src-tauri/Cargo.toml
npx vitest --run
cargo test --manifest-path src-tauri/Cargo.toml
npm run ci:local
```

Use the smallest relevant commands first. Run Docker CI for release-sensitive changes.

Verification proves the written contract. It does not replace owner intent validation.

## 7. Run Agent Preflight

Always run independent general and slop review lanes. Add:

- `security-auditor` for IPC, file, crypto, key, AI execution, updater, release, or
  supply-chain changes
- `threat-model-expert` for `.thf`, STRIDE, schema, migration, or threat-generation changes

Fix must-fix and should-fix findings and rerun the same lanes until they converge.

## 8. Open the Pull Request

- Link it with `Closes #N`.
- Link the plan, or state `N/A — Effort: Low`.
- Separate verification evidence from owner validation steps.
- Include before/after screenshots for UI changes.
- Leave the project item where it is. It went to `In progress` back in *Claim It and Create a
  Branch* and stays there until merge.

Only `Shreyasdbz` and `exitzerolabs-admin` may merge or update `main`.
Commit, push, PR creation, approval, and merge each require explicit authorization. Owners
must not use bypass access to skip repository safeguards.
