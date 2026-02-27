# Workflow Rules

These are MANDATORY. Follow them for every non-trivial change.

## docs/todo.md — Shared Execution Plan

`docs/todo.md` is the shared plan-of-record for both humans and LLM agents. It is the FIRST thing you read and the LAST thing you update.

### Before starting any work:
1. Read `docs/todo.md` to understand current state
2. Write the full execution plan as a Markdown checklist under a dated heading
3. Each task must be a checkable item: `- [ ] Description`
4. Sub-tasks are indented: `  - [ ] Sub-task`
5. Include validation steps as explicit checklist items

### During execution:
- After completing each task or validation pass, update `docs/todo.md`:
  - Check off completed items: `- [x] Description`
  - Add notes on anything unexpected
  - Add new items discovered during implementation
- Do NOT wait until the end to bulk-update — update as you go

### Format:
```markdown
## YYYY-MM-DD — Brief description of the work

### Plan
- [ ] Task 1
  - [ ] Sub-task 1a
  - [ ] Sub-task 1b
- [ ] Task 2
- [ ] Validate: run tests
- [ ] Validate: manual check

### Notes
- Any observations, blockers, or decisions made during execution
```

### Archiving:
- When the file gets long (50+ completed items or multiple days of work), the human will rename it to `docs/todo-archive-YYYY-MM-DD.md` and create a fresh `docs/todo.md`.
- Do NOT archive automatically — the human decides when.

## Git Branching — Branch Per Change

IMPORTANT: Non-trivial changes MUST happen on a new branch, never directly on `main`.

### What counts as non-trivial:
- Any code change (new features, bug fixes, refactors)
- Config changes that affect build or runtime behavior
- Schema or file format changes
- Any change touching more than 1-2 files

### What can go directly on main:
- Typo fixes in docs/comments
- Updating `docs/todo.md` itself
- Adding/updating `.claude/` configuration files

### Branch workflow:
1. Before starting work, create a branch: `git checkout -b type/short-description`
   - Branch naming: `feat/canvas-nodes`, `fix/yaml-validation`, `refactor/store-layout`
   - Prefix matches Conventional Commits: `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`
2. Make commits on the branch using Conventional Commits
3. When done, the human will handle PR/merge

### Enforcement:
- Before making code changes, check if you're on `main` with `git branch --show-current`
- If on `main`, create a branch FIRST before writing any code
- NEVER force-push or push to `main` directly

## Local CI — Validate Before Pushing

**Run local CI before opening a PR.** GitHub Actions CI is manual-only (`workflow_dispatch`) to conserve free-tier minutes.

### Quick check (native, ~30s):
```bash
npm run ci:local
```

### Full validation (Docker, clean environment):
```bash
npm run ci:docker         # lint + test
npm run ci:docker:build   # lint + test + Tauri build
```

### Pre-push hook:
- Installed automatically via `npm install` (the `prepare` script runs `scripts/setup-hooks.sh`)
- Runs `npm run ci:local` before every `git push`
- To skip in emergencies: `git push --no-verify` (use sparingly)

### GitHub Actions (manual):
- Trigger via GitHub UI or `gh workflow run ci.yml`
- Use for cross-platform validation before merging to `main`
