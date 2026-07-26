<!-- @format -->

# Coding

> Sources: `doctrine.md` §coding (retired); New Submodule Mono-Repo Directive (retired, see [`docs/archive/`](../archive/2026-07-new-submodule-monorepo-directive.md)); Project Postcard `AGENTS.md` and `docs/research/agentic-slop.md`; [ADR-0006](../decisions/0006-conformance-classes.md).

## Naming

| Thing | Convention |
| --- | --- |
| Files and directories | `kebab-case` |
| Variables and functions | `camelCase` |
| Classes and components | `PascalCase` |
| Constants | `SCREAMING_SNAKE_CASE` |
| Branches | `feat/`, `bug/`, `task/` prefix + issue number + short slug |

## Structure

Single responsibility for functions, classes, and modules. A unit that needs "and" to describe it is two units.

Docstrings on functions, classes, and modules: purpose, parameters, return value, and anything a caller could not infer. A docstring that restates the signature is noise — see the comment-slop tell in [anti-slop/code.md](anti-slop/code.md).

Errors are handled deliberately and logged with structure. Logging serves three jobs — usage metrics, health checks, and debugging — and the shape must be consistent across repos so that a single query works everywhere. The standing goal is one Exit Zero Labs logging SDK used by every repo; Sentry is the interim.

## Testing

Unit, integration, and end-to-end, with deterministic gates on coverage and correctness. Two rules carry more weight than the rest:

- **Never weaken a test to turn it green.** Fix the code, or fix the test's intent. Lowering a coverage floor or deleting an assertion to pass is reward hacking.
- **Coverage floors ratchet.** They may hold or rise, never fall. A floor rises by adding real behavioural tests, not by writing mock-only tests to hit a number.

Tautological tests, tests that only prove the mock was configured, and snapshot-everything suites are treated as defects. The catalogue is in [anti-slop/code.md](anti-slop/code.md).

## Definition of done

A change is done when it has been self-reviewed against [anti-slop/code.md](anti-slop/code.md) with **no functionality weakened**, its documentation impact is resolved per [documentation.md](documentation.md), and both its verification and validation criteria are met per [planning.md](planning.md). Green CI is verification. It is not validation.

## Branches, commits, pull requests

Work happens on a branch; the branch's pull request references its issue. No work happens off-ticket.

Individual commits within a branch need not be individually descriptive — the pull request title is what survives, because **every pull request merges to `main` by squash merge** and that title becomes the commit message. Keep history linear.

Pull request bodies carry **What**, **Why**, **How**, and **Testing**, plus the verification and validation split. Every pull request is reviewed before merge, by a human or an agent. Branch protection enforces the gate; agents may open, iterate, and merge within it.

Never bypass hooks. `--no-verify` is denied at the permission layer, not merely discouraged.

## Repository structure — Class B

New repos are pnpm monorepos:

```
apps/        top-level user-facing or internal-facing apps
packages/    shared packages, libraries, components
docs/        documentation for this repo
tooling/     scripts and maintenance files
media/       media assets
artifacts/   build output, logs, run artifacts — untracked
.claude/     agent configuration
.github/     CI, templates, provider configs
.e0l/        inherited doctrine (see ADR-0008)
```

An existing repo that does not fit records a deviation with a revisit trigger at its own `docs/deviations.md`. Restructuring a live repo with in-flight branches to satisfy layout is a destructive rewrite wearing conformance as a costume.

## Stack — Class C

Preferences, not mandates. Deviating requires an ADR in the repo.

| Area | Preference |
| --- | --- |
| Frontend | Astro with React islands, Tailwind, lightweight motion. Minimal and performance-first |
| Runtime | Bun wherever it can run the thing |
| Cloud | Cloudflare — Pages, Workers, storage, AI, networking |
| Database / backend services | Supabase where Cloudflare does not cover the case |
| Backend languages | TypeScript by default; Python for AI and ML; Go for high-performance services |
| Events | Kafka |
| Observability | Sentry, until the E0L logging SDK exists |
| Desktop | Tauri with Rust |
| Mobile | Native SwiftUI and native Jetpack Compose |
| Package manager | pnpm |

**Not permitted:** React Native, Flutter, and other cross-platform mobile frameworks. Mobile work leans on native frameworks, navigation, and conventions as far as they go.

**Vercel is prohibited.** This is the one Class C entry that is a prohibition rather than a preference, and it does not take a deviation record — it takes a dated remediation issue. The prohibition is not theoretical: `docs/runbooks/vps-gh-runner-playbook.md` §31 records that Vercel already rejects new deployments from the private `exit-zero-labs/kinnections` repository under its current plan, so the dependency is live and already degraded.
