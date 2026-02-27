# ThreatForge

Open-source, AI-enhanced, cross-platform desktop threat modeling application.

Fills the gap between Microsoft's legacy TMT (free but Windows-only, binary `.tm7` files) and enterprise platforms like ThreatModeler/IriusRisk ($20K+/year). Produces human-readable, git-diffable YAML files with integrated AI assistance.

**Status:** Early development — default Tauri scaffold, no custom code yet. Currently Phase 0.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| App Framework | Tauri v2 (Rust backend) |
| Frontend | React 19, TypeScript 5.x (strict mode) |
| Styling | Tailwind CSS 4, shadcn/ui |
| Diagramming | ReactFlow / xyflow |
| State | Zustand |
| File Format | Custom YAML schema (serde_yaml in Rust) |
| Testing (Frontend) | Vitest + React Testing Library |
| Testing (Rust) | `cargo test` |
| E2E Testing | Playwright |
| CI/CD | Docker (local) + GitHub Actions (manual) |
| Linting | Biome (TS), Clippy (Rust) |
| Formatting | Biome (TS), rustfmt (Rust) |

## Prerequisites

- **Node 20** (see `.node-version`)
- **Rust stable** with `clippy` and `rustfmt` components
- **Docker** (for `ci:docker` commands — local CI in a clean Linux environment)

## Commands

```bash
# Development
npm run dev              # Start Tauri dev server (hot reload on port 1420)
npm run tauri dev        # Alternative: start Tauri dev directly

# Build
npm run build            # Build frontend
npm run tauri build      # Build full desktop app (signed binary)

# Test
npx vitest               # Run frontend tests
npx vitest --run         # Run frontend tests once (no watch)
npx vitest run src/path/to/test.test.ts  # Run a single test file
cargo test --manifest-path src-tauri/Cargo.toml  # Run Rust tests

# Lint & Format
npx biome check .        # Lint check
npx biome check --write .  # Auto-fix lint + format
cargo clippy --manifest-path src-tauri/Cargo.toml  # Rust lint
cargo fmt --manifest-path src-tauri/Cargo.toml     # Rust format

# Local CI (run before pushing)
npm run ci:local         # Native lint + test (fast, ~30s)
npm run ci:docker        # Docker lint + test (clean environment)
npm run ci:docker:build  # Docker lint + test + Tauri build
```

## Architecture

```
threat-forge/
├── src/                    # React frontend
│   ├── components/         # React components (PascalCase)
│   ├── stores/             # Zustand stores
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Shared utilities
│   ├── types/              # TypeScript type definitions
│   └── App.tsx             # App root
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs          # Tauri commands + app setup
│   │   ├── main.rs         # Entry point
│   │   ├── commands/       # Tauri IPC command handlers
│   │   ├── models/         # Rust types (serde YAML schema)
│   │   ├── stride/         # STRIDE threat engine
│   │   └── file_io/        # File read/write operations
│   ├── Cargo.toml
│   └── tauri.conf.json
├── docs/                   # Project + implementation docs
│   ├── project-document.md
│   └── implementation-plan.md
└── public/                 # Static assets
```

## Key Architecture Decisions

- **ADR-001:** Tauri v2 over Electron — ~10MB binary vs 100MB+, Rust backend for security
- **ADR-002:** ReactFlow for diagramming — MIT, React-native, performant
- **ADR-003:** Custom YAML file format — human-readable, git-diffable (THE product moat)
- **ADR-004:** Zustand for state — minimal boilerplate, TypeScript-first
- **ADR-005:** BYOK AI (user-provided API keys) — zero cost, user controls data
- **ADR-006:** Layout data in separate JSON files — keeps YAML diffs clean
- **ADR-007:** OS keychain for API keys — native security via Tauri plugin
- **ADR-008:** Tailwind + shadcn/ui — lightweight, dark mode, customizable

See @docs/implementation-plan.md for full ADR details.

## File Format

The `.threatforge.yaml` file format is the product's primary moat. Design principles:
1. Human-readable in any text editor
2. Minimal, clean git diffs
3. Schema-validated for tooling interop
4. Layout coordinates stored separately in `.threatforge/layouts/*.json`

See @docs/project-document.md Section 4.3 for the full schema example.

## Conventions

These override the parent Exit Zero Labs CLAUDE.md:
- **Linting:** Biome for TypeScript (not ESLint/Prettier). Clippy for Rust.
- **Formatting:** Biome for TypeScript. rustfmt for Rust.
- **Package manager:** npm (not pnpm, not yarn)
- **Exports:** Named exports only. No default exports.
- **Files:** `kebab-case.ts` for files, `PascalCase` for components, `camelCase` for functions/variables
- **Commits:** Conventional Commits — `type(scope): description`
- **TypeScript:** Strict mode. No `any`. Prefer `unknown` over `any`.
- **Components:** Function components only. No class components.
- **State:** Zustand stores in `src/stores/`. No prop drilling beyond 2 levels.
- **Tauri IPC:** All Rust commands return `Result<T, String>`. Frontend calls via `@tauri-apps/api/core invoke()`.
- **Rust:** Use `thiserror` for error types. Derive `Serialize`/`Deserialize` on all IPC types.

## Workflow — READ THIS FIRST

**These two rules are non-negotiable. Follow them for every non-trivial change.**

1. **`docs/todo.md` is the shared execution plan.** Before starting any work, read it. Write your full plan as a checklist. Update it after every validation pass. See `.claude/rules/workflow.md` for the full protocol.

2. **Non-trivial changes go on a branch, never `main`.** Before writing code, run `git branch --show-current`. If on `main`, create a branch first: `git checkout -b type/short-description` (e.g., `feat/canvas-nodes`, `fix/yaml-validation`).

## Important Reminders

- ALWAYS run `cargo clippy` after modifying Rust code
- ALWAYS run `npx biome check --write .` after modifying TypeScript code
- Prefer running single test files over the full suite for speed
- The Tauri dev server runs on port 1420 — do not change this
- Never store API keys in files — always use OS keychain via Tauri plugin
- The YAML file format stability is critical — breaking changes require a migration path
