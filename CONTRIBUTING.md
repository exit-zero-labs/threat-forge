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
| `Backlog` | Filed but not yet shaped. Never picked up directly |
| `Ready` | Criteria, dependencies, ownership, and autonomy are settled |
| `In progress` | Claimed. Held through the whole PR cycle, including the window where verification and preflight are done and only owner validation remains |
| `Done` | Merged and validated on a local `main`, or rejected with the `Reject` label |

There are four states and no `In review`: for a solo studio there is nobody to hand to, so an
issue stays `In progress` until it merges.

Every non-trivial issue receives an `Urgent`/`High`/`Medium`/`Low` `Priority`, a
`High`/`Medium`/`Low` `Effort`, a `Task`/`Bug`/`Feature` `Type`, and exactly one
autonomy label:

- `AUTO` — an agent can reach a verification-complete PR without earlier human action
- `HITL` — a secret, account, provisioning step, or unresolved decision is needed

Final owner validation is required for both labels.

Issues also carry one `model/haiku`, `model/sonnet`, or `model/opus` label naming the cheapest
model that can do the work correctly. These map one-to-one onto `Effort` — Low, Medium, High —
and anything touching cryptography, IPC, the `.thf` schema, or a trust boundary is `model/opus`
and `High` regardless of how small the diff looks.

### Milestones

Milestones express scope, not schedule:

- **`M0 • POC`** — retroactive; the pre-repository prototype phase. Closed, with no tracked issues.
- **`M1 • Alpha`** — shipped work; closed issues and merged PRs only.
- **`M2 • Beta`** — the complete scoped feature set for launch.
- **`M3 • Release 1`** — beyond launch; community and nice-to-have work.

New contributions that have not been scoped against the launch cutoff go to `M3 • Release 1`.

### Planning by Effort

- **Low:** the issue body is the executable specification. No research dependency, by definition — if it turns out to need a web search or an unfamiliar library, it is Medium.
- **Medium:** add a committed plan based on `docs/plans/0000-template.md` before code.
- **High:** add a committed plan, and decompose into executable sub-issues.

Use native `Task`, `Bug`, and `Feature` issue types. Preserve parent/sub-issue relationships and
Iteration assignments when shaping or decomposing work.

Planning and implementation should use separate contexts for Medium and High work. Replans append
dated history rather than replacing earlier decisions.

### Verification and Validation

Verification is deterministic evidence that the written contract was implemented: types,
lint, tests, builds, security checks, and artifacts. Validation is an owner decision that the
change solves the right problem and avoids plausible-but-wrong outcomes.

Green CI does not mean a change is done. Work moves to `In progress` when you claim it, before
you start, and stays there through verification and preflight; owners perform final validation
and merge.

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
3. Add E2E, Docker, Tauri build, signing, or live-service checks when the change requires them. For
   a browser-facing UI change, run the relevant scenario in
   [docs/runbooks/running-agent-e2e-scenarios.md](docs/runbooks/running-agent-e2e-scenarios.md)
   (`npm run test:e2e:agent -- <scenario>`) and inspect its evidence before handoff.
4. Run the author anti-slop pass and independent PR preflight.
5. Link the issue with `Closes #N`, and the plan when one is required.
6. Include before/after screenshots or traces for visible UI changes.
7. List owner validation steps separately from automated verification.

If a CI check goes red, triage it with
[docs/runbooks/diagnosing-ci-failures.md](docs/runbooks/diagnosing-ci-failures.md) before
rerunning anything.

Commit, push, PR creation, approval, merge, and release each require explicit authorization.
Tool permissions or repository ownership do not imply authorization. Required status checks
and squash-only merging are never bypassed.

Contributor pull requests always require a code-owner review. During an explicitly
authorized autonomous agent run, the owner may direct the agent to merge its own
verification-complete pull requests with `--admin`, which waives only that review
requirement; see `AGENTS.md` for the conditions that still apply.

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
