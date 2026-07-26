<!-- @format -->

# Coding

The architecture and conventions every Exit Zero Labs repo inherits. Written for a studio where most code is generated, which changes what the rules have to be good at: they exist to make wrong code *visible*, not to make right code elegant.

> Sources: `doctrine.md` §coding (retired); the New Submodule Mono-Repo Directive (retired, see [`docs/archive/`](../archive/2026-07-new-submodule-monorepo-directive.md)); Project Postcard `AGENTS.md`; [ADR-0006](../decisions/0006-conformance-classes.md). External references are cited under [Sources](#sources).

## Architecture principles

Six, in priority order. When two conflict, the earlier wins.

### 1. Make illegal states unrepresentable, then validate at the boundary anyway

Types are a design tool, not a runtime guarantee. **Data crossing a network boundary is untrusted regardless of how strong the types are** — a `User` type says nothing about what a webhook actually sent.

So: model the domain so wrong states cannot be constructed, *and* parse untrusted input at every edge. The two are not redundant. Types catch the mistakes you make; parsing catches the ones the world makes.

Every trust boundary parses: HTTP handlers, webhooks, queue consumers, form submissions, and anything read from storage that an earlier schema version may have written.

### 2. Contracts live once, and the schema is the contract

Cross-surface types live in a single shared package — `packages/contracts` in a monorepo — as Zod schemas with types **inferred** from them, never hand-written alongside them. One definition produces both the runtime validator and the static type, so they cannot drift.

The frontend imports the same schema the backend validates against. That is what makes client-side validation trustworthy rather than a duplicated guess.

**Version contracts rather than mutating them.** Introduce `SubscriptionV2` instead of silently changing `Subscription`; consumers migrate deliberately. A contract change that compiles everywhere is a contract change nobody reviewed.

### 3. Static by default; interactivity is opt-in and small

For Astro frontends: **assume the browser receives plain HTML unless you can show the user benefits from JavaScript.** Islands are for the parts that genuinely need state or events — search, filters, forms, editors.

- Use `.astro` for layouts, navigation, footers, and anything without client-side behaviour.
- Keep islands **small and self-contained**. A large monolithic island defeats the point of partial hydration.
- **Do not default to `client:load`.** Ask when the user actually needs the behaviour: `client:visible` for below the fold, `client:idle` for non-critical. `client:load` is for what must work before first paint.

The measure is Core Web Vitals on the deployed page, not bundle size in isolation.

### 4. Choose storage by consistency requirement, not by familiarity

The most consequential architectural decision on Cloudflare, and the one most often made by habit.

| Need | Use | Because |
| --- | --- | --- |
| Relational data, queries, joins | **D1** | SQL with global read replication |
| Strongly consistent per-entity state with compute attached | **Durable Objects** | One room, one session, one accurate counter |
| Fast global reads of rarely-changing values | **KV** | Config, flags, session tokens |
| Blobs — images, archives, exports | **R2** | No egress fees |
| Async work, retries, batching | **Queues** | Decouples the request from the work |
| Multi-step operations that must survive failure | **Workflows** | Durable execution; steps resume rather than restart |

**KV is eventually consistent** — a write can take up to 60 seconds to propagate globally. Fine for feature flags; fatal for a counter, an inventory, or anything a user just changed and expects to see. When a write must be immediately visible, use D1 or a Durable Object.

Reach for Workflows when an operation is long, multi-step, and must not lose progress. Reach for Durable Objects when you need direct state access, WebSockets, or real-time coordination.

### 5. Side effects are idempotent, or they are wrapped

Anything retriable will be retried: queue consumers, workflow steps, webhook handlers, CI jobs. A side effect that is not idempotent is a duplicate charge, a duplicate email, or a corrupted count waiting for a retry.

Either make the effect idempotent — natural keys, conditional writes, unique constraints — or place it inside the durable step that owns its retry semantics. A best-effort side effect placed inside the `try` block it is meant to survive is a common and quiet defect.

### 6. Boring until measured

Prefer the simplest thing that satisfies the spec. Add an abstraction when a **second real caller** exists, not in anticipation of one. Add a cache when a measurement shows the read is hot, not because caching is generally good.

This matters more with generated code than without it: a model asked to build something will happily produce a factory, an interface, and an options object for a single call site, and each is a thing to maintain forever.

## Naming

| Thing | Convention |
| --- | --- |
| Files and directories | `kebab-case` |
| Variables and functions | `camelCase` |
| Classes, components, types | `PascalCase` |
| Constants | `SCREAMING_SNAKE_CASE` |
| Database tables and columns | `snake_case` |
| Packages | `@{repo}/{package}` |
| Branches | `feat/` · `bug/` · `task/` + issue number + short slug |

Names state what a thing *is*, not what it is made of. `subscriberEmail` over `emailString`; `SuppressionList` over `EmailArray`.

## Structure

**Single responsibility.** A unit needing "and" to describe it is two units.

**Docstrings on anything a caller cannot infer** — purpose, parameters, return, and the constraints absent from the signature. A docstring restating the signature is noise; see the comment-slop tell in [anti-slop/code.md](anti-slop/code.md).

**Comment the *why*, never the *what*.** The non-obvious invariant, the workaround and its cause, the link to the decision. Code says what it does; only a comment can say why it does it that way.

**Dependencies point inward.** Domain logic does not import a framework, a request object, or a storage client. It takes values and returns values — which is also what makes it testable without a runtime.

**Pure core, effectful shell.** Push logic into functions that take data and return data; keep I/O thin at the edge. This is what makes coverage meaningful rather than a proxy for how much of the app was booted.

## Testing

Tests exist to catch wrong behaviour. Everything else about them is secondary.

### Run tests in the runtime you deploy to

For Workers, run the suite **inside `workerd`** via the Vitest pool rather than in Node against mocks. A test passing in a runtime you do not ship is evidence about a program you did not write. The principle generalises: real D1 over a fake database, a real renderer over a stub, a real browser for anything visual.

### The shape

| Level | Tests | Against |
| --- | --- | --- |
| **Unit** | Pure logic, edge cases, error paths | Direct calls, no I/O |
| **Integration** | One surface end to end | Real local bindings — D1, R2, KV via Miniflare |
| **End-to-end** | A user's actual journey | A running app, real browser, faked *external* providers only |

Fake the third party you do not control. Do not fake your own database.

### Rules that bind

- **Never weaken a test to turn it green.** Fix the code, or fix the test's intent. Loosening an assertion, deleting a case, or pinning the expectation to current behaviour is reward hacking — it converts a failing test into a passing lie.
- **Coverage floors ratchet.** They hold or rise, never fall, and they rise by adding real behavioural tests — never by writing mock-only tests to reach a number.
- **A bug fix ships with a test that fails without it.** Otherwise the fix is unverified and the bug is unprotected against return.
- **Assert on behaviour, not implementation.** A test that breaks on a rename with no behaviour change is a maintenance tax; a test that passes for any implementation is not a test.

The catalogue of test failures we reject — tautological tests, testing the mock, snapshot-everything — is in [anti-slop/code.md](anti-slop/code.md).

## Errors and observability

**Fail loudly at boundaries, gracefully at the surface.** An unexpected state throws where it is detected; the outermost layer decides what the user sees. A `catch` that swallows and continues turns a diagnosable failure into a silent wrong answer.

**Errors are typed and enumerated.** A bounded set of codes, not free-text strings compared with `includes()`. Callers branch on codes; humans read messages.

**Never put user data in an error message or a log line.** Log identifiers, not identities. Anything that could be a subscriber's email, name, or content is redacted at the logging boundary — not at each call site, where it will eventually be forgotten.

**Structured logs with consistent fields.** Every line carries the request or run identifier that makes correlation possible. Logging serves usage metrics, health, and debugging, and the shape must be consistent across repos so one query works everywhere.

The standing goal is a single Exit Zero Labs logging SDK; Sentry is the interim.

## Security

Stated disproportionately because generated code defaults to the permissive option.

- **Secrets never enter the repo, a log, an error, or a test fixture.** Not in an example file, not commented out.
- **Least privilege by default** — a token scoped to one bucket; a workflow with `permissions: contents: read` until it needs more.
- **Every external input is parsed** before it reaches logic ([principle 1](#1-make-illegal-states-unrepresentable-then-validate-at-the-boundary-anyway)).
- **Never build a query, command, or path by concatenating untrusted input.**
- **Attacker-controlled keys never index a plain object.** Prototype pollution is a real class; a `Map` or a null-prototype object removes it.
- **Authorization is enforced at the data edge**, not only in the UI. A hidden button is not a permission.
- **Dependencies are pinned and reviewed.** CI actions are pinned by commit SHA, not by tag.

Anything touching money, auth, sessions, secrets, or subscriber data is `Effort: High` regardless of diff size, and never `AUTO` without a human in the loop.

## Definition of done

A change is done when **all** hold:

1. Its deterministic verification criteria pass and CI is green.
2. It has been self-reviewed against [anti-slop/code.md](anti-slop/code.md) with **no functionality weakened**.
3. Affected documentation is updated, or a `Docs-Impact: none (<reason>)` trailer records why not.
4. A human has read the diff and confirmed it does the right thing.

**Green CI is verification. It is not validation.** See [operations.md](operations.md#verification-and-validation).

## Branches, commits, pull requests

Work happens on a branch; its pull request references its issue. No work happens off-ticket.

**Squash merge only.** The pull request title becomes the commit message and is what survives, so commits inside a branch need not be individually descriptive. History stays linear.

Pull request bodies carry **What**, **Why**, **How**, and **Testing**, plus the verification and validation split. Every pull request is reviewed before merge, by a human or an agent; branch protection enforces the gate.

**Never bypass hooks.** `--no-verify` is denied at the permission layer, not merely discouraged.

Agent-authored commits carry a `Co-Authored-By` trailer naming the model — provenance is part of the audit trail, not decoration ([operations.md](operations.md#provenance)).

## Repository structure — Class B

New repos are pnpm monorepos:

```
apps/        deployable applications, user-facing or internal
packages/    shared libraries, components, contracts
docs/        this repo's documentation
tooling/     repo maintenance scripts
media/       media assets
artifacts/   build output, logs, run artifacts — gitignored
.claude/     agent configuration
.github/     CI, templates, provider configs
.e0l/        inherited doctrine — generated, never edited by hand
```

One composite `verify` script mirrors CI exactly, in the same order, so a green local run means a green pipeline. If the two can diverge they will, and the local one is the one people will trust.

An existing repo that does not fit records a deviation with a **revisit trigger** at its own `docs/deviations.md`. Restructuring a live repo with in-flight branches to satisfy a layout is a destructive rewrite wearing conformance as a costume.

## Stack — Class C

Preferences. Deviating requires an ADR in the repo.

| Area | Preference |
| --- | --- |
| Frontend | Astro with React islands, Tailwind, lightweight motion |
| Runtime | Bun wherever it can run the thing |
| Cloud | Cloudflare — Workers, Pages, D1, R2, KV, Queues, Workflows |
| Database beyond Cloudflare | Supabase |
| Backend languages | TypeScript by default; Python for AI and ML; Go for high-performance services |
| Events | Kafka |
| Observability | Sentry, until the E0L logging SDK exists |
| Desktop | Tauri with Rust |
| Mobile | Native SwiftUI and native Jetpack Compose |
| Package manager | pnpm |

**Not permitted:** React Native, Flutter, and other cross-platform mobile frameworks.

**Vercel is prohibited** — the one Class C entry that is a prohibition rather than a preference, and it takes a dated remediation issue rather than a deviation record. Not theoretical: [`docs/runbooks/vps-gh-runner-playbook.md`](../runbooks/vps-gh-runner-playbook.md) §31 records that Vercel already rejects new deployments from the private `exit-zero-labs/kinnections` repository on its current plan.

## Sources

- [Astro — Islands architecture](https://docs.astro.build/en/concepts/islands/)
- [Cloudflare — Choosing a data or storage product](https://developers.cloudflare.com/workers/platform/storage-options/)
- [Cloudflare — Workflows: durable execution on Workers](https://blog.cloudflare.com/building-workflows-durable-execution-on-workers/)
- [Cloudflare — Improved Workers testing via Vitest and workerd](https://blog.cloudflare.com/workers-vitest-integration/)
- [Cloudflare — Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [LogRocket — TypeScript at scale in 2026](https://blog.logrocket.com/typescript-at-scale-2026/)
