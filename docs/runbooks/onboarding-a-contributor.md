# Onboarding a Contributor

Guide for getting new contributors productive on ThreatForge.

## Prerequisites

New contributors need:

- **Node.js 20** (see `.node-version`)
- **Rust stable** with `clippy` and `rustfmt` components
- **Git** with a GitHub account
- A code editor (VS Code recommended for TypeScript + Rust via rust-analyzer)

## Setup Steps

### 1. Fork and Clone

```bash
# Fork via GitHub UI, then:
git clone https://github.com/YOUR_USERNAME/threat-forge.git
cd threat-forge
```

### 2. Install Dependencies

```bash
npm install    # Frontend deps + sets up git hooks
```

The `prepare` script automatically installs the pre-push hook that runs `npm run ci:local`.

### 3. Verify the Build

```bash
npm run dev              # Start dev server (http://localhost:1420)
npx vitest --run         # Frontend tests (should all pass)
cargo test --manifest-path src-tauri/Cargo.toml  # Rust tests
```

### 4. Read Key Documentation

| Document | Purpose |
|----------|---------|
| `CLAUDE.md` | Project overview, tech stack, commands, conventions |
| `CONTRIBUTING.md` | Contribution guidelines, PR process |
| `docs/knowledge/architecture.md` | System architecture and ADRs |
| `docs/knowledge/file-format.md` | `.thf` file format specification |
| `.claude/rules/` | Coding rules (code style, testing, security, workflow) |

## Project Architecture Overview

```
Frontend (React 19 + TypeScript)
  → Components in src/components/
  → State in src/stores/ (Zustand)
  → Utilities in src/lib/
  → Types in src/types/

Backend (Rust + Tauri v2)
  → Commands in src-tauri/src/commands/
  → Models in src-tauri/src/models/
  → STRIDE engine in src-tauri/src/stride/

Communication: Tauri IPC (JSON-RPC)
  → Frontend calls backend via invoke()
  → Backend emits events to frontend
```

## Key Concepts

| Concept | Description |
|---------|------------|
| **DFD** | Data Flow Diagram — the visual threat model |
| **STRIDE** | Threat classification: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege |
| **`.thf` file** | ThreatForge's YAML-based file format. The product moat. |
| **Elements** | DFD nodes: processes, data stores, external entities |
| **Data Flows** | Connections between elements |
| **Trust Boundaries** | Security zones grouping elements |
| **Threats** | Identified risks linked to elements/flows |

## Suggested First Tasks

1. Look for issues labeled `good first issue` on GitHub
2. Fix a typo in documentation
3. Add a test for an untested utility function
4. Expand STRIDE threat rules in `src-tauri/src/stride/`

## Development Workflow

1. Create a branch: `git checkout -b feat/description`
2. Make changes following the conventions in `CLAUDE.md`
3. Write tests for new code
4. Run validation:
   ```bash
   npx biome check --write .   # Lint + format TypeScript
   cargo clippy --manifest-path src-tauri/Cargo.toml  # Lint Rust
   npx vitest --run             # Frontend tests
   npm run ci:local             # Full local CI
   ```
5. Commit with Conventional Commits: `feat(scope): description`
6. Push and open a PR against `main`

## Getting Help

- Open a GitHub Discussion for questions
- File an issue for bugs or feature requests
- Email: admin@exitzerolabs.com
