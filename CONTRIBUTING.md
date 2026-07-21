# Contributing to ThreatForge

Thanks for your interest in contributing. ThreatForge is an open-source project maintained by Exit Zero Labs LLC, and we welcome contributions from the community.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/threat-forge.git`
3. Install prerequisites (see [README.md](README.md#prerequisites))
4. Install dependencies: `npm install`
5. Create a branch: `git checkout -b feat/your-feature` or `fix/your-bug`
6. Make your changes
7. Open a pull request against `main`

All pull requests are reviewed and merged by the repository owners. Only
`Shreyasdbz` and `exitzerolabs-admin` can update `main`; contributors never need direct
repository write access.

## Development Workflow

### Issue and Project Lifecycle

GitHub Issues and
[Threat Forge Project 2](https://github.com/orgs/exit-zero-labs/projects/2) are the sole
execution tracker.

| Status | Meaning |
|--------|---------|
| `To triage` | New and not yet shaped |
| `Backlog` | Triaged but not executable or selected |
| `Ready` | Criteria, dependencies, ownership, and autonomy are settled |
| `In progress` | Implementation is underway |
| `In review` | Verification and agent preflight are complete; owner validation remains |
| `Done` | Merged or closed after validation |

Every non-trivial issue receives P0/P1/P2 priority, XS–XL size, and exactly one autonomy
label:

- `Automatable` — an agent can reach a verification-complete PR without earlier human action
- `HITL` — a secret, account, provisioning step, or unresolved decision is needed

Final owner validation is required for both labels.

Issues also carry a `size/XS`–`size/XL` label mirroring the project `Size` field, and one
`model/haiku`, `model/sonnet`, or `model/opus` label naming the cheapest model that can do
the work correctly. Anything touching cryptography, IPC, the `.thf` schema, or a trust
boundary is `model/opus` regardless of size.

### Milestones

Milestones express scope, not schedule:

- **`M1 • Minimum Polish Product (MPP)`** — shipped work; closed issues and merged PRs only.
- **`M2 • General Release`** — the complete scoped feature set for general availability.
- **`M3 • V-Next`** — beyond general release; community and nice-to-have work.

New contributions that have not been scoped against the general-release cutoff go to `M3`.

### Planning by Size

- **XS/S:** the issue body is the executable specification.
- **M/L:** add a committed plan based on `docs/plans/0000-template.md` before code.
- **XL:** use a parent initiative and decompose it into executable sub-issues.

Use native `Task`, `Bug`, and `Feature` issue types. Preserve parent/sub-issue relationships and
Iteration assignments when shaping or decomposing work.

Planning and implementation should use separate contexts for M/L work. Replans append dated
history rather than replacing earlier decisions.

### Verification and Validation

Verification is deterministic evidence that the written contract was implemented: types,
lint, tests, builds, security checks, and artifacts. Validation is an owner decision that the
change solves the right problem and avoids plausible-but-wrong outcomes.

Green CI does not mean a change is done. Move work to `In review` only after verification and
agent preflight; owners perform final validation and merge.

### Branch Naming

Use Conventional Commits prefixes:

- `feat/description` -- New features
- `fix/description` -- Bug fixes
- `refactor/description` -- Code restructuring
- `chore/description` -- Build, CI, dependency changes
- `docs/description` -- Documentation only

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short description

Optional longer description.
```

Examples:
- `feat(canvas): add trust boundary grouping`
- `fix(yaml): handle missing version field on load`
- `refactor(store): split threat model store into domain slices`

### Code Style

**TypeScript:**
- Strict mode, no `any`
- Named exports only (no default exports)
- Files: `kebab-case.ts`. Components: `PascalCase`. Functions/variables: `camelCase`
- Lint and format with Biome: `npx biome check --write .`

**Rust:**
- Standard Rust conventions (`snake_case` functions, `PascalCase` types)
- No `.unwrap()` in production code
- Lint with Clippy: `cargo clippy --manifest-path src-tauri/Cargo.toml`
- Format with rustfmt: `cargo fmt --manifest-path src-tauri/Cargo.toml`

### Before Submitting a PR

1. Run the smallest targeted checks while iterating.
2. Run `npm run ci:local` before handoff.
3. Add E2E, Docker, Tauri build, signing, or live-service checks when the change requires them.
4. Run the author anti-slop pass and independent PR preflight.
5. Link the issue with `Closes #N` and the M/L plan when required.
6. Include before/after screenshots or traces for visible UI changes.
7. List owner validation steps separately from automated verification.

Commit, push, PR creation, approval, merge, and release each require explicit authorization.
Tool permissions or repository ownership do not imply authorization. Owners do not bypass
required checks, review, signed commits, thread resolution, or squash-only merging.

## What to Contribute

### Good First Issues

Look for issues labeled [`good first issue`](https://github.com/exit-zero-labs/threat-forge/labels/good%20first%20issue). These are scoped to be approachable for new contributors.

### Areas Where Help Is Needed

- **STRIDE threat rules** -- expanding the rule set for better threat coverage
- **Import/export** -- OWASP Threat Dragon `.json` import, PDF export
- **Accessibility** -- keyboard navigation, screen reader support, WCAG compliance
- **Internationalization** -- translations (once i18n architecture is in place)
- **Documentation** -- tutorials, guides, example threat models

### What We Probably Won't Accept

- Features that require a ThreatForge account or mandatory hosted backend
- Changes that break the YAML file format without a migration path
- Large refactors without prior discussion in an issue
- Dependencies that significantly increase binary size

## Reporting Bugs

Open a [bug report](https://github.com/exit-zero-labs/threat-forge/issues/new?template=bug-report.yml) with:
- Steps to reproduce
- Expected vs actual behavior
- Your OS and ThreatForge version
- The `.thf` file (if relevant and non-sensitive)

## Requesting Features

Open a [feature request](https://github.com/exit-zero-labs/threat-forge/issues/new?template=feature-request.yml) with:
- The problem you're trying to solve
- Your proposed solution (if you have one)
- Alternatives you've considered

Substantial product directions should use the
[roadmap initiative form](https://github.com/exit-zero-labs/threat-forge/issues/new?template=roadmap-initiative.yml).
Live priority and status are maintained in the
[Threat Forge project](https://github.com/orgs/exit-zero-labs/projects/2), not in external
trackers.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this standard.

## License

By contributing to ThreatForge, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE). Exit Zero Labs LLC retains copyright over the project as a whole.
