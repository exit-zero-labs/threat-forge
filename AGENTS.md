# ThreatForge agent contract

This is the canonical repository contract for humans and coding agents. Agent-specific
adapters must point here instead of redefining these rules.

## Product invariants

ThreatForge is a local-first, AI-enhanced system architecture and threat modeling
application built with Tauri v2, React 19, TypeScript, Rust, Zustand, and ReactFlow.

The following constraints are non-negotiable:

- `.thf` files remain human-readable, git-diffable, backward-compatible, and portable.
- ThreatForge remains useful without an account, hosted backend, or AI provider.
- AI is optional, BYOK, and direct-to-provider. Keys stay local and encrypted.
- AI output is untrusted. Mutations must be validated, reviewable, transactional, and
  undoable.
- Browser and desktop behavior must be deliberate rather than accidental fallbacks.
- Security-sensitive behavior fails closed and never exposes secrets or raw internal errors.

Canonical architecture and schema references:

- `docs/knowledge/architecture.md`
- `docs/knowledge/file-format.md`
- `docs/plans/roadmap.md` for strategic direction only

## Toolchain

- Node 22 and npm
- Rust stable with `clippy` and `rustfmt`
- Biome for TypeScript/JavaScript formatting and linting
- Vitest and React Testing Library for frontend tests
- Cargo tests for Rust
- Playwright for browser E2E

Use the smallest targeted check while iterating. Before PR handoff, run:

```bash
npm run ci:local
```

Use Docker CI for release-sensitive or cross-platform work:

```bash
npm run ci:docker
npm run ci:docker:build
```

## One planning system

GitHub Issues and
[Threat Forge Project 2](https://github.com/orgs/exit-zero-labs/projects/2) are the sole
execution tracker. Do not create a parallel Markdown or agent-only backlog.

Every non-trivial change requires an issue with:

- `Status`, `Priority`, and `Size`
- measurable acceptance criteria
- dependencies and parent initiative when applicable
- exactly one autonomy label: `agent-ready` or `human-blocked`

Project status semantics:

| Status | Meaning |
|--------|---------|
| `To triage` | Newly filed; shape and metadata are not settled |
| `Backlog` | Triaged but not currently executable or selected |
| `Ready` | Criteria, dependencies, ownership, and autonomy are settled |
| `In progress` | A branch and implementation are underway |
| `In review` | Verification and agent preflight are complete; owner validation remains |
| `Done` | Merged or closed after validation |

Priority remains `P0` → `P1` → `P2`. Size is a capability class:

| Size | Planning contract |
|------|-------------------|
| `XS` / `S` | The issue body is the executable specification |
| `M` / `L` | A committed `docs/plans/<issue>-<slug>.md` is required before code |
| `XL` | Initiative or parent only; decompose into executable sub-issues |

`agent-ready` means an agent can reach a verification-complete PR without earlier human
action. Final owner validation is still required. `human-blocked` means a secret,
provisioning step, unresolved product/design decision, sensitive content decision, or
external account action is required before that point.

## Verification is not validation

- **Verification:** deterministic evidence that the implementation meets its written
  contract: lint, types, tests, builds, security checks, screenshots, and acceptance
  criteria.
- **Validation:** owner judgment that the change solves the right problem and avoids
  plausible-but-wrong behavior.

Green CI never means `Done`. `In review` means verification is complete and only owner
validation and merge remain.

## Authorization boundaries

Reading, analysis, local edits, and local verification are allowed when requested. The
following actions each require explicit user authorization:

- create a commit
- push a branch
- create or publish a pull request
- approve, merge, close, or release
- deploy, roll back, or delete a production service

Permission configuration is not authorization. Never use an owner bypass to skip required
checks, review, signed commits, thread resolution, or the squash-only merge policy. Never
force-push or use `--no-verify`.

## Engineering workflow

1. **Triage:** shape the issue and populate Project 2 metadata. Do not code.
2. **Plan:** for M/L work, an independent planner writes the committed plan. XL work is
   decomposed first.
3. **Implement:** execute settled criteria without silently rescoping. Add tests with the
   behavior.
4. **Self-review:** run `anti-slop-review` and fix behavior-preserving findings.
5. **Preflight:** run the general PR reviewer and independent slop auditor, plus security
   and threat-model specialists when their lanes apply. Repeat the same lanes until
   must-fix and should-fix findings are resolved.
6. **Handoff:** move the issue to `In review` only after verification and preflight.
7. **Validate and merge:** an owner performs intent validation and the final merge.

Newly discovered work becomes a linked issue or sub-issue. Do not expand scope silently.
Replans append a dated change log rather than rewriting history.

## Review lanes

Keep review contexts independent and non-overlapping:

- **PR reviewer:** correctness, contract, architecture, tests, and V&V completeness.
- **Slop auditor:** speculative complexity, fake completeness, noisy defenses, type escapes,
  weak tests, and documentation drift.
- **Security auditor:** exploitability, trust boundaries, IPC, file I/O, cryptography,
  updates, secrets, and supply chain.
- **Threat-model expert:** `.thf` schema, STRIDE/domain correctness, threat quality, and
  false-positive control.

Use fresh reviewer context for non-trivial changes. Do not manufacture findings. Report
`must-fix`, `should-fix`, and `consider` separately.

## Anti-slop guardrails

Functionality is sacred. Never remove behavior, validation, edge handling, accessibility,
or tests merely to make code look cleaner. Genuine boundary defense and domain complexity
are not slop.

Watch for:

- speculative abstractions before a second real caller
- swallowed errors or success-shaped fallbacks
- impossible defensive branches and dead scaffolding
- hallucinated APIs, flags, status codes, or platform behavior
- duplicated logic instead of reuse
- stubs or partial wiring presented as complete
- `any`, double casts, non-null assertions, and other type escapes
- tests that prove mocks, tautologies, weakened assertions, or giant unreviewed snapshots
- comments that narrate syntax and docs that restate code or fabricate rationale
- cross-file behavior or documentation drift after a partial fix

The full evidence-driven doctrine is `docs/quality/agentic-slop.md`. Product AI output evaluation
methodology lives in `docs/quality/ai-output-quality.md`.

## Code conventions

- Named exports only; no default exports.
- TypeScript strict mode; use `unknown` and guards instead of `any`.
- `kebab-case` files, `PascalCase` components, `camelCase` functions and variables.
- Function components only.
- Zustand stores live in `src/stores/`; use selectors and store actions.
- Rust commands return `Result<T, String>` at the IPC boundary.
- Use `thiserror` internally and avoid `.unwrap()` in production.
- All IPC types derive `Serialize` and `Deserialize`.
- Keep commands thin and validate frontend input in Rust.
- Use Conventional Commits when explicitly authorized to commit.

Path-specific rules live in `.github/instructions/`. Claude adapters in `.claude/rules/`
must remain thin pointers to those canonical files.

## Security and file format

- API keys are encrypted via `KeyStorage` and never logged, serialized, or sent elsewhere.
- Preserve the strict CSP and least-privilege Tauri capabilities.
- Scope file access and reject traversal.
- Never use remote code execution, `eval`, or unsafe HTML rendering.
- New `.thf` fields are optional with defaults.
- Breaking schema changes require a version bump and migration.
- Every schema change requires round-trip and backward-compatibility tests.
- Unknown YAML fields remain tolerated for forward compatibility.

## Agent and skill index

Canonical agents live in `.github/agents/` and are exposed to Claude through
`.claude/agents`:

- `issue-planner`
- `feature-implementer`
- `pr-reviewer`
- `slop-auditor`
- `security-auditor`
- `threat-model-expert`

Canonical skills live in `.github/skills/` and are exposed to Claude through
`.claude/skills`:

- `issue-triage`
- `issues-clarify`
- `autonomous-issue-triage`
- `issues-report`
- `implement-issue`
- `fix-issue` (compatibility alias for settled bug issues)
- `anti-slop-review`
- `pr-preflight`
- `pr-cycle`
- `build-test`
