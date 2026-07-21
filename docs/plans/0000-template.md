# Issue N — Short title

## Objective

State the measurable user or system outcome.

## Issue contract

- **Issue:** `#N`
- **Parent initiative:** `#N` or `N/A`
- **Type:** `Task`, `Bug`, or `Feature`
- **Size:** `M` or `L`
- **Priority:** `P0`, `P1`, or `P2`
- **Autonomy:** `Automatable` or `HITL`
- **Dependencies:** linked issues, external prerequisites, or `None`
- **Non-goals:** behavior explicitly excluded from this change

## Current behavior and evidence

Describe verified repository behavior, relevant architecture, and constraints. Link canonical
docs instead of copying mutable specifications.

## Implementation steps

Each step should be independently executable and no larger than XS/S.

### 1. Step title

- **Behavior:** exact contract introduced or changed
- **Files:** expected source and test surfaces
- **Implementation:** ordered technical work
- **Targeted verification:** command and discriminating assertion
- **Intent validation:** what an owner must inspect or exercise

## Cross-cutting requirements

- **Security and privacy:** trust boundaries, input, keys, permissions, supply chain
- **`.thf` compatibility:** schema, migration, round trip, git diff
- **Browser and desktop:** adapter parity or intentional differences
- **AI safety:** untrusted output, schema validation, approval, cancellation, undo
- **Accessibility and UX:** keyboard, focus, contrast, empty/loading/error states
- **Observability and evidence:** logs, screenshots, traces, artifacts, provenance

## Verification gate

List targeted checks first, then the final required gate:

```bash
npm run ci:local
```

Add E2E, Docker, build, release, or live-service checks when the issue requires them.

## Owner validation

List the plausible-but-wrong outcomes and user workflows that deterministic checks cannot
decide. Green CI does not complete this section.

## Specialist review

- [ ] PR reviewer
- [ ] Slop auditor
- [ ] Security auditor, when boundary/security lanes apply
- [ ] Threat-model expert, when schema/STRIDE/threat lanes apply

## Replan log

Append changes; do not rewrite prior decisions.

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| YYYY-MM-DD | Initial plan | Issue and repository evidence |
