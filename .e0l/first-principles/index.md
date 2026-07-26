<!-- @format -->

# Exit Zero Labs first principles

The canonical set. Every product repo inherits these; each repo then invents its own design language, product direction, velocity, and architecture on top.

> Sources: `doctrine.md` §First Principles (retired, see [ADR-0001](../decisions/0001-doctrine-v1-adoption.md)); [ADR-0006](../decisions/0006-conformance-classes.md).

**Version:** `e0l-doctrine v1.0.0` · see [CHANGELOG](../CHANGELOG.md)

Exit Zero Labs is a solo software studio run by Shreyas Sane, building tasteful products that add value. The motto is **Ship Clean · Build Forward**: minimally designed, smooth and intuitive, highly functional, free of errors, and innovative in the problem they solve.

Operations are AI-native. Agents carry out planning, design, and implementation autonomously, within the standards set here.

## The set

| Document | Covers |
| --- | --- |
| [product.md](product.md) | Problem-obsession, milestone gating, idea validation, agent-first design, marketing ownership |
| [design.md](design.md) | Accessibility and function before aesthetics, the design language contract |
| [coding.md](coding.md) | Naming, structure, testing, the stack, branch and PR conventions |
| [operations.md](operations.md) | Automation, `--auto-mode`, model routing, execution tiers, the closed loop |
| [planning.md](planning.md) | The board taxonomy, plan artifacts, verification and validation |
| [documentation.md](documentation.md) | Where docs live, house voice, freshness enforcement |
| [anti-slop/](anti-slop/index.md) | What generated output must never look like, and how that is enforced |

## Conformance classes

Not every rule binds equally. Treating them as though they did would make the strict ones unenforceable, because the first justified exception teaches everyone that exceptions are available. Three classes, per [ADR-0006](../decisions/0006-conformance-classes.md):

**Class A — Governance.** Mandatory, no exceptions, every repo. The `.e0l/` inheritance mount, the `AGENTS.md`/`CLAUDE.md`/`copilot-instructions.md` topology, the board taxonomy, the anti-slop gate, branch and PR conventions, the verification-and-validation exit condition, documentation-freshness discipline.

**Class B — Structure.** Mandatory for new repos. An existing repo may hold a deviation record at its own `docs/deviations.md`, and that record must state a **revisit trigger** — the condition under which the deviation stops being justified. A deviation without a trigger is an exemption wearing a disguise. Monorepo layout and pnpm are Class B.

**Class C — Stack preference.** Advisory. Deviating requires an ADR in the repo. Astro, Bun, Cloudflare, Supabase, Python and Go, Kafka, Sentry, Tauri, native SwiftUI and Jetpack Compose are Class C.

One Class C item is a prohibition rather than a preference: **Vercel is not used.** It does not get a deviation record; it gets a dated remediation issue.

Adoption state and outstanding debt for every repo live in `Tooling/conformance.yml`. That file is the honest ledger — a conformance check that is permanently red is a check nobody reads.

## How this set changes

Amendment is a procedure, not an edit. The `doctrine-amend` skill enforces the ordering:

1. Open an issue on the workspace board.
2. Write an ADR in `docs/decisions/`, stating the decision, its consequences, **and the alternative that was rejected and why**.
3. Edit the affected documents here.
4. Append a line to [CHANGELOG.md](../CHANGELOG.md).
5. Bump `.e0l/VERSION` and run `Tooling/Scripts/e0l-export.sh`. The resulting `manifest.json` diff is the reviewable proof of what actually propagates.
6. Merge. Publication and per-repo sync pull requests follow.

Versioning is `vMAJOR.MINOR.PATCH`. **MAJOR** is a Class A change and every adopted repo must sync before its next merge. **MINOR** adds a principle or changes Class B or C; a sync pull request opens but nothing is blocked. **PATCH** is wording.

Once a decision has shipped, supersede it rather than editing it.

## Supersedes

This set replaces three documents, all retired to [`docs/archive/`](../archive/): the ephemeral `doctrine.md`, the Project Management Directive, and the Brand Directive. Their absorbed and overridden content is itemised in [ADR-0001](../decisions/0001-doctrine-v1-adoption.md).
