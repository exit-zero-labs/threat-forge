---
name: create-workspace
description: Scaffold a new Exit Zero Labs product repo as a submodule — create the GitHub repo, the monorepo skeleton, the agent-instruction topology, the doctrine mount, and the Project board with its milestone ladder and fields. Use when a researched idea has been commissioned and needs a repository.
---

# Create a product workspace

Scaffolds a submodule under `Repos/` that is doctrine-conformant from its first commit. New repos meet Class B in full — the deviation route exists for repos predating the doctrine, not for new ones.

## Guardrails

1. **Never run against an existing repo.** This creates; it does not retrofit. Adopting an existing repo is `propagate-doctrine`.
2. **Confirm name and visibility before creating anything.** Visibility decides the propagation profile and is painful to change once the board and remote exist.

## Procedure

1. Confirm the idea was researched and commissioned. No exploration in `docs/explorations/` means run `research-idea` first.
2. Agree the repo name (`kebab-case`) and visibility.
3. `Tooling/Scripts/new-submodule.sh --create <name>` (add `--public` when public).
4. Scaffold the Class B skeleton — `apps/ packages/ docs/ tooling/ media/ artifacts/`, pnpm workspace, Biome, a verify script. See `reference-monorepo-scaffold.md`.
5. Write the instruction topology: a fat `AGENTS.md`, a thin `CLAUDE.md`, a thin `.github/copilot-instructions.md`. No symlinks between them ([ADR-0005](../../../docs/decisions/0005-agents-md-canonical.md)).
6. `Tooling/Scripts/e0l-propagate.sh <name>` — reads visibility and picks the profile itself.
7. Create the board: Project from the template, the `M0 • POC` … `M3 • Release 1` ladder, `AUTO` and `HITL` labels, issue and PR templates carrying the verification/validation split. See `reference-github-setup.md`.
8. Add the repo to `Tooling/conformance.yml` with `adopted: true` and no deviations.
9. Update the repo table in the workspace `README.md`.
10. Verify: `Tooling/Scripts/e0l-verify.sh <name>` exits 0; for a public repo `find . -type l -not -path './.git/*'` is empty.
