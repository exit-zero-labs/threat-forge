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

Triage a red CI check with `docs/runbooks/diagnosing-ci-failures.md` before rerunning it.

## One planning system

GitHub Issues and
[Threat Forge Project 2](https://github.com/orgs/exit-zero-labs/projects/2) are the sole
execution tracker. Do not create a parallel Markdown or agent-only backlog.

Every non-trivial change requires an issue with:

- `Status`, `Priority`, and `Effort`
- measurable acceptance criteria
- dependencies and parent initiative when applicable
- exactly one autonomy label: `AUTO` or `HITL`

Project status semantics:

| Status | Meaning |
|--------|---------|
| `Backlog` | Filed. No agent has triaged it; fields are not enforced. Never picked up directly |
| `Ready` | An agent triaged it: fields set, description rewritten, relationships linked, justification comment posted. Anyone may pick it up |
| `In progress` | Claimed. Move here **before** starting work — parallel agents rely on it. Held through the entire PR cycle |
| `Done` | Merged and verified on a local `main`, or rejected with the `Reject` label |

Four states, no more. There is **no `In review`** — for a solo studio there is nobody to hand to, so
the issue stays `In progress` until merged. Rejection is the `Reject` label on a `Done` issue rather
than a state, because terminal non-`Done` states accumulate items nobody sweeps.

`Done` requires more than a merged PR: pull `main` locally and walk through the behaviour the issue
claimed to deliver. Merging is verification; that walkthrough is validation.

See `.e0l/first-principles/planning.md` for the full model.

Priority remains `P0` → `P1` → `P2`. `Effort` is the reasoning class the work needs — not how
long it takes:

| Effort | Model tier | Planning contract |
|--------|-----------|-------------------|
| `Low` | `model/haiku` | Mechanical, fully specified, low blast radius. The issue body is the executable specification |
| `Medium` | `model/sonnet` | Standard implementation against settled criteria. A committed `docs/plans/<issue>-<slug>.md` is required before code |
| `High` | `model/opus` | Architecture, schema, security, or cross-cutting judgment. A committed plan is required, and the work is decomposed into executable sub-issues |

The tier is a floor, not a ceiling. Any work touching cryptography, the IPC boundary, the
`.thf` schema, or a trust boundary is `High` regardless of how small the diff looks.

`Effort` replaced the former `Size` field in the doctrine v1 migration, and the `size/XS`–`size/XL`
labels were deleted with it. The `model/*` labels are **kept**: they state the reasoning class
directly, and during the migration they proved more accurate than `Size` — the two disagreed on 53
issues, so `Effort` was derived from the model label wherever one exists. The `Effort` field is
authoritative; the label must not contradict it.

`AUTO` means an agent can reach a verification-complete PR without earlier human action. Final
owner validation is still required. `HITL` means a secret, provisioning step, unresolved
product or design decision, sensitive content decision, or external account action is required
before that point.

## Milestones

Milestones express scope, not schedule. Every issue and pull request belongs to exactly one:

| Milestone | Meaning |
|-----------|---------|
| `M0 • POC` | Retroactive: the pre-repository prototype phase. Closed; no tracked issues |
| `M1 • Alpha` | Shipped: reliable, well-crafted threat modeling. Closed work only |
| `M2 • Beta` | The complete scoped feature set a user needs to adopt ThreatForge as their primary tool. Launch-ready |
| `M3 • Release 1` | Beyond launch; community and nice-to-have work. Unscoped by default |

New work that has not been scoped against the launch cutoff goes to `M3 • Release 1`. The owner
may pull an `M3` item forward into `M2` at any time; agents may not.

## Verification is not validation

- **Verification:** deterministic evidence that the implementation meets its written
  contract: lint, types, tests, builds, security checks, screenshots, and acceptance
  criteria.
- **Validation:** owner judgment that the change solves the right problem and avoids
  plausible-but-wrong behavior.

Green CI never means `Done`. `In progress` means verification is complete and only owner
validation and merge remain.

## Authorization boundaries

Reading, analysis, local edits, and local verification are allowed when requested. The
following actions each require explicit user authorization:

- create a commit
- push a branch
- create or publish a pull request
- approve, merge, close, or release
- deploy, roll back, or delete a production service

Permission configuration is not authorization. Never force-push or use `--no-verify`, and
never merge without the required status checks passing.

`main` requires a code-owner approving review, which an agent working under the owner's
account cannot satisfy. When the owner has explicitly authorized an autonomous run, the
owner may direct the agent to merge verification-complete work with `gh pr merge --squash
--admin`, which bypasses that review requirement and nothing else. That authorization is
per-run and must be stated by the owner; it is never inferred from repository permissions.
Under it the following still hold without exception:

- every required status check passes before the merge, never bypassed or disabled
- merges stay squash-only, preserving linear history
- the preflight review lanes run to convergence first, and the PR records their findings
- owner validation is deferred, not waived — the merged PR remains the record the owner
  reviews, and anything a reviewer could not verify is called out in the PR body

## Local machine resources

Agent work runs on the owner's workstation, shared with their editor, their browser, and other
concurrent agent sessions across other repositories. CPU, memory, and process count are a shared
budget, not a free resource. A saturated machine is an outage for the owner.

- **Never spawn synthetic load.** No CPU burners, busy-loops, `stress`/`yes` processes, or
  parallel job fans to simulate a loaded CI runner. If a timing assertion only fails under
  manufactured contention, that is evidence the assertion measures machine speed rather than a
  property of the code — fix the assertion instead of reproducing the noise. This rule is
  written from an incident: a review agent spawned 34 detached `node -e` busy-loops to model CI
  contention and drove the workstation to load 118 with 0% idle.
- **Never detach a process you will not reap.** Anything backgrounded during a task is stopped
  before that task reports. A process reparented to `launchd` (PPID 1) outlives the agent that
  started it and nobody sweeps it. Long-lived servers — `wrangler dev`, `vite preview`,
  Playwright servers — are stopped when the work that needed them ends.
- **Do not run the full suite in parallel lanes.** `npm run ci:local` and a bare `vitest run`
  are whole-machine operations. Concurrent review lanes must use the smallest targeted selector;
  only one lane runs the full gate, and preferably the orchestrator runs it once on their behalf.
- **Prefer a cheaper measurement.** Reach for a ratio, a complexity property, or a counted
  operation before reaching for wall-clock timing under load. See
  `src/lib/registry/registry-scale.test.ts` for the shape this should take.

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
6. **Handoff:** move the issue to `In progress` only after verification and preflight.
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
methodology lives in `docs/quality/ai-output-quality.md`. Copy a user reads — landing, About,
empty states, onboarding, release notes, page metadata — is governed by
`docs/knowledge/product-voice.md`.

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

Canonical agents are real files in `.claude/agents/`:

- `issue-planner`
- `feature-implementer`
- `pr-reviewer`
- `slop-auditor`
- `security-auditor`
- `threat-model-expert`

Canonical skills are real files in `.claude/skills/`:

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

## Inherited doctrine

Company-level standards are inherited from the Exit Zero Labs workspace and vendored under
`.e0l/`. ThreatForge is a public repository, so the payload is committed as real files and this
repository contains **no symlinks at all** — that invariant is what makes a standalone clone work
everywhere, and CI enforces it.

- `.e0l/first-principles/` — product, design, coding, operations, planning, documentation
- `.e0l/first-principles/anti-slop/` — what generated output must never look like
- `.e0l/VERSION` — the doctrine version this repository is synced to

**Never edit anything under `.e0l/` in place.** It is generated; a hand-edit makes the drift check
assert something untrue. A change belongs upstream in the workspace, goes through the amendment
procedure, and propagates back down.

Where a repository rule and an inherited principle disagree, the repository rule governs its own
surfaces — and the disagreement is worth raising rather than silently resolving.

ThreatForge holds one recorded structural deviation; see [`docs/deviations.md`](docs/deviations.md).
