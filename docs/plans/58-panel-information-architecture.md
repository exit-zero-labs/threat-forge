# Issue 58 — Reorganize the palette, inspector, and workspace information architecture

## Objective

A user can find any component in the palette by category, provider, search, recency, or
favorite; can read and edit every property `#57` added to the document model through an
inspector whose architecture, visual, threat, and AI groups are visually and programmatically
distinct; and can reach every one of these surfaces with the keyboard alone, in every
selection state (none, one, many) and at every supported panel width.

## Issue contract

- **Issue:** `#58`
- **Parent initiative:** `#47`
- **Type:** `Task`
- **Size:** `L`
- **Priority:** `P1`
- **Autonomy:** `Automatable`
- **Project status at planning time:** `Backlog`. Metadata is settled (P1 / L / `Automatable` /
  `model/sonnet` / `M2`); this committed plan is the remaining prerequisite for `Ready`.
- **Dependencies:**
  - `#57` — **merged**. Its `layers`, `groups`, `relationships`, `Element.layer`,
    `Element.group`, `Element.tags`, `Metadata.threat_analysis_enabled`, `Diagram.kind`, and
    `Diagram.description` fields exist in `src/types/threat-model.ts` and
    `src-tauri/src/models/threat_model.rs`. Surfacing them is the core of this issue.
  - `#59` — **not merged, being planned concurrently.** This issue consumes an assumed icon and
    catalog interface through exactly one module. See *Assumed `#59` interface* below.
  - `#54` — **not merged, being planned concurrently.** See *Concurrent work seams*.
  - `#56` — **partially merged** (`src/lib/persistence/`, `src/stores/workspace-store.ts` landed
    in `#132`). This issue deliberately stores nothing in `#56`-owned files. See Decision **D2**.
- **Non-goals:**
  - Rendering `relationships`, `groups`, or `layers` as canvas nodes/edges. No renderer exists;
    building one is a canvas issue, not an information-architecture issue. `#57`'s deferred
    item 3 nominated `#58` as the home for new visual vocabulary — that nomination is declined
    here and must become its own issue (see *Deferred follow-ups*).
  - Per-view / multi-diagram UX. `src/lib/model-layout-utils.ts` still reads
    `model.diagrams[0]` only.
  - Bulk property editing across a multi-selection (see Decision **D3**).
  - The icon catalog content, licensing metadata, and SVG-safety validation (`#59`).
  - Architecture templates (`#60`).
  - Tab strip, tab overflow, per-tab dirty state (`#54`).
  - Adding a virtualization dependency (see Decision **D1**).
  - Keyboard support for `ResizeHandle` (`src/components/ui/resize-handle.tsx` has none today).
    Real gap, out of this issue's four named accessibility lanes; file separately.

### Deferred follow-ups (file as linked issues under `#47`; do not build here)

1. **Canvas rendering and authoring for `relationships`.** `#57` shipped the schema; nothing
   draws them. Until then a relationship can never be selected, so this issue adds no
   relationship inspector — only a read-only count so the user can see the file is not
   silently dropping them.
2. **Canvas rendering for `groups`.** `Group` mirrors `TrustBoundary`'s field set precisely so
   the boundary node machinery can be reused, but reusing it is a canvas change.
3. **Bulk property assignment across a multi-selection** (layer, group, tag). Needs
   transactional multi-entity mutation plus a single undo step; `model-store-factory`'s
   `captureHistoryDebounced` keys on one entity id today.
4. **AI mutation provenance in the inspector.** See Decision **D3**, AI group.
5. **Keyboard-operable panel resize** (`role="separator"`, arrow keys, `aria-valuenow`).
6. **The Rust twin of `isThreatAnalysisEnabled`.** See Step 7.

## Current behavior and evidence

Every statement below was verified against the working tree at `7b2e025`.

### The palette today

`src/components/palette/component-palette.tsx` (304 lines) is a single file holding data
selection, layout, drag/drop, and two item components.

- Three hardcoded `GENERIC_ITEMS` (Component / Boundary / Text) render in a fixed top block.
- Below that: a text search, a horizontal category tab strip, and a flat `map` of results.
- `COMPONENT_LIBRARY` in `src/lib/component-library.ts` has **45 entries** across **9
  categories** (`Annotations` 1, `Clients` 6, `Cloud / Platform` 4, `Databases` 8, `Generic` 1,
  `Infrastructure` 5, `Messaging` 3, `Networking` 4, `Security` 8, `Services` 5).
- **16 subtypes** exist across those entries (`rds`, `s3`, `dynamodb`, `sns`, `sqs`,
  `cloudfront`, `azure_sql`, `azure_blob`, `cosmosdb`, `cloud_sql`, `gcs`, `cloudflare`,
  `kafka`, `redis`, `rabbitmq`, `memcached`). **This is the provider dimension the issue asks
  for, and it exists today** — it is simply not exposed in the palette.
- There is **no** recents, **no** favorites, **no** provider facet, **no** section grouping
  inside the library list, and **no** keyboard interaction of any kind: items are `<div>`s with
  `onDoubleClick` and `draggable`, not focusable, with no `role` and no `tabIndex`.
- Typing in the search box force-resets `activeCategory` to `"All"` and **unmounts** the
  category tab strip (`{!searchQuery && …}`), which would destroy focus if the strip were ever
  focusable.
- Empty state exists and is one line: `No matching components`. There is no loading state and
  no error state; the catalog is a module constant.

### The inspector today

`src/components/panels/right-panel.tsx` renders three tabs (`properties` / `threats` / `ai`)
driven by `useUiStore.rightPanelTab`. `src/components/panels/properties-tab.tsx` (786 lines) is
the inspector. It dispatches on three mutually exclusive ids from `model-store-factory`:
`selectedEdgeId`, `selectedBoundaryId`, `selectedElementId`, in that order.

Verified gaps, all of them the substance of this issue:

- **`#57`'s fields have no UI at all.** `grep` finds no reference to `layer`, `group`, or
  `tags` in any component. `src/lib/ai/schemas/actions.ts:126-132` already lets the **AI** write
  `layer`, `group`, and `tags` — so today the assistant can set fields the user cannot see or
  change.
- **`Element.stores` and `Element.encryption` have no UI either**, although they are in the
  schema and in `elementUpdateShape`.
- **`Metadata.threat_analysis_enabled` has no UI** and no resolution helper. `#57`'s plan
  Step 7 specified `ThreatModel::threat_analysis_enabled()` and
  `isThreatAnalysisEnabled(model)`; `grep` finds **neither in the merged tree**. This issue
  needs the rule, so it adds the TypeScript half (Step 7).
- **There are no property groups.** All fields are siblings in one `flex flex-col gap-3`.
- **There is no ARIA anywhere** in `component-palette.tsx`, `right-panel.tsx`,
  `properties-tab.tsx`, or `app-layout.tsx`. `grep -n "aria-\|role=" ` returns nothing for all
  four files.
- **`ColorField` produces two unlabelled controls.** The `<span>` label is not associated with
  either the `<input type="color">` or the `<input type="range">`, so both are announced with
  no name.
- **`ReadOnlyField` emits `<dt>`/`<dd>` with no `<dl>` ancestor** — invalid HTML and no
  description-list semantics.
- **Multi-selection silently lies.** `dfd-canvas.tsx:473` sets `multiSelectionKeyCode="Shift"`
  and `selectionMode={SelectionMode.Partial}`, so many nodes can be selected, but
  `onNodeClick` (line 242) writes a single id and `setSelectedElement` clears the other two
  ids. With three nodes selected the inspector shows exactly one of them and gives no
  indication that edits apply to one entity.
- **Empty selection is one sentence:** `Select an element or connector on the canvas to view
  its properties.` `e2e/empty-states.spec.ts:15` asserts the right panel contains
  `"Select an element"`.
- `FlowThreats` (line 184) filters `t.element === flowId`, but `Threat` has a separate `flow`
  field and `ElementProperties` filters `t.element === element.id`. A threat recorded against a
  flow via `Threat.flow` is invisible in both places. Pre-existing defect in this issue's blast
  radius; fixed in Step 9.

### Workspace and panel state today

`src/stores/ui-store.ts` owns `leftPanelOpen`, `leftPanelWidth`, `rightPanelOpen`,
`rightPanelWidth`, `rightPanelTab`, `canvasLocked`, and the dialogs. It hand-rolls two
`localStorage` keys (`threatforge-panel-widths`, `threatforge-theme`) rather than using
`zustand/middleware`'s `persist`. Widths are clamped to `[180, 400]` (left) and `[260, 500]`
(right). There is no preset concept.

Existing action surfaces that must stay in sync (the "common actions remain available
through…" criterion): `src/lib/command-registry.ts` (`view:*`, `navigate:*` commands),
`src/hooks/use-keyboard-shortcuts.ts` (`1`/`2`/`3`, `Cmd+B`, `Cmd+I`, `Cmd+Shift+I`, `Cmd+L`),
`src/components/layout/top-menu-bar.tsx` (`btn-toggle-left-panel`, `btn-toggle-right-panel`),
`src/components/canvas/canvas-context-menu.tsx` (`buildNodeMenuItems` /
`buildEdgeMenuItems`), and `src/components/panels/keyboard-shortcuts-dialog.tsx`.

### Load-bearing test selectors (must not break)

`e2e/fixtures.ts::addPaletteItem` double-clicks `palette-item-<kebab-id>` and waits for a new
`node-*`. These E2E specs depend on the current palette and inspector DOM:

| Selector | Used by |
|----------|---------|
| `component-palette` | `fixtures.ts:19`, `new-model.spec.ts` |
| `library-search` | (declared, currently unused by E2E) |
| `palette-item-generic`, `-web-server`, `-sql-database`, `-trust-boundary` | `keyboard-shortcuts`, `stride-analysis`, `canvas-visual`, `element-editing`, `dirty-state`, `save-reopen` |
| `right-panel`, `tab-properties`, `tab-threats`, `tab-ai` | `element-editing`, `empty-states`, `ai-chat` |
| `<label>` wrapping the input, filtered by text `Name` / `Trust Zone` | `element-editing.spec.ts:29,47` |
| right panel `toContainText("ID")`, `("Type")`, `("Select an element")` | `element-editing`, `empty-states` |

Visual baselines in `e2e/canvas-visual.spec.ts-snapshots/` screenshot `.react-flow` only, so
palette and inspector changes do **not** invalidate them. Do not regenerate them.

### Save does not validate; read does

`src/lib/thf-validation.ts::validateThreatModel` rejects dangling `element.layer`,
`element.group`, `group.parent`, and `relationship.from`/`to`, mirroring
`src-tauri/src/file_io/reader.rs::validate_references`. Neither
`serializeThreatModelYaml` nor `browser-file-adapter.saveFile` calls it. **A UI that leaves a
dangling architecture reference writes a file that then fails to open on both platforms.**
This is the single strongest constraint on Step 7.

### Two icon sources exist today

1. `ICON_MAP` in `src/lib/component-library.ts` — Lucide name → component, used by the palette
   and by `dfd-element-node.tsx`.
2. `SERVICE_ICONS` in `src/lib/service-icons.ts` — 9 inline SVG paths, consumed **only** by
   `dfd-element-node.tsx::resolveIcon`. Its header comment claims Simple Icons provenance but
   the `ServiceIcon` interface carries **no license, source, or trademark field**, which is
   exactly what `#59` exists to fix.

Consequence: **the palette and the canvas disagree about iconography today.** Dropping
`sql_database` with `subtype: "rds"` renders a Lucide database glyph in the palette and can
render an SVG brand glyph on the canvas. Unifying that is Step 1's job and `#59`'s payoff.

## Assumed `#59` interface

`#59` does not exist yet. This issue therefore defines **one** module,
`src/lib/palette/catalog.ts`, implemented in `#58` as a thin adapter over the existing
`COMPONENT_LIBRARY`, `ICON_MAP`, and `SERVICE_ICONS`. Every palette and inspector surface
imports **only** from this module. When `#59` lands it replaces the module body and keeps the
exported shape; nothing else in `#58`'s output changes.

```ts
/** Opaque icon handle. The palette never interprets it. */
export type PaletteIconRef = string;

export type PaletteIcon =
  | { kind: "lucide"; component: React.ComponentType<{ className?: string }> }
  | { kind: "svg-path"; path: string; fillRule?: "evenodd" | "nonzero" };

/** What is written to the document when the entry is placed. */
export interface PaletteInsert {
  /** `Element.type`, or the literal "trust_boundary" for the boundary entry. */
  type: string;
  /** `Element.subtype`, set for provider-specific entries. */
  subtype?: string;
  /** `Element.icon`. */
  icon?: string;
  /** Default `Element.name`. */
  name: string;
}

export interface PaletteEntry {
  /** Stable, unique catalog id. Also the `palette-item-<kebab>` test id stem. */
  id: string;
  label: string;
  /** Grouping facet, e.g. "Databases". Exactly one per entry. */
  category: string;
  /** Vendor facet, e.g. "aws" | "azure" | "gcp" | "cloudflare" | "oss". Optional. */
  provider?: string;
  /** Lowercased search aliases and keywords. */
  keywords: string[];
  icon: PaletteIconRef;
  insert: PaletteInsert;
}

export function getPaletteCatalog(): readonly PaletteEntry[];
export function getPaletteCategories(): readonly string[];
export function getPaletteProviders(): readonly { id: string; label: string }[];
export function resolvePaletteIcon(ref: PaletteIconRef): PaletteIcon | null;
```

**Coupling budget and rationale.**

- The interface is intentionally *narrower* than `#59`'s acceptance criteria. It carries **no**
  `license`, `source`, `trademark`, `aliases`, or `normalizedViewBox` field, because `#58`
  renders none of them. `#59` may add those without touching `#58`'s code.
- `PaletteIconRef` is `string` and opaque. `#58` never branches on its content. If `#59`
  changes the handle to a structured object, only `resolvePaletteIcon`'s body changes.
- `resolvePaletteIcon` returns `null` rather than throwing, and every call site renders the
  existing generic `Box` fallback. This is not defensive noise: `service-icons.ts` and
  `ICON_MAP` are already partial today (`getIconComponent` returns `undefined`, and
  `component-library.test.ts:131` asserts that), and `#59` will churn ids.
- `PaletteEntry.insert` exists so the palette never has to know that boundaries are added with
  `addTrustBoundary` and elements with `addElement`; that branch lives in one place.
- **If `#59` lands a different shape**, the only file to reconcile is
  `src/lib/palette/catalog.ts`. Record that contract in a file-header comment.

## Concurrent work seams

| Issue | Overlap | Rule for this issue |
|-------|---------|---------------------|
| `#59` icon/component registry | Owns `src/lib/component-library.ts` and `src/lib/service-icons.ts`. | **Do not restructure either file.** Add `src/lib/palette/catalog.ts` as an adapter over them. Do not delete `getIconComponent`, `searchComponents`, `getComponentsByCategory`, or `getAllComponents` — `dfd-element-node.tsx`, `properties-tab.tsx`, and `command-registry.ts` still call them. |
| `#54` multi-tab shell | Will insert a tab strip between `TopMenuBar` and the three-pane row in `src/components/layout/app-layout.tsx`, and will call `useDocumentRegistry.activateDocument`. | **The seam is `app-layout.tsx`'s three-pane row and nothing else.** `#58` changes only what is inside the two `<aside>`s plus their `aria-label`s and the panel-preset action. `#58` adds no tab UI, reads no `useDocumentRegistry` state, and stores nothing per document. Because the palette and inspector read through the `createActiveStoreFacade` facades (`useModelStore`, `useCanvasStore`), a `#54` document switch re-points the facades and both panels re-render correctly with no `#58` change. State that guarantee in `app-layout.tsx`'s comment. |
| `#56` browser persistence | Owns `src/lib/persistence/*` and `src/stores/workspace-store.ts`, including `WorkspacePreferences`. | **Do not widen `WorkspacePreferences` and do not import `workspace-store`.** See Decision **D2**. |
| `#66` a11y/screenshot artifacts | Will standardize accessibility and screenshot artifact capture. | `#58` produces its accessibility review as a PR artifact by hand (Step 13). Do not build a reusable artifact harness here. |

## Settled decisions

### D1 — Virtualization: not in this issue, with a named trigger

**Decision: do not add a windowing dependency. Ship an index-addressable row model and a
CI tripwire that fails when the catalog crosses the threshold.**

Evidence and reasoning:

- The catalog is **45 entries / 61 including provider variants** today. The largest single
  category is 8. Windowing 8 rows is pure overhead.
- `package.json` has no `react-window`, `react-virtuoso`, or `@tanstack/react-virtual`.
  `AGENTS.md` rejects "dependencies that significantly increase binary size" and
  "speculative abstractions before a second real caller".
- The "thousands of entries" requirement is **`#59`'s** (`#59`: "Search and rendering stay
  responsive with thousands of entries"; `#47` exit gate: "The palette remains responsive with
  thousands of entries"). `#59` owns the data volume, so `#59` owns the dependency decision.
- **Trigger condition:** windowing is required when any single rendered result set can exceed
  **300 rows**. 300 is chosen as roughly 6× the current worst case with margin: each row is one
  flex `<li>` with a 14 px glyph and one text node inside a 180–400 px scroller, and a few
  hundred such rows lay out inside one frame on the target hardware. It is a decision
  threshold, not a measured limit; whoever crosses it must measure.
- **Enforcement:** `src/lib/palette/catalog.test.ts` asserts
  `getPaletteCatalog().length <= PALETTE_WINDOWING_THRESHOLD` with a failure message naming
  this decision and `#59`. When `#59` lands thousands of entries the test fails, which is the
  point: the decision cannot be crossed silently.
- **Forward compatibility:** Step 3 builds `buildPaletteRows(...): PaletteRow[]` — a single
  flat, index-addressable array of `{ kind: "header" | "entry", … }` — and Step 4's roving
  tabindex indexes into it. A windowing renderer consumes exactly that array. No item
  component, no keyboard code, and no test changes when `#59` swaps the renderer.

This **deviates from the issue's written criterion** "Large result sets are virtualized and
keyboard navigable". Keyboard navigation is delivered in full. Virtualization is deferred with
a trigger. The owner must accept the amendment or direct otherwise (Owner validation item 1).

### D2 — Recents and favorites: global, user-scoped, its own localStorage namespace

**Decision: a new `src/stores/panel-store.ts` using `zustand/middleware`'s `persist` with
`name: "threatforge-panels"`. Global (not per-document). Never written to `.thf`.**

Options considered:

| Option | Verdict |
|--------|---------|
| `.thf` document field | **Rejected.** Personal UI preference in a portable, git-diffable, shared artifact. Requires a schema change, contradicting this issue's non-goals and `#57`'s settled shape. |
| Document-scoped IndexedDB | **Rejected.** Favorites are about the person's component vocabulary, not the document. Per-document favorites would reset on every new file. IndexedDB is browser-only (`get-workspace-storage.ts` returns a no-op storage on desktop), so desktop users would get nothing. |
| `WorkspacePreferences` in `workspace-store` | **Rejected on dependency safety.** `src/lib/persistence/types.ts:81` declares `WorkspacePreferences = Record<string, never>` and is owned by `#56`, which is in flight, with `#55` following it. Widening that type would put `#58` in `#56`'s files for no benefit. It is also semantically a *browser workspace* manifest, while the palette is identical on desktop. |
| `UserSettings` / `settings-store` | **Rejected on cohesion.** `UserSettings` is a flat, user-facing preference surface rendered by `settings-dialog.tsx`; `resetToDefaults()` would silently wipe favorites. Recents churn on every insert, which does not belong in a settings object. |
| **New `panel-store` with its own namespace** | **Chosen.** Touches no in-flight file, works identically on both platforms, has one cohesive concern ("how the user has arranged their panels"), and can be re-homed later behind its selectors without touching a component. |

Contents and contracts:

- `paletteFavorites: string[]` — catalog ids, insertion-ordered, capped at 100.
- `paletteRecents: string[]` — catalog ids, most-recent-first, capped at 12, de-duplicated on
  push.
- `inspectorSectionCollapsed: Record<string, boolean>` — keyed by stable section id
  (`element.architecture`, `element.visual`, …). Absent key means "use the default".
- `activePresetId: PresetId | null`.
- **Rehydrate validation:** ids are reconciled against `getPaletteCatalog()` on first read and
  unknown ids are dropped. This is genuine boundary defense, not noise: `localStorage` is
  user-writable, and `#59` will rename ids. A dropped id must not throw and must not clear the
  rest of the list.
- `panel-store` may import `ui-store`; `ui-store` must **not** import `panel-store`. One-way,
  acyclic, mirroring the `document-registry` → `document-stores` precedent.
- Nothing in `panel-store` is a credential, a document body, or a file path.

### D3 — Inspector section model

**Exactly four groups, fixed order, per entity kind.** The order is the authoring order: what
the thing *is* → how it *looks* → what is *wrong with it* → *help me*.

| # | Section id | Title | Default state | Contents (all fields verified to exist) |
|---|-----------|-------|---------------|------------------------------------------|
| 1 | `<kind>.architecture` | Architecture | Expanded | **Element:** `id` (read-only), `type`, `subtype`, `name`, `description`, `trust_zone`, `layer`, `group`, `tags`, `technologies`, `stores`, `encryption`. **Boundary:** `id`, `name`, `contains` (read-only). **Flow:** `id`, direction + flip, `flow_number`, `name`, `protocol`, `data`, `authenticated`. |
| 2 | `<kind>.visual` | Visual | Collapsed | **Element:** fill colour+opacity, stroke colour+opacity; for `type === "text"`: text colour, `font_size`, `font_weight`. **Boundary/Flow:** their existing colour controls. |
| 3 | `<kind>.threat` | Threat | Expanded iff `isThreatAnalysisEnabled(model)` **and** the entity has ≥1 threat; otherwise collapsed | Related threats (matching **both** `Threat.element` and `Threat.flow`), each linking to the Threats tab. Empty state: `No threats recorded for this <kind>.` Disabled state when threat analysis is off: an explanatory line plus an **Enable threat analysis** control writing `metadata.threat_analysis_enabled = true` via `updateMetadata`. |
| 4 | `<kind>.ai` | AI | Collapsed | One action: **Ask AI about this <kind>**, which seeds the AI chat input with a scoped prompt naming the entity id and switches `rightPanelTab` to `"ai"`. Disabled with a visible reason when no API key is configured, and while a stream is in flight. |

`stores`, `encryption`, `layer`, `group`, and `tags` are **new inspector surfaces** — the fields
exist in the schema and in `elementUpdateShape`, but no component reads them today.

**What "AI-assisted properties" means here.** Two readings were considered. (a) *Mark which
properties the AI wrote* requires per-field mutation provenance that the model does not carry;
adding it to `.thf` would put ephemeral, session-scoped data into a portable document, and the
right home for it is `#62` ("approvals and undo safety"), where mutation provenance must exist
anyway. (b) *Scope AI affordances to the selected entity* uses only what exists
(`useChatStore.sendMessage`, `useUiStore.setRightPanelTab`). **(b) is chosen; (a) is deferred to
follow-up 4** and flagged for owner confirmation.

**Collapse behavior.** Each section is `<section aria-labelledby={headingId}>` containing
`<h3><button aria-expanded aria-controls={panelId}>`. Collapsed content is unmounted, not
hidden, so it cannot be reached by Tab. A user override persists in `panel-store` and always
beats the default. Transitions respect `settings.reduceMotion` (already read by
`canvas.tsx:173`).

**Multi-selection.** Derive it — do **not** add a fourth selection field to `ModelState`.
`useCanvasStore` already holds `nodes`/`edges` with ReactFlow's `selected` flag, which is the
only place that knows about Shift-select. Contract:

- Selected count is `nodes.filter(n => n.selected).length + edges.filter(e => e.selected).length`.
- When count > 1 the inspector renders a **multi-selection summary**: a heading
  `N items selected`, a breakdown by kind (`3 components, 1 trust boundary, 2 data flows`), and
  only the actions that are already multi-safe and already implemented —
  `useCanvasStore.deleteSelected()`, `useClipboardStore.copySelected()`, `cutSelected()`.
- It states plainly: `Select a single item to edit its properties.`
- **No bulk property editing.** Not required by any acceptance criterion, and doing it correctly
  needs transactional multi-entity mutation with one undo step, which
  `captureHistoryDebounced(model, "element:<id>")` cannot express. Deferred as follow-up 3.

**Empty selection** renders **Document properties**, not a placeholder sentence: `metadata.title`,
`description`, `author` (read-only), the threat-analysis toggle, a counts row
(elements / flows / boundaries / threats / layers / groups / **relationships**), and the
**Layers** and **Groups** management lists from Step 7. The relationships count is read-only and
is the *only* relationship surface in this issue — its purpose is to prove the app is not
dropping data a hand-edited file contains. The hint line
`Select an element or connector on the canvas to view its properties.` is **preserved verbatim**
so `e2e/empty-states.spec.ts:15` continues to pass.

**No model open** keeps `No model open.` unchanged.

### D4 — Accessibility contracts

These are the four lanes named in the issue, expressed as testable contracts.

**Landmarks and regions.**

- `app-layout.tsx`: left `<aside aria-label="Component palette">`, right
  `<aside aria-label="Inspector">`, `<main aria-label="Diagram canvas">`.
- The right panel's tab bar becomes `role="tablist"` with `role="tab"` buttons carrying
  `aria-selected` and `aria-controls`; the content area becomes
  `<div role="tabpanel" aria-labelledby={activeTabId} tabIndex={-1}>`. `data-testid`s
  `tab-properties` / `tab-threats` / `tab-ai` / `right-panel` are preserved.
- Each palette section is `<h3 id=…>` + `<ul aria-labelledby=…>`, so screen-reader users can
  navigate the palette by heading.

**Palette keyboard traversal.** Native semantics only — `<ul>` / `<li>` / `<button>`. No
invented `listbox`/`option` roles, because palette items are activated, never "selected".

- Tab stops in the palette region: search input → category tablist (one stop, roving) →
  provider tablist (one stop, roving, rendered only when ≥1 entry has a provider) → item list
  (one stop, roving).
- Inside the item list, roving tabindex over a 2-D index: `ArrowDown`/`ArrowUp` move between
  rows (skipping headers, wrapping off); `ArrowRight`/`ArrowLeft` move between the row's two
  controls (insert button, favourite toggle); `Home`/`End` jump to first/last row;
  `PageUp`/`PageDown` move by 10.
- `Enter` or `Space` on the insert button places the entry at canvas centre — identical to
  today's double-click path (`getCanvasCenter` + `addElement`/`addTrustBoundary`).
- `Escape` inside the list returns focus to the search input and does not clear the query.
- Typing a printable character while the list has focus moves focus to the search input and
  appends that character.
- The favourite toggle is a real `<button aria-pressed={…}>` with accessible name
  `Favourite <label>` — not a hover-only affordance.
- The focused row is scrolled with `scrollIntoView({ block: "nearest" })`, matching
  `command-palette.tsx:63`.
- The category tablist stays **mounted** while a query is active (today it unmounts). Search
  filters **within** the active tab; when the active tab yields zero matches and other tabs do,
  a **Search all categories** button appears in the empty state. This replaces today's
  "typing silently resets to All" behavior and is called out for owner validation.

**Inspector form semantics.**

- Keep the existing **wrapping `<label>`** pattern for text/number/textarea/select inputs. It is
  a valid implicit label and `e2e/element-editing.spec.ts:29,47` depends on it.
- `ColorField`: the colour input gets `aria-label="<Label> colour"`, the range input gets
  `aria-label="<Label> opacity"` plus `aria-valuetext="{n}%"`. The **Reset to default** button
  gets accessible name `Reset <Label> to default`.
- `ReadOnlyField`: read-only rows within one section are wrapped in a single `<dl>` so
  `<dt>`/`<dd>` are valid, or converted to `<div>`+`<span>` with `aria-labelledby`. Either is
  acceptable; the invalid orphan `<dt>` is not.
- Checkboxes and the font-weight toggle group get `aria-pressed` / native checkbox semantics
  with names.
- Section disclosure buttons carry `aria-expanded` and `aria-controls`.

**Focus behavior on selection change.**

- Selecting on the canvas **must not** move focus into the inspector. Stealing focus would break
  arrow-key nudging (`use-keyboard-shortcuts.ts:75-91`) and drag.
- Instead the inspector container carries `tabIndex={-1}` and an `aria-live="polite"` status
  node announcing `<Name> selected` (one node, deduplicated on identical text).
- **If focus is already inside the inspector when the selection changes**, focus moves to the
  inspector container — never to `document.body`. The naive implementation strands focus on
  `body` when the focused field unmounts; the Step 13 test asserts against exactly that.
- Pressing `1` / `2` / `3` (existing shortcuts) now also focuses the tab panel container. That
  is a deliberate user action, so moving focus is expected and is what makes those shortcuts
  usable by a screen-reader user today (they currently switch tabs and announce nothing).

**Narrow window and overflow.** Panel width is user-controlled, so use a `ResizeObserver` on the
panel element rather than a viewport media query.

- Palette at width ≤ 220 px: rows drop secondary text; the accessible name is unchanged.
- Category/provider tab strips overflow horizontally with `overflow-x-auto` (today's behavior)
  and keep keyboard access via the roving tablist, so no row is unreachable at any width.
- Inspector at width ≤ 300 px: colour + opacity composites stack vertically.

## Implementation steps

Each step is independently executable, no larger than XS/S, and leaves the tree green.

### 1. Add the palette catalog and icon seam

- **Behavior:** `src/lib/palette/catalog.ts` exports the *Assumed `#59` interface* verbatim,
  implemented over `COMPONENT_LIBRARY`, `ICON_MAP`, and `SERVICE_ICONS`. Each
  `ComponentDefinition` yields one provider-neutral entry; each of its 16 subtypes yields one
  additional entry whose `provider` comes from an explicit `SUBTYPE_PROVIDER` map and whose
  `insert` sets both `type` and `subtype`. Generic / Boundary / Text remain entries with
  `category: "Generic"`. No component imports `component-library` for palette data after this
  step.
- **Files:** `src/lib/palette/catalog.ts` (new), `src/lib/palette/catalog.test.ts` (new).
- **Implementation:**
  1. Write the file-header comment stating that this module is the sole `#59` seam and that
     `#59` replaces its body, not its exports.
  2. `SUBTYPE_PROVIDER: Record<string, string>` maps the 16 known subtype ids to `aws`
     (`rds`, `s3`, `dynamodb`, `sns`, `sqs`, `cloudfront`), `azure` (`azure_sql`, `azure_blob`,
     `cosmosdb`), `gcp` (`cloud_sql`, `gcs`), `cloudflare` (`cloudflare`), and `oss`
     (`kafka`, `redis`, `rabbitmq`, `memcached`). An unmapped subtype yields an entry with
     `provider: undefined` — it must still appear in the catalog.
  3. Entry ids: base entries reuse the component id; provider entries use
     `` `${componentId}--${subtypeId}` ``. `data-testid` is `palette-item-<id with _ and -- →
     kebab>`; **the four ids named in the E2E table must resolve to exactly today's strings.**
  4. `resolvePaletteIcon` tries `SERVICE_ICONS` first, then `ICON_MAP`, then returns `null`,
     mirroring `dfd-element-node.tsx::resolveIcon`'s precedence so palette and canvas agree.
  5. `keywords` merges `ComponentDefinition.tags`, the label, the category, and the subtype
     label, all lowercased once at module init.
  6. Export `PALETTE_WINDOWING_THRESHOLD = 300` with a comment citing decision **D1**.
- **Targeted verification:** `npx vitest --run palette/catalog`. Discriminating assertions:
  every entry id is unique; the four E2E test-id stems exist; `sql_database--rds` has
  `provider === "aws"` and `insert.subtype === "rds"`; `resolvePaletteIcon("nonexistent")`
  returns `null`; `getPaletteCatalog().length <= PALETTE_WINDOWING_THRESHOLD` with the
  `#59` failure message; and — the drift check — every `COMPONENT_LIBRARY` id appears in the
  catalog exactly once as a base entry.
- **Intent validation:** Owner confirms the provider facet derived from subtypes (AWS / Azure /
  GCP / Cloudflare / Open source) is the vendor taxonomy they want `#59` to inherit.

### 2. Add the panel preference store

- **Behavior:** `src/stores/panel-store.ts` persists palette favourites, palette recents,
  inspector section collapse state, and the active panel preset to `localStorage` under
  `threatforge-panels`, per decision **D2**.
- **Files:** `src/stores/panel-store.ts` (new), `src/stores/panel-store.test.ts` (new).
- **Implementation:**
  1. `create<PanelState>()(persist(…, { name: "threatforge-panels", version: 1, partialize }))`,
     mirroring `settings-store.ts`'s convention.
  2. Actions: `toggleFavorite(id)`, `pushRecent(id)`, `setSectionCollapsed(sectionId, boolean)`,
     `setActivePreset(id | null)`.
  3. `pushRecent` de-duplicates then truncates to 12; `toggleFavorite` truncates to 100 and
     no-ops past the cap rather than evicting silently.
  4. Export selectors `selectVisibleFavorites(state, catalog)` and
     `selectVisibleRecents(state, catalog)` that filter ids absent from the catalog. Filtering
     happens at **read** time, not on rehydrate, so a catalog swap during a `#59` upgrade cannot
     destroy a user's list.
  5. `partialize` persists only the four fields above. No document id, no file path, no
     credential.
- **Targeted verification:** `npx vitest --run panel-store`. Discriminating assertions: pushing
  an existing recent moves it to the front without growing the array; the 13th distinct recent
  evicts the oldest; a favourite id that is not in the supplied catalog is filtered by the
  selector **but is still present in the persisted state**; malformed JSON in `localStorage`
  leaves the store at defaults without throwing.
- **Intent validation:** None; verified deterministically.

### 3. Rebuild the palette shell around sections, tabs, and search

- **Behavior:** The palette renders, in order: a search input; a category tablist; a provider
  tablist (only when ≥1 catalog entry has a provider); then sections **Favourites**,
  **Recent**, **Generic**, and one section per category (or per provider, when a provider tab is
  active). Search filters within the active tab. Zero results render the empty state plus a
  **Search all categories** action when other tabs match.
- **Files:** `src/components/palette/component-palette.tsx` (rewrite),
  `src/components/palette/palette-rows.ts` (new — pure row model),
  `src/components/palette/palette-item.tsx` (new — extracted item),
  `src/components/palette/palette-rows.test.ts` (new),
  `src/components/palette/component-palette.test.tsx` (new).
- **Implementation:**
  1. `buildPaletteRows({ catalog, query, activeCategory, activeProvider, favorites, recents })`
     returns a **flat** `PaletteRow[]` of
     `{ kind: "header"; id; label } | { kind: "entry"; id; entry; sectionId }`. Pure, no React,
     no store access. This array is the windowing seam from **D1** and the index space for
     Step 4's roving tabindex.
  2. Move drag/drop (`setDragGhost`, `onDragStart`, `onDragEnd`, `getCanvasCenter`) into
     `palette-item.tsx` **unchanged in behavior**, driven by `entry.insert` instead of
     hardcoded branches. Boundary entries call `addTrustBoundary`; everything else calls
     `addElement(insert.type, position, { subtype, icon, name })`.
  3. Preserve `data-testid="component-palette"`, `data-testid="library-search"`, and every
     `palette-item-*` id from Step 1.
  4. States, all rendered by the shell: **empty** (`No matching components` preserved, plus the
     cross-category recovery action), **empty favourites** (`Star a component to pin it here.`),
     **empty recents** (section omitted entirely rather than showing an empty shell),
     **disabled** (when `useUiStore.canvasLocked` is true, insert buttons are `disabled` with
     `title`/`aria-describedby` explaining why — today a locked canvas still accepts palette
     double-clicks, which is a real inconsistency this step fixes). There is no loading state and
     no error state: the catalog is a synchronous module constant, and inventing one would be
     fake completeness. Record that in a comment.
- **Targeted verification:** `npx vitest --run palette-rows` and
  `npx vitest --run component-palette`. Discriminating assertions: with a favourite and a
  recent set, the row array's first three headers are `Favourites`, `Recent`, `Generic`;
  a query that matches nothing in the active category but matches in another produces zero
  entry rows **and** the recovery action; selecting provider `aws` yields only entries whose
  `insert.subtype` is an AWS subtype; a locked canvas renders every insert button `disabled`.
- **Intent validation:** Owner exercises search + category + provider and confirms the
  "search within the active tab" behavior is preferable to today's "typing resets to All".

### 4. Add palette keyboard traversal and ARIA

- **Behavior:** The full keyboard contract from decision **D4**, implemented over the Step 3 row
  array.
- **Files:** `src/components/palette/component-palette.tsx`,
  `src/components/palette/palette-item.tsx`,
  `src/components/palette/component-palette.a11y.test.tsx` (new).
- **Implementation:**
  1. Track `focusedIndex` (row index) and `focusedControl` (`"insert" | "favorite"`). Exactly one
     button in the list has `tabIndex={0}`.
  2. One container-level `onKeyDown` handles Arrow keys, Home/End, PageUp/PageDown, Enter/Space,
     Escape, and printable-character passthrough. Header rows are skipped by index arithmetic,
     never by DOM traversal.
  3. When the row array changes (query, tab, favourite toggle), clamp `focusedIndex` to the new
     length — the same pattern as `command-palette.tsx:54-58`.
  4. Category and provider strips become `role="tablist"` + `role="tab"` with `aria-selected`,
     `aria-controls`, and Left/Right/Home/End roving. The list container is
     `role="tabpanel" aria-labelledby={activeTabId} tabIndex={-1}`.
  5. Sections are `<h3 id>` + `<ul aria-labelledby>`; rows are `<li>` with two sibling
     `<button>`s.
- **Targeted verification:** `npx vitest --run component-palette.a11y`. Discriminating
  assertions, using `@testing-library/react` + `user-event`: Tab from the search input reaches
  the category tablist, then the list, in exactly three stops; `ArrowDown` from the first row
  lands on the next **entry**, not on a header; `ArrowRight` moves to the favourite toggle and
  `aria-pressed` flips on `Enter`; `End` reaches the last entry; `Escape` returns
  `document.activeElement` to the search input **with the query intact**; typing `k` while the
  list is focused focuses the search input and yields value `k`; every insert button has an
  accessible name equal to its label.
- **Intent validation:** Owner drives the palette with the keyboard only, with VoiceOver or NVDA
  running, and confirms section headings are announced when crossing a boundary.

### 5. Wire recents and favourites

- **Behavior:** Placing an entry (double-click, keyboard activate, or drag-drop) pushes its id
  to recents. The favourite toggle writes through `panel-store`. Both sections re-render
  immediately and survive reload.
- **Files:** `src/components/palette/palette-item.tsx`,
  `src/components/palette/component-palette.tsx`,
  `src/components/palette/component-palette.test.tsx` (extend).
- **Implementation:**
  1. Call `pushRecent(entry.id)` from the one shared `insertEntry(entry, position)` helper so
     all three placement paths record identically. Do not call it from three places.
  2. Favourite and recent sections render the same `PaletteItem` component; an entry appearing
     in two sections must have distinct DOM ids but the **same** `data-testid` is not allowed —
     suffix the section (`palette-item-web-server` in the main list stays canonical;
     favourites/recents rows use `palette-fav-item-*` / `palette-recent-item-*`) so
     `page.getByTestId("palette-item-web-server")` stays unambiguous for E2E.
- **Targeted verification:** `npx vitest --run component-palette`. Discriminating assertions:
  activating an entry from the keyboard puts it first in Recent; activating it again does not
  duplicate it; unfavouriting the last favourite renders the empty-favourites copy, not an empty
  `<ul>`; a `panel-store` state containing an unknown id renders without it and without
  throwing.
- **Intent validation:** Owner confirms the strict double-testid rule did not break
  `addPaletteItem` (Step 14 E2E covers this deterministically).

### 6. Extract the inspector section primitives

- **Behavior:** `InspectorSection` renders an accessible, collapsible, persisted section.
  `ColorField`, `ReadOnlyField`, `EditableField`, `EditableTextarea`, and
  `CommaSeparatedField` move out of `properties-tab.tsx` with their accessibility defects
  fixed and **no behavior change** otherwise.
- **Files:** `src/components/panels/inspector/inspector-section.tsx` (new),
  `src/components/panels/inspector/fields.tsx` (new),
  `src/components/panels/inspector/fields.test.tsx` (new),
  `src/components/panels/inspector/inspector-section.test.tsx` (new).
- **Implementation:**
  1. `InspectorSection({ sectionId, title, defaultOpen, children })` reads/writes
     `panel-store.inspectorSectionCollapsed[sectionId]`, falling back to `defaultOpen`.
     `<section aria-labelledby>` + `<h3><button aria-expanded aria-controls>`. Collapsed
     children are **unmounted**.
  2. Respect `useSettingsStore(s => s.settings.reduceMotion)` for the disclosure transition.
  3. `ColorField` gains the two `aria-label`s, `aria-valuetext`, and the named reset button.
  4. `ReadOnlyField` no longer emits an orphan `<dt>`.
  5. `CommaSeparatedField` keeps its focus-guarded `useEffect` sync verbatim — it exists so the
     input does not fight the user mid-typing. Do not "simplify" it.
- **Targeted verification:** `npx vitest --run inspector-section` and
  `npx vitest --run inspector/fields`. Discriminating assertions:
  `getByRole("button", { expanded: true })` flips to `expanded: false` on click and the child
  input is **removed from the tree** (`queryByLabelText(...)` is null); the collapse state
  survives an unmount/remount via `panel-store`; `getByLabelText("Fill colour")` and
  `getByLabelText("Fill opacity")` both resolve; no `dt` element exists without a `dl`
  ancestor.
- **Intent validation:** None; verified deterministically.

### 7. Add `isThreatAnalysisEnabled` and reference-safe layer/group actions

**This is the riskiest step in the plan.** See *Risk*.

- **Behavior:** New `model-store` actions create, rename, and delete `layers` and `groups`.
  **Deleting a layer or group clears every reference to it in the same transaction**, so the
  document can never be saved with a dangling `element.layer`, `element.group`, or
  `group.parent`. A new `isThreatAnalysisEnabled(model)` implements `#57`'s resolution rule.
- **Files:** `src/lib/thf-model-utils.ts` (new), `src/lib/thf-model-utils.test.ts` (new),
  `src/stores/model-store-factory.ts` (extend), `src/stores/model-store.test.ts` (extend).
- **Implementation:**
  1. `isThreatAnalysisEnabled(model)`: `metadata.threat_analysis_enabled ?? model.threats.length > 0`.
     `#57` plan Step 7 specified this rule and a Rust twin; **neither landed**. Add the
     TypeScript half here because this issue's UI needs it; do **not** add the Rust method,
     which would have no caller. File follow-up 6.
  2. `addLayer(name) → Layer`, `updateLayer(id, updates)`, `deleteLayer(id)`;
     `addGroup(name) → Group`, `updateGroup(id, updates)`, `deleteGroup(id)`.
  3. Id generation: slugify the name, then suffix `-2`, `-3`, … until unique **across
     `layers` ∪ `groups` ∪ `elements` ∪ `trust_boundaries`**, because
     `thf-validation.ts` rejects a `groups[].id` colliding with an element or boundary id and
     `clipboard-store.ts` maps all three into one id space.
  4. `deleteLayer(id)` produces one new model in one `set` call: the layer removed **and**
     `elements.map(e => e.layer === id ? { ...e, layer: undefined } : e)`.
     `deleteGroup(id)` additionally clears `element.group` and re-parents children by setting
     `group.parent = deleted.parent` (never leaving a dangling parent, never orphaning to a
     cycle).
  5. Every mutator calls `captureHistory(model)` (discrete, not debounced) so one delete is one
     undo step, and sets `isDirty: true`.
  6. `updateLayer`/`updateGroup` use `captureHistoryDebounced(model, \`layer:${id}\`)`, matching
     the existing `element:`/`flow:`/`boundary:` keying.
- **Targeted verification:** `npx vitest --run model-store` and `npx vitest --run thf-model-utils`.
  **The discriminating test is the round trip through the real validator:** build a model with
  a layer, a group, three elements referencing them, and a nested child group; call
  `deleteLayer` and `deleteGroup`; then assert
  `validateThreatModel(serialize→parse(model))` **does not throw**. A naive implementation that
  removes only the container passes a shallow assertion and fails this one.
  Also: `isThreatAnalysisEnabled` table test over the four committed fixtures in
  `tests/fixtures/thf/` plus the discriminating case `{ flag: false, threats: [t] } → false`;
  a new layer named identically to an existing element id gets a distinct id; one delete is one
  undo step.
- **Intent validation:** Owner deletes a layer that three components belong to, saves, and
  reopens the file on the other platform to confirm it opens.

### 8. Regroup the element inspector into the four sections

- **Behavior:** `ElementProperties` renders exactly the four sections from decision **D3**, with
  `layer`, `group`, `tags`, `stores`, and `encryption` editable for the first time.
- **Files:** `src/components/panels/inspector/element-inspector.tsx` (new, extracted from
  `properties-tab.tsx`), `src/components/panels/properties-tab.tsx` (reduced to dispatch),
  `src/components/panels/inspector/element-inspector.test.tsx` (new).
- **Implementation:**
  1. Move `ElementProperties` verbatim, then regroup. **No field's write path changes**: the
     `updateElement` + `syncElementNodeData` pairing stays exactly as it is, including the text
     annotation branches.
  2. `Layer` and `Group` are `<select>`s over `model.layers` / `model.groups` with a `None`
     option and a trailing `New layer…` / `New group…` option that calls `addLayer`/`addGroup`
     with a prompt-free inline text input and then assigns the new id. No modal.
  3. `Tags` uses `CommaSeparatedField`, matching `technologies`. `stores` likewise; `encryption`
     uses `EditableField`.
  4. The Threat section unions `t.element === id` **and** `t.flow === id`, fixing the
     `FlowThreats` defect noted in the evidence section.
  5. Text annotations (`type === "text"`) keep their reduced field set: the Architecture section
     shows only `id`, `Text`, `description`; the Threat and AI sections are not rendered at all
     (`strideCategory: "none"`), which is honest rather than showing four empty groups.
- **Targeted verification:** `npx vitest --run element-inspector`. Discriminating assertions:
  with a model containing two layers, choosing the second writes `element.layer` and leaves
  every other element untouched; a threat recorded with `flow: <id>` on a flow appears in that
  flow's Threat section (this fails before the fix); a text annotation renders exactly two
  sections; changing `type` still clears `subtype` and updates the canvas node data.
- **Intent validation:** Owner confirms the Architecture/Visual split matches how they think
  about a component, and that `stores`/`encryption` belong in Architecture rather than a
  security-specific group.

### 9. Regroup the boundary and flow inspectors; add the AI and Threat sections

- **Behavior:** `TrustBoundaryProperties` and `EdgeProperties` use the same four-section shell.
  The Threat section renders its enabled/disabled/empty states. The AI section renders its
  action and its disabled reasons.
- **Files:** `src/components/panels/inspector/boundary-inspector.tsx` (new),
  `src/components/panels/inspector/flow-inspector.tsx` (new),
  `src/components/panels/inspector/threat-section.tsx` (new),
  `src/components/panels/inspector/ai-section.tsx` (new), plus their tests.
- **Implementation:**
  1. Move both components verbatim, then regroup. Preserve `Flip Direction`, the `Flow #`
     input's `Auto` placeholder, and the `Contains` read-only rendering.
  2. `ThreatSection({ entityKind, entityId })`: when `isThreatAnalysisEnabled(model)` is false,
     render the explanation plus the **Enable threat analysis** button
     (`updateMetadata({ threat_analysis_enabled: true })`). When true and empty, render
     `No threats recorded for this <kind>.` When true and non-empty, render the existing
     `ThreatLink` list unchanged.
  3. `AiSection({ entityKind, entityId, entityName })`: one button. Disabled with visible reason
     when `useChatStore(s => s.hasApiKey)` is false (`No API key configured` — reuse the exact
     string `ai-chat-tab` uses so `e2e/empty-states.spec.ts` semantics stay consistent) and while
     `isStreaming` is true. On activate: set the AI tab, seed the composer with a prompt naming
     the entity kind, name, and id. **It does not send.** The user reviews and sends — AI output
     is untrusted and the user must stay in the loop from the first turn.
- **Targeted verification:** `npx vitest --run threat-section`, `npx vitest --run ai-section`,
  `npx vitest --run boundary-inspector`, `npx vitest --run flow-inspector`. Discriminating
  assertions: a model with `threat_analysis_enabled: false` **and** existing threats renders the
  disabled state (the explicit flag beats inference); clicking Enable flips it and re-renders
  the list; the AI button is `disabled` with an accessible description when `hasApiKey` is
  false; activating it switches `rightPanelTab` to `"ai"` and **does not** call
  `chatStore.sendMessage`.
- **Intent validation:** Owner confirms the AI section is a scoped affordance, not a promise of
  per-field AI provenance (decision **D3**), and confirms the seeded prompt reads well.

### 10. Add the document inspector and the multi-selection summary

- **Behavior:** Empty selection renders Document properties (including Layers/Groups
  management); a selection of more than one item renders the multi-selection summary. Both per
  decision **D3**.
- **Files:** `src/components/panels/inspector/document-inspector.tsx` (new),
  `src/components/panels/inspector/multi-selection-inspector.tsx` (new),
  `src/components/panels/properties-tab.tsx` (dispatch order), plus tests.
- **Implementation:**
  1. Dispatch order in `properties-tab.tsx`: no model → `No model open.`; derived selection
     count > 1 → multi-selection; `selectedEdgeId` → flow; `selectedBoundaryId` → boundary;
     `selectedElementId` → element; else → document.
  2. Derive the count with a `useCanvasStore` selector returning a **stable primitive**
     (`selectedNodeCount`, `selectedEdgeCount`) rather than a new array each render, so the
     panel does not re-render on every canvas mutation.
  3. Document inspector: title/description editable via `updateMetadata`; author read-only;
     counts row including `relationships?.length ?? 0`; the threat-analysis toggle; the Layers
     and Groups lists with add/rename/delete from Step 7. Deleting a layer shows an inline
     confirmation naming how many components will be unassigned.
  4. Preserve the hint sentence `Select an element or connector on the canvas to view its
     properties.` verbatim.
- **Targeted verification:** `npx vitest --run document-inspector` and
  `npx vitest --run multi-selection-inspector`. Discriminating assertions: with two nodes
  `selected: true` in the canvas store **and** `selectedElementId` set, the multi-selection
  summary renders and no single-entity field is present (this fails against today's behavior);
  the summary's counts break down correctly across nodes, boundaries, and edges; the document
  inspector still contains the string `Select an element`; the delete confirmation names the
  correct member count.
- **Intent validation:** Owner shift-selects three components and confirms the panel no longer
  implies edits apply to all of them.

### 11. Add panel presets

- **Behavior:** Three presets — **Architecture design** (palette open, inspector open on
  Properties), **Threat review** (palette closed, inspector open on Threats), **Focused canvas**
  (both panels closed) — reachable from the View menu, the command palette, and keyboard.
- **Files:** `src/stores/panel-store.ts` (extend), `src/lib/panel-presets.ts` (new),
  `src/lib/command-registry.ts`, `src/components/layout/top-menu-bar.tsx`,
  `src/hooks/use-keyboard-shortcuts.ts`,
  `src/components/panels/keyboard-shortcuts-dialog.tsx`, `src/lib/panel-presets.test.ts` (new),
  `src/lib/command-registry.test.ts` (extend).
- **Implementation:**
  1. `PANEL_PRESETS: readonly { id, label, shortcut, apply(ui): void }[]` in
     `src/lib/panel-presets.ts`. `apply` calls only existing `ui-store` setters —
     `toggleLeftPanel`/`toggleRightPanel` are toggles, so add explicit
     `setLeftPanelOpen(boolean)` / `setRightPanelOpen(boolean)` to `ui-store` and implement the
     existing toggles in terms of them. Toggling twice to reach a known state would be a bug.
  2. `panel-store.setActivePreset(id)` records which preset is active; any manual panel change
     clears it to `null` so the menu never shows a stale check mark.
  3. Surfaces: `view:preset-*` commands in `command-registry.ts`; a **View → Layout** submenu in
     `top-menu-bar.tsx` with `aria-checked` radio semantics; `Cmd+Alt+1/2/3` in
     `use-keyboard-shortcuts.ts` (verified not to collide with the existing `1`/`2`/`3`,
     `Cmd+Shift+I`, `Cmd+Shift+L`, or `Cmd+0/=/-`); rows added to
     `keyboard-shortcuts-dialog.tsx` so the cheat sheet does not drift.
- **Targeted verification:** `npx vitest --run panel-presets` and
  `npx vitest --run command-registry`. Discriminating assertions: applying **Focused canvas**
  from a state where the left panel is already closed leaves it closed (proves absolute setters,
  not toggles); applying a preset then manually toggling a panel sets `activePresetId` to
  `null`; every preset id has a command, a menu entry, and a cheat-sheet row — asserted by
  iterating `PANEL_PRESETS`, so adding a preset without a surface fails.
- **Intent validation:** Owner confirms three presets are the right three and that the
  shortcuts do not fight muscle memory.

### 12. Add region labels, tab semantics, and narrow-width behavior

- **Behavior:** The landmark, tablist, and responsive contracts from decision **D4**.
- **Files:** `src/components/layout/app-layout.tsx`,
  `src/components/panels/right-panel.tsx`,
  `src/components/palette/component-palette.tsx`,
  `src/hooks/use-element-width.ts` (new),
  `src/components/panels/right-panel.test.tsx` (new).
- **Implementation:**
  1. `app-layout.tsx`: the three `aria-label`s, plus a comment naming the `#54` seam (the
     three-pane row) and stating that the panels read through the store facades and therefore
     need no change when tabs land.
  2. `right-panel.tsx`: `role="tablist"` / `role="tab"` / `role="tabpanel"` with roving tabindex
     and Left/Right/Home/End, preserving all four `data-testid`s and the threat count badge.
  3. `use-element-width.ts`: a small `ResizeObserver` hook returning the observed width, with the
     jsdom-safe guard that `ResizeObserver` may be undefined in tests (it is not polyfilled in
     `src/test-setup.ts` — check and add the polyfill there if absent rather than branching in
     production code).
  4. Apply the ≤ 220 px palette rule and the ≤ 300 px inspector stacking rule.
- **Targeted verification:** `npx vitest --run right-panel`. Discriminating assertions:
  `getAllByRole("tab")` returns three with exactly one `aria-selected="true"`; `ArrowRight` on
  the active tab moves focus and selection to the next; the tab panel is labelled by the active
  tab; the palette region has accessible name `Component palette`.
- **Intent validation:** Owner drags both panels to their minimum widths and confirms no control
  is clipped or unreachable.

### 13. Focus management and the selection live region

- **Behavior:** The focus contract from decision **D4**: canvas selection never steals focus;
  focus inside the inspector is never stranded on `body`; `1`/`2`/`3` move focus into the panel;
  selection changes are announced politely.
- **Files:** `src/components/panels/right-panel.tsx`,
  `src/components/panels/properties-tab.tsx`,
  `src/hooks/use-keyboard-shortcuts.ts`,
  `src/components/panels/inspector/inspector-focus.test.tsx` (new).
- **Implementation:**
  1. The tab panel container gets `tabIndex={-1}` and a ref; `1`/`2`/`3` and the
     `navigate:*` commands call `.focus()` on it after setting the tab.
  2. A single `aria-live="polite"` `<div>` in the inspector renders the current selection
     description; it renders nothing when the description is unchanged.
  3. On selection change, if `containerRef.current.contains(document.activeElement)`, call
     `containerRef.current.focus()` **before** the new content mounts.
- **Targeted verification:** `npx vitest --run inspector-focus`. The discriminating assertion:
  select element A, focus its Name input, change the selection to element B, then assert
  `document.activeElement` is the inspector container — **not** `document.body`. Second
  assertion: with focus on the canvas, changing selection leaves `document.activeElement`
  unchanged. Third: pressing `2` moves focus into the panel.
- **Intent validation:** Owner navigates with a screen reader, selects three different
  components in sequence, and confirms each is announced once without focus jumping.

### 14. E2E coverage, screenshots, and the accessibility review

- **Behavior:** The user-visible workflows are proven end to end, and the PR carries the
  before/after screenshots and accessibility review the issue requires.
- **Files:** `e2e/palette-navigation.spec.ts` (new),
  `e2e/inspector-sections.spec.ts` (new), `e2e/element-editing.spec.ts` (extend),
  `e2e/empty-states.spec.ts` (extend).
- **Implementation:**
  1. Palette E2E: keyboard-only insertion (focus search → Tab to list → `ArrowDown` ×N →
     `Enter` → node count increases); favourite a component and confirm it appears in
     Favourites after reload; provider tab `AWS` inserts an element whose canvas node renders
     the subtype icon.
  2. Inspector E2E: select an element, expand Visual, change fill, collapse it, reload, and
     confirm the collapse state persisted; assign a layer created from the document inspector,
     save, reopen, and confirm the layer round-trips; shift-select two nodes and confirm the
     multi-selection summary.
  3. Preserve every existing assertion in `element-editing.spec.ts` and `empty-states.spec.ts`
     unchanged. If any needs editing, the DOM contract was broken — fix the code, not the test.
  4. Capture before/after screenshots of the palette and inspector in both themes at default and
     minimum panel widths.
  5. Write the accessibility review into the PR body: the four lanes from **D4**, the keyboard
     map, the announced names, and the two known gaps (`ResizeHandle`, virtualization) with
     their follow-up issue numbers. Do not add a new `docs/` file for it.
- **Targeted verification:**
  `npx playwright test e2e/palette-navigation.spec.ts e2e/inspector-sections.spec.ts e2e/element-editing.spec.ts e2e/empty-states.spec.ts`.
  Discriminating check: temporarily revert Step 4's `Enter` handler and confirm the
  keyboard-only insertion test fails; revert.
- **Intent validation:** Owner compares before/after screenshots and judges whether the palette
  is now faster to use, not merely more organized.

## Risk

**The riskiest step is Step 7 (layer/group actions with reference-safe delete).** It is the only
step whose failure mode is silent data corruption rather than a visible UI defect. `.thf`
reference integrity is enforced on the **read** path only —
`src-tauri/src/file_io/reader.rs::validate_references` and
`src/lib/thf-validation.ts::validateThreatModel` — and neither
`serializeThreatModelYaml` nor `browser-file-adapter.saveFile` validates before writing. A
`deleteLayer` that removes the layer but leaves `element.layer` pointing at it produces a
**successful save of a file that then refuses to open on both platforms**, and the user has no
signal until the next open. Every other step in this plan fails loudly in a test or on screen.

Controls: the delete actions build one new model in one `set` call (no intermediate invalid
state observable by autosave); the discriminating verification runs the real
serialize → parse → `validateThreatModel` round trip rather than asserting on the in-memory
object; and id allocation is checked against the union of all four id spaces, matching
`thf-validation.ts`'s collision rules.

## Cross-cutting requirements

- **Security and privacy:** No new trust boundary, no new IPC command, no new network call, no
  filesystem access. `panel-store` persists only catalog ids, booleans, and a preset id to
  `localStorage` — never a document body, file path, or credential; `partialize` enforces that
  and `panel-store.test.ts` asserts the persisted key set. Catalog ids read back from
  `localStorage` are untrusted: they are filtered against `getPaletteCatalog()` at read time and
  are only ever used as React keys, `data-testid` stems, and lookup keys — never as HTML, never
  as a URL, never `eval`'d. The AI section seeds a composer string and never auto-sends, so no
  new untrusted-mutation path is created. `#59`'s SVG-safety validation stays `#59`'s; this
  issue renders only SVG paths that already ship in `service-icons.ts`.
- **`.thf` compatibility:** No schema change and no version bump. Every field this issue exposes
  was added by `#57` and is already covered by `tests/fixtures/thf/` and
  `src/types/threat-model.contract.test.ts`. The one file-format-critical behavior is Step 7's
  reference-safe delete, verified through the real validator. Optional fields must be written as
  `undefined` (omitted), never as `""` or `[]` — `js-yaml` drops `undefined` keys but emits
  `tags: []`, which would add a line to every element in every browser-saved file. The
  comma-separated fields must therefore commit `undefined` when the parsed list is empty.
  `threat_analysis_enabled` stays tri-state: the toggle writes `true`/`false` explicitly and
  never writes `undefined` back.
- **Browser and desktop:** Identical on both. `panel-store` uses `localStorage`, which is
  available in the Tauri webview and in the browser; it deliberately does **not** use the
  IndexedDB workspace storage, which `get-workspace-storage.ts` resolves to a no-op on desktop.
  No adapter branch is introduced.
- **AI safety:** The AI section seeds and never sends. It is disabled with a visible reason when
  no key is configured and while a stream is in flight. It surfaces no key material. Making
  `layer`, `group`, and `tags` user-editable **closes** an existing asymmetry in which the AI
  could write fields the user could not inspect or revert; every such edit goes through
  `updateElement`, which already captures history, so undo covers them.
- **Accessibility and UX:** Fully specified in decision **D4**. Per-surface state inventory:
  *palette* — empty (no matches, with cross-category recovery), empty favourites, omitted-when-
  empty recents, disabled (canvas locked), narrow (≤ 220 px); no loading or error state exists
  because the catalog is a module constant, and that is stated in a comment rather than faked.
  *Inspector* — no model open, empty selection (document properties), single selection,
  multi-selection, entity-not-found (preserve today's `Element not found.` /
  `Data flow not found.` / `Boundary not found.`), threat-analysis-disabled, AI-unavailable,
  AI-streaming, narrow (≤ 300 px). Dark and light themes both use existing theme variables only.
  `settings.reduceMotion` gates every new transition.
- **Observability and evidence:** The PR carries before/after screenshots of both panels in both
  themes at default and minimum widths, the written accessibility review from Step 14, the
  keyboard map, and an explicit statement that every pre-existing E2E assertion listed in the
  evidence table passed **unmodified**.

## Verification gate

Targeted, in order:

```bash
npx tsc --noEmit
npx vitest --run palette
npx vitest --run panel-store
npx vitest --run inspector
npx vitest --run model-store
npx vitest --run thf-model-utils
npx vitest --run right-panel
npx vitest --run command-registry
npx biome check .
npx playwright test e2e/palette-navigation.spec.ts e2e/inspector-sections.spec.ts
npx playwright test e2e/element-editing.spec.ts e2e/empty-states.spec.ts e2e/keyboard-shortcuts.spec.ts
```

Final required gate:

```bash
npm run ci:local
```

E2E **is** required for this issue: every acceptance criterion is a user-visible interaction, and
Step 14's keyboard-only insertion path cannot be proven at the unit level.
`e2e/canvas-visual.spec.ts` must be run once locally on macOS to confirm the baselines still
match — they screenshot `.react-flow` only, so they should be untouched; if any baseline moves,
the palette changed the canvas and that is a bug, not a baseline to regenerate.
`npm run ci:docker` is not required: no Rust, build, or platform-specific surface changes.

## Owner validation

Deterministic checks cannot decide any of the following.

1. **The virtualization amendment (decision D1).** The issue says "Large result sets are
   virtualized". This plan ships keyboard navigation in full and defers windowing to `#59` with
   a 300-row trigger and a CI tripwire. Accept the amendment, or direct that a windowing
   dependency be added now for 61 entries.
2. **The `#59` interface bet.** `src/lib/palette/catalog.ts` is the single seam. If `#59` lands a
   materially different shape, that one file is the reconciliation cost. Confirm the seam is
   narrow enough, or direct that `#58` wait for `#59`.
3. **Is the four-group taxonomy right?** Architecture / Visual / Threat / AI is a modeling
   opinion. The plausible-but-wrong outcome is a panel that passes every test and that nobody
   wants to scroll. Judge it on screen, not in the table. In particular: do `stores` and
   `encryption` belong in Architecture, or do they want a security group of their own?
4. **Is "AI-assisted properties" satisfied by an affordance rather than provenance?** Decision
   **D3** chooses a scoped "Ask AI about this component" action and defers per-field AI
   provenance to `#62`. Confirm, or direct that provenance land first.
5. **Is refusing bulk multi-edit acceptable?** The summary tells the truth and offers only
   delete/copy/cut. A user who shift-selects ten components to set a layer will be disappointed.
   Confirm the deferral (follow-up 3) or pull it into scope.
6. **Recents/favourites scope (decision D2).** They are global and user-scoped, in
   `threatforge-panels`. Confirm that favourites should follow the person rather than the
   document, and that `Reset to defaults` in Settings should **not** clear them (it will not,
   because they are outside `UserSettings`).
7. **Search-within-tab.** Today typing resets the category to All. This plan scopes search to
   the active tab and offers a "Search all categories" recovery. Confirm the change.
8. **Palette insert while the canvas is locked.** Today a locked canvas still accepts palette
   double-clicks. Step 3 disables insertion when locked. Confirm that is the intended meaning of
   the lock.
9. **Deferred follow-ups.** Confirm items 1–6 in *Deferred follow-ups* should become linked
   issues under `#47`.
10. **The `#57` Step 7 gap.** `isThreatAnalysisEnabled` and its Rust twin were specified by
    `#57`'s plan and did not land. This issue adds the TypeScript half only. Confirm that the
    Rust method should be filed separately rather than added here without a caller.

## Specialist review

- [ ] PR reviewer
- [ ] Slop auditor — specifically the D1 tripwire test, the `#59` seam's coupling budget, and
      whether the read-only relationships count row earns its place
- [ ] Security auditor, when boundary/security lanes apply — `localStorage` persistence in
      `panel-store`, the untrusted-id read path, and the AI section's seed-without-send contract
- [ ] Threat-model expert, when schema/STRIDE/threat lanes apply — required because Step 7
      mutates architecture references that `.thf` reference integrity depends on, and because
      the Threat section changes when threat analysis is presented as enabled

## Replan log

Append changes; do not rewrite prior decisions.

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-07-21 | Initial plan | Issue `#58`, parent `#47`, sibling issues `#54`/`#56`/`#59`/`#60`, and repository evidence at `7b2e025`: `src/components/palette/component-palette.tsx`, `src/components/panels/{right-panel,properties-tab,threats-tab,ai-chat-tab}.tsx`, `src/components/layout/{app-layout,top-menu-bar}.tsx`, `src/components/canvas/{dfd-canvas,canvas-context-menu}.tsx`, `src/components/canvas/nodes/dfd-element-node.tsx`, `src/lib/{component-library,service-icons,command-registry,thf-validation,thf-yaml}.ts`, `src/lib/ai/schemas/actions.ts`, `src/stores/{ui-store,model-store-factory,canvas-store-factory,document-registry,document-stores,workspace-store,settings-store}.ts`, `src/lib/persistence/types.ts`, `src/types/threat-model.ts`, `src/hooks/use-keyboard-shortcuts.ts`, `e2e/*`, `package.json`, `vitest.config.ts`. Catalog counts (45 components, 9 categories, 16 subtypes) and the absence of any virtualization dependency, any ARIA attribute in the four affected files, and any merged `isThreatAnalysisEnabled` helper were measured directly rather than assumed. |
