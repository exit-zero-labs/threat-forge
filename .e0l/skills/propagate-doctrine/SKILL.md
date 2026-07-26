---
name: propagate-doctrine
description: Push the current doctrine version out to product repos and open their sync pull requests. Use after a doctrine amendment merges, when adopting a repo for the first time, or when the drift check reports a repo behind. Handles the private-symlink and public-vendored profiles.
---

# Propagate the doctrine

Moves the exported `.e0l/` payload into product repos and raises the sync pull requests.

## Guardrails

1. **Never propagate into a dirty, detached, or mid-rebase working tree.** `e0l-propagate.sh` refuses these, and that refusal is what stops uncommitted work in a dormant repo being destroyed. Resolve the repo's state instead of working around it.
2. **Never hardcode visibility.** It is read live from `gh repo view`, so a repo flipped to public is caught. A stale list is how a public repo ships a dangling symlink.

## Procedure

1. `Tooling/Scripts/e0l-preflight.sh` — must exit 0.
2. `Tooling/Scripts/e0l-export.sh` — rebuild `.e0l/`, regenerate `manifest.json`, confirm `VERSION`.
3. `Tooling/Scripts/e0l-propagate.sh <repo>...` — applies the profile per visibility:
   - **private** — a relative `.e0l` symlink **plus** the CI step that materialises the payload. That step is mandatory: the symlink escapes the repo root and always dangles in hosted CI ([ADR-0002](../../../docs/decisions/0002-propagation-by-visibility.md)).
   - **public** — payload vendored as real files, with the drift workflow and a `CODEOWNERS` entry. **Zero symlinks anywhere.**
4. `Tooling/Scripts/e0l-verify.sh`. For a public repo confirm `find . -type l -not -path './.git/*'` returns nothing.
5. One PR per repo: branch `chore/e0l-doctrine-v{version}`, title `chore(e0l): sync doctrine bundle to v{version}`, body stating the version delta.
6. Update each repo's row in `Tooling/conformance.yml`.

Only repos marked `adopted: true` are synced. Adopting a new repo is a deliberate, separately reviewed change — never flip `adopted` as a side effect of a sync run.
