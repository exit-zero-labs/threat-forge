# Issue 159 — Refresh canonical repository documentation

## Objective

Every retained current-behavior claim in the repository-versioned documentation is traceable
to named code, test, configuration, CI, or release evidence; every `verify` flag from the
governing information architecture (IA) is resolved; every `contains-planned` file keeps its
future material explicitly labeled and linked; duplicated mutable facts are removed in favor
of a single canonical source; and internal links in every modified document resolve. No
product behavior, `.thf` schema, runtime code, Wiki page, publishing workflow, or final
`README.md` landing migration is introduced.

## Issue contract

- **Issue:** `#159`
- **Parent initiative:** `#144`
- **Type:** `Task`
- **Size:** `L`
- **Priority:** `P1`
- **Autonomy:** `Automatable`
- **Dependencies:** `#158` (complete — merged IA at
  `docs/knowledge/documentation-architecture.md`). This issue blocks `#162`.
- **Milestone:** `M2 • General Release`. **Model tier:** `model/opus` (crosses architecture,
  `.thf`, AI, security, release, source-of-truth boundaries).
- **Governing source of truth:** `docs/knowledge/documentation-architecture.md` is the
  inventory, disposition, ownership, source-of-truth, and labeling contract. This plan does
  not restate its tables; it executes the `#159` deliverables it assigns.
- **Non-goals (hard exclusions):**
  - No authoring under `docs/wiki/**` (that is `#160`); the directory does not exist and is
    not created here.
  - No Wiki page publication or `.github/workflows/**` change (that is `#161`).
  - No final `README.md` landing-page migration or Wiki/engineering link re-pointing, and no
    new deterministic Markdown link-checker script (that is `#162`). The owner authorized
    only narrow removal of duplicated volatile counts from README in this issue.
  - No product behavior, `.thf` schema, or runtime change under `src/**` or `src-tauri/**`.
  - `docs/archive/**` stays byte-for-byte untouched.
  - No rewrite of issue-plan history; replan logs are appended, never rewritten.
  - Stale claims discovered in runtime code or outside this contract are filed as new linked
    issues, not fixed here (see "Out of scope / discovered work").

## Current behavior and evidence

ThreatForge is a local-first, AI-enhanced, Tauri v2 + React 19 + TypeScript + Rust threat
modeling app (`AGENTS.md` "Product invariants"). The IA (`#158`) classified every root and
`docs/**` Markdown file, assigned one canonical owner per mutable fact, and handed `#159`
these measurable deliverables (IA § "#159 — Canonical repository docs refresh"):

- resolve the five `verify` rows: `docs/knowledge/overview.md`, `product-design.md`,
  `market-analysis.md`, `risks.md`, `mcp-server.md` (MCP against `src-tauri/src/mcp/**`);
- confirm the four `contains-planned` rows keep future material labeled and linked:
  `docs/knowledge/overview.md`, `product-design.md`, `docs/quality/ai-output-quality.md`,
  `docs/runbooks/configuring-release-signing.md`;
- keep `docs/knowledge/architecture.md` as the architecture entry point and
  `docs/knowledge/file-format.md` as the sole `.thf` contract (also fixed in `AGENTS.md`
  "Canonical architecture and schema references" and the IA source-of-truth matrix);
- remove duplicated mutable facts in favor of canonical links (IA § "Volatile-facts rule" /
  "Anti-duplication rule");
- keep issue plans as execution records and archives untouched; all internal links resolve.

### Verified evidence gathered while planning (2026-07-22)

These are the concrete claim classes an implementer must reconcile, with the exact evidence
location for each. Do not re-derive scope from scratch.

| Claim class | Where it appears (stale/at-risk) | Canonical evidence | Finding |
|-------------|----------------------------------|--------------------|---------|
| Theme count | `overview.md:44` "13+ themes"; `product-design.md:26` "13+ themes"; `README.md:66` "15 Themes" (8 dark + 7 light) | `src/lib/themes/presets.ts` — `mode: "dark"` ×8, `mode: "light"` ×7, 15 `id:` entries; store `src/stores/ui-store.ts` imports `THEME_PRESETS` | Volatile count **contradicts across files** (13+ vs 15). Actual = 15. Remove/omit the prose count or cite the presets file; never restate a bare number in multiple surfaces. |
| Typed-component count | `overview.md:15,39` "44 typed components"; `product-design.md:20,25` "44 typed components across 10 categories"; `README.md:46` "44 typed components across 10 categories" | `src/lib/component-library.ts` — 47 `id:` entries across **10** distinct `category:` values; `src/lib/component-library.test.ts:18` asserts only `>= 25` | "44" is a volatile, now-inaccurate count. Category count (10) is verifiable. Remove the exact item count or cite the source; keep the verifiable "10 categories" only if cited. |
| Test counts | `overview.md:46` "417+ frontend tests, 73+ Rust tests, 40+ E2E tests"; `README.md:163-164` same | Vitest/cargo/Playwright suites (no pinned total; counts change every PR) | Volatile numeric facts. Remove per IA volatile-facts rule; describe suites by tool, not count. |
| Keyboard-shortcut count | `product-design.md:27` "27+ shortcuts"; `README.md:73` "27+ keyboard shortcuts" | `src/lib/command-registry.ts` (source of truth) | Volatile count; omit or cite, do not duplicate a bare number. |
| AI providers | `overview.md:41` / `product-design.md:23` "OpenAI + Anthropic"; `architecture.md:27` "OpenAI / Anthropic / **Ollama**"; `README.md:56,211`; `market-analysis.md:36` | `src/lib/ai/protocol/messages.ts:13` `type AiProvider = "anthropic" \| "openai"` (exactly two) | "OpenAI + Anthropic" is **shipped/verified**. The owner decided to remove unsupported Ollama references and list only shipped providers, without adding a planned-provider note. |
| Platform / CI matrix | `overview.md:47` "(macOS, Windows, Linux)"; `README.md:20,32,193`; `risks.md:10` "CI matrix on all platforms" | `docs/plans/roadmap.md:17` lists **browser, macOS, Windows, Linux** as intentional surfaces; `AGENTS.md` "Browser and desktop behavior must be deliberate" | Desktop-only matrices omit the deliberate browser build. Reconcile: describe surfaces per roadmap; treat the platform badge/matrix as a volatile fact owned by one source. |
| MCP element types | `mcp-server.md:117-119` lists 3: `process`, `data_store`, `external_entity` | `src-tauri/src/mcp/server.rs:101` `VALID_ELEMENT_TYPES = ["process", "data_store", "external_entity", "text"]` | Doc **omits `text`** (accepted by `add_element`/`update_element`). Add `text`. Note the code's own `#[schemars]` description at `server.rs:143` also omits `text` — a runtime inconsistency filed as out-of-scope follow-up, not fixed here. |
| MCP tool surface | `mcp-server.md:76-114` (12 tools, params, categories, severities) | `server.rs:590-603` `EXPECTED_TOOL_NAMES` (12 names) + fixture `src-tauri/src/mcp/fixtures/tool-surface.json`; request structs `server.rs:141-215`; STRIDE/severity strings `server.rs:204-211,501,510` | Tool names, parameters, STRIDE categories, and severity levels **match code** — verify-and-keep. Build/usage verify against `src-tauri/Cargo.toml:18-20` (`[[bin]] threatforge-mcp`) and `rmcp = "2.2"` (`Cargo.toml:30`). |
| "Production-ready" / launch gaps | `overview.md:37-49` "production-ready" + "Remaining for public launch: … signing, auto-updater, landing page, launch marketing" | `docs/plans/roadmap.md` Phase 0 (signing/updater as exit gates); `docs/runbooks/configuring-release-signing.md:3` "remaining owner and implementation work" | This is the `contains-planned` split: shipped-vs-remaining must stay explicitly labeled and link to the roadmap/issues; do not present remaining work as done or drop it. |
| Stack versions | `architecture.md` (React 19, Tauri v2, Tailwind 4, serde/serde_yaml, AES-256-GCM) | `package.json` deps (`react ^19.x`, `@tauri-apps/api 2.x`, `zod ^4`, `zustand ^5`); `src-tauri/Cargo.toml` | Verify each named version/library still matches; keep the architecture diagram as the entry point (do not relocate). |
| SECURITY.md provider list | `SECURITY.md:45` "user's own LLM API provider (OpenAI, Anthropic, Ollama)" | `messages.ts:13` (two providers) | The owner decided that the illustrative list must name only shipped Anthropic and OpenAI providers. |

### Tooling and gate facts

- `npm run ci:local` runs `scripts/ci-local.sh`: lockfile/Tauri-version checks, `biome check`,
  `tsc --noEmit`, `cargo fmt --check`, `clippy -D warnings`, Vitest, and web build. **Biome
  does not lint Markdown and no Markdown link checker exists** (IA § "Constraints and
  validation guidance"; confirmed — `scripts/` has no link tool). A deterministic Markdown
  link checker is explicitly deferred to `#162`.
- Therefore `ci:local` will not detect documentation defects; it is the regression gate proving
  this docs-only change did not touch code. Documentation correctness is verified by the manual
  evidence re-check and link-resolution steps below.

## Change matrix (file-by-file disposition)

"Modify" = edit permitted and required where a stale/duplicated claim is found. "Verify-in-pass"
= read and correct only if a claim contradicts evidence; otherwise leave. "Leave untouched" =
do not edit.

### Modify — `verify` and/or `contains-planned` rows (primary scope)

| File | IA disposition / flags | Required action | Key evidence |
|------|------------------------|-----------------|--------------|
| `docs/knowledge/overview.md` | repository-canonical · `verify`, `contains-planned`, `transitional` | Fix "13+ themes" (→15 or cite presets), remove "44 typed components" and all test counts, reconcile platform line to include browser, keep providers (verified), keep "production-ready"/"Remaining for public launch" but label shipped-vs-planned and link roadmap. | `src/lib/themes/presets.ts`, `component-library.ts`, `messages.ts`, `roadmap.md` |
| `docs/knowledge/product-design.md` | internal-strategy · `verify`, `contains-planned` | Verify "Feature Set (Implemented)" against code; remove volatile counts (44 components, 13+ themes, 27+ shortcuts) or cite source; keep "Should-Have (future)" / "Could-Have (future)" tables labeled future and add a roadmap/issue link. | `component-library.ts`, `command-registry.ts`, `presets.ts`, `roadmap.md` |
| `docs/knowledge/market-analysis.md` | internal-strategy · `verify` | Verify the ThreatForge column of the competitive table against code (platform, AI features, YAML/git, offline, STRIDE); leave external market sizing/CAGR but confirm each is attributed in the existing "Sources" section and dated; reconcile provider/platform claims to canonical evidence. | `messages.ts`, `component-library.ts`, `file-format.md`, existing `Sources` block |
| `docs/knowledge/risks.md` | internal-strategy · `verify` | Verify current technical claims (stack, "CI matrix on all platforms", ReactFlow/Tauri usage); label external/volatile numbers (e.g. "88K+ stars", "$600/year") as external and dated rather than asserted-as-current. | `package.json`, `src-tauri/Cargo.toml`, `.github/workflows/**` for CI matrix |
| `docs/knowledge/mcp-server.md` | repository-canonical · `verify` (against `src-tauri/src/mcp/**`) | Add `text` to Element Types; verify the 12 tool names, each tool's parameters, STRIDE categories, severity levels, build/usage, and "How it works" reload/save behavior against code and tests; correct any drift. | `server.rs:101,141-215,285-544,590-603`, `fixtures/tool-surface.json`, `bin/threatforge-mcp.rs`, `tests/mcp_stdio.rs`, `Cargo.toml:18-30` |
| `docs/quality/ai-output-quality.md` | repository-canonical · `contains-planned` | Confirm the "defines methodology, not a production gate yet" framing and any future-scope language stay explicitly labeled; ensure future material links to `docs/plans/roadmap.md` or a canonical issue. No methodology rewrite. | `ai-output-quality.md:1-5`, `AGENTS.md` reference |
| `docs/runbooks/configuring-release-signing.md` | repository-canonical · `contains-planned` | Confirm "Current repository state" vs "Remaining gap" / "Owner-only work" stays labeled and evidence-backed; verify the "protected `Production` environment / two-owner approval" claim against release workflow config; do not present remaining signing work as shipped. | `configuring-release-signing.md:3,42-73`, `.github/workflows/**`, `roadmap.md` Phase 0 |

### Modify — canonical entry-point contracts (preserve role, fix only verified drift)

| File | IA disposition | Required action | Key evidence |
|------|----------------|-----------------|--------------|
| `docs/knowledge/architecture.md` | repository-canonical (architecture entry point, named in `AGENTS.md`) | Preserve as the architecture entry point and keep the system diagram. Correct the external-LLM line to the two shipped providers and remove Ollama without adding a planned-provider note; verify named stack versions/libraries against `package.json` and `Cargo.toml`; remove any duplicated volatile fact in favor of a link. | `messages.ts:13`, `package.json`, `src-tauri/Cargo.toml` |
| `docs/knowledge/file-format.md` | repository-canonical (sole `.thf` contract, named in `AGENTS.md`) | Preserve as the single `.thf` contract. Verify described sections/version against the Rust model/serde types; **no schema or format change**. Correct only demonstrably stale prose. Threat-model expert reviews. | `src-tauri/src/**` model/serde types, `docs/runbooks/schema-migration.md` |

### Reconcile — root governance/contributor/security/agent docs (no move to Wiki)

| File | IA disposition | Required action |
|------|----------------|-----------------|
| `README.md` | repository-canonical · `transitional` | Remove only duplicated volatile counts (themes, components, tests, shortcuts) authorized for #159. Do not restructure the landing page, repoint Wiki/engineering links, or perform the #162 migration. |
| `CONTRIBUTING.md` | repository-canonical | Verify process/toolchain references still match `AGENTS.md`, `package.json` scripts, and runbooks; remove any duplicated mutable fact in favor of a link. Stays in repo (`#144` non-goal to move). |
| `SECURITY.md` | repository-canonical (canonical security policy) | Verify reporting process/scope; change the illustrative provider list to shipped Anthropic and OpenAI only. Remains the sole security-policy source. |
| `CODE_OF_CONDUCT.md` | repository-canonical | Verify contact/enforcement references resolve; otherwise leave. |
| `AGENTS.md` | repository-canonical (engineering source of truth) | Verify no mutable fact drifted. The owner decided not to add an IA pointer in #159. |
| `CLAUDE.md` | generated (adapter pointer) | Confirm it stays a thin pointer to `@AGENTS.md`; do not add policy. |

### Verify-in-pass — remaining repository-canonical docs (edit only on confirmed drift)

- `docs/runbooks/adding-a-feature.md`, `debugging-tauri-ipc.md`, `deploying-the-website.md`,
  `diagnosing-ci-failures.md`, `onboarding-a-contributor.md`, `releasing-a-version.md`,
  `responding-to-issues.md`, `schema-migration.md` — spot-verify commands, script names, and
  paths against `package.json`, `scripts/`, and `.github/workflows/**`; correct only if a
  command/path is wrong. Do not restyle.
- `docs/knowledge/glossary.md` — verify terms; no volatile facts. `#160` consumes it; do not
  fork or restructure here.
- `docs/knowledge/go-to-market.md` — internal-strategy, **no `verify` flag**: leave unless a
  claim is plainly contradicted by evidence.

### Leave untouched (explicit)

- `docs/archive/**` — read-only historical; **byte-for-byte untouched** (verify with git).
- `docs/wiki/**` — does not exist; not created (`#160`).
- `docs/plans/**` (`roadmap.md`, `0000-template.md`, `README.md`, and every `<issue>-<slug>.md`)
  — execution records; not rewritten. This new plan file is the only `docs/plans/**` addition.
- `docs/knowledge/documentation-architecture.md` — governing IA; referenced, not edited.
- `src/**`, `src-tauri/**`, `.github/workflows/**`, `dist/`, generated output — no change.

## How to avoid volatile duplication (rule the implementer must apply)

Per IA § "Volatile-facts rule" and "Anti-duplication rule": each mutable fact has exactly one
canonical owner; every other surface links, never copies. Apply per class:

- **Counts** (themes, components, tests, shortcuts): the code/test is the source. In prose,
  omit the number or replace it with a qualitative description plus a link/path to the source
  file. Never restate the same bare number in two docs (the theme count already drifted 13+ vs
  15). If a count must appear, cite its evidence file inline so review can re-verify.
- **Provider lists**: the source is `src/lib/ai/protocol/messages.ts` (`AiProvider`). Describe
  "BYOK, direct-to-provider" (an `AGENTS.md` invariant) rather than re-enumerating providers in
  every doc; where a list is genuinely useful, cite the type.
- **Release/launch status**: owned by `docs/plans/roadmap.md` and GitHub Project 2 — never a
  bare "production-ready" without the labeled remaining-work link.
- **Platform matrix**: owned by `docs/plans/roadmap.md` (browser + macOS/Windows/Linux as
  deliberate surfaces); other docs link rather than maintaining an independent matrix.
- **Live task status/priority/size**: never in docs (Project 2 only).

## Shipped-vs-planned handling for the four `contains-planned` rows

Each must make it implausible to read planned as shipped (IA § "Shipped vs planned vs history
labeling"; marker convention `Status: Shipped` / `Status: Planned (#NNN)` renders in Markdown
and Wiki):

- `docs/knowledge/overview.md`: keep the shipped feature list verified; keep "Remaining for
  public launch" explicitly labeled planned and link `docs/plans/roadmap.md` (Phase 0 signing/
  updater/website gates).
- `docs/knowledge/product-design.md`: keep "Feature Set (Implemented)" verified; keep
  "Should-Have (future)" and "Could-Have (future)" labeled future with a roadmap/issue link.
- `docs/quality/ai-output-quality.md`: keep "methodology, not a production gate yet" and any
  future generated-threats/visual-assistance scope labeled; link roadmap or issue.
- `docs/runbooks/configuring-release-signing.md`: keep "Current repository state" vs
  "Remaining gap" / "Owner-only work" split; link roadmap Phase 0. Do not present remaining
  signing work as complete.

## Claim safeguards and specialist review lanes

- **Architecture:** `docs/knowledge/architecture.md` stays the entry point; the diagram and
  cross-references are preserved, only verified drift corrected. → PR reviewer.
- **`.thf` / file-format:** `docs/knowledge/file-format.md` stays the sole `.thf` contract; no
  schema/format change; changes limited to verified stale prose. → Threat-model expert +
  PR reviewer.
- **Security:** `SECURITY.md` stays the canonical policy; BYOK/key-locality/untrusted-output
  invariants are described, never weakened; no secrets/keys/tokens added; release-signing
  runbook keeps least-privilege/owner-gated framing. → Security auditor.
- **AI:** untrusted-output and BYOK claims match `AGENTS.md` invariants; `ai-output-quality.md`
  future scope stays labeled. → Security auditor + Threat-model expert as applicable.
- **Release:** no signing status presented as shipped; roadmap Phase 0 gates are the source. →
  Security auditor + PR reviewer.
- **MCP:** STRIDE categories, severities, tool surface, and element types match
  `src-tauri/src/mcp/**` and the pinned fixture. → Threat-model expert (STRIDE) + PR reviewer.

## Internal-link validation approach (existing tools only)

No Markdown link checker exists and none is added here (deferred to `#162`). Validate links in
every modified document with existing tooling, read-only:

1. Enumerate relative Markdown links in changed files:
   `grep -noE '\]\(([^)]+)\)' <file>` (ignore `http(s)://`, `mailto:`, and pure `#anchor`).
2. For each relative target, resolve it from the containing file's directory and confirm the
   path exists in the working tree (`test -e` / `git ls-files`), including any `#section`
   target that points at another file's heading.
3. Confirm links added to canonical sources (roadmap, architecture, file-format, issues) point
   to real paths/anchors, and that no link points into `docs/wiki/**` (does not exist) or a
   `#162`-owned final README structure.
4. Re-run enumeration after edits; zero unresolved relative links in modified files is the
   acceptance bar. Record the check output in the PR body.

This is deterministic and repeatable without new scripts; the automated repo-wide checker is
`#162`'s deliverable.

## Implementation steps

Each step is XS/S-sized, independently executable, and touches only documentation.

### 1. Snapshot baseline and lock exclusions

- **Behavior:** Establish the untouched baseline so archive/plan-history invariants are
  provable.
- **Files:** none modified.
- **Implementation:** record `git rev-parse HEAD`; capture `git ls-files docs/archive` hashes
  (e.g. `git ls-tree -r HEAD docs/archive`) to assert byte-for-byte immutability at the end;
  confirm `docs/wiki` does not exist.
- **Targeted verification:** `git status` clean; archive hash list saved for the final diff
  assertion.
- **Intent validation:** owner confirms the exclusion set (archive, wiki, plans, runtime code)
  and README's narrow count-only scope before edits begin.

### 2. Resolve `docs/knowledge/mcp-server.md` against `src-tauri/src/mcp/**`

- **Behavior:** MCP doc matches the shipped tool surface and accepted element types.
- **Files:** `docs/knowledge/mcp-server.md`.
- **Implementation:** add `text` to "Element Types"; cross-check the 12 tool names against
  `EXPECTED_TOOL_NAMES` (`server.rs:590-603`) and the fixture; verify each tool's parameters
  against the request structs (`server.rs:141-215`), STRIDE categories/severities
  (`server.rs:204-211`), and build/usage against `Cargo.toml:18-30` and
  `bin/threatforge-mcp.rs`; verify "How it works" reload/save/JSON-RPC-over-stdio against
  `tests/mcp_stdio.rs` and `server.rs`.
- **Targeted verification:** every documented tool/param/category/severity has a matching code
  line cited; link check per the link section; optionally build the binary
  (`cargo build --bin threatforge-mcp`) to confirm the documented build command.
- **Intent validation:** owner confirms the doc now names `text` and no phantom tool/param.

### 3. Resolve `docs/knowledge/overview.md` (verify + contains-planned + transitional)

- **Behavior:** Overview claims are verified, volatile counts removed, planned material labeled.
- **Files:** `docs/knowledge/overview.md`.
- **Implementation:** remove "44 typed components" (both occurrences) and the test-count line;
  fix/omit "13+ themes" (actual 15 per `presets.ts`); reconcile the platform line to the
  roadmap's deliberate surfaces (add browser or link the roadmap); keep the verified provider
  and TMT-import claims; label "production-ready" precisely and keep "Remaining for public
  launch" as `Status: Planned` with a `docs/plans/roadmap.md` link. Do not add new duplicate
  counts.
- **Targeted verification:** no bare volatile count remains uncited; planned block links
  roadmap; links resolve.
- **Intent validation:** owner confirms a reader cannot mistake remaining launch work as done.

### 4. Resolve `docs/knowledge/product-design.md` (internal-strategy verify + contains-planned)

- **Behavior:** Implemented feature set is verified; future tables stay labeled; volatile counts
  removed.
- **Files:** `docs/knowledge/product-design.md`.
- **Implementation:** verify each "Feature Set (Implemented)" row against code (canvas,
  `.thf`, STRIDE, AI/BYOK, import, undo/redo, minimap, etc.); remove volatile counts (44
  components, 13+ themes, 27+ shortcuts) or cite sources; keep the 10-category fact only if
  cited to `component-library.ts`; keep "Should-Have (future)" and "Could-Have (future)"
  labeled future with a roadmap/issue link.
- **Targeted verification:** implemented rows are evidence-cited; future tables labeled+linked;
  no bare volatile counts.
- **Intent validation:** owner confirms internal-strategy meaning is preserved (not
  over-trimmed).

### 5. Resolve `docs/knowledge/market-analysis.md` and `risks.md` (internal-strategy verify)

- **Behavior:** Product-capability and technical claims are verified; external figures are
  attributed/dated, not asserted as current.
- **Files:** `docs/knowledge/market-analysis.md`, `docs/knowledge/risks.md`.
- **Implementation:** in `market-analysis.md`, verify the ThreatForge competitive-table column
  against code and keep external market/competitor figures under the existing "Sources"
  attribution; in `risks.md`, verify stack/CI claims and mark external counts (stars, cost) as
  external and dated. Reconcile provider/platform mentions to canonical evidence.
- **Targeted verification:** every ThreatForge capability cell traces to code; external claims
  are attributed; links resolve.
- **Intent validation:** owner confirms strategy framing intact and no capability is overstated.

### 6. Refresh `docs/knowledge/architecture.md` (preserve entry-point role)

- **Behavior:** Architecture entry point stays authoritative; the Ollama drift is corrected.
- **Files:** `docs/knowledge/architecture.md`.
- **Implementation:** correct the external-LLM line to the two shipped providers and remove
  Ollama without adding a planned-provider note; verify named stack versions/libraries; keep
  the diagram and cross-references; remove any duplicated volatile fact in favor of a link.
- **Targeted verification:** provider line matches `messages.ts`; versions match manifests; doc
  remains the architecture entry point (still linked from `AGENTS.md`).
- **Intent validation:** owner confirms only shipped providers are represented.

### 7. Verify `docs/knowledge/file-format.md` (sole `.thf` contract, no schema change)

- **Behavior:** `.thf` contract stays single-source and accurate.
- **Files:** `docs/knowledge/file-format.md`.
- **Implementation:** verify documented sections/version against the Rust model/serde types;
  correct only demonstrably stale prose; **no schema/format change**; keep it the sole `.thf`
  contract (no fork, no Wiki move).
- **Targeted verification:** described sections match serde types; version string matches code;
  links resolve.
- **Intent validation:** threat-model expert + owner confirm no schema semantics changed.

### 8. Confirm labeling in `ai-output-quality.md` and `configuring-release-signing.md`

- **Behavior:** Both `contains-planned` files keep future material labeled and linked.
- **Files:** `docs/quality/ai-output-quality.md`, `docs/runbooks/configuring-release-signing.md`.
- **Implementation:** confirm the "not a production gate yet" and future-scope framing in
  `ai-output-quality.md` stays labeled and links roadmap/issue; confirm the release-signing
  "Current repository state" vs "Remaining gap"/"Owner-only work" split stays labeled, verify
  the `Production`-environment/two-owner-approval claim against workflow config, and link
  roadmap Phase 0. Minimal edits only.
- **Targeted verification:** each future/remaining block is labeled and linked; release-state
  claim matches workflow config.
- **Intent validation:** owner confirms no planned gate reads as shipped.

### 9. Reconcile root governance/contributor/security/agent docs

- **Behavior:** Root contracts are accurate, non-duplicative, and stay in the repository.
- **Files:** `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `AGENTS.md`,
  `CLAUDE.md`.
- **Implementation:** verify process/toolchain/script references against `package.json`,
  `scripts/`, runbooks, and `AGENTS.md`; remove only duplicated volatile counts from README
  without restructuring it; list only shipped Anthropic and OpenAI providers in `SECURITY.md`;
  keep `CLAUDE.md` a thin pointer; do not add an `AGENTS.md`→IA pointer. Do not move any
  contract to the Wiki.
- **Targeted verification:** referenced commands/paths resolve; no new duplicated mutable fact;
  `CLAUDE.md` unchanged in role.
- **Intent validation:** owner confirms README remained count-only and root contracts retained
  their roles.

### 10. Verify-in-pass remaining canonical docs

- **Behavior:** Runbooks/glossary contain no wrong command/path; no restyle.
- **Files:** the eight runbooks listed above, `docs/knowledge/glossary.md`,
  `docs/knowledge/go-to-market.md` (leave unless contradicted).
- **Implementation:** spot-verify commands, script names, and paths; correct only confirmed
  drift.
- **Targeted verification:** each corrected command/path resolves; links resolve.
- **Intent validation:** owner spot-checks one runbook and the glossary.

### 11. Whole-set link validation and immutability assertion

- **Behavior:** All modified docs' internal links resolve; excluded files are provably untouched.
- **Files:** none new; validation over modified set.
- **Implementation:** run the link-validation procedure over every modified file; assert
  `docs/archive/**` matches the Step 1 hash list byte-for-byte; assert `docs/plans/**` (except
  this new file), `docs/wiki/**`, `src/**`, `src-tauri/**`, `.github/workflows/**` are
  unchanged (`git diff --stat`); assert README changes are limited to volatile-count removal.
- **Targeted verification:** zero unresolved relative links; `git diff --stat` shows only the
  intended docs + this plan; archive hashes identical.
- **Intent validation:** owner reviews the `git diff --stat` scope.

## Cross-cutting requirements

- **Security and privacy:** no secrets, keys, or tokens in any doc; `SECURITY.md` stays the
  canonical policy; BYOK/key-locality/untrusted-output invariants described, never weakened.
- **`.thf` compatibility:** no schema/format change; `file-format.md` stays the sole contract;
  `mcp-server.md` describes but never redefines schema semantics.
- **Browser and desktop:** platform descriptions cover the deliberate browser build alongside
  desktop, per `roadmap.md`/`AGENTS.md`.
- **AI safety:** untrusted-output/approval/undo framing stays consistent with `AGENTS.md`;
  `ai-output-quality.md` future scope labeled.
- **Accessibility and UX:** sentence-case headings and ISO `YYYY-MM-DD` dates per
  `.github/instructions/docs.instructions.md` in any edited heading/date.
- **Observability and evidence:** each retained current-behavior claim is traceable to a named
  evidence source; command results are never fabricated.

## Verification gate

Targeted checks first (per-step, above): manual evidence re-check against cited code/config,
and the link-resolution procedure over modified files. Then the required regression gate,
proving the docs-only change did not disturb code:

```bash
npm run ci:local
```

Because Biome does not lint Markdown and no link checker exists, `ci:local` is a
non-regression signal only; documentation correctness rests on the manual evidence and link
steps and on specialist review. No E2E/Docker/build/release checks are required for a
documentation-only change (the optional `cargo build --bin threatforge-mcp` in Step 2 only
confirms the documented MCP build command).

## Acceptance mapping

| Issue acceptance criterion | Satisfied by |
|----------------------------|--------------|
| Retained current-behavior claims traceable to named evidence; unsupported claims removed or labeled | Evidence table + Steps 2–10 |
| All five `verify` rows resolved with recorded evidence | Steps 2–6 (overview, product-design, market-analysis, risks, mcp-server) + evidence table |
| All four `contains-planned` rows keep labeled future material linked to roadmap/issue | Steps 3, 4, 8 + shipped-vs-planned section |
| Mutable facts have one canonical owner; no independent duplication | "Avoid volatile duplication" + Steps 3–6, 9 |
| Architecture/`.thf`/security/contribution/agent/runbook/planning/quality contracts remain in-repo and reviewable | Change matrix "Leave/Reconcile"; nothing moved to Wiki |
| Issue plans stay execution records; replan appended; `docs/archive/**` byte-for-byte untouched | Steps 1, 11 + Non-goals |
| Internal links resolve from GitHub and local checkout | Link-validation section + Step 11 |
| No product/schema/runtime/Wiki/workflow/final-README migration | Non-goals + narrow README change-matrix row |

## Owner validation

The owner settled the four implementation choices on 2026-07-22:

- README may receive only narrow volatile-count removal; final landing/navigation/link work
  remains #162.
- Do not add an `AGENTS.md`→IA pointer in #159.
- Remove Ollama from `architecture.md` and list only shipped providers, with no planned note.
- List only shipped Anthropic and OpenAI providers in `SECURITY.md`.

Deterministic checks still cannot decide these final validation points; owner must judge:

- Confirm the internal-strategy files (`product-design`, `market-analysis`, `risks`,
  `go-to-market`) retain intended strategic meaning and were not over-trimmed.
- Confirm no planned/remaining work anywhere reads as shipped.

## Specialist review

- [ ] PR reviewer — contract, evidence traceability, entry-point roles preserved, link results
- [ ] Slop auditor — documentation drift, fabricated precision, over-trimming, dead links
- [ ] Security auditor — `SECURITY.md`, release-signing runbook, BYOK/key/untrusted-output claims
- [ ] Threat-model expert — `file-format.md` `.thf` semantics, MCP STRIDE categories/severities

## Risks and rollback

- **Over-trimming an internal-strategy file** (removing a fact that is itself the canonical
  source). Mitigation: remove only *duplicated* facts; keep one canonical instance; internal-
  strategy files keep their strategic prose.
- **Introducing a broken link while adding canonical links.** Mitigation: Step 11 re-runs link
  validation after edits.
- **Accidental edit to an excluded file.** Mitigation: Step 1 baseline + Step 11 `git diff
  --stat` and archive-hash assertion.
- **Runtime inconsistency temptation** (e.g. fixing the `text` element type in `server.rs`
  schemars, or Ollama onboarding text in `src/`). Mitigation: out of scope — file follow-up
  issues; `#159` is docs-only.
- **Rollback:** documentation-only; revert the single docs commit (`git revert`) with no
  runtime, schema, or data impact.

## Out of scope / discovered work (file as new linked issues, do not fix here)

- `src-tauri/src/mcp/server.rs:143` `#[schemars]` description for `add_element` omits the
  `text` element type accepted by `VALID_ELEMENT_TYPES` (`server.rs:101`) — a wire-schema/runtime
  inconsistency requiring a code change and fixture regen.
- `src/lib/onboarding/guides.ts:112` and `src/components/onboarding/whats-new-overlay.tsx:30`
  name "Ollama" as a BYOK provider, but `AiProvider` supports only `anthropic`/`openai`
  (`messages.ts:13`) — runtime copy drift.
- Final `README.md` landing migration, engineering/Wiki link re-pointing, and a deterministic
  Markdown link-checker script — owned by `#162`.
- `docs/wiki/**` authoring — `#160`; Wiki publishing — `#161`.

## Replan log

Append changes; do not rewrite prior decisions.

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-07-22 | Initial plan | Issue `#159`, parent `#144`, completed dependency `#158`, governing IA `docs/knowledge/documentation-architecture.md`, and repository evidence: `src/lib/themes/presets.ts` (15 themes), `src/lib/component-library.ts` (47 items / 10 categories; test asserts ≥25), `src/lib/ai/protocol/messages.ts` (two providers), `src-tauri/src/mcp/server.rs` (+`text` element type, 12-tool surface), `src-tauri/Cargo.toml`, `docs/plans/roadmap.md`, `scripts/ci-local.sh`, and cross-file volatile-count contradictions (13+ vs 15 themes; stale 44-component and test counts; architecture Ollama drift). |
| 2026-07-22 | Resolve owner choices | Owner authorized narrow README volatile-count removal, declined the AGENTS pointer, chose shipped-only providers in architecture, and chose Anthropic/OpenAI-only wording in SECURITY. |
