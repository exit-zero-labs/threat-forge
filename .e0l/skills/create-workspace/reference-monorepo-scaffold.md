<!-- @format -->

# Monorepo scaffold

Reference for the `create-workspace` skill. Absorbed from the retired New Submodule Mono-Repo Directive (`docs/archive/2026-07-new-submodule-monorepo-directive.md`).

Class B: mandatory for new repos. An existing repo that does not fit records a deviation with a revisit trigger instead.

## Structure

```
apps/         deployable applications, user-facing or internal
packages/     shared libraries, components, contracts
docs/         this repo's documentation (see documentation.md)
tooling/      repo maintenance scripts
media/        media assets
artifacts/    build output, logs, run artifacts — gitignored
.claude/      agent config: settings, skills, agents
.github/      workflows, issue and PR templates, provider configs
.e0l/         inherited doctrine — never edited by hand
```

## Root files

| File | Purpose |
| --- | --- |
| `AGENTS.md` | The canonical contract. Fat, real file |
| `CLAUDE.md` | Thin pointer to `AGENTS.md` plus Claude-only notes |
| `README.md` | Public overview |
| `CONTRIBUTING.md` | Process, if the repo takes outside contributions |
| `package.json` | Workspace root; the `verify` script lives here |
| `pnpm-workspace.yaml` | Workspace globs |
| `biome.json` | Lint and format config |
| `.gitignore` | Must ignore `artifacts/`, never `.e0l/` in a public repo |

## Conventions

`kebab-case` for files and directories, `camelCase` for variables and functions, `PascalCase` for classes and components. Package names are scoped: `@<repo>/<package>`.

## The verify script

One composite command that mirrors CI exactly, so a green local run means a green pipeline:

```json
{ "scripts": { "verify": "pnpm lint && pnpm format:check && pnpm check && pnpm test && pnpm build" } }
```

Add repo-specific gates in the same order CI runs them — a schema-drift check, a docs-freshness check, an anti-slop scan over changed prose.

## Stack

Class C preferences are in `first-principles/coding.md`. Deviating needs an ADR in the repo. **Vercel is prohibited** and is the one entry that takes a remediation issue rather than a deviation record.
