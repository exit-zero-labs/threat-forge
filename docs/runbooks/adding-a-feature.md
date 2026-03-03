# Adding a Feature

Step-by-step guide for implementing new features in ThreatForge.

## Before You Start

1. **Check the backlog** — Read `docs/plans/backlog.md` for feature specs and priorities.
2. **Read todo.md** — Check `docs/plans/todo.md` for current work in progress. Write your plan there.
3. **Understand the architecture** — See `docs/knowledge/architecture.md` and `CLAUDE.md`.

## Branch Workflow

```bash
# Ensure you're on main and up to date
git checkout main
git pull origin main

# Create a feature branch
git checkout -b feat/short-description
```

Branch naming uses Conventional Commits prefixes: `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`.

## Implementation Steps

### 1. Write Your Plan

Update `docs/plans/todo.md` with a dated checklist:

```markdown
## YYYY-MM-DD — Feature description

- [ ] Task 1
  - [ ] Sub-task 1a
- [ ] Task 2
- [ ] Validate: run tests
```

### 2. Understand Existing Code

Read relevant source files before making changes. Key locations:

| Area | Location |
|------|----------|
| React components | `src/components/` |
| Zustand stores | `src/stores/` |
| Shared utilities | `src/lib/` |
| TypeScript types | `src/types/` |
| Rust commands | `src-tauri/src/commands/` |
| Rust models | `src-tauri/src/models/` |
| Tauri config | `src-tauri/tauri.conf.json` |

### 3. Implement the Feature

Follow project conventions:

- **TypeScript**: Strict mode, no `any`, named exports only, `kebab-case` files
- **Rust**: `snake_case` functions, `PascalCase` types, `Result<T, String>` for commands
- **State**: Zustand stores in `src/stores/`, no prop drilling beyond 2 levels
- **Components**: Function components only, shadcn/ui primitives in `src/components/ui/`

### 4. Write Tests

- **Frontend**: Vitest + React Testing Library. Test file lives next to source: `foo.test.ts`
- **Rust**: `#[cfg(test)] mod tests` in the same file, or `src-tauri/tests/` for integration tests
- **YAML schema changes**: Must include round-trip tests (serialize -> deserialize -> assert equal)

### 5. Validate

```bash
# TypeScript lint + format
npx biome check --write .

# Rust lint
cargo clippy --manifest-path src-tauri/Cargo.toml

# Frontend tests
npx vitest --run

# Rust tests
cargo test --manifest-path src-tauri/Cargo.toml

# Full local CI (recommended before pushing)
npm run ci:local
```

### 6. Update todo.md

Check off completed items. Add notes about decisions or surprises.

### 7. Commit and Push

```bash
# Stage specific files (not git add -A)
git add src/path/to/changed-files
git commit -m "feat(scope): short description"
git push -u origin feat/short-description
```

### 8. Open a Pull Request

Target `main`. Include:
- Summary of changes
- Test plan
- Screenshots (for UI changes)

## Checklist

- [ ] Plan written in `docs/plans/todo.md`
- [ ] Feature branch created (not on `main`)
- [ ] Code follows project conventions
- [ ] Tests written and passing
- [ ] Biome and Clippy clean
- [ ] `todo.md` updated with completion status
- [ ] PR opened with description and test plan
