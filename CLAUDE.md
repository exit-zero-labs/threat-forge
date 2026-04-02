# ThreatForge

<!-- E0L company-wide context (agent personas, architecture decisions, git workflow).
     Available inside dev container via the .e0l symlink → /workspace-config.
     Silently skipped if not present (e.g., opening the repo natively without devcontainer). -->
@./.e0l/.ai/AI.md

Open-source, AI-enhanced, cross-platform desktop threat modeling application.

Fills the gap between Microsoft's legacy TMT (free but Windows-only, binary `.tm7` files) and enterprise platforms like ThreatModeler/IriusRisk ($20K+/year). Produces human-readable, git-diffable YAML files with integrated AI assistance.

**Status:** Production-ready. Core application fully functional. Remaining work: cross-platform CI builds, code signing, and launch marketing.

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
├── src/                        # React frontend
│   ├── components/             # React components (PascalCase)
│   │   ├── canvas/             # DFD canvas, nodes, edges
│   │   ├── layout/             # App layout, top menu, panels
│   │   ├── onboarding/         # Guides, overlays, tips
│   │   ├── palette/            # Component palette (left sidebar)
│   │   ├── panels/             # Properties, threats, settings, AI
│   │   └── ui/                 # shadcn/ui primitives
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Shared utilities
│   ├── stores/                 # Zustand stores
│   ├── types/                  # TypeScript type definitions
│   └── App.tsx                 # App root
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── lib.rs              # Tauri commands + app setup
│   │   ├── main.rs             # Entry point
│   │   ├── commands/           # Tauri IPC command handlers
│   │   ├── models/             # Rust types (serde YAML schema)
│   │   ├── stride/             # STRIDE threat engine
│   │   ├── ai/                 # AI: key storage, streaming providers, system prompts
│   │   ├── file_io/            # File read/write operations
│   │   └── importers/          # Import from external formats (TM7, etc.)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── e2e/                        # Playwright E2E tests
├── docs/                       # Documentation
│   ├── knowledge/              # Reference docs (architecture, format, market, etc.)
│   ├── plans/                  # Todo tracking and roadmap
│   └── runbooks/               # Operational guides (adding features, releases, migrations, etc.)
└── public/                     # Static assets
```

See @docs/knowledge/architecture.md for the full system architecture and ADRs.
See @docs/runbooks/ for operational guides (adding features, releasing, schema migration, etc.).

## Key Architecture Decisions

- **ADR-001:** Tauri v2 over Electron — ~10MB binary vs 100MB+, Rust backend for security
- **ADR-002:** ReactFlow for diagramming — MIT, React-native, performant
- **ADR-003:** Custom YAML file format — human-readable, git-diffable (THE product moat)
- **ADR-004:** Zustand for state — minimal boilerplate, TypeScript-first
- **ADR-005:** BYOK AI (user-provided API keys) — zero cost, user controls data
- **ADR-006:** Inline layout data — positions stored on each element in the `.thf` file; single-file portability
- **ADR-007:** AES-256-GCM encrypted file storage for API keys
- **ADR-008:** Tailwind + shadcn/ui — lightweight, dark mode, customizable

## File Format

The `.thf` file format is the product's primary moat. Design principles:
1. Human-readable in any text editor
2. Minimal, clean git diffs
3. Schema-validated for tooling interop
4. Single-file — all data (including layout positions) inline, no sidecars

See @docs/knowledge/file-format.md for the full schema spec and examples.

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

1. **`docs/plans/todo.md` is the shared execution plan.** Before starting any work, read it. Write your full plan as a checklist. Update it after every validation pass. See `.claude/rules/workflow.md` for the full protocol.

2. **Non-trivial changes go on a branch, never `main`.** Before writing code, run `git branch --show-current`. If on `main`, create a branch first: `git checkout -b type/short-description` (e.g., `feat/canvas-nodes`, `fix/yaml-validation`).

## Important Reminders

- ALWAYS run `cargo clippy` after modifying Rust code
- ALWAYS run `npx biome check --write .` after modifying TypeScript code
- Prefer running single test files over the full suite for speed
- The Tauri dev server runs on port 1420 — do not change this
- Never store API keys in plaintext — they are AES-256-GCM encrypted at rest
- The YAML file format stability is critical — breaking changes require a migration path
