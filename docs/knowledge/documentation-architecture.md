# Documentation information architecture

Status: Canonical policy. Last updated: 2026-07-22. Owner: maintainers.

This document is the single canonical information-architecture (IA) and source-of-truth
policy for ThreatForge documentation. It assigns every existing documentation surface an
explicit disposition, names one canonical owner for every mutable fact, fixes the GitHub
Wiki handbook page map and boundaries, defines how shipped behavior is distinguished from
planned direction and history, and hands issues `#159`, `#160`, `#161`, and `#162`
measurable contracts and a fixed execution order.

It follows `AGENTS.md` and `.github/instructions/docs.instructions.md`: sentence-case
headings, ISO `YYYY-MM-DD` dates, canonical sources are linked rather than copied, and
current behavior is separated from verified evidence, proposals, and history.

## Scope and non-goals

This artifact is a design and policy contract. It does **not**:

- edit, refresh, move, or delete any inventoried document's content (that is `#159`,
  `#160`, and `#162` work);
- create handbook pages, `Home.md`, `_Sidebar.md`, or any Wiki content (`#160`, `#161`);
- add a publishing workflow or touch `.github/workflows/**` (`#161`);
- change product behavior, the `.thf` schema, or any code under `src/**` or `src-tauri/**`;
- rewrite `docs/archive/**` or any historical record;
- mutate GitHub state (labels, project fields, issue bodies, Wiki) or open a pull request.

The implementation adds only this artifact; the required issue plan is a separate planning
record.

### Planned is never shown as shipped

Per `AGENTS.md` ("Verification is not validation") and
`.github/instructions/docs.instructions.md`, no document may present planned functionality
as shipped behavior. Every capability claim is either verified against a named evidence
source and marked shipped, or explicitly labeled planned with a link to
`docs/plans/roadmap.md` or a canonical issue. Command results and precision are never
fabricated. This invariant governs every disposition and downstream contract below.

## How to read this document

Every documentation file receives exactly **one** primary disposition from the closed set
below, plus zero or more optional flags. A closed vocabulary is what makes coverage
measurable for `#159`–`#162`.

### Disposition vocabulary (closed set)

| Disposition | Definition | Lifecycle rule |
|-------------|------------|----------------|
| `repository-canonical` | The authoritative source for its facts, versioned in this repository. | Edited only through pull request; other surfaces link to it and never copy its mutable facts. |
| `wiki-facing-source` | Repository-versioned source for a user-facing handbook page, authored under `docs/wiki/`. | Reviewed via pull request in the repo; published to the GitHub Wiki by `#161`. The published Wiki is a mirror, never an independent source. |
| `historical` | A read-only record of a past decision or execution. | Never rewritten to read as current state; preserved verbatim. |
| `generated` | Derived from a canonical source (an adapter pointer or a build/publish output). | Never hand-edited as truth; regenerated from its canonical source. |
| `superseded` | Replaced by a newer canonical source but retained for traceability. | Marked with its replacement; not treated as current. No file currently holds this disposition; it exists so future replacements are labeled rather than silently deleted. |
| `internal-strategy` | Repository-canonical internal strategy or planning knowledge that is not user-facing and is not authoritative for shipped behavior. | Edited through pull request; never published to the user handbook and never cited as a capability source. |

### Optional flags

| Flag | Meaning |
|------|---------|
| `verify` | At least one claim in the file must be checked against code, tests, CI, or config before it is republished or cited. |
| `contains-planned` | The file mixes shipped and future material; the future material must stay explicitly labeled (see "shipped vs planned vs history"). |
| `transitional` | Canonical today, but slated to change role or destination via a named downstream issue. |

## Documentation inventory and classification

Verified by directory inspection on 2026-07-22 (`find docs -name '*.md'`, root `*.md`,
`.github`). Every root and `docs/**` Markdown document that currently exists is classified
below, including this artifact and the `#158` plan. Volatile counts (line counts, exact
provider lists, test totals) are intentionally omitted here per the source-of-truth rule.

### Root governance, legal, and engineering contracts

| Path | Audience | Disposition | Flags | Canonical owner | Downstream issue |
|------|----------|-------------|-------|-----------------|------------------|
| `README.md` | Users + contributors | `repository-canonical` | `transitional` (→ identity + navigation landing) | Maintainers | `#162` |
| `CONTRIBUTING.md` | Contributors | `repository-canonical` | — | Maintainers | — (stays in repo; `#144` non-goal to move) |
| `SECURITY.md` | Users + researchers | `repository-canonical` | — | Maintainers | — (canonical security-policy source) |
| `CODE_OF_CONDUCT.md` | Community | `repository-canonical` | — | Maintainers | — |
| `LICENSE` | All | `repository-canonical` (legal, static) | — | Exit Zero Labs LLC | — |
| `NOTICE` | All | `repository-canonical` (legal, static) | — | Exit Zero Labs LLC | — |
| `AGENTS.md` | Agents + contributors | `repository-canonical` (engineering-process source of truth) | — | Maintainers | `#159` may add a pointer to this IA after owner validation |
| `CLAUDE.md` | Claude agent | `generated` (adapter pointer to `AGENTS.md`) | — | Maintainers | — |

`LICENSE` and `NOTICE` are not Markdown and fall outside the deterministic Markdown
coverage check, but are recorded here for completeness of ownership.

### `.github` adapters, instructions, and templates

| Path | Audience | Disposition | Flags | Canonical owner | Downstream issue |
|------|----------|-------------|-------|-----------------|------------------|
| `.github/copilot-instructions.md` | Copilot agent | `generated` (adapter pointer to `AGENTS.md` + `.github/instructions/**`) | — | Maintainers | — |
| `.github/instructions/**` (e.g. `.github/instructions/docs.instructions.md`) | Agents + contributors | `repository-canonical` (path-specific rules) | — | Maintainers | — |
| `.github/PULL_REQUEST_TEMPLATE.md` | Contributors | `repository-canonical` (template) | — | Maintainers | — |
| `.github/ISSUE_TEMPLATE/**` | Contributors | `repository-canonical` (templates) | — | Maintainers | — |
| `.github/agents/**`, `.github/skills/**` | Agents | `repository-canonical` (agent/skill definitions) | — | Maintainers | — |
| `.claude/**` adapters (`.claude/rules/**`, `.claude/agents`, `.claude/skills`) | Claude agent | `generated` (thin pointers; canonical = `AGENTS.md` + `.github/instructions/**`) | — | Maintainers | — |

The canonical engineering source is `AGENTS.md` plus `.github/instructions/**`. `CLAUDE.md`,
`.github/copilot-instructions.md`, and `.claude/**` are `generated` adapters that must remain
thin pointers and never redefine policy.

### `docs/knowledge/` — product and engineering knowledge

| Path | Audience | Disposition | Flags | Canonical owner | Downstream issue |
|------|----------|-------------|-------|-----------------|------------------|
| `docs/knowledge/architecture.md` | Contributors | `repository-canonical` (architecture contract, named in `AGENTS.md`) | — | Maintainers | `#159` refresh; handbook links, never copies |
| `docs/knowledge/file-format.md` | Contributors | `repository-canonical` (sole `.thf` contract, named in `AGENTS.md`) | — | Maintainers | `#159` refresh; handbook `.thf concepts` links only |
| `docs/knowledge/glossary.md` | Users + contributors | `repository-canonical` (glossary terms source) | — | Maintainers | `#160` links/derives, does not fork |
| `docs/knowledge/overview.md` | Users | `repository-canonical` (current product overview) | `verify`, `contains-planned`, `transitional` (→ handbook input, then a non-duplicative repository pointer) | Maintainers | `#159` verifies/removes duplicate claims; `#160` uses as handbook input |
| `docs/knowledge/product-design.md` | Internal | `internal-strategy` | `verify`, `contains-planned` | Maintainers | `#159` verifies current claims and labels future material |
| `docs/knowledge/go-to-market.md` | Internal | `internal-strategy` | — | Maintainers | — |
| `docs/knowledge/market-analysis.md` | Internal | `internal-strategy` | `verify` | Maintainers | `#159` verifies market and capability claims |
| `docs/knowledge/risks.md` | Internal | `internal-strategy` | `verify` | Maintainers | `#159` verifies current technical claims |
| `docs/knowledge/mcp-server.md` | Contributors | `repository-canonical` | `verify` | Maintainers | `#159` refresh against `src-tauri/src/mcp/**` |
| `docs/knowledge/documentation-architecture.md` | Contributors | `repository-canonical` (this IA and source-of-truth policy) | — | Maintainers | referenced by `#159`–`#162` |

`docs/knowledge/mcp-server.md` documents **shipped** behavior, not a proposal: the MCP
server is present in code and tests (`src-tauri/src/mcp/server.rs`,
`src-tauri/src/bin/threatforge-mcp.rs`, `src-tauri/tests/mcp_stdio.rs`, and
`rmcp = { version = "2.2", ... }` in `src-tauri/Cargo.toml`, verified 2026-07-22). Its
`verify` flag means `#159` re-checks the described surface against that code.

No current file is a `wiki-facing-source`: `docs/wiki/` does not exist until `#160` creates
it. `overview.md` and `glossary.md` are repository-canonical inputs to that work, not handbook
sources themselves.

The `internal-strategy` set (`product-design`, `go-to-market`, `market-analysis`, `risks`)
is repository-canonical but never user-facing or authoritative for shipped behavior.
`internal-strategy` is distinct from `repository-canonical` precisely so these files are not
mistaken for handbook or capability sources; its `verify` flags identify existing claims
that `#159` must reconcile.

### `docs/quality/` — quality doctrine

| Path | Audience | Disposition | Flags | Canonical owner | Downstream issue |
|------|----------|-------------|-------|-----------------|------------------|
| `docs/quality/agentic-slop.md` | Agents + contributors | `repository-canonical` (doctrine, named in `AGENTS.md`) | — | Maintainers | — |
| `docs/quality/ai-output-quality.md` | Agents + contributors | `repository-canonical` (method, named in `AGENTS.md`) | `contains-planned` (explicitly "not a production gate yet") | Maintainers | `#159` keeps forward-looking scope labeled |

### `docs/runbooks/` — operational runbooks

All runbooks are `repository-canonical` operational sources owned by maintainers.

| Path | Disposition | Flags |
|------|-------------|-------|
| `docs/runbooks/adding-a-feature.md` | `repository-canonical` | — |
| `docs/runbooks/configuring-release-signing.md` | `repository-canonical` | `contains-planned` (mixes shipped setup and remaining owner/implementation work) |
| `docs/runbooks/debugging-tauri-ipc.md` | `repository-canonical` | — |
| `docs/runbooks/deploying-the-website.md` | `repository-canonical` | — |
| `docs/runbooks/diagnosing-ci-failures.md` | `repository-canonical` | — |
| `docs/runbooks/onboarding-a-contributor.md` | `repository-canonical` | — |
| `docs/runbooks/releasing-a-version.md` | `repository-canonical` | — |
| `docs/runbooks/responding-to-issues.md` | `repository-canonical` | — |
| `docs/runbooks/schema-migration.md` | `repository-canonical` | — |

### `docs/plans/` — planning system

`docs/plans/roadmap.md` is `repository-canonical` and the **canonical future-direction
source**. `docs/plans/0000-template.md` and `docs/plans/README.md` are the
`repository-canonical` plan contract and planning index. Issue-specific
`<issue>-<slug>.md` plans are `repository-canonical` planning records: they append replan
history and are execution contracts, never presented as shipped state or used to infer live
issue status.

| Path | Disposition | Flags |
|------|-------------|-------|
| `docs/plans/roadmap.md` | `repository-canonical` (canonical future direction) | — |
| `docs/plans/0000-template.md` | `repository-canonical` (plan contract) | — |
| `docs/plans/README.md` | `repository-canonical` (planning index) | — |
| `docs/plans/53-document-registry.md` | `repository-canonical` (issue plan) | — |
| `docs/plans/54-multi-tab-workspace.md` | `repository-canonical` (issue plan) | — |
| `docs/plans/56-indexeddb-persistence.md` | `repository-canonical` (issue plan) | — |
| `docs/plans/57-architecture-model.md` | `repository-canonical` (issue plan) | — |
| `docs/plans/58-panel-information-architecture.md` | `repository-canonical` (issue plan) | — |
| `docs/plans/59-component-icon-registry.md` | `repository-canonical` (issue plan) | — |
| `docs/plans/61-ai-conversation-protocol.md` | `repository-canonical` (issue plan) | — |
| `docs/plans/62-bounded-tool-loop.md` | `repository-canonical` (issue plan) | — |
| `docs/plans/70-cross-agent-ai-harness.md` | `repository-canonical` (issue plan) | — |
| `docs/plans/93-toolchain-upgrades.md` | `repository-canonical` (issue plan) | — |
| `docs/plans/111-ci-reliability.md` | `repository-canonical` (issue plan) | — |
| `docs/plans/116-browser-thf-validation.md` | `repository-canonical` (issue plan) | — |
| `docs/plans/158-documentation-information-architecture.md` | `repository-canonical` (issue plan for this issue) | — |

### `docs/archive/` — historical records

All archived plans are `historical` and read-only. `docs/archive/plans/001.md` opens with
"Historical execution record. Do not use as an active planning source." They are never
rewritten to read as current state.

| Path | Disposition |
|------|-------------|
| `docs/archive/plans/001.md` | `historical` |
| `docs/archive/plans/002.md` | `historical` |
| `docs/archive/plans/003.md` | `historical` |
| `docs/archive/plans/004.md` | `historical` |
| `docs/archive/plans/005.md` | `historical` |
| `docs/archive/plans/006.md` | `historical` |
| `docs/archive/plans/007.md` | `historical` |
| `docs/archive/plans/008.md` | `historical` |

### Generated non-documentation output (out of IA scope)

`dist/`, `playwright-report/`, `test-results/`, and `screenshots/` are `generated` build and
test output. They are explicitly out of the documentation IA scope and are never hand-edited
as truth.

## One source of truth and ownership

The target architecture assigns each class of mutable fact exactly one canonical location
and owner. Every other surface **links** to that source; it never copies the mutable fact.
Existing transitional exceptions are named below. This is the anti-duplication rule that
`#144` requires to end stale, contradictory claims.

| Fact class | Single canonical source | Owner |
|------------|-------------------------|-------|
| Live task status, priority, size, ownership, dependencies | GitHub Project 2 (never in docs) | Maintainers |
| Product direction and sequencing | `docs/plans/roadmap.md` | Maintainers |
| Architecture contract | `docs/knowledge/architecture.md` | Maintainers |
| `.thf` schema and format contract | `docs/knowledge/file-format.md` | Maintainers |
| Engineering process and code conventions | `AGENTS.md` | Maintainers |
| Path-specific engineering rules | `.github/instructions/**` | Maintainers |
| Quality doctrine and AI-output-quality method | `docs/quality/agentic-slop.md`, `docs/quality/ai-output-quality.md` | Maintainers |
| Security policy and vulnerability reporting | `SECURITY.md` | Maintainers |
| Contribution process | `CONTRIBUTING.md` | Maintainers |
| Community conduct | `CODE_OF_CONDUCT.md` | Maintainers |
| Glossary terms | `docs/knowledge/glossary.md` | Maintainers |
| Target user-facing capability descriptions | The single handbook page for that topic under `docs/wiki/` after `#160`, each claim verified against code/tests | Maintainers |
| Planning contract and index | `docs/plans/0000-template.md`, `docs/plans/README.md` | Maintainers |
| Historical execution records | `docs/archive/**` (read-only) and issue-plan replan logs | Maintainers |
| Legal | `LICENSE`, `NOTICE` | Exit Zero Labs LLC |

### Volatile-facts rule

Volatile numeric or enumerated facts — test counts, exact AI provider lists, release or
version status, "N themes", supported-platform matrices — are **not** duplicated in prose.
They are either derived or generated from their source, cited to a specific code or CI
evidence location, or omitted. Duplicating such facts in prose is the primary cause of the
stale-claim drift `#144` names, so it is prohibited across all surfaces including `README.md`
and every handbook page.

Until `#159`, `#160`, and `#162` resolve the existing README/overview duplication, those
files remain explicitly `transitional`; no new duplicate capability claims may be added
during the transition.

### Anti-duplication rule

`README.md` and handbook pages describe and orient; they link to the canonical source above
for any mutable fact. Restating a mutable fact that a canonical source owns is a defect that
`#159` and `#162` must remove.

## Wiki handbook architecture

The user-facing handbook is authored and reviewed **in the repository** at `docs/wiki/`
(`wiki-facing-source`) and published to the GitHub Wiki by `#161`. The published Wiki is a
`generated` mirror: manual Wiki edits are non-canonical and are overwritten by the next
publication. `docs/wiki/` does not exist yet; `#160` creates it against this contract.

The owner selected `docs/wiki/` as the version-controlled handbook source on 2026-07-22
(recorded in the `#158` plan). This keeps user-facing source separate from the
`docs/knowledge/` engineering contracts while making the publication target explicit.

### Page map

The page map covers a new user's journey: installation → first model → threat analysis →
optional AI → import/export → troubleshooting. Source slugs are kebab-case and map
deterministically to Wiki page names; titles and headings are sentence-case.

| Wiki page | Source slug (`docs/wiki/`) | Purpose |
|-----------|---------------------------|---------|
| `Home` | `Home.md` | Landing and orientation; entry to the whole handbook. |
| `Installation` | `installation.md` | Desktop install per platform **and** browser access, both intentional. |
| `Getting started` | `getting-started.md` | First run; create and open a model. |
| `Core modeling workflows` | `core-modeling-workflows.md` | Canvas, components, relationships, data flows. |
| `STRIDE threat analysis` | `stride-threat-analysis.md` | Running and reading STRIDE analysis. |
| `AI-assisted analysis (BYOK)` | `ai-assisted-analysis-byok.md` | Optional, direct-to-provider, local encrypted keys, untrusted-output safety; no account or hosted backend. |
| `Import and export` | `import-and-export.md` | TMT import, `.thf` export and download. |
| `.thf concepts` | `thf-concepts.md` | User-facing conceptual overview linking to canonical `docs/knowledge/file-format.md`; never restates schema rules. |
| `Troubleshooting` | `troubleshooting.md` | Common failures and recovery. |
| `Glossary` | `glossary.md` | Sourced from `docs/knowledge/glossary.md`; links or derives, never forks. |

### Navigation, naming, and footer

- `_Sidebar.md` fixes deterministic navigation order: `Home` → `Installation` →
  `Getting started` → `Core modeling workflows` → `STRIDE threat analysis` →
  `AI-assisted analysis (BYOK)` → `Import and export` → `.thf concepts` →
  `Troubleshooting` → `Glossary`.
- `_Footer.md` holds a stable footer (project identity and license/security links).
- GitHub Wiki reserves `Home.md`, `_Sidebar.md`, and `_Footer.md`; those names are used
  verbatim. All other pages use stable kebab-case slugs so links do not rot.
- Headings are sentence-case and dates are ISO `YYYY-MM-DD`, per
  `.github/instructions/docs.instructions.md`.

### Canonical-vs-Wiki ownership boundary

Handbook pages describe **verified current behavior** and link to repository-canonical
architecture, schema, security, roadmap, and contribution contracts for engineering detail.
They never restate mutable engineering facts, never require a ThreatForge account, and never
imply a hosted backend. The AI page describes optionality, direct-to-provider requests, local
encrypted keys, and untrusted-output validation, consistent with the `AGENTS.md` product
invariants. Both the desktop app and the browser build are covered as deliberate surfaces.

## Shipped vs planned vs history labeling

Every page must make it implausible to mistake planned functionality for shipped behavior.

- **Shipped:** a capability statement is verified against a named evidence source — a code
  path, a test, a CI job, or a config entry — and marked shipped. Example marker:
  `Status: Shipped` (optionally with the evidence path).
- **Planned:** future behavior is explicitly labeled and linked to `docs/plans/roadmap.md`
  or a canonical issue. Example marker: `Status: Planned (#NNN)`. Blending shipped and
  planned material without a label is prohibited.
- **Verified evidence:** evidence is cited, not asserted; command results are never
  fabricated (`.github/instructions/docs.instructions.md`).
- **Proposal:** unresolved or exploratory material is marked as a proposal and is not read as
  a commitment.
- **History:** historical records live only in `docs/archive/**` and issue-plan replan logs;
  history is never rewritten to read as current state.

The marker convention is a lightweight status line or callout (for example
`Status: Shipped` / `Status: Planned (#NNN)`) that renders identically in repository Markdown
and in the published Wiki, so the shipped-vs-planned distinction survives publication. Files
flagged `contains-planned` (`docs/knowledge/overview.md`,
`docs/knowledge/product-design.md`,
`docs/quality/ai-output-quality.md`, and
`docs/runbooks/configuring-release-signing.md`) must keep their future material labeled this
way.

## Downstream contracts and sequencing for #159–#162

Each child issue receives measurable inputs, deliverables, and a completion signal so a
separate implementer can execute it without rediscovering this IA.

### #159 — Canonical repository docs refresh

- **Inputs:** this IA's inventory, source-of-truth map, and labeling convention.
- **Deliverables:** every `repository-canonical` and `internal-strategy` document's
  current-behavior claims verified against evidence; all `verify` flags resolved for
  `docs/knowledge/overview.md`, `product-design.md`, `market-analysis.md`, `risks.md`, and
  `mcp-server.md` (against `src-tauri/src/mcp/**`); every `contains-planned` file confirmed to
  keep future material explicitly labeled (`docs/knowledge/overview.md`, `product-design.md`,
  `docs/quality/ai-output-quality.md`, and
  `docs/runbooks/configuring-release-signing.md`); duplicated mutable facts removed in favor
  of canonical links; internal links resolve;
  `docs/knowledge/architecture.md` and `docs/knowledge/file-format.md` retain their canonical
  roles; issue plans keep replan history; archives untouched. May add a pointer to this IA
  doc from `AGENTS.md` or docs indexes if the owner approves (deferred from `#158`).
- **Completion signal:** every `verify` row is resolved, every `contains-planned` row retains
  explicit future labeling, and no mutable fact is duplicated across surfaces.

### #160 — Handbook authoring

- **Inputs:** the page map, the `docs/wiki/` source location, the naming convention, the
  `_Sidebar.md` order, and the boundary rules above.
- **Deliverables:** each mapped page authored under `docs/wiki/` with verified current
  behavior, planned content isolated and labeled, a `Home` page and deterministic
  `_Sidebar.md`, no account or hosted-backend implication, both desktop and browser covered,
  renders locally, and links to repository-canonical contracts instead of copying them.
- **Completion signal:** a new user can complete the full install → first model → threat
  analysis → optional AI → import/export → troubleshooting journey entirely from the
  handbook.

### #161 — Wiki publishing

- **Inputs:** settled `docs/wiki/` content and this page map, plus the owner's one-time first
  Wiki page creation (a HITL prerequisite, not resolved by `#158`).
- **Deliverables:** a least-privilege workflow that publishes `docs/wiki/` to the GitHub Wiki
  with SHA-pinned actions, trusted-`main`-only execution, deterministic `Home`, `_Sidebar`,
  and asset ordering, visible failure, and a traceable Wiki commit. No manual Wiki source of
  truth remains.
- **Completion signal:** the published Wiki is a reproducible mirror of `docs/wiki/` from
  trusted `main` content, with no hand-authored Wiki pages.

### #162 — README landing and link repair

- **Inputs:** the final canonical destinations settled by `#159`, `#160`, and `#161`.
- **Deliverables:** `README.md` trimmed to product identity, verified highlights, a minimal
  quick start, security and contribution entry points, and navigation; user-facing links
  point to the Wiki, engineering links point to repository-canonical sources; deterministic
  Markdown link validation is added; archived and historical docs are not rewritten.
- **Completion signal:** deterministic link validation passes and no mutable fact is
  duplicated between `README.md` and its canonical sources.

### Sequencing (from #144)

`#158` → (`#159` in parallel with `#160`) → `#161` (only after `#160` **and** the owner's
first Wiki page) → `#162` (after `#159`, `#160`, and `#161` settle destinations).

## Acceptance criteria coverage

| `#158` acceptance criterion | Satisfying section |
|-----------------------------|--------------------|
| Complete inventory and classification of every root and `docs/**` Markdown document | "Documentation inventory and classification" |
| Closed disposition vocabulary | "How to read this document" |
| One source of truth and ownership matrix | "One source of truth and ownership" |
| Deterministic Wiki page map, navigation, naming, and boundaries with `docs/wiki/` as canonical source and the published Wiki as generated mirror | "Wiki handbook architecture" |
| Shipped vs verified vs planned vs proposal vs history labeling convention | "Shipped vs planned vs history labeling" |
| Measurable downstream contracts and sequencing for `#159`–`#162` | "Downstream contracts and sequencing for #159–#162" |

## Constraints and validation guidance

- **Security and privacy:** no secrets, keys, or tokens appear in documentation. `SECURITY.md`
  remains the canonical security-policy source. Handbook pages describe, never weaken, the
  BYOK, key-locality, and untrusted-AI-output invariants in `AGENTS.md`. The `#161` publishing
  contract records least-privilege, SHA-pinned, trusted-branch, fail-visible constraints; it
  is not implemented here.
- **`.thf` compatibility:** no schema or format change. `docs/knowledge/file-format.md` is the
  sole canonical `.thf` contract; the handbook `.thf concepts` page links to it and must not
  restate schema rules.
- **Browser and desktop:** handbook installation and getting-started pages cover both the
  desktop app and the browser build as deliberate surfaces, per `AGENTS.md`.
- **Accessibility and UX:** a deterministic `_Sidebar.md` order and stable slugs keep
  navigation predictable; sentence-case headings and ISO dates apply everywhere.
- **Evidence:** every current-behavior claim in downstream docs must cite a verifiable
  evidence source; the labeling convention forbids fabricated results.

Deterministic verification for this artifact is inventory-coverage and internal-content
checks (Biome does not lint Markdown, and no link checker exists yet — that arrives with
`#162`). Owner validation must still confirm the judgment calls: the `internal-strategy` set
(`product-design`, `go-to-market`, `market-analysis`, `risks`), the transition treatment for
`overview` and `glossary`, every `verify` and `contains-planned` flag, the
completeness of the page map for the target journey, and that the labeling convention makes
planned-as-shipped reading implausible.

## Replan log

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-07-22 | Initial IA | Issue `#158` plus repository evidence (`find docs -name '*.md'`, root `*.md`, `.github`, and code evidence for the MCP server). |
