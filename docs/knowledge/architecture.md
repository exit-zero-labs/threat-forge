# ThreatForge — Architecture

## System Architecture

```
ThreatForge Desktop App (Tauri v2)
├── Frontend (React 19 + TypeScript)
│   ├── UI Components (React + Tailwind CSS 4 + shadcn/ui)
│   ├── Diagramming Canvas (ReactFlow / xyflow)
│   ├── AI Chat Pane
│   ├── Threat Analysis View
│   └── State Management (Zustand)
│
├── Backend (Rust)
│   ├── File I/O (Read/Write YAML — serde + serde_yaml)
│   ├── Schema Validation (strict serde deserialization)
│   ├── STRIDE Engine (threat rule engine)
│   ├── Secure Key Storage (AES-256-GCM encrypted file)
│   ├── Auto-Updater (Tauri plugin)
│   └── Opt-in Telemetry
│
└── IPC: Tauri IPC (JSON-RPC) between frontend and backend
```

**External connections:**
- AI Chat Pane → External LLM API (OpenAI / Anthropic / Ollama) via HTTPS with user's API key
- File I/O → Local filesystem (`.thf` files)
- Auto-Updater → GitHub Releases (signature-verified)

## Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| App Framework | Tauri v2 (Rust) | ~10MB binary vs 100MB+ Electron; native webview; security sandbox |
| Frontend | React 19 + TypeScript 5.x | Largest contributor pool; strong typing |
| Styling | Tailwind CSS 4 + shadcn/ui | Lightweight, dark mode, customizable |
| Canvas | ReactFlow (xyflow) | MIT, React-native, performant, active dev |
| State | Zustand | Minimal boilerplate, TypeScript-first |
| File Format | Custom YAML schema (serde_yaml) | Human-readable, git-diffable |
| Testing (Frontend) | Vitest + React Testing Library | Fast, Vite-compatible |
| Testing (Rust) | cargo test | Standard Rust testing |
| E2E Testing | Playwright | Cross-platform, reliable |
| CI/CD | Docker (local) + GitHub Actions | Free for public repos |
| Linting | Biome (TS), Clippy (Rust) | Fast, opinionated |
| Formatting | Biome (TS), rustfmt (Rust) | Consistent style |

## Architecture Decision Records (ADRs)

| ADR | Decision | Rationale | Key Tradeoff |
|-----|----------|-----------|-------------|
| **ADR-001** | Tauri v2 over Electron | ~10MB binary; Rust backend for security/perf; native OS webview | Smaller ecosystem than Electron |
| **ADR-002** | ReactFlow for diagramming | MIT license; React-native; excellent performance; active dev | Required custom work for DFD conventions |
| **ADR-003** | Custom YAML file format | Human-readable; git-diffable; familiar to developers | YAML indentation gotchas; mitigated by strict schema validation |
| **ADR-004** | Zustand for state | Minimal boilerplate; great TypeScript support; performant | Less middleware than Redux; not needed at this scale |
| **ADR-005** | BYOK AI (user-provided keys) | Zero cost to project; no rate limiting; user controls data | Requires user to have API key; AI is optional |
| **ADR-006** | Inline layout data | Positions stored inline on each element in the `.thf` file; single-file portability | Slightly larger diffs when repositioning; but eliminates sidecar file complexity |
| **ADR-007** | AES-256-GCM encrypted file storage for API keys | Cross-platform without OS-specific keychain quirks; secure at rest | Managed by app, not OS keychain |
| **ADR-008** | Tailwind + shadcn/ui | Lightweight, customizable, excellent dark mode, growing Tauri adoption | More manual composition than MUI |

## Project Structure

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
│   │   ├── adapters/           # File system adapters (Tauri, browser)
│   │   ├── themes/             # Theme presets and engine
│   │   └── ...                 # Component library, STRIDE engine, commands
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
│   │   └── file_io/            # File read/write operations
│   ├── Cargo.toml
│   └── tauri.conf.json
├── e2e/                        # Playwright E2E tests
├── docs/                       # Documentation
│   ├── knowledge/              # Reference docs (architecture, format, etc.)
│   └── plans/                  # Todo tracking and roadmap
└── public/                     # Static assets
```

## Infrastructure & DevOps

| Environment | Purpose | Infrastructure | Cost |
|-------------|---------|---------------|------|
| Local | Developer workstation | `npm run tauri dev` (hot reload) | $0 |
| CI | Automated builds + tests | GitHub Actions matrix (ubuntu, macos, windows) | $0 (public repo) |
| Release | Signed binaries | GitHub Releases | $0 |
| Website | Docs + landing page | GitHub Pages or Cloudflare Pages | $0 |

### CI Pipeline

```
Feature Branch → PR Created → GitHub Actions CI
  → Lint (Biome + Clippy)
  → Test (Vitest + cargo test)
  → Build (All 3 Platforms)
  → PR Review → Merge to main
    → Tagged Release? → Build Signed Binaries → GitHub Release → Auto-update
```

### Local CI

```bash
npm run ci:local         # Native lint + test (fast, ~30s)
npm run ci:docker        # Docker lint + test (clean environment)
npm run ci:docker:build  # Docker lint + test + Tauri build
```

## Security Architecture

| Layer | Approach |
|-------|---------|
| API Key Storage | AES-256-GCM encrypted file in app data directory |
| AI API Calls | Direct from user's machine with user's key; HTTPS only |
| File Integrity | Schema validation on read via strict serde deserialization |
| Auto-Update | Signed releases via Tauri updater with signature verification |
| Supply Chain | Dependabot + cargo-audit in CI; minimal dependencies |
| CSP | Strict Content Security Policy; no inline scripts, no remote code |
| Input Sanitization | Rust-side for file ops; React-side for UI; LLM output treated as untrusted |

See [SECURITY.md](../../SECURITY.md) for the full security policy and vulnerability reporting.
