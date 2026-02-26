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

## Development Workflow

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

1. Run lint checks:
   ```bash
   npx biome check .
   cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
   ```

2. Run tests:
   ```bash
   npx vitest --run
   cargo test --manifest-path src-tauri/Cargo.toml
   ```

3. Make sure the app builds:
   ```bash
   npm run tauri build
   ```

## What to Contribute

### Good First Issues

Look for issues labeled [`good first issue`](https://github.com/exit-zero-labs/threat-forge/labels/good%20first%20issue). These are scoped to be approachable for new contributors.

### Areas Where Help Is Needed

- **STRIDE threat rules** -- expanding the rule set for better threat coverage
- **Import/export** -- converters for Microsoft TMT `.tm7` and OWASP Threat Dragon `.json`
- **Accessibility** -- keyboard navigation, screen reader support, WCAG compliance
- **Internationalization** -- translations (once i18n architecture is in place)
- **Documentation** -- tutorials, guides, example threat models

### What We Probably Won't Accept

- Features that require a cloud backend or SaaS infrastructure
- Changes that break the YAML file format without a migration path
- Large refactors without prior discussion in an issue
- Dependencies that significantly increase binary size

## Reporting Bugs

Open a [bug report](https://github.com/exit-zero-labs/threat-forge/issues/new?template=bug-report.yml) with:
- Steps to reproduce
- Expected vs actual behavior
- Your OS and ThreatForge version
- The `.threatforge.yaml` file (if relevant and non-sensitive)

## Requesting Features

Open a [feature request](https://github.com/exit-zero-labs/threat-forge/issues/new?template=feature-request.yml) with:
- The problem you're trying to solve
- Your proposed solution (if you have one)
- Alternatives you've considered

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this standard.

## License

By contributing to ThreatForge, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE). Exit Zero Labs LLC retains copyright over the project as a whole.
