# Issue 70 — Cross-agent AI engineering harness

## Objective

Adopt a harness-neutral AI engineering methodology that gives Claude, Copilot, and other coding
agents the same ThreatForge planning, implementation, review, GitHub organization, anti-slop,
verification, validation, and authorization contracts.

## Issue contract

- **Issue:** `#70`
- **Parent initiative:** `N/A`
- **Type:** `Task`
- **Size:** `L`
- **Priority:** `P0`
- **Autonomy:** `agent-ready`
- **Dependencies:** `None`
- **Non-goals:** product AI runtime or evaluation implementation, unrelated vendor-specific
  skills, milestones, or runtime model routing

## Current behavior and evidence

ThreatForge requires one harness-neutral contract, narrow path instructions, independent
planning and review contexts, whole-board drift repair, and explicit
verification-versus-validation and lifecycle authorization boundaries.

The implementation preserves ThreatForge's CODEOWNERS, ruleset, Project 2 taxonomy,
Rust/Tauri/React architecture, `.thf` constraints, and domain specialists.

## Implementation steps

### 1. Canonical cross-agent contract

- **Behavior:** one `AGENTS.md` owns invariants, Project 2 semantics, V&V, authorization, review
  lanes, and anti-slop guardrails
- **Files:** `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`,
  `.github/instructions/`, `.claude/rules/`
- **Targeted verification:** resolve every adapter reference and confirm no duplicated policy
- **Intent validation:** owners confirm lifecycle and authorization language

### 2. Independent agent roles and quality doctrine

- **Behavior:** planner, implementer, general reviewer, slop auditor, security auditor, and
  threat-model expert have separate responsibilities
- **Files:** `.github/agents/`, `.claude/agents/`, `docs/quality/`
- **Targeted verification:** inspect frontmatter, references, lane boundaries, and recognition
  patterns
- **Intent validation:** owners confirm review severity and anti-slop false-positive guardrails

### 3. GitHub lifecycle skills

- **Behavior:** triage, clarification, autonomous selection, reporting, implementation,
  anti-slop, preflight, build/test, and authorized PR cycle use live Project metadata
- **Files:** `.github/skills/`, `.claude/skills/`
- **Targeted verification:** confirm dynamic field discovery and no hard-coded Project option IDs
- **Intent validation:** exercise one triage/report/preflight workflow

### 4. Templates, runbooks, and cloud-agent setup

- **Behavior:** issue/PR intake captures criteria, dependencies, V&V, plan, preflight, and
  autonomy; Copilot starts with deterministic Node/Rust dependencies
- **Files:** `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`,
  `.github/workflows/copilot-setup-steps.yml`, `CONTRIBUTING.md`, `docs/runbooks/`,
  `docs/plans/0000-template.md`
- **Targeted verification:** parse YAML/JSON/frontmatter and run repository CI
- **Intent validation:** review the contributor path from intake through owner validation

### 5. Canonical topology reconciliation

- **Behavior:** canonical names and scopes match the concrete port specification: `pr-reviewer`,
  `implement-issue`, ten narrow Copilot instructions, seven thin Claude rule adapters, and
  relative symlinks for Claude agent/skill discovery
- **Files:** `.github/agents/`, `.github/skills/`, `.github/instructions/`, `.claude/`,
  `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`
- **Targeted verification:** confirm exact canonical tree, symlink targets, frontmatter parsing,
  path scopes, reference resolution, permission rules, and absence of superseded names
- **Intent validation:** owners confirm canonical naming and symlink portability are the desired
  maintenance tradeoff

## Cross-cutting requirements

- **Security and privacy:** no secret permissions, owner bypass, or public vulnerability workflow
- **`.thf` compatibility:** preserve schema and threat-model specialist authority
- **Browser and desktop:** preserve shared adapter-contract expectations
- **AI safety:** separate engineering slop from future product-output quality gates
- **Accessibility and UX:** retain explicit visual/accessibility review evidence
- **Observability and evidence:** review passes preserve findings, fixes, and rerun evidence

## Verification gate

```bash
npm run ci:local
```

Also parse all changed YAML/JSON/frontmatter, validate internal references, and run independent
general/slop/security review.

## Owner validation

- Confirm `agent-ready` and `human-blocked` meanings match desired autonomy.
- Confirm owners never use bypass access to skip required repository controls.
- Confirm issue planning by size is practical for ongoing work.
- Confirm adapters remain thin enough to avoid policy drift.

## Specialist review

Initial implementation pass:

- [x] General PR reviewer
- [x] Slop auditor
- [x] Security auditor
- [x] Threat-model expert not required; no `.thf` or STRIDE behavior changes

Canonical-topology reconciliation pass:

- [x] PR reviewer
- [x] Slop auditor
- [x] Security auditor
- [x] Threat-model expert not required; no `.thf` or STRIDE behavior changes

## Replan log

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-07-20 | Initial plan recorded during the configuration migration | The active operations branch required a harness-neutral execution contract and explicit remaining validation |
| 2026-07-20 | Preflight findings applied and rerun requested | Fixed the Node prerequisite, documentation adapter, skill index, and Production environment binding. Kept the contributor lifecycle summary because `CONTRIBUTING.md` is an intentional human-facing root contract rather than a harness adapter. |
| 2026-07-20 | General, slop, and security lanes converged | Reruns found no must-fix or should-fix findings. The manual website deployment governance gap remains explicitly tracked by issue `#69`; secret scanning, push protection, protected release reviewers, and self-review prevention were verified live. |
| 2026-07-20 | Canonical topology specification reopened local reconciliation | The final specification required narrower instruction scopes, canonical `pr-reviewer` and `implement-issue` names, Claude agent/skill symlinks, and explicit Claude mutation permissions. These deltas were applied before owner validation; no remote lifecycle state changed. |
| 2026-07-20 | Canonical topology reconciled and preflight converged | Added the exact six-agent, ten-skill, ten-instruction, and seven-Claude-adapter topology; hardened local mutation controls; preserved legacy `.thf` migration knowledge; expanded the canonical local gate; and added browser-artifact Worker validation to existing CI. Repeated PR, slop, and security lanes ended with no must-fix or should-fix findings. |
| 2026-07-21 | Autonomy labels renamed after this plan completed | `agent-ready` became `Automatable` and `human-blocked` became `HITL`, aligning ThreatForge with the Exit Zero Labs cross-repo label vocabulary. The old names above are left intact as the historical record of this plan; current policy lives in `AGENTS.md`. |
