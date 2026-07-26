<!-- @format -->

# Deviations from the Exit Zero Labs doctrine

Recorded departures from the inherited standards. Every entry states a **revisit trigger** — the condition under which the deviation stops being justified. A deviation without a trigger is an exemption in disguise, so an entry missing one is itself a defect.

Class definitions are in `.e0l/first-principles/index.md`. Class A is not deviable.

## Structure: single application, npm rather than a pnpm monorepo

**Class:** B (structure)
**Recorded:** 2026-07-25
**Status:** Active

The doctrine specifies a pnpm monorepo with `apps/` and `packages/`. ThreatForge is a single Vite + React application with a Rust `src-tauri/`, a `worker/`, an `e2e/` suite, and a root `wrangler.jsonc`, built on npm with `package-lock.json`.

**Why it stands.** Restructuring would invalidate the lockfile, break the self-hosted runner's dependency cache, rewrite every `src-tauri` and `wrangler.jsonc` path, and put every in-flight branch into unresolvable conflict. That is a destructive rewrite wearing conformance as a costume — the layout would match while the repository got worse.

The rules the layout exists to serve are met without it: one build, one test suite, one verify command, and a single place each concern lives.

**Revisit trigger:** when ThreatForge gains a second deployable application, or a shared module consumed by more than one of `src/`, `worker/`, and `src-tauri/`. At that point the monorepo layout starts paying for itself and this deviation should be closed.

## Labels: `area:*` and `model/*` retained

**Class:** A (board taxonomy)
**Recorded:** 2026-07-25
**Status:** Active

The taxonomy defines exactly two labels, `AUTO` and `HITL`, on the grounds that every other dimension is a native field. ThreatForge keeps two additional families.

**`area:*`** — roughly 25 surface labels. They are orthogonal to every board field and are the only way an outside contributor to a public repository can filter by surface. No field expresses this.

**`model/*`** — `haiku`, `sonnet`, `opus`. These state the reasoning class a task needs, which is what the `Effort` field means. They are kept because they are currently the **more accurate** source: during the doctrine v1 migration they disagreed with the Size-derived Effort on 53 issues and covered 9 issues that had no Size at all, so `Effort` was re-derived from them.

**Revisit trigger for `model/*`:** once triage has re-confirmed `Effort` on the open backlog directly, the labels become redundant and should be deleted. `area:*` has no revisit trigger; it is expected to stay.
