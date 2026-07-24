# Issue 59 — Build a typed, licensed icon and component registry

## Objective

One typed registry becomes the source of truth for ThreatForge's component taxonomy and icon
catalogue. Every shipped icon carries pinned, machine-audited provenance, license, and trademark
metadata; no SVG document is ever parsed at runtime, so untrusted `.thf` and AI strings can only
select a bundled glyph and never supply one; and `#58` and `#60` can treat entry IDs as a stable
public contract that CI refuses to let anyone rename or delete.

## Issue contract

- **Issue:** `#59`
- **Parent initiative:** `#47`
- **Type:** `Task`
- **Size:** `L`
- **Priority:** `P1`
- **Autonomy:** `Automatable`
- **Dependencies:** `#57` (merged as `#123`; `element.tags`, `layer`, `group`, and `Diagram.kind`
  exist and `ElementType` is deliberately an open string so this issue owns the vocabulary). No
  blocking dependency. Concurrent seams with `#58`, `#60`, and `#93` — see *Concurrent work seams*.
- **Non-goals:**
  - Palette and inspector information architecture: tabs, virtualization, recents, favorites,
    keyboard navigation, panel presets (`#58`). This issue ships the data and query interface those
    surfaces consume, and nothing else.
  - Architecture templates and use-case E2E flows (`#60`). This issue guarantees the IDs those
    templates reference.
  - Any `.thf` schema change, new field, or version bump. The registry adds no document field; it
    types vocabularies that `element.type`, `element.subtype`, and `element.icon` already carry.
  - User-uploaded or document-embedded icons, and any runtime SVG parser. `#47` excludes this
    explicitly and Step 3 adds a test that keeps it excluded.
  - Removing the Rust/TypeScript STRIDE role duplication at its root. See *Deferred follow-ups*.
  - Per-entry colour, theming, or dark/light icon variants.
  - An in-app icon credits screen. See *Deferred follow-ups*.

### Deferred follow-ups (file as linked issues; do not build here)

1. **Single-source the STRIDE role table across Rust and TypeScript.** Step 9 proves the two agree
   for every ID in a shared table but cannot prove the table covers every Rust match arm, because
   `stride_category_for_type` (`src-tauri/src/stride/mod.rs:17`) is a hand-written `match`. Making
   the Rust side enumerable is a production Rust change and belongs in its own issue.
2. **In-app icon credits and trademark notice surface.** `NOTICE` is not shipped to the browser
   build. `#58` owns the settings/about surfaces; the registry already exposes the data.
3. **Provider-specific component entries** (`aws_lambda`, `azure_function`, …) beyond today's 16
   variants. This issue makes the shape and the audit exist; bulk curation is content work that
   should land in reviewable batches once the contribution runbook is committed.
4. **Removing `resolveIcon`'s dependence on `subtype` doubling as an icon key in `.thf`.** Step 4
   makes the link explicit data (`variant.iconId`) without changing any stored value; deciding
   whether `subtype` should stop being an icon-bearing field at all is a schema conversation.

## Current behavior and evidence

Every statement below was verified against the working tree at `7b2e025`.

### There is no registry today; there are three overlapping vocabularies

- `src/lib/component-library.ts` holds **45** `ComponentDefinition` entries (`id`, `label`, `shape`,
  `strideCategory`, `icon`, `category`, `tags`, `subtypes`) and **16** `SubtypeDefinition` entries.
  `ComponentDefinition.id` is the value stored as `.thf` `element.type`.
- The same file holds `ICON_MAP`, **44** string keys pointing at `lucide-react` components
  (lines 83–128). Those keys are stored as `.thf` `element.icon`:
  `component-palette.tsx:259` and `command-registry.ts:195` both call
  `addElement(type, position, { icon: component.icon, name: component.label })`.
- `src/lib/service-icons.ts` holds **8** `ServiceIcon` entries (`aws`, `docker`, `postgresql`,
  `redis`, `mongodb`, `nginx`, `graphql`, `kafka`), each a single SVG path string in a 24×24 box.
  Those IDs are reachable from `.thf` through both `element.icon` and `element.subtype`.

So three ID namespaces are already public schema, and two of them (`element.icon`,
`element.subtype`) are read through one lookup. `resolveIcon`
(`src/components/canvas/nodes/dfd-element-node.tsx:55`) resolves in this order:

1. `getServiceIcon(subtype || icon)` — a brand SVG wins over everything;
2. the variant's `icon` through `ICON_MAP`;
3. `getComponentByType(subtype)`'s icon;
4. `getComponentByType(type)`'s icon;
5. `icon` through `ICON_MAP`;
6. `null`.

The consequence worth naming: an explicit `element.icon` beats the component default **only when it
happens to name a brand icon**, purely because brand icons live in a different array. Step 8
replaces that with one documented precedence.

### The registry is not separated from rendering

`component-library.ts` imports 44 `lucide-react` components at module scope. `src/lib/stride-engine.ts`
imports `getStrideCategoryForType` from it, so the browser STRIDE path pulls in the icon component
graph. `src/stores/canvas-store-factory.ts` and `src/components/panels/threats-tab.tsx` import it
too. "Registry data is separated from palette layout and React rendering" is therefore a real
structural change, not a rename.

### Rendering is already safe, and must stay that way

`NodeIcon` (`dfd-element-node.tsx:89`) renders
`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={resolved.path} fillRule={…}/></svg>`.
React sets `d` as an attribute on an element it creates; the string is never parsed as markup.
`grep -rn "dangerouslySetInnerHTML\|innerHTML" src e2e index.html` returns exactly one hit, an
assertion in `src/components/onboarding/guide-overlay.test.tsx:50`. There is **no** unsafe HTML
rendering in the product today and this issue must not introduce one.

### Provenance today is an unverifiable comment

`service-icons.ts:1–7` says the icons are "sourced from Simple Icons (MIT/CC0) where available, with
simplified paths for small rendering sizes." Three problems, all verifiable by reading the file:

1. The claim is a module comment. Nothing is machine-checkable, no entry names a source URL, an
   upstream revision, or an SPDX identifier, and Simple Icons is `CC0-1.0`, not "MIT/CC0".
2. "Simplified paths" means the shipped geometry is a **derivative** of the upstream mark. The
   `docker` entry is a sequence of axis-aligned rectangles (`M4.82 17.28h2.34v-2.22H4.82Z…`), which
   is not the upstream Simple Icons geometry. Several vendor brand policies forbid modifying the
   mark, so "we simplified it" is the most legally exposed sentence in the repository.
3. Six of the eight entries are third-party trademarks (AWS, Docker, PostgreSQL, Redis, MongoDB,
   NGINX) with no owner, policy URL, or withdrawal path recorded.

The repository contains **no `.svg` files at all** outside `public/` (which holds PNGs and an ICO),
so there is no existing asset pipeline, no SVG toolchain, and no vendored upstream source to audit
against.

### `NOTICE` carries only the Apache-2.0 boilerplate

`NOTICE` is 15 lines and mentions no third-party asset, license, or trademark. There is no
attribution surface to audit against yet; Step 6 creates one.

### The taxonomy already disagrees with itself across the IPC boundary

`stride_category_for_type` (`src-tauri/src/stride/mod.rs:17`) classifies `data_store` as `Store` and
`external_entity` as `Actor`. Neither ID exists in `COMPONENT_LIBRARY`, so the TypeScript
`getStrideCategoryForType` (`component-library.ts:612`) falls through to its `?? "service"` default
for both. `getStrideAdapter` (`src/lib/adapters/get-stride-adapter.ts`) routes desktop to the Rust
engine and browser to `src/lib/stride-engine.ts`, so **the same document produces different threats
on desktop and in the browser**: a `data_store` element yields 3 threats on desktop and 6 in the
browser; an `external_entity` yields 2 on desktop and 6 in the browser.

This is not hypothetical vocabulary. `docs/knowledge/file-format.md:99–133` — the canonical example
in the format documentation — uses `type: process`, `type: data_store`, and `type: external_entity`.
`src/types/threat-model.contract.test.ts` and several store tests use them too. `process` is the
only one of the three that agrees (both sides fall to `service`).

**This contradicts the issue body's premise that a registry can be assembled from the existing
component taxonomy alone.** Step 1 pins the divergence, Step 9 closes it deliberately, and the root
cause (a hand-written Rust `match` duplicating a TypeScript table) becomes a linked issue.

### Untrusted strings already reach icon and type resolution

`src/lib/ai/schemas/actions.ts:118–121` types the AI-writable element payload as
`type: z.string().optional()`, `subtype: z.string().optional()`, `icon: z.string().optional()`.
`.thf` files supply the same three fields with no vocabulary check on either read path
(`src-tauri/src/file_io/reader.rs`, `src/lib/thf-validation.ts` — both validate references and IDs,
neither validates `type`/`icon`/`subtype` against any list). Resolution must therefore be **total**:
an unknown key returns a fallback and can never become markup.

### Test and fixture infrastructure the plan reuses

- Vitest `include` is `src/**/*.test.{ts,tsx}` with `environment: "jsdom"` (`vitest.config.ts`), so
  tests live under `src/` but read repository files through `node:fs` — the exact pattern
  `src/types/thf-fixtures.test.ts` uses via `new URL("../../tests/fixtures/…", import.meta.url)`.
  jsdom also provides a real `DOMParser`, which Step 3 depends on.
- `tests/fixtures/thf/` already exists with a `README.md` describing fixture classes; `tests/` is not
  ignored by `.gitignore` or `.dockerignore`.
- Biome's `files.includes` is `["src/**", "scripts/*.mjs", "*.ts", "*.json"]`, so anything new under
  `tests/` is unlinted, and a new helper script would have to be `.mjs`. Step 3 avoids adding one.
- Rust fixture reads use `concat!(env!("CARGO_MANIFEST_DIR"), "/../tests/fixtures/…")`
  (`src-tauri/src/file_io/fixtures_test.rs`).
- E2E selectors depend on the current IDs: `e2e/canvas-visual.spec.ts` and four other specs use
  `palette-item-web-server`, `palette-item-sql-database`, `palette-item-trust-boundary`, and
  `palette-item-generic`, derived by `component.id.replace(/_/g, "-")`
  (`component-palette.tsx:210`, `:264`). `e2e/canvas-visual.spec.ts-snapshots/` holds committed
  visual baselines.

### ADR numbering

ADRs are rows in the table at `docs/knowledge/architecture.md:52`, currently ADR-001 through
ADR-010. The next is **ADR-011**.

### Settled decisions index

Four decisions are settled by this plan and must not be re-litigated during implementation:

| Decision | Settled in |
|----------|-----------|
| Entry shape and the ID stability contract | Step 2 |
| SVG safety: contract, placement, and fail-closed behavior | Step 3 |
| Permitted license classes and what the audit asserts | Step 6 |
| Trademark representation and constraints | Step 6 |

## Concurrent work seams

| Issue | Overlap | Rule for this issue |
|-------|---------|---------------------|
| `#58` palette/inspector IA | Consumes the query interface and rewrites `component-palette.tsx` and `properties-tab.tsx`. | This issue swaps those two files onto the registry with **no layout change** (Step 8) so `#58` starts from a registry-backed surface. Publish `listComponents`/`searchComponents`/`listCategories`/`listProviders` with stable ordering; do not build tabs, recents, favorites, or virtualization. |
| `#58` **unresolved ordering conflict** | `docs/plans/58-panel-information-architecture.md` (written concurrently, not yet merged) instructs its implementer to add `src/lib/palette/catalog.ts` as an adapter over `component-library.ts`/`service-icons.ts` and to **not delete** `getIconComponent`, `searchComponents`, `getComponentsByCategory`, or `getAllComponents`. Step 8 of this plan deletes both modules. | **The two plans cannot both be executed as written.** They are compatible in one order only: `#59` merges first, then `#58`'s catalog adapter is written over `src/lib/registry/registry.ts` instead of over the deleted modules — `#58`'s `PaletteIconRef` seam is already opaque, so it maps onto `IconEntry` without redesign. Whoever executes second must re-read the other plan before starting. Escalate to the owner rather than silently reconciling; see *Owner validation* item 10. `#58`'s evidence section also states `service-icons.ts` has 9 entries — it has 8 (`grep -n 'id: "' src/lib/service-icons.ts`). |
| `#60` architecture templates | References registry entries by ID in template data. | The ID stability contract (Step 2) and the frozen manifest (Step 2) are what make that safe. Step 10 adds the test that every ID used by `src/lib/templates.ts` and every `.thf` fixture resolves, which is the guard `#60` inherits. |
| `#93` toolchain upgrades (in flight on `chore/93-toolchain-upgrades`) | Owns `package.json` dev tooling versions. | Step 5 adds one **devDependency** (`simple-icons`). Add it in a single, isolated `package.json`/`package-lock.json` hunk and rebase rather than reformatting the manifest. |
| `#53`/`#56` document registry and persistence | Own the stores. | The only store file touched is `src/stores/canvas-store-factory.ts`, and only its `getComponentByType` import (Step 8). Change the import, nothing else. |

## Implementation steps

### 1. Freeze the shipped vocabulary and characterize today's resolution

- **Behavior:** A committed manifest records every component, variant, and icon ID that ships today,
  and a characterization test pins today's shape, STRIDE role, and icon resolution for a corpus of
  real inputs — including the desktop/browser divergence. Every assertion written here must still
  pass unmodified after Step 8 except the single, named precedence change; that is the regression
  net for the whole issue.
- **Files:**
  - `tests/fixtures/registry/shipped-ids.json` (new)
  - `tests/fixtures/registry/README.md` (new)
  - `src/lib/registry/taxonomy-characterization.test.ts` (new)
- **Implementation:**
  1. `shipped-ids.json` holds three sorted, duplicate-free arrays: `componentIds` (the 45
     `COMPONENT_LIBRARY` ids), `variantIds` (the 16 `SubtypeDefinition` ids), `iconIds` (the 44
     `ICON_MAP` keys plus the 8 `SERVICE_ICONS` ids). Generate it from the modules, then read it by
     eye. `tests/fixtures/registry/README.md` states that this file is the public ID floor and that
     entries are appended, never removed or renamed.
  2. The characterization test imports the **current** modules (`component-library`, `service-icons`)
     and asserts:
     - a table of `id → { shape, strideCategory }` for all 45 components, written out literally, not
       derived from the module under test;
     - `resolveIcon` output identity for a matrix drawn from real inputs: every `(type, subtype,
       icon)` triple that appears in `src/lib/templates.ts`, every triple in `tests/fixtures/thf/**`,
       each of the 8 brand IDs reached through `subtype` and through `icon`, and the four unknown-key
       cases (`unknown type`, `unknown icon`, `unknown subtype`, all three unknown). Assert the
       resolved *identity* (`{kind:"lucide", name}` or the first 24 characters of the path `d`), not
       a rendered snapshot.
     - the divergence, stated as a fact rather than an aspiration:
       `expect(getStrideCategoryForType("data_store")).toBe("service")` with a comment naming
       `stride_category_for_type` and the threat-count consequence, and the same for
       `external_entity`. Step 9 flips these two assertions and nothing else.
  3. Do not fix anything in this step. Its value is that it fails loudly in Step 8 if the port
     changes behavior nobody intended.
- **Targeted verification:** `npx vitest --run taxonomy-characterization`. Discriminating check:
  temporarily change one entry's `shape` in `component-library.ts` and confirm the table assertion
  fails naming that ID; revert.
- **Intent validation:** Owner confirms the two divergence assertions describe real, current
  behavior and agrees they are a bug to be closed in Step 9 rather than preserved.

### 2. Define the registry types and settle the ID stability contract

- **Behavior:** The entry types exist with no data behind them yet, and the rules that make an ID
  permanent are written down and mechanically enforced.
- **Files:**
  - `src/lib/registry/types.ts` (new)
  - `src/lib/registry/id-stability.test.ts` (new)
  - `docs/knowledge/component-registry.md` (new; the ID section only, rest fills in Steps 3/6/10)
- **Implementation:**

  **Decision: two ID namespaces, flat and permanent, with lookup-time aliases and deprecation
  instead of deletion.**

  ```ts
  export type EntryStatus = "active" | "deprecated";

  export type ComponentCategory =
    | "generic" | "annotations" | "services" | "databases" | "messaging"
    | "infrastructure" | "security" | "clients" | "networking" | "platform";

  export type ProviderId =
    | "generic" | "aws" | "azure" | "gcp" | "cloudflare" | "kubernetes" | "oss";

  export type ShapeKind = "rounded" | "database" | "rect" | "hexagon" | "text";
  export type StrideRole = "service" | "store" | "actor" | "none";

  export interface ComponentVariant {
    readonly id: string;                  // .thf element.subtype — permanent
    readonly label: string;
    readonly aliases: readonly string[];
    readonly provider: ProviderId;
    readonly iconId: string;              // -> IconEntry.id; explicit, never inferred
    readonly status: EntryStatus;
  }

  export interface ComponentEntry {
    readonly id: string;                  // .thf element.type — permanent
    readonly label: string;
    readonly aliases: readonly string[];
    readonly category: ComponentCategory;
    readonly provider: ProviderId;
    readonly iconId: string;
    readonly shape: ShapeKind;            // normalized visual metadata
    readonly strideRole: StrideRole;
    readonly keywords: readonly string[];
    readonly variants: readonly ComponentVariant[];
    readonly status: EntryStatus;
  }
  ```

  Notes that are part of the decision, not commentary:
  - The field is `keywords`, not `tags`. `#57` added `Element.tags` as free-form *user* labels
    (`src/types/threat-model.ts:81`); reusing the word for search synonyms would make two unrelated
    concepts share a name across the document and the registry.
  - `category` and `provider` are closed unions of slugs with display labels resolved separately.
    Today `category` is simultaneously an identifier and a display string (`"Cloud / Platform"`),
    which `#58` cannot key tabs off.
  - **Scope of the stability contract:** only `ComponentEntry.id`, `ComponentVariant.id`, and
    `IconEntry.id` are document-visible. `label`, `category`, `provider`, `keywords`, `shape`, and
    ordering are presentation metadata and may change freely. Say this explicitly in the doc —
    `#58` and `#60` need to know which half they can rely on.

  **What makes an ID permanent.** An ID that has appeared in any released build is permanent from
  that moment:
  1. It is never reused for different semantics.
  2. It is never renamed. A rename is expressed as a new entry whose `aliases` contains the old ID.
  3. It is never deleted. An entry that should leave the palette gets `status: "deprecated"`; it
     still resolves, still renders, and is filtered out of `listComponents`/`searchComponents` by
     default. Deleting instead would silently reclassify existing documents: `getShapeForType`
     defaults to `"rounded"` and `getStrideCategoryForType` to `"service"`, so a removed
     `sql_database` would become a rounded service node and gain three threats it should not have.

  **Aliases resolve on lookup and never rewrite the document.** `resolveComponent("old_id")` returns
  the entry whose `aliases` contains it, and nothing writes the canonical ID back into the model.
  Rewriting on save would produce a spurious line in every `.thf` diff, against `#57`'s
  diff-minimality contract, and would make files unopenable by older builds that only know the old
  ID. Aliases are therefore permanent too.

  **Enforcement.** `id-stability.test.ts` asserts, against `tests/fixtures/registry/shipped-ids.json`:
  - every manifest ID resolves, directly or through an alias — the removal/rename trip-wire, with a
    failure message that names the missing ID and points at the deprecation rule;
  - the registry's ID set equals the manifest set, with additions reported as a distinct, actionable
    failure ("append `<id>` to shipped-ids.json") so growth stays a reviewed one-line diff rather
    than an unreviewed snapshot;
  - IDs are unique within each namespace and match `^[a-z0-9][a-z0-9_-]*$`;
  - no alias collides with any canonical ID in the same namespace, and no alias is claimed twice.
  In this step the test runs against an empty registry and the manifest, so it fails; wire it green
  in Step 4 and Step 5 as the data lands. Write it now so the data cannot land without it.
- **Targeted verification:** `npx tsc --noEmit` and `npx vitest --run id-stability`. Discriminating
  check: after Step 4, delete one ID from `component-entries.ts` and confirm the failure names that
  ID and the deprecation rule; then add an ID without touching the manifest and confirm the second,
  differently-worded failure.
- **Intent validation:** Owner accepts that IDs are permanent public schema and that the cost is a
  registry that only ever grows, with deprecated entries retained indefinitely.

### 3. Add the SVG source validator and the adversarial payload corpus

- **Behavior:** A pure, allow-list SVG reducer accepts a source document only if it reduces to path
  data, and rejects everything else with a reason. It runs where untrusted SVG actually exists —
  contribution and CI time — and never ships to the runtime.
- **Files:**
  - `src/lib/registry/icon-source-validation.ts` (new)
  - `src/lib/registry/icon-source-validation.test.ts` (new)
  - `src/lib/registry/no-runtime-svg-parser.test.ts` (new)
  - `tests/fixtures/icons/README.md`, `tests/fixtures/icons/valid/*.svg`,
    `tests/fixtures/icons/adversarial/*.svg` (new)
- **Implementation:**

  **Decision: the shipped payload is path data, not an SVG document; validation is an allow-list;
  it runs at contribution/CI time; there is no runtime parser.**

  Three layers, each with a different job:

  1. **Contribution/CI time — the only place an SVG document exists.**
     `parseIconSvg(source: string): { ok: true; paths: IconPath[] } | { ok: false; reason: string }`.
     Pre-parse textual gate first: reject any input containing `<!DOCTYPE`, `<!ENTITY`, or a
     processing instruction other than a leading `<?xml … ?>` declaration. Entity handling differs
     between XML parsers, so this must not depend on the parser. Then
     `new DOMParser().parseFromString(source, "image/svg+xml")`; reject on `<parsererror>`.
     Then walk the tree with an **allow-list**:
     - allowed elements: `svg` (root, exactly one) and `path`; a `<title>`/`<desc>` with only text
       content is allowed and discarded;
     - allowed `svg` attributes: `xmlns`, `viewBox` (must equal `0 0 24 24`), `width`, `height`,
       `role`, `fill` (only `none`/`currentColor`);
     - allowed `path` attributes: `d` (required) and `fill-rule` (only `evenodd`/`nonzero`);
     - **any** other element, attribute, namespace prefix, or text node rejects the whole document.
       There is no sanitize-and-continue path and no "strip the bad bit" branch.
     - `d` must match `/^[MmZzLlHhVvCcSsQqTtAaEe0-9+\-.,\s]+$/` and be at most 8 KB; the reduction
       collapses whitespace runs to single spaces and trims.
     An allow-list is the decision because a denylist has to keep up with the attack surface — the
     corpus below contains a comment-split tag specifically to demonstrate that a `<script`-substring
     check is not a control.

  2. **Test time, every CI run.** Steps 5 and 6 assert that every `kind: "paths"` entry equals the
     reduction of its committed source, and that its `d` satisfies the character allow-list and the
     size bound independently of how it got there.

  3. **Runtime — no SVG parsing exists.** `.thf` and AI strings are lookup keys only; a miss returns
     the generic fallback. `no-runtime-svg-parser.test.ts` walks `src/` with `node:fs`, collects
     every module importing `icon-source-validation`, and asserts the set contains only
     `*.test.ts`/`*.test.tsx` files. That is the mechanical guarantee that the parser never reaches
     a shipped bundle and that nobody quietly wires up an upload path — the behavior `#47` excludes.

  **Reconciling with "never use unsafe HTML rendering."** Nothing here renders HTML. The renderer
  (Step 8) creates `<svg>`/`<path>` React elements and sets `d` and `fillRule` as attributes; there
  is no `dangerouslySetInnerHTML`, no `innerHTML`, and no string concatenation into markup. The
  product-level safety property does not depend on `parseIconSvg` being correct: even a parser
  bypass could only emit a `d` string, which is separately constrained to path-data characters and
  set as an attribute on an element React constructs. `parseIconSvg` is a contribution-hygiene gate
  layered on top of that, not the last line of defense. State this in
  `docs/knowledge/component-registry.md` so a reviewer does not mistake the parser for the control.

  **Adversarial corpus.** One file per case in `tests/fixtures/icons/adversarial/`, driven by a
  table in the test that names the expected rejection. Every case must be rejected; the test asserts
  `ok === false` and that `reason` names the offending construct.

  | File | Payload class |
  |------|---------------|
  | `script-element.svg` | `<script>` sibling of a valid `<path>` |
  | `script-cdata.svg` | `<script><![CDATA[alert(1)]]></script>` |
  | `namespaced-script.svg` | `<svg:script>` via a namespace prefix |
  | `onload-attribute.svg` | `onload` on the root |
  | `mixed-case-event.svg` | `OnMouseOver` on a `<path>` — casing must not bypass |
  | `foreign-object.svg` | `<foreignObject>` wrapping XHTML `<img onerror>` |
  | `use-xlink-remote.svg` | `<use xlink:href="https://…#a">` |
  | `use-href-protocol-relative.svg` | `<use href="//evil.example/x.svg#a">` |
  | `image-remote.svg` | `<image href="https://…/pixel.png">` (remote fetch / tracking) |
  | `image-data-uri.svg` | `<image href="data:image/svg+xml;base64,…">` (nested SVG) |
  | `style-element-import.svg` | `<style>@import url(https://…)</style>` |
  | `style-attribute.svg` | `style="fill:url(https://…#g)"` — any `style` attribute at all |
  | `fill-url-external.svg` | `fill="url(https://…#g)"` external paint server |
  | `filter-url-external.svg` | `filter="url(https://…#f)"` |
  | `anchor-javascript.svg` | `<a xlink:href="javascript:alert(1)">` |
  | `entity-encoded-javascript.svg` | `href="&#106;avascript:alert(1)"` |
  | `smil-animate-href.svg` | `<animate attributeName="href" to="javascript:…">` |
  | `smil-set-onclick.svg` | `<set attributeName="onclick" to="alert(1)">` |
  | `doctype-xxe.svg` | `<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>` |
  | `entity-expansion.svg` | nested-entity expansion (billion laughs) |
  | `xml-stylesheet-pi.svg` | `<?xml-stylesheet href="https://…" type="text/xsl"?>` |
  | `comment-split-tag.svg` | `<sc<!-- -->ript>` — proves the check is not a substring scan |
  | `path-d-breakout.svg` | `d="M0 0L1 1'/><script>alert(1)</script>"` — breakout shape in `d` |
  | `oversized-path.svg` | `d` over the 8 KB bound |
  | `wrong-viewbox.svg` | `viewBox="0 0 512 512"` — normalization must be explicit |
  | `transform-on-group.svg` | `<g transform="matrix(…)">` — geometry flattening is not silent |
  | `nested-svg.svg` | `<svg>` inside `<svg>` |
  | `title-with-event.svg` | `<title onclick="alert(1)">` |

  **Positive corpus, and why it is mandatory.** `tests/fixtures/icons/valid/` holds
  `single-path.svg`, `multi-path-evenodd.svg`, and `title-and-desc.svg`. The test asserts each is
  accepted **and** that the reduced paths equal a literal expected value. Without this a validator
  that rejects everything would pass the adversarial suite — the classic fake-completeness failure.
- **Targeted verification:** `npx vitest --run icon-source-validation no-runtime-svg-parser`.
  Discriminating checks, run and then reverted: (a) replace the allow-list walk with a
  `source.includes("<script")` denylist and confirm at least
  `namespaced-script`, `comment-split-tag`, `foreign-object`, `style-attribute`, and
  `use-xlink-remote` fail; (b) make `parseIconSvg` return `{ ok: false }` unconditionally and confirm
  the positive corpus fails; (c) add an import of `icon-source-validation` to
  `src/lib/registry/registry.ts` and confirm `no-runtime-svg-parser` fails.
- **Intent validation:** Owner reads the corpus table and confirms no payload class they care about
  is missing, and accepts that ThreatForge will never accept a user-supplied SVG at runtime.

### 4. Port the component taxonomy into typed entries with no behavior change

- **Behavior:** All 45 components and 16 variants exist as `ComponentEntry`/`ComponentVariant` data
  with the same IDs, shapes, and STRIDE roles. Nothing consumes it yet.
- **Files:**
  - `src/lib/registry/component-entries.ts` (new)
  - `src/lib/registry/registry.test.ts` (new)
- **Implementation:**
  1. Transcribe every entry. `id`, `shape`, and `strideCategory → strideRole` are copied verbatim —
     any change here is a behavior change and belongs to Step 9, not this step.
  2. `category` maps to the slug union; keep the current declaration order so
     `listCategories()` yields `annotations, services, databases, messaging, infrastructure,
     security, clients, networking, platform`, matching today's `COMPONENT_CATEGORIES` insertion
     order. Palette tab order and the committed visual baselines depend on it.
  3. `tags` becomes `keywords` verbatim. `aliases` starts empty for every entry except where Step 9
     adds legacy IDs.
  4. `provider` is `"generic"` for every component; variants carry the real provider (`s3`,
     `cloudfront` → `aws`; `azure_sql`, `cosmosdb`, `azure_blob` → `azure`; `cloud_sql`, `gcs` →
     `gcp`; `cloudflare` → `cloudflare`; `redis`, `memcached`, `rabbitmq`, `kafka`, `dynamodb`,
     `sns`, `sqs` per their vendor). Provider is presentation metadata, so getting a value wrong is
     a fixable label bug, not a schema break — say so in the doc.
  5. `iconId` on each component is today's `icon` string. `iconId` on each variant is the icon the
     current resolver actually produces, which is **not** always the variant's declared `icon`:
     `redis` and `kafka` resolve to their brand SVGs because `resolveIcon` checks the service
     registry with `subtype` first. Read the Step 1 characterization table to fill these in; do not
     copy `SubtypeDefinition.icon` blindly.
  6. `status` is `"active"` everywhere in this step.
- **Targeted verification:** `npx vitest --run id-stability registry`. `id-stability` must now pass
  for `componentIds` and `variantIds`. Add a test asserting the transcription against the Step 1
  table: for all 45 IDs, `getComponent(id).shape` and `.strideRole` equal the characterization
  table. Discriminating check: change one `strideRole` and confirm both the transcription test and
  (after Step 8) the characterization test fail.
- **Intent validation:** None beyond Step 8.

### 5. Port the icon vocabulary with lockfile-pinned sources and provenance

- **Behavior:** All 52 icon IDs exist as `IconEntry` data. Lucide-backed entries name their lucide
  icon; bundled-path entries carry geometry provably derived from a pinned upstream package. Any
  mark that cannot be sourced that way is withdrawn to a fallback glyph **with its ID retained**.
- **Files:**
  - `src/lib/registry/types.ts` (extend), `src/lib/registry/icon-entries.ts` (new)
  - `package.json`, `package-lock.json` (add `simple-icons` as a devDependency)
  - `tests/fixtures/icons/sources/<icon-id>.svg` (new, one per bundled-path entry)
  - `src/lib/registry/icon-entries.test.ts` (new)
- **Implementation:**
  1. Icon types:
     ```ts
     export interface IconPath { readonly d: string; readonly fillRule?: "evenodd" | "nonzero"; }

     export type IconArtwork =
       | { readonly kind: "lucide"; readonly name: string }
       | { readonly kind: "paths"; readonly viewBox: "0 0 24 24";
           readonly sourceFile: string; readonly paths: readonly IconPath[] }
       | { readonly kind: "withdrawn"; readonly reason: string; readonly fallbackIconId: string };
     ```
     `sourceFile` lives inside the `paths` variant so `tsc` enforces "bundled geometry names its
     committed source" — it is impossible to add path data without provenance.
  2. Add `simple-icons` as a **devDependency**, in one isolated hunk. Copy each needed
     `node_modules/simple-icons/icons/<slug>.svg` verbatim into
     `tests/fixtures/icons/sources/<icon-id>.svg`. Provenance becomes lockfile-pinned and
     integrity-hashed rather than a URL claim, and `scripts/check-lockfile-registry.mjs` already
     guards the lockfile. Alternative considered and rejected: hand-vendoring SVGs with a recorded
     URL and commit SHA — it re-creates today's unverifiable-claim failure, because nothing in CI can
     check the claim.
  3. `icon-entries.test.ts` asserts, for every `kind: "paths"` entry, that
     `tests/fixtures/icons/sources/<sourceFile>` is **byte-identical** to
     `node_modules/simple-icons/icons/<slug>.svg`, and that `parseIconSvg(source).paths` deep-equals
     `artwork.paths`. If `simple-icons` is missing, the test **fails**; it does not skip.
  4. Re-derive the 8 existing brand icons. Each must satisfy: a committed source copied from the
     pinned package, accepted by `parseIconSvg`, an allowed license (Step 6), and — for third-party
     marks — unmodified geometry. Today's hand-simplified paths satisfy none of these and are
     replaced wholesale. If a mark is absent from the pinned `simple-icons` release (that project
     removes marks on owner request), set the entry to
     `{ kind: "withdrawn", reason, fallbackIconId }` pointing at the abstract glyph the component
     already used (`aws` → `archive`-class fallback per its component, `docker` → `container`, and so
     on). **The ID stays.** Withdrawal must never break a `.thf` file that references it — that is
     the decisive reason ID permanence and artwork content are separate fields.
  5. Lucide-backed entries: `{ kind: "lucide", name }` for all 44 `ICON_MAP` keys. The registry data
     module imports nothing from `lucide-react`; the name→component map moves to the renderer in
     Step 8. This is the concrete "data separated from rendering" change: after it,
     `src/lib/stride-engine.ts` no longer transitively imports 44 React components.
- **Targeted verification:** `npx vitest --run icon-entries id-stability`. Discriminating checks:
  (a) change one character of a committed source file and confirm the byte-identity assertion fails;
  (b) change one character of a shipped `d` and confirm the reduction comparison fails naming the
  entry; (c) delete `node_modules/simple-icons` and confirm the suite fails rather than skips.
- **Intent validation:** Owner reviews the final list of shipped versus withdrawn brand marks and the
  fallback each withdrawn ID renders. This is a legal-surface judgment; the mechanical rule decides
  what an agent may ship, but the resulting catalogue is the owner's call.

### 6. Add the license, provenance, and trademark audit with a `NOTICE` attribution block

- **Behavior:** An entry without provenance, or with a disallowed license, or with an unflagged
  vendor mark, fails CI. `NOTICE` carries the attribution and trademark data and cannot drift from
  the registry.
- **Files:**
  - `src/lib/registry/types.ts` (extend), `src/lib/registry/icon-entries.ts` (populate)
  - `src/lib/registry/provenance-audit.test.ts` (new)
  - `NOTICE` (extend), `docs/knowledge/component-registry.md` (extend)
- **Implementation:**

  **Decision: a closed license union covering public-domain and permissive-with-attribution only.**

  ```ts
  export type IconLicense =
    | "CC0-1.0" | "Unlicense" | "MIT" | "ISC" | "BSD-3-Clause" | "Apache-2.0";
  ```

  Allowed because every one of these is satisfiable by a single static `NOTICE` section and none
  imposes share-alike on the application. Explicitly disallowed, and named in the doc so the line is
  not re-argued: `CC-BY-*` (per-icon attribution obligation that a static notice does not reliably
  discharge), `CC-BY-SA-*`, `GPL-*`, `AGPL-*`, `MPL-2.0` (copyleft on an asset embedded in the
  bundle), `CC-BY-NC-*` (non-commercial, incompatible with Apache-2.0 redistribution), and anything
  unlicensed, "free for personal use", or unknown. There is no `"unknown"` member and no escape
  hatch: an entry missing provenance fails `tsc`, not just the audit.

  ```ts
  export interface IconProvenance {
    readonly project: string;      // "Lucide", "Simple Icons" — the NOTICE key
    readonly sourceUrl: string;    // absolute https URL
    readonly sourceRef: string;    // pinned package version or commit SHA; never "main"/"latest"
    readonly license: IconLicense;
    readonly copyright: string;    // required for MIT/ISC/BSD-3-Clause/Apache-2.0; "" for CC0/Unlicense
  }
  ```

  **Decision: trademarks are represented as required, closed-union metadata, and constrained by
  policy — not by rendering.**

  ```ts
  export type IconTrademark =
    | { readonly kind: "none" }
    | { readonly kind: "third-party"; readonly owner: string;
        readonly policyUrl: string; readonly unmodified: true };
  ```

  `unmodified: true` is a literal type, so a modified mark cannot be expressed. The constraints, all
  written into `docs/knowledge/component-registry.md`:
  1. **Nominative use only.** A vendor mark identifies that vendor's product on the user's own
     diagram. It is never used in ThreatForge branding, the app icon, README imagery, marketing, or
     as the default glyph for a generic component type.
  2. **No modification.** Geometry ships as the upstream artifact. The one permitted normalization is
     dropping a hard-coded `fill` so `currentColor` applies, which Step 3's allow-list already
     enforces by refusing any other attribute. Today's "simplified paths" are exactly what this
     forbids.
  3. **Owner and policy URL recorded** so a takedown can be honored mechanically.
  4. **Withdrawal is a data change, never a deletion.** Flip `artwork` to `kind: "withdrawn"`; the ID
     resolves forever and no user's file breaks. This is the payoff of Step 2's contract.
  5. **Third-party marks appear only on explicitly branded variants**, never as a component type's
     default `iconId`. `sql_database` keeps an abstract glyph; `postgresql` is a variant the user
     chooses.

  **What the audit asserts** (`provenance-audit.test.ts`), for every icon entry:
  1. `provenance.license` is a member of the allowed set, checked at runtime against a literal array
     as well as by the type, so an `as` cast cannot smuggle a value past `tsc`.
  2. `provenance.sourceUrl` parses as a URL with protocol exactly `https:`.
  3. `provenance.sourceRef` is non-empty and is not `main`, `master`, `HEAD`, or `latest`.
  4. `provenance.copyright` is non-empty for `MIT`/`ISC`/`BSD-3-Clause`/`Apache-2.0`.
  5. Every `kind: "paths"` entry has a committed source file (asserted in Step 5) and a `d` matching
     the path-data character allow-list and the 8 KB bound — re-asserted here independently of
     `parseIconSvg`, so the shipped invariant does not depend on the parser.
  6. Every entry whose `provider` is a real vendor, or whose `label` matches a committed list of
     vendor names, has `trademark.kind === "third-party"` with a non-empty `owner` and an `https:`
     `policyUrl`. A vendor mark cannot ship silently flagged `none`.
  7. **`NOTICE` set equality.** `NOTICE` gains two machine-readable blocks:
     ```
     <!-- icon-attribution:start -->
     - Lucide — ISC — https://github.com/lucide-icons/lucide
     - Simple Icons — CC0-1.0 — https://github.com/simple-icons/simple-icons
     <!-- icon-attribution:end -->

     <!-- icon-trademarks:start -->
     - Docker — Docker, Inc. — https://www.docker.com/legal/trademark-guidelines/
     <!-- icon-trademarks:end -->
     ```
     The test derives the distinct `(project, license, sourceUrl)` set and the distinct
     `(label, owner, policyUrl)` set from the registry, parses the two blocks, and asserts **set
     equality in both directions**. Adding an icon from a new upstream project without updating
     `NOTICE` fails; removing the last icon from a project without pruning `NOTICE` also fails. This
     is the assertion that makes the audit real rather than a shape check.
- **Targeted verification:** `npx vitest --run provenance-audit`. Discriminating checks: (a) change
  one entry's license to `"CC-BY-4.0"` and confirm both `tsc` and the runtime membership assertion
  fail; (b) delete one line from the `NOTICE` attribution block and confirm set equality fails naming
  the missing project; (c) flip one vendor mark's `trademark` to `{ kind: "none" }` and confirm the
  vendor-name assertion fails; (d) blank a `copyright` on an MIT entry and confirm it fails.
- **Intent validation:** Owner confirms the permitted license set, the `CC-BY` exclusion, and the
  nominative-use trademark policy. Both are legal-posture decisions for an Apache-2.0 project and
  neither should be settled by CI alone.

### 7. Add O(1) lookup, alias resolution, filtered search, and a scale budget

- **Behavior:** The registry is constructed once from entry data into ID and alias maps plus a
  precomputed search index. Lookup is total and never returns `undefined` for the resolver
  entry points. A 5,000-entry registry stays responsive.
- **Files:**
  - `src/lib/registry/registry.ts` (new), `src/lib/registry/registry.test.ts` (extend)
  - `src/lib/registry/registry-scale.test.ts` (new)
- **Implementation:**
  1. `createRegistry(components, icons)` returns the query object; a module-level `registry` is built
     from the shipped data and the named functions delegate to it. The factory exists so the scale
     test can build a synthetic registry without shipping 5,000 icons, mirroring the injected-factory
     pattern `#53` established in `src/stores/document-stores.ts`.
  2. Built once at construction: `Map<id, ComponentEntry>`, `Map<alias, id>`, the same pair for
     icons and variants, `Map<ComponentCategory, ComponentEntry[]>`, `Map<ProviderId,
     ComponentEntry[]>`, and one lowercase `haystack` string per entry joining `label`, `id`,
     `aliases`, `keywords`, and the provider and category labels. No per-query allocation, no regex
     construction per keystroke.
  3. Public interface — this is what `#58` and `#60` compile against:
     ```ts
     getComponent(id: string): ComponentEntry | undefined;
     getIcon(id: string): IconEntry | undefined;
     resolveComponent(typeValue: string): ComponentEntry;                 // total
     resolveElementIcon(el: { type: string; subtype?: string; icon?: string }): IconEntry; // total
     listComponents(filter?: { category?: ComponentCategory; provider?: ProviderId;
                               includeDeprecated?: boolean }): readonly ComponentEntry[];
     searchComponents(query: string, filter?: …): readonly ComponentEntry[];
     listCategories(): readonly { id: ComponentCategory; label: string }[];
     listProviders(): readonly { id: ProviderId; label: string }[];
     ```
     Ordering is declaration order, stable across calls, so `#58` can index a virtualized list by
     position. Deprecated entries are excluded from `listComponents`/`searchComponents` unless
     `includeDeprecated` is set, and are always returned by `getComponent`/`resolveComponent`.
  4. **Resolution precedence** — one rule, documented, replacing the six-branch cascade:
     `subtype` (variant of the resolved component, else a component entry whose ID equals it) →
     `icon` → the component's `iconId` → the generic fallback. This changes exactly one observable
     behavior: an explicit `element.icon` now beats the component's default even when it is not a
     brand icon. Today that only worked for the 8 brand IDs, purely because they lived in a
     different array. Verify against the Step 1 matrix that no `(type, subtype, icon)` triple
     occurring in `templates.ts` or `tests/fixtures/thf/**` changes; the change is reachable only by
     a hand-authored or AI-authored document that sets `icon` to something the type did not.
  5. Unknown keys are not errors: `resolveComponent` returns the `generic` entry and
     `resolveElementIcon` returns the generic glyph. Fail-closed here means "render something inert",
     not "throw", because a `.thf` file with an unknown type must still open.
  6. Scale test: build a synthetic 5,000-entry registry through the factory and assert
     construction under 100 ms and 200 mixed queries (exact ID, alias, prefix search, category
     filter, provider filter) under 250 ms in total. The budget is a regression trip-wire with
     roughly an order of magnitude of headroom, not a benchmark — record the measured local timing in
     the PR body so the headroom is visible. Also assert correctness at scale: an exact-ID lookup on
     the 5,000-entry registry returns the right entry, which fails if someone reintroduces a linear
     `Array.find`.
- **Targeted verification:** `npx vitest --run registry registry-scale`. Discriminating check:
  replace the ID map with `entries.find(e => e.id === id)` and confirm the scale test's query budget
  fails; replace the precomputed haystack with a per-query `new RegExp(query, "i")` build and confirm
  the same.
- **Intent validation:** Owner confirms the precedence change (explicit `icon` wins) is the intended
  semantics for `element.icon`.

### 8. Move rendering behind one icon renderer and swap every consumer

- **Behavior:** Every consumer reads the registry; `component-library.ts` and `service-icons.ts` are
  deleted; one React component renders an `IconEntry`. No visible layout, ordering, or selector
  changes.
- **Files:**
  - `src/components/icons/icon-renderer.tsx`, `src/components/icons/icon-renderer.test.tsx` (new)
  - `src/components/palette/component-palette.tsx`, `src/components/canvas/nodes/dfd-element-node.tsx`,
    `src/components/panels/properties-tab.tsx`, `src/components/panels/threats-tab.tsx`,
    `src/lib/command-registry.ts`, `src/lib/stride-engine.ts`,
    `src/stores/canvas-store-factory.ts` (edit)
  - delete `src/lib/component-library.ts`, `src/lib/service-icons.ts`,
    `src/lib/component-library.test.ts`
  - `src/lib/registry/taxonomy-characterization.test.ts` (retarget)
- **Implementation:**
  1. `icon-renderer.tsx` owns the only `lucide-react` name map and the only SVG element construction:
     `kind: "lucide"` renders the component; `kind: "paths"` renders
     `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">` with one `<path>` per entry
     carrying only `d` and `fillRule`; `kind: "withdrawn"` renders `fallbackIconId`, resolved once
     with a guard against a fallback chain. No `className`, `style`, or `fill` may come from registry
     data — that is what forecloses CSS `url()` by construction.
  2. Swap consumers one file at a time. Non-negotiable invariants:
     - `data-testid` strings stay byte-identical: `palette-item-${id.replace(/_/g, "-")}` and
       `palette-item-trust-boundary` / `palette-item-generic` / `palette-item-text`;
     - palette category tab order and item order are unchanged;
     - `properties-tab.tsx` keeps writing `icon: <the component's iconId>` on a type change and
       `subtype: undefined`, so saved documents are unchanged;
     - `stride-engine.ts` imports only `resolveComponent(...).strideRole`, which removes its
       transitive `lucide-react` dependency.
  3. Re-home every assertion from `component-library.test.ts` rather than dropping it. The
     "all icon names resolve to valid lucide components" test (line 124) becomes an assertion that
     every `kind: "lucide"` entry's `name` exists in the renderer's map. The deprecated
     `getComponentBySubtype` alias has no caller outside its own test and is dropped, which is stated
     in the PR body rather than done silently.
  4. Retarget `taxonomy-characterization.test.ts` to the registry. Exactly one assertion changes: the
     `(type, icon)` case where an explicit non-brand `icon` now wins. Every other assertion must pass
     unmodified. If a second assertion needs editing, the port changed behavior nobody authorized.
  5. Add an untrusted-input regression test: an element whose `icon` is
     `"</path><script>alert(1)</script>"` and whose `type` is `"../../etc/passwd"` renders the
     generic fallback, and `container.querySelector("script")` is `null`.
- **Targeted verification:** `npx vitest --run`, `npx tsc --noEmit`, then `npx playwright test`. The
  committed visual baselines in `e2e/canvas-visual.spec.ts-snapshots/` must pass **without being
  regenerated**; regenerating them would hide exactly the regression this step risks.
  Discriminating check: change one component's `shape` in the registry and confirm both the
  characterization test and a visual baseline fail; revert.
- **Intent validation:** Owner opens an existing `.thf` file on desktop and in the browser and
  confirms every node renders the same icon and shape as before, and that the palette looks
  unchanged. This is the step where a silent regression is most likely and least visible to CI.

### 9. Admit the legacy DFD types and prove Rust/TypeScript role parity

- **Behavior:** `process`, `data_store`, and `external_entity` become deprecated registry entries
  whose `strideRole` matches the Rust engine, closing the desktop/browser threat divergence for the
  types the format documentation's own example uses.
- **Files:**
  - `src/lib/registry/component-entries.ts` (extend),
    `tests/fixtures/registry/shipped-ids.json` (extend)
  - `tests/fixtures/registry/stride-roles.json` (new)
  - `src/lib/registry/stride-role-parity.test.ts` (new)
  - `src-tauri/src/stride/mod.rs` (**test module only**; no production Rust change)
  - `src/lib/registry/taxonomy-characterization.test.ts` (flip the two divergence assertions)
- **Implementation:**
  1. Add three entries with `status: "deprecated"`, matching `stride_category_for_type`
     (`src-tauri/src/stride/mod.rs:17–31`): `process` → `service`/`rounded`; `data_store` →
     `store`/`database`; `external_entity` → `actor`/`rect`. Give them `aliases` linking them to
     their modern equivalents where one exists, and keep them out of the palette via `deprecated`.
  2. `stride-roles.json` is a flat `{ "<component id>": "service" | "store" | "actor" | "none" }`
     table authored from the Rust match arms plus every registry ID.
  3. TypeScript test: for every row, `resolveComponent(id).strideRole` equals the table.
  4. Rust test in a `#[cfg(test)]` module: read the table with
     `concat!(env!("CARGO_MANIFEST_DIR"), "/../tests/fixtures/registry/stride-roles.json")` and
     assert `stride_category_for_type(id)` equals each row. No production Rust changes; the Rust
     `match` is untouched.
  5. Record the honest residual gap in the test header and in `docs/knowledge/component-registry.md`:
     a Rust-only match arm added later without a table row is not caught, because the `match` is not
     enumerable. Single-sourcing it is the linked follow-up issue, not this one. Do not claim
     coverage the mechanism does not have.
  6. This step deliberately changes user-visible behavior for legacy documents: in the browser a
     `data_store` goes from 6 threats to 3 and from a rounded node to a database node, and an
     `external_entity` goes from 6 threats to 2 and to a rect node — matching what desktop has
     always done. Keep it as its own commit so it can be reverted independently.
- **Targeted verification:** `npx vitest --run stride-role-parity taxonomy-characterization` and
  `cargo test --manifest-path src-tauri/Cargo.toml stride`. Discriminating check: change one row in
  `stride-roles.json` and confirm the Rust test and the TypeScript test both fail on that row — that
  is the proof the table is load-bearing on both sides rather than restating one of them.
- **Intent validation:** Owner confirms that closing the divergence in favor of the Rust
  classification is correct, and that changing threat counts for existing legacy documents is
  acceptable. The alternative — teaching the Rust engine the browser's defaults — would remove three
  correct classifications and should be rejected explicitly.

### 10. Document the contract, the contribution runbook, and ADR-011

- **Behavior:** The registry contract, the ID policy, the license and trademark policy, the
  resolution precedence, and the icon contribution review process are written down where `#58` and
  `#60` will look for them, and every `.thf` fixture and template ID is proven to resolve.
- **Files:**
  - `docs/knowledge/component-registry.md` (complete), `docs/knowledge/architecture.md` (ADR-011 row
    and project-structure tree), `docs/runbooks/adding-an-icon.md` (new),
    `docs/knowledge/file-format.md` (vocabulary pointer)
  - `src/lib/registry/consumer-contract.test.ts` (new)
- **Implementation:**
  1. `docs/knowledge/component-registry.md` covers: the two ID namespaces and which fields are
     document-visible; the permanence, alias, and deprecation rules; the resolution precedence; the
     license allow-list and the exclusions with reasons; the trademark policy and the withdrawal
     path; the SVG allow-list and the explicit statement that no runtime parser exists and that the
     shipped guarantee is the path-data allow-list plus attribute-only rendering, not the parser.
  2. `docs/runbooks/adding-an-icon.md` is the documented review process the issue requires: bump or
     confirm the pinned `simple-icons` version, copy the source verbatim, add the entry with
     provenance and trademark metadata, append the ID to `shipped-ids.json`, update `NOTICE`, and run
     the audit. State plainly that arbitrary user uploads are unsupported by design and that there is
     no runtime ingestion path.
  3. ADR-011: "Icon artwork ships as validated path data with lockfile-pinned provenance." One-line
     consequence: every icon addition requires a source file, a `NOTICE` entry, and a manifest line.
  4. `docs/knowledge/file-format.md` gains one short paragraph stating that `element.type`,
     `element.subtype`, and `element.icon` are open strings whose vocabulary is the registry, that
     unknown values render a fallback rather than failing to open, and pointing at the new doc.
  5. `consumer-contract.test.ts` asserts that every `type`, `subtype`, and `icon` value appearing in
     `src/lib/templates.ts` and in every file under `tests/fixtures/thf/` resolves to a
     non-fallback registry entry. This is the guard `#60` inherits: a template referencing a renamed
     or missing ID fails here rather than shipping a broken template.
- **Targeted verification:** `npx vitest --run consumer-contract`. Discriminating check: point one
  template element at `type: "does_not_exist"` and confirm the test fails naming the template and the
  value. Re-read the doc against `types.ts` field by field: no field described that does not exist,
  no field existing that is not described.
- **Intent validation:** Owner reads `docs/runbooks/adding-an-icon.md` and confirms a first-time
  contributor could add one icon by following it without asking a question.

## Cross-cutting requirements

- **Security and privacy:** The trust boundary is icon *content*, and it is crossed exactly once, at
  contribution time. Three layers, in order of strength: geometry is only ever path data constrained
  to a character allow-list; it is rendered as React-set attributes with no HTML parsing, no
  `dangerouslySetInnerHTML`, and no registry-supplied `style`/`class`/`fill`; and `parseIconSvg`
  rejects any source outside a tiny allow-list. Runtime input (`.thf` fields and AI payloads, both
  arbitrary strings per `src/lib/ai/schemas/actions.ts:118–121`) can only ever be a lookup key, and
  an unknown key resolves to an inert fallback. `no-runtime-svg-parser.test.ts` mechanically keeps the
  parser out of the shipped bundle. No IPC surface, no filesystem access, no network access, and no
  secrets are introduced. The strict CSP in `src-tauri/tauri.conf.json:25` is unchanged and remains
  sufficient: bundled path data needs no `img-src` or `style-src` relaxation, and external references
  are rejected before they could need one.
- **`.thf` compatibility:** No schema change, no new field, no version bump. Every ID that a `.thf`
  file can contain today still resolves after this change, enforced by
  `tests/fixtures/registry/shipped-ids.json`. Files are never rewritten by alias resolution.
  Unknown `type`/`subtype`/`icon` values continue to open and render a fallback — that behavior is
  preserved deliberately and tested, because failing closed on an unknown vocabulary value would make
  forward compatibility impossible.
- **Browser and desktop:** The registry is frontend-only and identical on both. Step 9 removes an
  existing, unintended platform divergence in STRIDE classification; the residual difference — that
  Rust owns its own role table — is documented, table-tested, and has a linked follow-up. No new
  intentional difference is created.
- **AI safety:** AI-authored `type`, `subtype`, and `icon` values are untrusted strings entering the
  same total resolver as file input, with the same fallback. AI gains no ability to supply artwork,
  and the existing validation, transactional apply, and undo machinery is untouched.
- **Accessibility and UX:** Rendered icons keep `aria-hidden="true"` and remain decorative next to a
  text label, matching today's `NodeIcon` and palette markup; the accessible name comes from the
  component label. Contrast is unaffected because artwork inherits `currentColor` in both themes.
  Withdrawn marks render a real glyph, never an empty box. No layout, ordering, focus, or keyboard
  behavior changes in this issue — those belong to `#58`.
- **Observability and evidence:** The PR should carry the full `NOTICE` diff, the list of shipped
  versus withdrawn brand marks with the reason for each withdrawal, the measured local timing behind
  the scale budget, before/after palette and canvas screenshots showing no visual change from Step 8,
  and a statement that every Step 1 assertion passed unmodified except the one named precedence case.

## Verification gate

Targeted, in the order the steps land:

```bash
npx vitest --run taxonomy-characterization
npx vitest --run id-stability
npx vitest --run icon-source-validation no-runtime-svg-parser
npx vitest --run icon-entries provenance-audit
npx vitest --run registry registry-scale
npx vitest --run stride-role-parity consumer-contract
npx tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml stride
npx biome check .
```

Then the full frontend suite and E2E, because Step 8 is the risk:

```bash
npx vitest --run
npx playwright test
```

Final required gate:

```bash
npm run ci:local
```

Run `npm run ci:docker` before handoff: `tests/fixtures/icons/` and the `node_modules/simple-icons`
byte-identity assertion are new path dependencies, and Docker CI is where a missing file or an
`.dockerignore` gap surfaces. A Tauri build is not required — no Rust production code changes.

## Owner validation

Deterministic checks cannot decide any of the following:

1. **Which brand marks ThreatForge ships.** Step 5's rule decides what an agent *may* ship; the
   resulting catalogue, and each withdrawal, is a legal-posture judgment. Read the shipped/withdrawn
   list and the fallback each withdrawn ID renders.
2. **Is the license allow-list right?** Excluding `CC-BY-4.0` rules out Font Awesome Free and several
   other large catalogues. Confirm the exclusion, or direct that `CC-BY` be admitted with a
   per-icon attribution mechanism.
3. **Is nominative-use-only the right trademark posture?** The accepted position is that vendor marks
   appear only on user-chosen branded variants, never in ThreatForge's own branding or as a default
   glyph. Confirm, or direct a stricter no-vendor-marks policy.
4. **Is permanent-ID growth acceptable?** The registry can only grow; deprecated and withdrawn
   entries are retained indefinitely. The alternative — deleting entries — silently reclassifies
   existing documents through the `"rounded"`/`"service"` defaults.
5. **Is the Step 9 behavior change acceptable?** Browser threat counts change for legacy `data_store`
   and `external_entity` elements, and their canvas shapes change. Confirm that matching the desktop
   engine is correct, or direct that the divergence be left in place and tracked separately.
6. **Is the precedence change acceptable?** An explicit `element.icon` now beats the component
   default for non-brand icons too. No committed template or fixture changes, but a hand-edited file
   could render differently.
7. **Is the `simple-icons` devDependency acceptable?** It buys lockfile-pinned, integrity-hashed
   provenance and a CI assertion that shipped geometry is byte-derived from upstream. The cost is a
   multi-megabyte development-only dependency.
8. **Shipping registry data ahead of the UI.** Provider filters, deprecation filtering, and the scale
   budget have no user-facing surface until `#58`. Confirm the sequencing, or direct that `#59` merge
   alongside a consumer.
9. **Deferred follow-ups.** Confirm the four deferred items become linked issues under `#47`.
10. **`#59`/`#58` execution order.** The concurrently written `#58` plan tells its implementer to
    preserve `component-library.ts` and `service-icons.ts` and adapt over them; Step 8 here deletes
    both. Decide the merge order — the analysis in *Concurrent work seams* argues `#59` first, with
    `#58`'s catalog adapter written over `src/lib/registry/registry.ts` — or direct that Step 8 keep
    the old modules as thin re-export shims until `#58` lands.

## Specialist review

- [ ] PR reviewer
- [ ] Slop auditor — especially Step 3's layering claim (the parser is a hygiene gate, not the
      control) and Step 8's re-homing of every `component-library.test.ts` assertion rather than
      dropping coverage with the module
- [ ] Security auditor — **required.** Icons are untrusted third-party content and this issue defines
      how that content is validated, where the validation runs, what the shipped guarantee actually
      rests on, and how untrusted `.thf`/AI strings reach icon resolution. The auditor should
      specifically review the Step 3 allow-list and adversarial corpus, the
      `no-runtime-svg-parser` invariant, the path-data character allow-list and size bound, the
      attribute-only rendering contract in Step 8, and the CSP claim in *Cross-cutting requirements*
- [ ] Threat-model expert — required for Step 9: the STRIDE role table, the Rust/TypeScript parity
      mechanism, and the false-positive/false-negative consequences of reclassifying `data_store` and
      `external_entity` in the browser engine

## Replan log

Append changes; do not rewrite prior decisions.

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-07-21 | Initial plan | Issue `#59`, parent `#47`, sibling issues `#57`/`#58`/`#60`, and repository evidence at `7b2e025`: `src/lib/component-library.ts` (45 components, 16 variants, 44 icon-map keys), `src/lib/service-icons.ts` (8 brand paths, unverifiable provenance comment), `src/components/canvas/nodes/dfd-element-node.tsx:55–107` (resolution precedence and safe attribute rendering), `src/lib/stride-engine.ts:215`, `src-tauri/src/stride/mod.rs:17–31`, `src/lib/adapters/get-stride-adapter.ts`, `src/lib/ai/schemas/actions.ts:118–121`, `src/types/threat-model.ts`, `docs/knowledge/file-format.md:99–133`, `NOTICE`, `vitest.config.ts`, `biome.json`, `src-tauri/tauri.conf.json:25`, `e2e/*.spec.ts` selectors. Desktop/browser STRIDE divergence for `data_store` and `external_entity` established by reading both engines and the adapter router. |
| 2026-07-24 | Implementation deviations forced by the environment (Steps 1–4, 6-lucide, 7, 9, 10 landed; Steps 5-brand, 6-brand, 8 deferred) | **(a) npm registry unreachable (`ENOTCONN` on `registry.npmjs.org`; GitHub reachable).** The `simple-icons` devDependency (Step 5.2) could not be installed and no cached copy exists, so brand marks cannot be vendored with lockfile-pinned, byte-identity-verified provenance. Per the plan's supply-chain rule and the run instruction not to weaken lockfile gates on transient npm networking, no dependency or lockfile entry was fabricated and the GitHub-URL vendoring the plan explicitly rejected was not substituted. The 8 brand icons (`aws`, `docker`, `postgresql`, `redis`, `mongodb`, `nginx`, `graphql`, `kafka`) are parked as `kind: "withdrawn"` with honest reasons and abstract fallbacks (Step 5.4's designated state), keeping their IDs permanent and resolution total without shipping unverified artwork. Restoring them to `kind: "paths"` is the network-gated remainder of Steps 5–6. **(b) Consumer swap (Step 8) deferred.** Step 8 requires the brand marks as `paths` to preserve `redis`/`kafka` node rendering under its "no visible change" gate, so `component-library.ts`/`service-icons.ts` are left intact and no consumer, store, or `.tsx` file was modified. The registry ships as unwired data with a stable query API (owner-validation item 8 contemplates this). Runtime behavior, selectors, and visual baselines are therefore unchanged; no screenshots were regenerated. `taxonomy-characterization.test.ts` remains pinned to the legacy modules (its Step 8 retarget lands with the swap). **(c) `node:fs` → `import.meta.glob`.** The toolchain ships no `@types/node`, so fixture/corpus reads use Vite's `?raw` glob loader (the repository's established pattern, e.g. `src/lib/persistence/no-key-leakage.test.ts`) instead of the `node:fs`/`new URL` mechanism the plan's evidence assumed. **(d) Manifest already includes the 3 legacy DFD IDs** (`process`/`data_store`/`external_entity`) from Step 9 rather than as a later extend. All landed steps are green: `id-stability`, `taxonomy-characterization`, `icon-source-validation`, `no-runtime-svg-parser`, `icon-entries`, `provenance-audit`, `registry`, `registry-scale`, `stride-role-parity` (TS + Rust), and `consumer-contract`; the three plan discriminating checks for Steps 2/3/6 were run and reverted. Follow-up: complete Steps 5-brand/6-brand/8 once npm access is restored; owner to ratify the interim withdrawn state (owner-validation items 1 and 10). |
| 2026-07-24 | Canonical dependency recovery — Steps 5-brand, 6-brand, and 8 completed | **Provenance recovered without the local npm registry.** `simple-icons@16.27.0` was pinned from independently corroborated evidence: the npm tarball URL `https://registry.npmjs.org/simple-icons/-/simple-icons-16.27.0.tgz` and SHA-512 integrity `sha512-Rk2dCRVCPHnla9/mHmztJOlbkfncPDUMSOPozQO3+c+vr6Uwy9jhNHeuxxvNZgbF9ZwpoT1BCu1LNB4Q07VmZQ==`, identical across the official `simple-icons/simple-icons-website-rs` and `simple-icons/simple-icons-font` lockfiles. `package.json`/`package-lock.json` gained the single `simple-icons` devDependency hunk with the canonical resolved URL, integrity, `dev: true`, `funding`, `license: CC0-1.0`, and `engines.node >= 0.12.18`; `check:lockfile` passes unweakened. The package `package.json` fetched via the pinned jsDelivr npm mirror was byte-identical (SHA-256) to the upstream 16.27.0 GitHub tag. **Seven brand marks now ship `kind: "paths"`** (docker, postgresql, redis, mongodb, nginx, graphql, kafka): each SVG was retrieved through `https://cdn.jsdelivr.net/npm/simple-icons@16.27.0/icons/<slug>.svg`, verified against the per-file SHA-256 in `data.jsdelivr.com/v1/package/npm/simple-icons@16.27.0/flat`, committed to `tests/fixtures/icons/sources/<icon-id>.svg`, and asserted byte-identical to `node_modules/simple-icons/icons/<slug>.svg` (seeded locally; `npm ci` installs the canonical package on remote CI; `icon-entries.test.ts` fails rather than skips if the package is absent). Trademark owners and policy URLs were verified from each vendor's authoritative page (Docker, Inc.; PostgreSQL Community Association of Canada; Redis Ltd.; MongoDB, Inc.; F5, Inc. for NGINX; The GraphQL Foundation; The Apache Software Foundation), and Kafka's Apache-2.0 per-icon license override is recorded as distinct provenance. **`aws` stays `withdrawn`** honestly — the `amazonwebservices` mark is absent from 16.27.0 (HTTP 404), so its ID is retained with an `archive` fallback. `NOTICE` attribution and trademark blocks were updated to exact set equality. **Step 8 completed:** every runtime consumer (`component-palette`, `dfd-element-node`, `properties-tab`, `threats-tab`, `command-registry`, `stride-engine`, `canvas-store-factory`) now reads the registry; `component-library.ts`/`service-icons.ts`/`component-library.test.ts` are deleted; the lucide name→component map and all SVG construction live in the new `src/components/icons/icon-renderer.tsx`; `taxonomy-characterization.test.ts` and `registry.test.ts` were retargeted off the deleted modules; the deprecated `getComponentBySubtype` alias was dropped (no external caller). Visual baselines were not regenerated. Architecture ADR renumbered to **ADR-012** (ADR-011 was taken by `#62`). Residual follow-ups from the prior row are resolved. |
| 2026-07-24 | Independent preflight corrections supersede the affected implementation assumptions above | The four required review lanes found that the legacy renderer accepted all eight frozen service-icon IDs through `element.subtype`; the registry now preserves that branch before component-scoped variants, and the characterization matrix proves all eight IDs through both `subtype` and `icon`. The prior “exactly one observable change” claim is withdrawn: explicit recognized icons, total generic fallback, exact Simple Icons geometry, the AWS withdrawal fallback, and the documented STRIDE parity changes are the reviewable behavior changes. Source SVG fixtures are byte-identical with no permitted `fill` edit; validated paths are pasted as production literals rather than importing the contribution parser. Per-component variant/alias maps make resolution O(1), including a 5,000-variant scale case. Shipped versus withdrawn artwork/provenance is now a discriminated union. Lucide provenance is bound to installed `lucide-react@1.25.0`; nine Feather-derived glyphs carry MIT rather than ISC metadata, complete ISC/MIT grants are in `NOTICE`, the web legal page embeds canonical notices, and desktop bundles include `LICENSE`/`NOTICE` resources. |
