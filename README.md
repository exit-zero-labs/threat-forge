# ThreatForge

<p align="center">
  <img src="media/logo_long_v1_compressed.png" alt="ThreatForge" width="400" />
</p>

Open-source, AI-enhanced threat modeling for modern development teams.

ThreatForge is a cross-platform desktop application that makes threat modeling fast, collaborative, and developer-friendly. It produces human-readable, git-diffable YAML files instead of opaque binaries, and uses AI to accelerate the most tedious parts of threat analysis.

Built with [Tauri v2](https://v2.tauri.app/) + React. Runs on macOS, Windows, and Linux in a ~10MB binary.

## Why ThreatForge?

The threat modeling tools landscape has a gap. On one side: Microsoft's free but Windows-only Threat Modeling Tool with its 2016-era UI and opaque `.tm7` binary files. On the other: enterprise platforms that cost $20K+/year. In between, there's nothing that combines a modern interface, a clean file format, and AI assistance.

ThreatForge fills that gap.

- **Human-readable YAML files** that you can open in any text editor, diff in git, and review in pull requests
- **Modern diagramming canvas** for data flow diagrams with drag-and-drop, custom SVG icons, and trust boundaries
- **STRIDE threat engine** that auto-generates threats based on your architecture
- **AI chat pane** (bring your own API key) for conversational threat analysis and refinement
- **Cross-platform** via Tauri v2 -- native performance, small binary, no Electron bloat
- **Fully offline** -- AI features are optional, everything else works without a network

## Status

ThreatForge is in early development. The core architecture is defined and the scaffolding is in place, but no custom application code has been written yet. See the [implementation plan](docs/implementation-plan.md) for the roadmap.

**Phase 0** (current): File format validation + ReactFlow DFD prototype spike.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform

### Setup

```bash
git clone https://github.com/exit-zero-labs/threat-forge.git
cd threat-forge
npm install
```

### Run

```bash
npm run tauri dev
```

This starts the Tauri dev server with hot reload on port 1420.

### Build

```bash
npm run tauri build
```

Produces a signed desktop binary for your platform.

### Test

```bash
npx vitest --run              # Frontend tests
cargo test -p threat-forge    # Rust tests
```

### Lint

```bash
npx biome check .                                      # TypeScript
cargo clippy --manifest-path src-tauri/Cargo.toml       # Rust
```

## Tech Stack

| Layer             | Technology                                            |
| ----------------- | ----------------------------------------------------- |
| Desktop framework | Tauri v2 (Rust)                                       |
| Frontend          | React 19, TypeScript, Tailwind CSS 4, shadcn/ui       |
| Diagramming       | ReactFlow / xyflow                                    |
| State management  | Zustand                                               |
| File format       | Custom YAML schema (serde_yaml)                       |
| Testing           | Vitest, React Testing Library, Playwright, cargo test |
| CI/CD             | GitHub Actions                                        |

## File Format

The `.threatforge.yaml` format is designed to be the most developer-friendly way to store threat models:

```yaml
version: "1.0"
metadata:
  title: "Payment Processing Service"
  author: "Alex Chen"
  created: 2026-03-15

elements:
  - id: api-gateway
    type: process
    name: "API Gateway"
    trust_zone: dmz

  - id: payment-db
    type: data_store
    name: "Payment Database"
    trust_zone: internal

data_flows:
  - id: flow-1
    from: api-gateway
    to: payment-db
    protocol: PostgreSQL/TLS
    data: [transaction_records]

threats:
  - id: threat-1
    title: "SQL Injection on payment queries"
    category: Tampering
    element: api-gateway
    severity: High
    mitigation:
      status: mitigated
      description: "Parameterized queries via ORM"
```

Layout coordinates are stored separately in `.threatforge/layouts/` so repositioning elements on the canvas never pollutes your threat model diffs.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.

## Security

If you discover a security vulnerability, please report it responsibly. See [SECURITY.md](SECURITY.md) for details. Do not open a public issue for security vulnerabilities.

## License

Copyright 2026 Exit Zero Labs LLC.

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for the full text.

## Mission

ThreatForge exists to make threat modeling accessible to every developer, not just security specialists. Security shouldn't be gated behind expensive enterprise tools or painful UX. If more teams can threat-model quickly and painlessly, the software we all depend on gets safer.

Built by [Exit Zero Labs](https://exitzerolabs.com). Ship clean. Build forward.
