# Issue 158 — Define the documentation information architecture

## Objective

Produce one reviewed, committed documentation information-architecture (IA) and
source-of-truth policy that:

- assigns every existing documentation collection and document an explicit disposition,
- names a single canonical owner for every mutable fact,
- specifies the GitHub Wiki handbook page map, deterministic navigation, naming, and
  ownership boundaries,
- defines how shipped behavior, verified evidence, future direction, proposals, and history
  are distinguished, and
- hands #159, #160, #161, and #162 measurable contracts and a fixed sequencing order.

The deliverable is a design/policy artifact. It does not refresh canonical docs (#159),
author handbook content (#160), publish the Wiki (#161), or rewrite the README (#162).

## Issue contract

- **Issue:** `#158`
- **Parent initiative:** `#144`
- **Type:** `Task`
- **Size:** `M`
- **Priority:** `P1`
- **Autonomy:** `Automatable`
- **Dependencies:** None. Blocks `#159` and `#160` (which transitively gate `#161`, `#162`).
- **Non-goals:**
  - Editing, refreshing, moving, or deleting any inventoried document's content (that is
    #159/#160/#162 work). This plan's implementation adds the IA policy artifact only.
  - Creating handbook pages, `Home.md`, `_Sidebar.md`, or any Wiki content.
  - Adding a publishing workflow or touching `.github/workflows/**`.
  - Changing product behavior, the `.thf` schema, or any code under `src/**`, `src-tauri/**`.
  - Rewriting `docs/archive/**` or any historical record.
  - Mutating GitHub state (labels, project fields, issue bodies, Wiki) or creating a PR.
  - Resolving the owner's one-time Wiki first-page creation (a `#161` HITL prerequisite).

## Current behavior and evidence

### Documentation surfaces that exist today

Verified by directory inspection on 2026-07-22 (`find docs -type f`, root `*.md`,
`.github/*.md`).

Root governance and legal:

- `README.md` (261 lines) — product intro plus duplicated feature list, file-format
  example, getting-started, tech stack, architecture summary, security, contributing.
- `CONTRIBUTING.md` (190), `SECURITY.md` (72), `CODE_OF_CONDUCT.md` (56).
- `LICENSE`, `NOTICE` (Apache-2.0, Exit Zero Labs LLC).
- `AGENTS.md` (261) — canonical cross-agent engineering contract.
- `CLAUDE.md` (10), `.github/copilot-instructions.md` (8) — thin adapters that point to
  `AGENTS.md`; `.github/instructions/**` holds path-specific rules; `.claude/**` mirrors.
- `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/**` (referenced by archive
  history; templates).

`docs/knowledge/` (product/engineering knowledge):

- `architecture.md` (292) — canonical architecture entry point (named in `AGENTS.md`).
- `file-format.md` (352) — canonical `.thf` contract (named in `AGENTS.md`).
- `glossary.md` (51) — term definitions and references.
- `overview.md` (55) — product overview / "what it is".
- `product-design.md` (103) — personas and product design.
- `go-to-market.md` (84), `market-analysis.md` (66), `risks.md` (58) — internal strategy.
- `mcp-server.md` (155) — MCP server docs. Verified as **present in code**
  (`src-tauri/src/mcp/server.rs`, `src-tauri/src/bin/threatforge-mcp.rs`,
  `src-tauri/tests/mcp_stdio.rs`, `rmcp = "2.2"` in `src-tauri/Cargo.toml`), so it
  documents shipped behavior, not a proposal.

`docs/quality/`:

- `agentic-slop.md` (105) — quality doctrine referenced by `AGENTS.md`.
- `ai-output-quality.md` (83) — AI output quality method (explicitly "not a production gate
  yet"; forward-looking scope must stay labeled).

`docs/runbooks/` (operational, all currently repository-canonical):

- `adding-a-feature.md` (100), `configuring-release-signing.md` (572, preserves remaining
  owner/implementation work — mixes shipped and planned, must stay labeled),
  `debugging-tauri-ipc.md` (175), `deploying-the-website.md` (86),
  `diagnosing-ci-failures.md` (384), `onboarding-a-contributor.md` (107),
  `releasing-a-version.md` (150), `responding-to-issues.md` (120),
  `schema-migration.md` (132).

`docs/plans/` (planning system):

- `0000-template.md` (plan contract), `README.md` (planning index),
  `roadmap.md` (canonical strategic direction, named in `AGENTS.md`), and active
  `<issue>-<slug>.md` plans (`53`, `54`, `56`, `57`, `58`, `59`, `61`, `62`, `70`, `93`,
  `111`, `116`). Active plans append replan history and are not shipped-state docs.

`docs/archive/plans/` (`001.md`–`008.md`) — read-only historical execution records
(`001.md` opens with "Historical execution record. Do not use as an active planning
source.").

Non-documentation generated output present in the tree but out of scope: `dist/`,
`playwright-report/`, `test-results/`, `screenshots/`.

### Governing rules already in force

- `AGENTS.md` fixes the canonical roles of `docs/knowledge/architecture.md`,
  `docs/knowledge/file-format.md`, `docs/plans/roadmap.md`, `docs/quality/agentic-slop.md`,
  and `docs/quality/ai-output-quality.md`, and makes GitHub Project 2 the sole live task
  tracker.
- `.github/instructions/docs.instructions.md` requires sentence-case headings, ISO dates,
  pointing to canonical sources instead of duplicating mutable facts, read-only
  `docs/archive/`, distinguishing current/verified/proposed/unresolved, and appended replan
  history.
- Parent `#144` fixes the hybrid strategy and the execution order:
  `#158` → (`#159`, `#160`) → `#161` (after `#160` and the owner's first Wiki page) →
  `#162`.

### Toolchain evidence relevant to verification

- `package.json` scripts: `check` (`biome check .`), `test`, `test:e2e`, `ci:local`
  (`bash scripts/ci-local.sh`). No Markdown linter or link checker exists today
  (`grep` for `markdown|remark|lint-md|link|vale|cspell` finds only `react-markdown` and
  `remark-gfm` runtime deps). Deterministic link validation is therefore introduced later
  by `#162`, not required here; this plan's verification is inventory-coverage and
  internal-link checks over the single new artifact.
- Biome does not lint Markdown, so the new `.md` artifact is verified by targeted `grep`
  coverage checks and manual review, not `npm run check`.

## Design decisions resolved from repository evidence

These remove avoidable ambiguity for the implementer. Each is derived from existing
structure or an explicit owner decision recorded below.

1. **Artifact location.** The IA/source-of-truth policy is a durable, code-coupled
   governance contract, so it is repository-canonical and lives at
   `docs/knowledge/documentation-architecture.md`. Rationale: `docs/knowledge/` already
   holds the canonical `architecture.md` and `file-format.md` contracts that `AGENTS.md`
   names; the documentation IA is the same class of durable contract and belongs beside
   them. It is not placed under `docs/plans/` (those are per-issue execution plans) or at
   repo root (root is being slimmed by `#162`).
2. **Handbook source-of-truth location (contract handed to #160/#161).** Handbook pages are
   authored and reviewed in the repository at `docs/wiki/` and published to the Wiki by
   `#161`; the Wiki is a generated mirror, never an independent source. Rationale: `#144`
   and `#160` require "version-controlled" handbook source reviewed via pull requests, and
   `#161` publishes "from trusted `main` content". A dedicated `docs/wiki/` directory keeps
   user-facing source separate from `docs/knowledge/` engineering contracts while making
   its publication target explicit. The owner selected this location on 2026-07-22.
3. **Wiki naming/navigation.** GitHub Wiki reserves `Home.md`, `_Sidebar.md`, `_Footer.md`.
   Handbook source files use kebab-case slugs that map deterministically to Wiki page names,
   and `_Sidebar.md` fixes navigation order. This matches `.github/instructions/docs.instructions.md`
   (sentence-case headings) and the `#161` requirement for deterministic ordering.
4. **No AGENTS.md / README edits in this issue.** Adding pointers to the new IA doc from
   `AGENTS.md` or `README.md` is deferred to `#159`/`#162` to avoid editing canonical
   contracts inside an IA-definition issue. This plan records that as a downstream contract,
   not a step here.
5. **Disposition vocabulary is closed.** Every document receives exactly one primary
   disposition from a fixed set (below), plus optional flags (`verify`, `contains-planned`,
   `transitional`). A closed vocabulary is what makes coverage measurable for `#159`–`#162`.

## Implementation steps

Each step is XS/S-sized. The implementer produces one new Markdown artifact,
`docs/knowledge/documentation-architecture.md`, built section by section. No other file is
edited.

### 1. Scaffold the canonical IA artifact

- **Behavior:** Create `docs/knowledge/documentation-architecture.md` with sentence-case
  headings, an ISO-dated status line, a scope statement, and a "how to read this document"
  legend defining the closed disposition vocabulary and the optional flags.
- **Files:** `docs/knowledge/documentation-architecture.md` (new).
- **Implementation:**
  - Define the disposition set exactly: `repository-canonical`, `wiki-facing-source`,
    `historical`, `generated`, `superseded`, `internal-strategy`. Give each a one-line
    definition and the rule that governs its lifecycle (e.g. `historical` = read-only,
    never rewritten to look current; `generated` = derived from a canonical source, never
    hand-edited as truth).
  - Define optional flags: `verify` (claim must be checked against code/tests/CI/config
    before publication), `contains-planned` (mixes shipped and future; requires explicit
    labeling), `transitional` (canonical today, slated to change destination via a named
    downstream issue).
  - State the non-goals and the "planned is never shown as shipped" invariant up front,
    citing `AGENTS.md` and `.github/instructions/docs.instructions.md`.
- **Targeted verification:**
  `test -f docs/knowledge/documentation-architecture.md &&
   grep -nE "repository-canonical|wiki-facing-source|historical|generated|superseded|internal-strategy"
   docs/knowledge/documentation-architecture.md`
  must list all six dispositions.
- **Intent validation:** Owner confirms the vocabulary is complete and unambiguous and that
  `internal-strategy` versus `repository-canonical` is a meaningful distinction for the
  `docs/knowledge/*` strategy files.

### 2. Write the full inventory and classification table

- **Behavior:** A single table (or grouped tables per collection) listing **every** file
  from the "Current behavior and evidence" inventory with its path, audience, primary
  disposition, flags, canonical owner, and the downstream issue that acts on it.
- **Files:** `docs/knowledge/documentation-architecture.md`.
- **Implementation:** Populate with at least these rows (dispositions resolved from
  evidence; the implementer re-verifies each before committing):
  - `README.md` → `repository-canonical`, `transitional` (→ landing page via `#162`),
    owner: maintainers.
  - `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` → `repository-canonical`
    governance, owner: maintainers; must not move to Wiki (`#144` non-goal).
  - `LICENSE`, `NOTICE` → `repository-canonical` legal (static), owner: Exit Zero Labs LLC.
  - `AGENTS.md` → `repository-canonical` (engineering-process source of truth), owner:
    maintainers.
  - `CLAUDE.md`, `.github/copilot-instructions.md`, `.claude/**` adapters → `generated`
    (adapter pointers; canonical = `AGENTS.md` + `.github/instructions/**`).
  - `.github/instructions/**`, `.github/PULL_REQUEST_TEMPLATE.md`,
    `.github/ISSUE_TEMPLATE/**` → `repository-canonical`.
  - `docs/knowledge/architecture.md`, `docs/knowledge/file-format.md` →
    `repository-canonical` (named in `AGENTS.md`); refreshed by `#159`; handbook may link
    but never copy.
  - `docs/knowledge/glossary.md` → `repository-canonical` and canonical **source** for the
    Wiki glossary page (`wiki-facing-source` flag); `#160` links/derives, does not fork.
  - `docs/knowledge/overview.md` → `wiki-facing-source` candidate for the handbook home
    (owner confirms) with `verify`.
  - `docs/knowledge/product-design.md`, `go-to-market.md`, `market-analysis.md`, `risks.md`
    → `internal-strategy` (repository-canonical, not user-facing, not shipped-behavior
    claims), owner: maintainers.
  - `docs/knowledge/mcp-server.md` → `repository-canonical` with `verify` (code present;
    refresh against `src-tauri/src/mcp/**` in `#159`).
  - `docs/quality/agentic-slop.md`, `ai-output-quality.md` → `repository-canonical` doctrine
    (named in `AGENTS.md`); `ai-output-quality.md` carries `contains-planned`.
  - Every `docs/runbooks/*.md` → `repository-canonical` operational; `configuring-release-signing.md`
    carries `contains-planned`.
  - `docs/plans/0000-template.md`, `docs/plans/README.md` → `repository-canonical` planning
    contract/index.
  - `docs/plans/roadmap.md` → `repository-canonical`, designated **canonical future-direction
    source**.
  - Active `docs/plans/<issue>-<slug>.md` → `repository-canonical` planning records; append
    replans, never present as shipped state.
  - `docs/archive/plans/001.md`–`008.md` → `historical` (read-only).
  - Generated non-doc output (`dist/`, `playwright-report/`, `test-results/`, `screenshots/`)
    → `generated`, explicitly out of documentation IA scope.
- **Targeted verification:** Coverage check — every path from the inventory appears exactly
  once:
  `for f in $(find docs -name '*.md' | sort) README.md CONTRIBUTING.md SECURITY.md
   CODE_OF_CONDUCT.md AGENTS.md CLAUDE.md; do grep -q "$f" docs/knowledge/documentation-architecture.md
   || echo "MISSING: $f"; done` prints nothing.
- **Intent validation:** Owner spot-checks that no document was mis-audited (especially the
  `internal-strategy` set and the `wiki-facing-source` candidates) and that every
  `verify`/`contains-planned` flag is justified.

### 3. Define one-source-of-truth and ownership rules for mutable facts

- **Behavior:** A "source of truth" section mapping each class of mutable fact to exactly one
  canonical location and owner, plus the anti-duplication rule that all other surfaces link
  rather than copy.
- **Files:** `docs/knowledge/documentation-architecture.md`.
- **Implementation:** Record at minimum:
  - Live task status/priority/size/ownership/dependencies → GitHub Project 2 (never docs),
    per `AGENTS.md`.
  - Product direction and sequencing → `docs/plans/roadmap.md`.
  - Architecture contract → `docs/knowledge/architecture.md`.
  - `.thf` schema/format contract → `docs/knowledge/file-format.md`.
  - Engineering process and code conventions → `AGENTS.md`; path rules →
    `.github/instructions/**`.
  - Quality doctrine → `docs/quality/**`.
  - Security policy and vulnerability reporting → `SECURITY.md`.
  - Contribution process → `CONTRIBUTING.md`; code of conduct → `CODE_OF_CONDUCT.md`.
  - Glossary terms → `docs/knowledge/glossary.md`.
  - Current user-facing capability descriptions → the single handbook page for that topic,
    each claim verified against code/tests; README and other pages link, never restate.
  - Volatile numeric/enumerated facts (test counts, exact provider lists, release/version
    status, "N themes") → not duplicated in prose; either derived/generated or cited to
    code/CI evidence, or omitted. This directly targets the stale-claim risk `#144` names.
  - Explicit ownership rows for: README, contributor/security/governance files,
    architecture/schema contracts, plans, runbooks, quality doctrine, and archives (the
    acceptance-criteria list).
- **Targeted verification:**
  `grep -nE "Project 2|roadmap.md|architecture.md|file-format.md|AGENTS.md|SECURITY.md|CONTRIBUTING.md|glossary.md"
   docs/knowledge/documentation-architecture.md` shows each canonical anchor is named.
- **Intent validation:** Owner confirms there is exactly one owner per fact class and that
  the volatile-facts rule is strict enough to prevent the duplication `#144` flags.

### 4. Specify the Wiki handbook page map, navigation, naming, and boundaries

- **Behavior:** A "Wiki handbook architecture" section giving the deterministic page map,
  `_Sidebar.md` order, naming convention, source location, and the canonical-vs-Wiki
  ownership boundary. This is the contract `#160` and `#161` implement.
- **Files:** `docs/knowledge/documentation-architecture.md`.
- **Implementation:**
  - Source of truth: `docs/wiki/` in the repo (decision #2). Publishing target: the
    GitHub Wiki, mirrored by `#161`. Wiki is `generated`; manual Wiki edits are non-canonical
    and overwritten by the next publication.
  - Page map covering the required topics (installation, core workflows, AI/BYOK, `.thf`
    concepts, troubleshooting, glossary), e.g.:
    - `Home` (`Home.md`) — landing/orientation.
    - `Installation` — desktop install per platform + browser access.
    - `Getting started` — first run, create/open a model.
    - `Core modeling workflows` — canvas, components, relationships, data flows.
    - `STRIDE threat analysis` — running and reading analysis.
    - `AI-assisted analysis (BYOK)` — optional, direct-to-provider, key locality/encryption,
      untrusted-output safety; no account/hosted backend implied.
    - `Import and export` — TMT import, `.thf` export/download.
    - `.thf concepts` — user-facing conceptual overview linking to canonical
      `docs/knowledge/file-format.md`.
    - `Troubleshooting` — common failures and recovery.
    - `Glossary` — sourced from `docs/knowledge/glossary.md`.
    - `_Sidebar.md`, `_Footer.md` — deterministic navigation and footer.
  - Naming convention: kebab-case source slugs → Wiki page names; sentence-case titles and
    headings; ISO dates; stable slugs so links do not rot.
  - Ownership boundary rule: handbook pages describe verified current behavior and link to
    repository-canonical architecture/schema/security/roadmap/contribution contracts for
    engineering detail; they never restate mutable engineering facts, never require a
    ThreatForge account, and never imply a hosted backend (per `#160`).
- **Targeted verification:**
  `grep -niE "installation|core.*workflow|BYOK|thf concept|troubleshoot|glossary|_Sidebar"
   docs/knowledge/documentation-architecture.md` confirms every required topic and the
  sidebar are present.
- **Intent validation:** Owner confirms the page map is complete for a new user's
  install → first model → threat analysis → optional AI → import/export → troubleshooting
  journey, and that the `docs/wiki/` source-versus-published-Wiki boundary is understandable.

### 5. Define the shipped-vs-planned-vs-history labeling convention

- **Behavior:** A section fixing how any page distinguishes shipped behavior, verified
  evidence, future direction, proposals, and historical records.
- **Files:** `docs/knowledge/documentation-architecture.md`.
- **Implementation:**
  - Every capability statement is either (a) verified against a named evidence source
    (code path, test, CI, config) and marked shipped, or (b) explicitly labeled planned with
    a link to the roadmap or a canonical issue. No blending without labeling.
  - Prescribe a consistent lightweight marker convention (e.g. a "Status: Shipped" /
    "Status: Planned (#NNN)" line or callout) usable in both repo Markdown and Wiki render.
  - Verified evidence is cited, not asserted; command results are never fabricated
    (`.github/instructions/docs.instructions.md`).
  - History lives only in `docs/archive/**` and active-plan replan logs; it is never
    rewritten to read as current state.
- **Targeted verification:**
  `grep -niE "shipped|planned|verified|roadmap|archive" docs/knowledge/documentation-architecture.md`
  shows the five distinctions are addressed.
- **Intent validation:** Owner confirms the marker convention makes it implausible to mistake
  planned functionality for shipped behavior in either surface.

### 6. Define downstream contracts and sequencing for #159–#162

- **Behavior:** A "downstream contracts" section giving each child issue measurable inputs,
  deliverables, and completion signals, plus the fixed execution order and dependency notes.
- **Files:** `docs/knowledge/documentation-architecture.md`.
- **Implementation:** Record, per issue:
  - **#159 (canonical repo docs refresh):** inputs = this IA's inventory + source-of-truth +
    labeling rules. Deliverables = every `repository-canonical`/`internal-strategy` doc's
    current-behavior claims verified against evidence; `verify`/`contains-planned` flags
    resolved; duplicated mutable facts removed in favor of canonical links; internal links
    resolve; `architecture.md`/`file-format.md` retain canonical roles; active plans keep
    replan history; archives untouched. Contract: add pointer(s) to this IA doc from
    `AGENTS.md`/docs indexes if owner approves (decision #4). Completion = inventory rows
    marked `verify` are all resolved.
  - **#160 (handbook authoring):** inputs = the page map, `docs/wiki/` source location,
    naming, sidebar order, boundary rules. Deliverables = each mapped page authored with
    verified current behavior, planned content isolated and linked, `Home` + deterministic
    `_Sidebar`, no account/hosted-backend implication, renders locally, links to canonical
    contracts instead of copying. Completion = a new user can complete the full journey from
    the handbook.
  - **#161 (Wiki publishing):** inputs = settled `docs/wiki/` content and page map; the
    owner's one-time first-page creation (HITL). Deliverables = least-privilege workflow
    publishing `docs/wiki/` → Wiki with SHA-pinned actions, trusted-`main`-only
    execution, deterministic `Home`/`_Sidebar`/asset order, visible failure, traceable Wiki
    commit, no manual Wiki source of truth.
  - **#162 (README landing + link repair):** inputs = final canonical destinations from
    #159–#161. Deliverables = README trimmed to identity + verified highlights + minimal
    quick start + security/contribution entry points + navigation; user links → Wiki,
    engineering links → repository-canonical; deterministic link validation added; no
    unnecessary rewrite of archived/historical docs.
  - Sequencing (from `#144`): `#158` → (`#159` ∥ `#160`) → `#161` (after `#160` **and** the
    owner's first Wiki page) → `#162` (after `#159`, `#160`, `#161` settle destinations).
- **Targeted verification:**
  `grep -nE "#159|#160|#161|#162" docs/knowledge/documentation-architecture.md` shows each
  child has explicit inputs, deliverables, and ordering.
- **Intent validation:** Owner confirms each child could be executed against these contracts
  by a separate implementer without rediscovering the IA, and that the ordering matches
  `#144`.

### 7. Add the acceptance-criteria mapping and initialize the replan log

- **Behavior:** An "acceptance criteria coverage" table mapping each `#158` acceptance
  criterion to the section that satisfies it, and a dated replan log seeded per template.
- **Files:** `docs/knowledge/documentation-architecture.md`.
- **Implementation:**
  - Map the six `#158` acceptance criteria (inventory coverage; disposition classification;
    one-source-of-truth + ownership; Wiki page map/nav/naming/boundaries;
    shipped-vs-planned-vs-history distinction; measurable downstream contracts) to their
    sections.
  - Add an ISO-dated change-log table: `2026-07-22 | Initial IA | Issue #158 + repository
    evidence`.
- **Targeted verification:** Every acceptance criterion string maps to a section reference;
  table has no empty cells.
- **Intent validation:** Owner confirms full acceptance-criteria coverage with no gap.

## Cross-cutting requirements

- **Security and privacy:** No secrets, keys, tokens, or credentials appear in the artifact.
  The IA reaffirms that `SECURITY.md` is the canonical security-policy source and that
  BYOK/key-locality/untrusted-AI-output invariants (`AGENTS.md`) are described, never
  weakened, by handbook pages. The `#161` publishing contract records least-privilege,
  SHA-pinned, trusted-branch, fail-visible constraints but is not implemented here.
- **`.thf` compatibility:** No schema or format change. The IA designates
  `docs/knowledge/file-format.md` as the sole canonical `.thf` contract; the handbook `.thf`
  concepts page links to it and must not restate schema rules.
- **Browser and desktop:** Handbook installation/getting-started pages must cover both the
  desktop app and browser build as intentional, per `AGENTS.md`; the IA records this as a
  `#160` boundary requirement.
- **AI safety:** The AI/BYOK handbook page contract requires describing optionality,
  direct-to-provider requests, local encrypted keys, and untrusted-output validation; it must
  not imply an account or hosted backend.
- **Accessibility and UX:** Deterministic `_Sidebar.md` ordering and stable slugs keep
  navigation predictable; sentence-case headings and ISO dates per
  `.github/instructions/docs.instructions.md`.
- **Observability and evidence:** Every current-behavior claim in downstream docs must cite a
  verifiable evidence source; the labeling convention (step 5) forbids fabricated results.

## Verification gate

This issue ships one Markdown artifact and edits no code, so the code CI gate is not the
discriminating check. Run, in order:

```bash
# 1. Artifact exists and vocabulary is complete
test -f docs/knowledge/documentation-architecture.md
grep -nE "repository-canonical|wiki-facing-source|historical|generated|superseded|internal-strategy" \
  docs/knowledge/documentation-architecture.md

# 2. Inventory coverage: every existing doc is classified
for f in $(find docs -name '*.md' | sort) README.md CONTRIBUTING.md SECURITY.md \
  CODE_OF_CONDUCT.md AGENTS.md CLAUDE.md .github/copilot-instructions.md; do
  grep -q "$f" docs/knowledge/documentation-architecture.md || echo "MISSING: $f"
done   # expect no output

# 3. Required Wiki topics and downstream contracts are present
grep -niE "installation|BYOK|thf concept|troubleshoot|glossary|_Sidebar" \
  docs/knowledge/documentation-architecture.md
grep -nE "#159|#160|#161|#162" docs/knowledge/documentation-architecture.md

# 4. No accidental code change
git status --porcelain   # expect only docs/... additions
```

Because the plan touches only Markdown (Biome does not lint Markdown, and no link checker
exists yet), `npm run ci:local` is not required for correctness here; run it only if any
non-Markdown file was unexpectedly modified. Deterministic Markdown link validation is
introduced by `#162`.

## Owner validation

The handbook source location is settled as `docs/wiki/`. Deterministic checks cannot decide
the remaining validation points; the owner must:

- Confirm the artifact location `docs/knowledge/documentation-architecture.md` and whether a
  pointer to it should be added to `AGENTS.md`/README (deferred to `#159`/`#162` here).
- Confirm the disposition assignments for judgment calls: the `internal-strategy` set
  (`product-design`, `go-to-market`, `market-analysis`, `risks`), the `wiki-facing-source`
  candidates (`overview`, `glossary`), and every `verify`/`contains-planned` flag.
- Confirm the Wiki page map is complete for the target new-user journey and that
  canonical-vs-Wiki boundaries feel natural rather than forced.
- Confirm the labeling convention makes it implausible to read planned functionality as
  shipped.

## Risks and mitigations

- **Mis-audited disposition** propagates wrong actions into `#159`/`#160`. Mitigation: closed
  vocabulary, coverage check, and explicit owner spot-check of judgment calls.
- **Stale claims baked into the IA** (e.g. treating `mcp-server.md` or release status as
  shipped without verification). Mitigation: `verify` flags plus the source-of-truth rule
  that volatile facts are cited or omitted; MCP presence already verified in code.
- **Source/target ambiguity** because `docs/wiki/` is canonical source while GitHub Wiki is a
  generated mirror. Mitigation: the disposition vocabulary and ownership rules label the
  repository directory `wiki-facing-source` and the published Wiki `generated`.
- **Scope creep into refresh/authoring.** Mitigation: non-goals forbid editing any
  inventoried document; the only file created is the IA artifact.
- **Duplication reintroduced downstream.** Mitigation: the anti-duplication rule and
  per-fact ownership table give `#159`/`#162` a testable contract.

## Rollback

The implementation adds exactly one new file. To roll back, delete
`docs/knowledge/documentation-architecture.md` (or revert the single commit that adds it).
No other file, workflow, schema, or GitHub state is touched, so rollback carries no data or
behavior risk.

## Specialist review

- [x] PR reviewer — contract completeness, downstream mapping, template conformance.
- [x] Slop auditor — no fabricated precision/coverage; dispositions are evidence-backed.
- [ ] Security auditor — not triggered (no code, workflow, secret, or boundary change); the
  IA only records the `#161` publishing security constraints for later implementation.
- [ ] Threat-model expert — not triggered (no `.thf` schema or STRIDE change; the IA points
  to the canonical `file-format.md` without altering it).

## Replan log

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-07-22 | Initial plan | Issue `#158`, parent `#144`, children `#159`–`#162`, `AGENTS.md`, `.github/instructions/docs.instructions.md`, `docs/plans/0000-template.md`, full `docs/**` + root doc inventory, and code evidence for the MCP server. |
| 2026-07-22 | Set handbook source to `docs/wiki/` | Owner selected `docs/wiki/` for the version-controlled handbook source; updated the #160/#161 contracts, validation, and risk treatment. |
