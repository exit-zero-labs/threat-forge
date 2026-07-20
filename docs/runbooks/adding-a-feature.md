# Adding a Feature

Use this workflow for non-trivial ThreatForge features.

## 1. Start From GitHub

1. Find or create the GitHub issue.
2. Add it to the
   [Threat Forge project](https://github.com/orgs/exit-zero-labs/projects/2).
3. Set `Status`, `Priority`, and `Size`.
4. Link the parent initiative and any blocking issues.
5. Write measurable acceptance criteria in the issue.
6. Apply exactly one autonomy label:
   - `agent-ready` when no earlier human action is needed
   - `human-blocked` for secrets, provisioning, external accounts, or unresolved decisions

GitHub is the only execution tracker. Do not create a second backlog in Markdown.

Use the size as a capability contract:

- XS/S: the issue body is executable.
- M/L: run the issue planner and commit `docs/plans/<issue>-<slug>.md` before code.
- XL: keep it as a parent initiative and decompose it into sub-issues.

## 2. Create a Branch

```bash
git checkout main
git pull origin main
git checkout -b feat/short-description
```

Use Conventional Commits prefixes: `feat/`, `fix/`, `refactor/`, `chore/`, or `docs/`.
Move the project item to `In progress`.

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

## 4. Plan M/L Work

Use the `issue-planner` agent and `docs/plans/0000-template.md`. The planner may write only
the plan. Implementation happens in a separate context after the plan is reviewable.

Skip this step for settled XS/S issues. Never execute an XL issue directly.

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
- Link the M/L plan or state `N/A — XS/S`.
- Separate verification evidence from owner validation steps.
- Include before/after screenshots for UI changes.
- Move the project item to `In review`.

Only `Shreyasdbz` and `exitzerolabs-admin` may merge or update `main`.
Commit, push, PR creation, approval, and merge each require explicit authorization. Owners
must not use bypass access to skip repository safeguards.
