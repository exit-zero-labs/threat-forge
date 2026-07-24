# Issue 65 — Build deterministic browser workspace fixtures and interaction helpers

## Objective

Reusable browser E2E workspace setup and cross-spec interactions move into one shared, versioned,
typed layer (`e2e/support/`) instead of ad hoc per-spec code, so that: (a) empty, realistic, large,
malformed, multi-tab, and recovery-adjacent workspace states are each reproducible from a single
named call; (b) create/open/switch/click/drag/connect/edit/save/export/restore are typed helpers
with no CSS/testid selector leaking into scenario prose; (c) time, random IDs, animation, fonts,
and viewport are each either actively controlled or evidenced as already deterministic; (d) every
browser spec fails on an unexpected console error, unhandled rejection, or failed network request,
with a test-scoped allowlist for the one deliberately-triggered production warning; and (e) the
same fixtures and commands run headed locally and headless in CI. Specs whose raw gesture or
first-run state is the behavior under test keep that behavior visible while still inheriting the
failure policy.

## Issue contract

- **Issue:** `#65`
- **Parent initiative:** `#45` (Phase 4 — agent-driven E2E quality, milestone M2 "General Release")
- **Type:** `Task`
- **Size:** `M`
- **Priority:** `P0` (per Project 2; issue itself carries no explicit priority label)
- **Autonomy:** `Automatable`
- **Project status note:** Project 2 `Status` currently reads `Backlog` because Size M requires this
  committed plan before the issue can become executable. The issue is not `To triage`: it has
  settled acceptance criteria, is labeled `Automatable`/`size/M`/`model/sonnet`, and its thread
  confirms the former `#53`/`#56` blockers are both `Done` on `main`. Once this plan is committed
  and reviewed, no dependency or design blocker remains and the issue can move to `Ready`.
- **Dependencies:**
  - `#53` (document registry/state ownership) — merged (`3c40206`, `3266111`, `6535ee3`).
  - `#54` (multi-tab workspace: tab strip, reorder, pin, close) — merged (`64c7aee`).
  - `#56` (IndexedDB + localStorage workspace persistence) — merged (`91cdd1c`, `9474136`).
  - `#111` (CI reliability: bounded local timeouts, first-run overlay suppression, infra-failure
    reruns) — merged; this plan's failure-policy and timeout conventions build on it without
    re-litigating it.
  - No new npm dependency. No secret, account, or external service. Autonomy stays `Automatable`.
- **Non-goals (owned by adjacent issues, named not absorbed):**
  - Artifact/manifest standardization (screenshot/trace/console/DOM bundling, visual baselines,
    quality rubric) is `#66`. This plan only adds the naming seam (`test.step` conventions) `#66`
    can key off; it builds no manifest, no baseline, no bundle.
  - The documented agent E2E runbook and "one command launches the right fixture" workflow is
    `#67`. This plan only makes the fixture-seeding functions plain, importable, and separately
    named so `#67` can document them without re-deriving selectors; it writes no runbook.
  - The browser recovery screen (inspect/export/clear a corrupt or oversized workspace) is `#55`,
    still `Backlog`. This plan's "recovery" fixture class proves only the fail-visible,
    non-destructive states that exist **today**; it builds no recovery UI and does not wait for
    `#55`.
  - `.thf` schema changes are none-of-this-issue's; every fixture uses the current `"1.0"` schema
    and is validated by the real production reader.
  - Desktop (Tauri) E2E is untouched; this issue is browser-only per its own title and labels.
    Desktop smoke coverage is `#68`.
  - No new Playwright project, browser engine, or worker-parallelism change. The suite stays one
    `chromium` project, `workers: undefined` locally / `1` in CI (unchanged from current config).

## Current behavior and evidence

Evidence read on `main` at `4d56b92` and empirically re-verified against the running dev server
(`npm run dev:web` on port 3000) via short-lived, deleted probe spec files — never committed, `git
status --short` confirmed clean after every probe in this planning session.

### Existing shared fixture surface (`e2e/fixtures.ts`)

Exports a Playwright `test`/`expect` pair (`test = base.extend({ page: ... suppressFirstRunOverlays
... })`) plus free functions: `dismissWhatsNew`, `waitForCanvasReady`, `createModel` (clicks
`btn-empty-new`, waits for `component-palette` + canvas), `addPaletteItem` (double-click a palette
item, wait for node count to increment, bounded 15s per #111), `suppressFirstRunOverlays` (seeds
`threatforge-last-seen-version` and `threatforge-onboarding` via `page.addInitScript` before any
navigation), and `seedAnthropicApiKey`. No console/network failure policy exists today. No shared
fixture-seeding module exists; `e2e/document-tabs.spec.ts` defines its own local
`openDocuments(page, count)` (loop of `btn-new-document` clicks) and `e2e/browser-restore.spec.ts`
defines its own local `waitForLocalSave`, `elementNameInput`, `renameSelectedElement`,
`createNamedDocument` — each is correct but not shared, and each spec would otherwise duplicate it.

### Persistence/registry architecture this plan builds fixtures against (`#53`/`#54`/`#56`)

- `useDocumentRegistry` (`src/stores/document-registry.ts`) owns live `DocumentSession`s keyed by
  branded `DocumentId` (`doc-<uuid>`, `src/lib/document-id.ts`, `src/types/document.ts`).
- `useWorkspaceStore` (`src/stores/workspace-store.ts`) persists a localStorage manifest (`{
  schemaVersion, documents: WorkspaceManifestEntry[], activeDocumentId, preferences }`) under key
  `WORKSPACE_STORAGE_NAMESPACE = "threatforge-workspace"` (`src/lib/persistence/types.ts`), and
  tracks per-document `persistence[id]: DocumentPersistenceState` (`status: 'pending'|'writing'|
  'saved'|'error'|'corrupt'`) plus whole-store `persistenceAvailable`/`unavailableReason:
  'unavailable'|'private-mode'|'migration-failed'|'corrupt'|null`.
- IndexedDB (same `WORKSPACE_STORAGE_NAMESPACE` as the DB name, `WORKSPACE_DB_VERSION = 1`,
  `src/lib/persistence/migrations.ts`) holds two stores: `STORE_DOCUMENTS = "documents"`
  (`{ id, currentRevisionId, updatedAt }`) and `STORE_REVISIONS = "revisions"`
  (`{ revisionId, documentId, thf, seq, createdAt }`), plus `STORE_META`/`INDEX_BY_DOCUMENT`.
- `useWorkspaceRestore`/`hydrateDocumentById` (`src/hooks/use-workspace-restore.ts`) reads a
  document's stored `.thf` text, parses it (`parseThreatModelYaml`), and enforces the exact-match
  schema-version gate (`validateThreatModelVersion`, ADR-009) — the same lightweight parser
  boundary as everywhere else, deliberately without full reference re-validation of an
  in-progress document.
- `useWorkspacePersistence` (`src/hooks/use-workspace-persistence.ts`) debounce-writes the active
  document's captured model; `reportWriteFailure` (line 68-82) sets `status: 'error'` and emits
  **exactly one** `console.warn("Workspace persistence failed for <id> (<kind>); changes are kept
  in memory.")` per failing document — the only production `console.warn` call site reachable
  from ordinary browser E2E flows (the other, `update-store.ts:63`, is gated behind `isTauri()`
  and unreachable in a browser context at all).
- `StatusBar` (`src/components/layout/status-bar.tsx:29-84`) renders one coalesced indicator via
  `describeLocalPersistence`, keyed off `persistence[activeDocumentId]` and the whole-store
  `unavailableReason`. Its own doc comment (line 21-24) states scope precisely: *"this reports
  fail-visible state only... acting on it... is `#55`'s recovery screen."*

### Verified: per-document `status: 'corrupt'` ("Recovery needed" text) is unreachable today, by design

`markUnreadable` (`use-workspace-restore.ts:30-42`) is the only writer of `status: 'corrupt'`, and
its own doc comment states: *"A corrupt record is never deleted and never auto-activated; `#55`
renders the recovery affordance over this state."* Both of its call sites are inside
`hydrateDocumentById`, which gates `registry.activateDocument`/hydration success — a document
whose stored body cannot be read or parsed **never becomes `activeDocumentId`**, so
`StatusBar`'s `persistence[activeDocumentId]` never observes `'corrupt'`, and the "Recovery
needed" text branch (lines 36-42, 75-80 of `status-bar.tsx`) is currently dead from the UI's
perspective. This was directly confirmed empirically: seeding a sole document whose stored
revision is invalid YAML and reloading produces a tab that renders with `aria-selected="true"`
(the tab strip's `mergeWorkspaceTabs` marks it selected from the persisted manifest pointer
regardless of hydration outcome) while the canvas falls back to `data-testid="empty-canvas"` (no
model is active) — with **no error text at all**, not "Recovery needed" and not anything else. The
app remains fully interactive afterward (clicking "New Document" still works and activates a
fresh tab). This is consistent with the source comments: the store-level state exists ahead of its
future consumer (`#55`), and the plan below builds a fixture against the true, current, safe-but-
silent behavior rather than a text string that cannot appear before `#55` ships. This is not a
defect this plan fixes — it is out of scope (see Non-goals) and is called out in Owner validation
for visibility rather than silently assumed away.

Two statuses distinct from the above **are** reachable and independently render distinct text:
- **Whole-store `unavailableReason`** (`'unavailable'` confirmed reachable by deleting
  `window.indexedDB` before navigation; `'private-mode'` is a distinct `WorkspaceUnavailableReason`
  value but `describeLocalPersistence` renders it through the *same* branch as `'unavailable'`
  ("This session won't be saved") — confirmed by reading the function: only `'migration-failed'`
  and `'corrupt'` take the "Recovery needed" branch. There is no UI-observable difference between
  `'unavailable'` and `'private-mode'`, so this plan does not build a second fixture for
  `'private-mode'` — it would assert identical text via a less direct mechanism (patching
  `indexedDB.open` to throw `SecurityError`, verified working but strictly redundant with the
  simpler `window.indexedDB = undefined` technique already used for `'unavailable'`).
- **Per-document `status: 'error'`** ("Not saved locally") — reachable for an **already-active**
  document mid-session via a genuine write failure (`reportWriteFailure`), independent of the
  hydration-gating issue above, since the document is already active before the write ever fails.
  Confirmed empirically: create a document, wait for its first successful "Saved locally", patch
  `IDBObjectStore.prototype.put` to throw from that point on, edit again — status flips to "Not
  saved locally" and exactly one `console.warn` matching the pattern above fires.
- **Stale-manifest reconciliation** (an orphan-detection path, not a rendered status) — confirmed
  empirically: seed one real IndexedDB document plus one localStorage manifest entry with no
  backing IndexedDB record, reload — only the real document's tab survives and hydrates correctly;
  no crash, no visible artifact of the dropped entry (its IndexedDB body, if any existed, would be
  retained un-referenced for `#55`, per D5 in `#56`'s plan).

### Console/network noise baseline (measured, not assumed)

Every ordinary flow probed (new model, add element, reload, multi-tab, dirty-state edit, malformed
open, AI/threats tab visits, ecommerce template load) produces **zero** `console` `error`/`warning`
events, zero `pageerror` events, and zero `requestfailed` events beyond Vite HMR `info`/`debug`
noise and a React DevTools banner (both below the `warning` severity this plan listens for). The
one exception, confirmed by direct reproduction, is `reportWriteFailure`'s single `console.warn`
(above) — reachable only by deliberately breaking a write, which only the recovery fixture class
does.

**Fixture authoring pitfall, found and fixed by evidence:** opening
`tests/fixtures/thf/architecture-canonical-full.thf` (the Rust/TS round-trip corpus's canonical
fixture) through the real browser Open-file flow produces **repeated** `console.warn` noise —
`[React Flow]: Couldn't create edge for source handle id: "right", edge id: flow-1` — because that
fixture's `data_flows[].source_handle` values (`"right"`, bare position names) predate the
browser's DOM handle-id convention (`{position}-source`/`{position}-target`, `src/lib/canvas-
utils.ts:94-95,147-148`, `src/lib/templates.ts:67-73`) and are passed straight through to
ReactFlow's edge `sourceHandle`/`targetHandle` props unchanged
(`src/stores/canvas-store-factory.ts:222-223`) with no DOM handle by that bare name to bind to.
**Consequence for this plan:** the shared `tests/fixtures/thf/` corpus fixture is safe to reuse for
"malformed" (the `invalid/*.thf` files have no `data_flows` reaching the canvas at all — they fail
at open-time) but is **not** reused for "realistic"; and any newly-authored fixture (the "large"
one) must either omit `source_handle`/`target_handle` entirely — confirmed empirically to render
with **zero** console noise (ReactFlow draws an un-anchored edge with no warning) — or compute
correct `{position}-source`/`{position}-target` values the way `loadTemplate` does. This plan omits
them (simpler, verified clean, and the large fixture's purpose is bulk-render performance, not
exact handle geometry).

### The "realistic" fixture is a public template, not a `.thf` import

`src/lib/templates.ts` ships six named starter templates (`TEMPLATES`), each with a
`data-testid="template-<id>"` card on the empty-canvas state, loaded via `loadTemplate(id)`. The
`"ecommerce-platform"` template has **13 elements, 13 data flows, 3 trust boundaries, 5 threats**
(counted directly from `TEMPLATE_BUILDERS["ecommerce-platform"]`), every flow already carries a
computed `{position}-source`/`{position}-target` handle pair, and clicking its card is a single
public-UI action confirmed to produce zero console/network noise. **Important:** `loadTemplate`
stamps `metadata.created`/`metadata.modified` with `new Date().toISOString().split("T")[0]`
(`templates.ts:53`, `today` closure) — non-deterministic unless the fixture installs
`page.clock.install({ time })` **before** clicking the card.

### File-open and file-save/export mechanics (`src/lib/adapters/browser-file-adapter.ts`)

- **Open** (`btn-open`, `pickFile`) creates a **detached** `<input type="file">` (never appended to
  the DOM) and calls `.click()` directly. Confirmed empirically that Playwright's
  `page.waitForEvent("filechooser")` + `chooser.setFiles(path)` pattern still works correctly
  against this detached-input design (Playwright hooks the native chooser at the browser level,
  not via a DOM locator).
- **Save** (`btn-save`/`btn-save-as`, `saveThreatModel`) and **Export** (`btn-export`,
  `exportAsHtml`) both call `downloadBlob`, which creates and clicks a temporary `<a download>`.
  Both are real browser downloads. Confirmed empirically: `page.waitForEvent("download")` around
  the `btn-save` click yields a `Download` whose `suggestedFilename()` matches `/\.thf$/` and whose
  `path()` resolves to real content. This is **distinct** from the automatic, no-user-action
  IndexedDB workspace autosave (`useWorkspacePersistence`) that `browser-restore.spec.ts` already
  exercises via reload — the plan's `saveDocument`/`exportHtmlReport` helpers must not be confused
  with that mechanism, and their doc comments say so explicitly.

### Interaction gesture mechanics (canvas)

- **Connect:** ReactFlow renders 8 cardinal/corner source+target handle pairs per node via the
  shared `NodeHandles` component (`src/components/canvas/nodes/shared-handles.tsx`), and uses
  strict connection targeting — a drag must land precisely on the target's `-target`-suffixed
  handle DOM element (e.g. `[data-handleid='left-target']`), confirmed to reliably create exactly
  one `.react-flow__edge` when dragging from a `right-source` handle to a `left-target` handle,
  via real `page.mouse.down()` → `page.mouse.move(..., { steps: 10 })` → `page.mouse.up()`
  sequences (the exact pattern already used raw in `e2e/canvas-handles.spec.ts:44-81`).
- **Edges currently carry no `data-testid`** (`src/components/canvas/edges/data-flow-edge.tsx`),
  only the ReactFlow-assigned `.react-flow__edge` class. `BaseEdge`'s implementation
  (`node_modules/@xyflow/react` — `function BaseEdge({ path, ...props })`) spreads `...props`,
  including any `data-testid`, directly onto the visible `<path>` element it renders — confirmed
  by reading the installed package source, not assumed. This plan adds `data-testid={
  \`edge-${id}\`}` to the `<BaseEdge>` call, mirroring the existing `data-testid={\`node-${id}\`}`
  convention on nodes (`dfd-element-node.tsx:152,195`) and the "inert `data-testid`-at-most"
  production-change precedent already established by `#111`'s plan.
- **Edit:** the right-panel "Name" input is reached via `page.getByTestId("right-panel")
  .locator("label").filter({ hasText: "Name" }).locator("input")` — the exact, already-proven
  pattern in `e2e/element-editing.spec.ts:28-32` and `e2e/browser-restore.spec.ts:19-25`.
- **Tab identity:** each tab carries both `role="tab"` (order-based) and
  `data-testid="document-tab-<documentId>"` (id-based), plus a sibling
  `data-testid="close-tab-<documentId>"` button (`src/components/layout/document-tab.tsx:91,118,
  167`). No tab-rename UI exists (titles come only from `metadata.title`), so no `renameTab` helper
  is needed or planned.

### Determinism inputs already verified

- `page.clock.install({ time })` (Playwright ≥1.45; this repo pins `@playwright/test@^1.58.2`) was
  confirmed to anchor `Date.now()`/`new Date()` deterministically without freezing RAF/timers —
  real interaction timing (React state commits, debounce timers) continues to work normally.
- `reducedMotion: "reduce"` and the config's current default viewport (`devices["Desktop Chrome"]`,
  1280×720, unchanged in `playwright.config.ts`) are both already-available, already-deterministic
  Playwright `use` options; the config does not yet set `reducedMotion` explicitly.
- **Fonts:** grepped `index.html`, all `*.css`, and `package.json` — **no custom web font is loaded
  anywhere in the app** (no `@font-face`, no Google Fonts link, no `fontsource` package). There is
  therefore no FOUT/network-font race for this plan to defend against; font-rendering variance
  across host operating systems is a visual-snapshot-baseline concern (`canvas-visual.spec.ts`,
  owned by `#66`'s stable-baseline work), not a fixture-determinism concern for `#65`. This plan
  states the finding rather than adding an unneeded font-loading control.
- **Random IDs:** `crypto.randomUUID()`-derived `DocumentId`s are deliberately **not** intercepted.
  No existing spec asserts on a literal `DocumentId` value (confirmed by review of every current
  spec), and `document-id.ts`'s "fail closed, no `Math.random()` fallback" design exists precisely
  *because* a predictable id is a workspace-integrity hazard — shimming the app's own generator to
  be predictable would reintroduce exactly the hazard the code guards against, for no test benefit.
  Test-adapter seeding mints its own ids via Node's `crypto.randomUUID()`, entirely independent of
  the app's generator.

### CI/local command parity (already exact)

`.github/workflows/ci.yml`'s `e2e` job runs `npx playwright install --with-deps chromium` then
`npx playwright test` (single `chromium` project, `retries: 2`, `workers: 1` under `CI=true`).
`scripts/ci-local.sh --e2e` runs the identical `npx playwright test`. No headed variant exists in
CI or locally today; `package.json` has `test:e2e` (`playwright test`) and `test:e2e:ui`
(`playwright test --ui`) but no `--headed` script.

## Design decisions

### D1 — Fixture inventory: exactly six classes, nine seed functions, explicit seeding boundary

| # | Fixture (function name) | Class | Seeds via | Version | Renders/asserts |
|---|--------------------------|-------|-----------|---------|------------------|
| 1 | `seedEmptyWorkspace` | empty | **public UI** — `createModel(page)` (existing, unchanged) | v1 | 0 elements, 0 flows |
| 2 | `seedRealisticWorkspace` | realistic | **public UI** — install clock, click `template-ecommerce-platform` | v1 | 13 elements, 13 flows, 3 boundaries, 5 threats |
| 3 | `seedLargeWorkspace` | large | **public UI** — Open-file flow against committed `e2e/fixtures/large-model.thf` | v1 | 150 elements, 100 flows, renders ≤5000ms |
| 4 | `seedMalformedWorkspace` | malformed | **public UI** — Open-file flow against existing `tests/fixtures/thf/invalid/truncated.thf` (reused, not duplicated) | v1 (tracks the corpus fixture as-is) | `window.alert` equals `Open failed: This file is not a valid ThreatForge document: it could not be parsed.`, canvas unchanged |
| 5 | `seedMultiTabWorkspace` | multi-tab | **public UI** — promoted `openDocuments(page, 10)` | v1 | 10 tabs, tenth selected (reuses `#54`'s "at least ten" bound, not increased) |
| 6 | `seedEphemeralWorkspace` | recovery | **test-adapter** — delete `window.indexedDB` via `addInitScript` before navigation | v1 | `local-persistence-status` = "This session won't be saved" |
| 7 | `seedWriteFailureWorkspace` | recovery | **test-adapter** — create doc via public UI, wait for first "Saved locally", then patch `IDBObjectStore.prototype.put` to throw, trigger one more edit | v1 | status → "Not saved locally"; exactly one allowlisted `console.warn` |
| 8 | `seedStaleManifestWorkspace` | recovery | **public UI + test-adapter** — create and persist one real document, then append one manifest-only orphan to the existing localStorage wrapper | v1 | reload keeps exactly the real document's tab; no crash |
| 9 | `seedCorruptSoleDocumentWorkspace` | recovery | **public UI + test-adapter** — create and persist one real document, then replace only its current IndexedDB revision body with invalid YAML | v1 | tab renders `aria-selected="true"` but unhydrated; canvas shows `empty-canvas`; app stays interactive (new-document still works) |

Fixtures 1, 2, 3, 4, 5 seed through the app's own public storage/file interfaces exactly as a real
user would (click, template card, Open dialog) — satisfying "seed through supported storage/file
interfaces... where possible" directly, with **zero** raw IndexedDB/localStorage writes. Fixtures
6-9 are the one place a test-adapter is unavoidable: there is no public UI action that disables
IndexedDB, forces a write to fail, or hand-corrupts a stored revision, and building one would be
speculative product work out of scope for this issue. This boundary is the plan's answer to that
acceptance criterion, stated explicitly rather than left implicit.

"Recovery" is deliberately **four** distinct seed functions, not one, because the issue's six
named classes are workspace *states*, and the current, correctly-scoped observable "recovery"
behavior in production today is four separable, independently-testable states (see Current
behavior and evidence: unreachable-`corrupt`-status finding). Bundling them into one function would
either assert a false/unreachable UI text or silently under-test three of the four real states.

Versioning convention: `workspace-fixtures.ts` exports
`WORKSPACE_FIXTURE_VERSION = 1 as const`; every `test.step` name includes that value
(`seed:<name>@v1`), and the large `.thf` header records the same fixture version plus its
element/flow counts. A future shape change bumps the constant and the affected fixture header and
is recorded in this plan's Replan log — never silently overwritten.

### D2 — Typed helper API (`e2e/support/interactions.ts`)

All helpers take a `Page` (and, where relevant, a `Locator` or plain data — never a raw CSS/testid
string) so calling code in scenario specs reads as behavior, not selectors:

```ts
async function createDocument(page: Page): Promise<void>;
// Clicks the always-present tab-strip "+" (`btn-new-document`); works whether or not a document
// is already open. Distinct from and does not replace `createModel` (fixtures.ts), which is the
// specific "New Model" action from the truly-empty canvas state (`btn-empty-new`) and stays as-is.

async function openDocument(page: Page, fixturePath: string): Promise<void>;
// Wraps the `page.waitForEvent("filechooser")` + `btn-open` click + `chooser.setFiles(path)`
// pattern. Resolves once the file has been handed to the browser; callers assert the resulting
// state (or the resulting `window.alert` for a malformed file) themselves.

async function switchToTab(page: Page, locate: { index: number } | { documentId: string }): Promise<void>;
// Clicks `getByRole("tab").nth(index)` or `getByTestId(\`document-tab-${documentId}\`)` and
// waits for that tab's `aria-selected="true"`.

async function clickElementByName(page: Page, name: string): Promise<Locator>;
// Locates `[data-testid^='node-']` filtered by visible text, clicks it, returns the Locator for
// chaining (e.g. into editElementName).

async function dragElementBy(page: Page, element: Locator, dx: number, dy: number): Promise<void>;
// Raw page.mouse down/move(steps:10)/up gesture from the element's bounding-box center, the exact
// mechanic already proven in canvas-handles.spec.ts.

async function connectElements(
  page: Page, source: Locator, target: Locator,
  opts?: { sourceHandle?: string; targetHandle?: string },
): Promise<void>;
// Defaults to 'right-source' -> 'left-target'; drags from the source handle's bounding box to the
// target handle's, asserts .react-flow__edge count increments by exactly one.

async function editElementName(page: Page, element: Locator, newName: string): Promise<void>;
// Clicks the element, fills the right-panel Name input, asserts the canvas node reflects it.

async function saveDocument(page: Page): Promise<Download>;
// Clicks btn-save, awaits the real browser download event, returns it for content assertions.
// Explicitly NOT the same mechanism as automatic IndexedDB autosave.

async function exportHtmlReport(page: Page): Promise<Download>;
// Clicks btn-export, awaits the download event, returns it.

async function restoreWorkspace(page: Page): Promise<void>;
// page.reload() then waits for the stable post-reload shell anchors (status-bar, btn-new-document)
// to be visible -- the same anchor pair already used in browser-restore.spec.ts's first test.
// Does not wait for every tab's hydration; spec-specific assertions do that.

async function waitForLocalSave(page: Page): Promise<void>;
// Promoted verbatim from browser-restore.spec.ts: asserts "Saving locally..." then "Saved
// locally" on local-persistence-status, in that order, so callers track *this* edit's write.

async function openDocuments(page: Page, count: number): Promise<void>;
// Promoted verbatim from document-tabs.spec.ts's local helper of the same name/signature.
```

No helper accepts or returns a bare CSS selector string; every parameter is either a `Page`, a
`Locator`, or plain scenario data (a name, a count, a delta, a fixture path).

### D3 — Determinism controls

- **Time:** `installDeterministicClock(page, iso = "2026-01-01T00:00:00.000Z")` in
  `e2e/support/base.ts`, calling `page.clock.install({ time: new Date(iso) })`. Called before
  `page.goto` by any fixture whose seeded content embeds `new Date()` (the realistic template and
  any future date-stamped fixture); fixtures that don't touch dates (empty, malformed-open,
  multi-tab of empty docs) do not need it and do not call it, to avoid installing a fake clock
  where it buys nothing.
- **Random IDs:** deliberately not intercepted (rationale in Current behavior and evidence).
- **Animation:** `playwright.config.ts`'s `use` block gains `reducedMotion: "reduce"`.
- **Fonts:** no action; documented finding that none are loaded (see Current behavior and
  evidence). Cross-OS font-rendering variance in screenshot baselines remains `#66`'s concern.
- **Viewport:** no action; the config's current `devices["Desktop Chrome"]` default (1280×720) is
  already fixed and used by every spec today.

### D4 — Console/network failure policy and allowlist

`e2e/support/base.ts` defines `failureAwareTest` and `expect` with a `page` fixture that attaches:

- `page.on("console", msg => { if (msg.type() === "error" || msg.type() === "warning") ... })`
- `page.on("pageerror", err => ...)`
- `page.on("requestfailed", req => ...)`

and, in teardown (after `use(page)` returns), filters collected entries against the configured
allowlist and throws an aggregated diagnostic listing every disallowed entry. The **default
allowlist is empty**. `console.log`/`info`/`debug` are not observed (only `error`/`warning` types),
which is why ordinary Vite HMR/DevTools chatter needs no exception. The forced-write-failure test
alone calls `test.use({ allowedConsolePatterns: [...] })` with a fully anchored pattern matching
the complete observed safe warning shape (document id, error kind, and fixed suffix). The exception
is scoped to that test/describe; ordinary tests do not silently accept a future persistence
warning.

`e2e/fixtures.ts` imports `failureAwareTest` and extends only its `page` fixture to run
`suppressFirstRunOverlays` before the test. This keeps the existing `test` export and every existing
overlay-suppressed spec behavior unchanged without creating an import cycle. The two specs that
currently import the raw runtime `test` are made failure-aware deliberately:

- `onboarding-auto-start.spec.ts` imports `failureAwareTest as test` (not the overlay-suppressing
  `fixtures.ts` test), so real first-run behavior remains under test.
- `screenshot-templates.spec.ts` imports `test` from `fixtures.ts` and removes its duplicate manual
  suppression calls; its rendered state remains the same.

After this migration, no `*.spec.ts` imports the runtime `test` directly from `@playwright/test`;
type-only `Page`/`Route` imports remain fine.

### D5 — Headed/headless parity and Playwright project strategy

Add `"test:e2e:headed": "playwright test --headed"` to `package.json`. This is local-debugging
sugar only — CI's `npx playwright test` is unchanged, still headless, still one `chromium`
project, still `workers: 1`/`retries: 2` under `CI=true`. No new Playwright `projects` entry, no
new browser engine, no worker-count change: the issue asks for the *same* fixtures/tests to run
both ways via a flag, not a parallel test matrix, and multi-browser coverage is not in scope here.

### D6 — Migration of existing specs (no weakening)

| Spec | Change | What stays untouched and why |
|------|--------|-------------------------------|
| `e2e/document-tabs.spec.ts` | Replace its local `openDocuments` with the one imported from `e2e/support/interactions.ts` (identical signature/behavior) | Every assertion (aria-selected, arrow-key focus, Home/End, Enter-commits) is unchanged; only the helper's *source* moves |
| `e2e/browser-restore.spec.ts` | Replace its local `waitForLocalSave` with the shared one | `elementNameInput`/`renameSelectedElement`/`createNamedDocument` stay local — each is a trivial, spec-specific one-liner composition; promoting them buys nothing and risks over-abstracting a 3-line locator builder |
| `e2e/onboarding-auto-start.spec.ts` | Import `failureAwareTest as test` and `expect` from `support/base.ts` | Keep its first-run seeding and all raw guide interactions unchanged; it must not use the overlay-suppressing `fixtures.ts` test |
| `e2e/screenshot-templates.spec.ts` | Import `test` from `fixtures.ts`; remove the duplicate `suppressFirstRunOverlays` alias/calls | Keep every screenshot action/path unchanged; suppression still occurs once through the shared fixture |
| `e2e/canvas-handles.spec.ts` | **Not migrated** | Its raw `page.mouse` gestures are the subject under test (handle opacity during hover/drag); swapping them for the new `dragElementBy`/`connectElements` helpers would test the helper's plumbing standing in for the thing the spec claims to prove — the exact "do not mock or bypass the behavior under test" rule in `.github/instructions/e2e.instructions.md` |
| `e2e/dirty-state.spec.ts` | **Not migrated** | Its raw `page.on("dialog")`/keyboard assertions are the discard-guard contract itself |
| `e2e/element-editing.spec.ts` | **Not migrated** | Its raw `select`/dropdown assertions test the properties-panel contract itself; `editElementName` covers only the Name-input path used elsewhere, not this spec's own subject |

No existing assertion is loosened, removed, or replaced by a generic helper where the generic
helper would stand in for the specific contract under test.

### D7 — Artifact seam for `#66` and workflow seam for `#67`

- Every fixture-seeding function's body is wrapped in `await test.step(\`seed:<name>@v1\`, async () => { ... })`, and every `interactions.ts` helper wraps its own body in `test.step(\`<verb>: <summary>\`, ...)`. Playwright's own step/trace hierarchy (visible in the HTML report and the `results.json` `#66` will parse) then carries stable, greppable names without any new manifest code — this plan builds no manifest itself, only the naming convention `#66` can key off.
- `e2e/support/workspace-fixtures.ts` exports plain `(page: Page, ...) => Promise<void>` functions
  with no spec-file-specific setup baked in, so `#67` can reference
  `seedRealisticWorkspace`/`seedLargeWorkspace`/etc. without re-deriving selectors. Existing
  `npx playwright test <file>` / `bash scripts/ci-local.sh --e2e` parity and the new
  `test:e2e:headed` script provide the implementation seam; they do **not** satisfy #67's
  documentation and one-command workflow criteria, which remain wholly owned by #67.

### D8 — Large-fixture authoring constraints (evidence-derived)

`e2e/fixtures/large-model.thf` (new, committed, static) must:
1. Contain **150 elements, 100 data flows**, matching the empirically-measured ~236ms full-render
   time on the real Open-file path (a generous 5000ms assertion timeout is used in the spec,
   consistent with this repo's existing generous-but-bounded local-timeout convention —
   `addPaletteItem`'s 15000ms, `waitForLocalSave`'s 15000ms).
2. Give every element an explicit `position: { x, y }` in a deterministic grid (15 columns × 10
   rows, 220px column / 160px row spacing) so no auto-layout algorithm runs
   (`buildLayoutFromModel` only positions elements that already carry `position`; omitting it
   everywhere would change the measured render path).
3. Omit `source_handle`/`target_handle` on every data flow (confirmed empirically to render with
   zero console noise; including bare position names like the corpus's `architecture-canonical-
   full.thf` does was confirmed to reintroduce the ReactFlow handle-mismatch warning found above).
4. Have no duplicate element/flow ids and every flow's `from`/`to` referencing a real element id
   (the same reference-integrity rules `thf-validation.ts#assertNoDuplicateIds`/reference checks
   enforce), and use the current `version: "1.0"` schema — validated by successfully opening
   through the real browser reader, which is the discriminating verification for this fixture.
5. Live at `e2e/fixtures/`, not inside `tests/fixtures/thf/` — that directory's own README scopes
   it strictly to the shared Rust/TS byte-identity/round-trip corpus; a new e2e-only bulk fixture
   does not belong there and would conflate two different contracts.
6. Be reproducible: a small, committed, one-off generator (`e2e/fixtures/gen-large-model.mjs`, not
   wired into any npm script — run manually to regenerate) documents the exact grid/count/omission
   rules above in a header comment, mirroring the `.thf` corpus README's own "regenerate by..."
   convention.

### D9 — What the "recovery" fixture class honestly proves (and does not)

Stated once here, referenced from Owner validation and the corrupt-sole-document step: this plan's
recovery fixtures prove (a) ephemeral/degraded-mode messaging when IndexedDB is unavailable, (b) a
live write failure surfaces visibly with exactly one allowlisted log line, (c) a stale manifest
entry with no backing IndexedDB record is silently and safely dropped on reconciliation, and (d) a
corrupt sole document at boot does not crash the app, does not silently pretend to load, and
leaves the workspace otherwise fully usable. It does **not** prove that a corrupt document shows
a "Recovery needed" message to the user today, because — per the source's own doc comments and
this plan's direct empirical confirmation — that UI text cannot currently be reached by any
production code path; rendering it is `#55`'s job. Framing fixture (d) as proving "Recovery needed"
would be exactly the kind of hallucinated-behavior/mock-only assertion the tests instructions
guard against, so the plan does not do that.

## Implementation steps

Each step is independently executable and reviewable.

### 1. Add `data-testid` to data-flow edges (the only production-source change)

- **Behavior:** every rendered edge gains `data-testid="edge-<id>"`, mirroring the existing
  `data-testid="node-<id>"` convention. No behavior change to rendering, drag, connect, selection,
  or persistence — purely additive test observability, precedented by `#111`'s "inert `data-
  testid`-at-most" production-change allowance.
- **Files:** `src/components/canvas/edges/data-flow-edge.tsx`.
- **Implementation:** add `data-testid={\`edge-${id}\`}` as a prop to the existing `<BaseEdge ...>`
  call (confirmed via the installed `@xyflow/react` source that `BaseEdge` spreads unrecognized
  props, including `data-testid`, directly onto the rendered `<path>` element it owns — this is
  not a guess).
- **Targeted verification:** `npx vitest --run` for any existing edge component test (none currently
  assert on the edge's DOM structure, so none should break); manual `npx playwright test
  e2e/canvas-handles.spec.ts` (unrelated spec, must still pass unchanged) as a smoke check that
  nothing about edge rendering regressed.
- **Intent validation:** owner confirms the new attribute renders on a real edge in DevTools and
  that no visual/style change occurred (the prop carries no `className`/`style`).

### 2. `e2e/support/base.ts` — failure-aware base test and deterministic clock

- **Behavior:** one module owns the failure policy every browser spec consumes without forcing
  first-run suppression on specs that intentionally test onboarding. It adds:
  (a) console/pageerror/requestfailed capture with an empty default allowlist and a
  `test.use({ allowedConsolePatterns })` test-scoped extension point (D4), and
  (b) `installDeterministicClock(page, iso?)` (D3).
- **Files:** `e2e/support/base.ts` (new); `e2e/fixtures.ts` (modified to extend the failure-aware
  base with its existing overlay suppression); `e2e/onboarding-auto-start.spec.ts` and
  `e2e/screenshot-templates.spec.ts` (runtime test imports only, per D6).
- **Implementation:**
  1. `support/base.ts` imports Playwright's raw `test as base`/`expect`, defines
     `allowedConsolePatterns` as an option fixture whose default is `[]`, and exports
     `failureAwareTest = base.extend(...)` plus `expect`.
  2. Its `page` fixture attaches the three listeners before `use(page)`, then filters the collected
     entries against `allowedConsolePatterns` and throws one aggregated `Error` listing every
     disallowed entry after the test body.
  3. Export `installDeterministicClock(page, iso = "2026-01-01T00:00:00.000Z")` calling
     `page.clock.install({ time: new Date(iso) })`.
  4. Keep `AUTO_START_GUIDE_IDS` and `suppressFirstRunOverlays` in `fixtures.ts`. Import
     `failureAwareTest as base`/`expect` from `support/base.ts`; preserve the existing
     `test = base.extend({ page: ...suppressFirstRunOverlays... })` shape and all existing helper
     exports. `base.ts` never imports `fixtures.ts`, so no cycle exists.
  5. `onboarding-auto-start.spec.ts` imports `failureAwareTest as test` and `expect` from
     `support/base.ts`, retaining its raw `Page` type import and its exact first-run setup.
     `screenshot-templates.spec.ts` imports `test` from `fixtures.ts` and removes its manual
     suppression alias/calls.
- **Targeted verification:** run every existing spec once (`npx playwright test`) to confirm the
  empty default allowlist does not fail any currently-green spec (this is the discriminating check
  that the failure policy does not regress the suite); a small dedicated test in
  `e2e/workspace-fixtures.spec.ts` (step 6) that deliberately emits an unallowed `console.error` via
  `page.evaluate` and asserts the test itself fails (proves the policy is not a no-op) — written
  as a Playwright expected-failure pattern (`test.fail()`) rather than by inspecting internals.
  Also run `! grep -E 'import .*test.* from "@playwright/test"' e2e/*.spec.ts`; it must return no
  runtime `test` import.
- **Failure triage rule:** if the full-suite migration exposes warning/error/network noise in an
  existing spec, investigate and fix the source. Do not widen the empty default allowlist to make
  the suite green; only a test that deliberately triggers a fully understood safe condition may
  add an anchored local exception.
- **Intent validation:** owner confirms the aggregated failure message is legible (names the
  console/pageerror/requestfailed entries, not just a generic "test failed") and that the
  allowlist regex is narrow enough that a real future regression matching a *different* message
  still fails loudly.

### 3. `e2e/support/interactions.ts` — typed helper API

- **Behavior:** implements every helper in D2, each internally wrapped in its own `test.step` (D7).
  `openDocuments` and `waitForLocalSave` are promoted verbatim (same behavior, same assertions) from
  their current spec-local definitions.
- **Files:** `e2e/support/interactions.ts` (new); `e2e/document-tabs.spec.ts` (modified — delete the
  local `openDocuments`, import from `support/interactions.ts`); `e2e/browser-restore.spec.ts`
  (modified — delete the local `waitForLocalSave`, import from `support/interactions.ts`).
- **Implementation:** implement each function to the exact contract in D2's snippet; for
  `connectElements`, reuse the confirmed `right-source` → `left-target` default and the
  `page.mouse` down/move(steps:10)/up sequence already proven in `canvas-handles.spec.ts`; for
  `saveDocument`/`exportHtmlReport`, use `Promise.all([page.waitForEvent("download"), ...click])`
  exactly as confirmed in the probe.
- **Targeted verification:** `npx playwright test e2e/document-tabs.spec.ts
  e2e/browser-restore.spec.ts` — both must pass unchanged (same assertions, same pass/fail
  behavior, only the helper's import source moved); `npx tsc --noEmit` (typed helper signatures);
  `npx biome check e2e/`.
- **Intent validation:** owner spot-checks that no helper's internal selector logic leaked into
  any calling spec (grep-check: no new `data-testid=`/CSS-selector literal appears in a spec file
  that imports these helpers for the action the helper covers).

### 4. Author the committed large `.thf` fixture and its generator

- **Behavior:** `e2e/fixtures/large-model.thf` exists, is a valid `"1.0"` document, opens cleanly
  through the real browser reader, and matches D8's exact shape (150/100/grid positions/no
  handles).
- **Files:** `e2e/fixtures/large-model.thf` (new, static); `e2e/fixtures/gen-large-model.mjs` (new,
  one-off generator, not referenced by any npm script or CI step).
- **Implementation:** write the generator per D8; run it once to produce the committed `.thf`; open
  it once manually through the app's real Open dialog to confirm it loads with 150 nodes and no
  console warning before committing (this manual confirmation is the authoring gate, not an
  automated one — the automated proof is step 6's discriminating test).
- **Targeted verification:** `npx playwright test e2e/workspace-fixtures.spec.ts -g "large"` (added
  in step 6) — asserts node count 150, edge count 100 (or the drawn-edge count if some flows
  reference the same pair — the generator must avoid duplicate from/to pairs so 100 flows produce
  100 distinct rendered edges), render completes within 5000ms, zero console/network noise.
- **Intent validation:** owner opens the fixture once locally (headed run, D5) and visually
  confirms the grid renders sanely (no overlapping nodes, no off-canvas elements) — a plausible-
  but-wrong outcome (e.g. all elements stacked at the origin due to a generator bug) that a count
  assertion alone would not catch.

### 5. `e2e/support/workspace-fixtures.ts` — the nine seed functions

- **Behavior:** implements exactly the nine functions in D1's table, each seeding the named state
  and returning once it is fully settled (public-UI ones return after the app's own readiness
  signals; test-adapter ones return after the seeded IndexedDB/localStorage write completes and,
  where applicable, after `page.reload()`).
- **Files:** `e2e/support/workspace-fixtures.ts` (new).
- **Implementation:**
  1. `seedEmptyWorkspace(page)` — thin wrapper: `await page.goto("/app"); await
     createModel(page);` (imports `createModel` from `../fixtures`).
  2. `seedRealisticWorkspace(page)` — `installDeterministicClock(page); await page.goto("/app");`
     wait for `empty-canvas`, click `template-ecommerce-platform`, wait for
     `.react-flow__node` count 13.
  3. `seedLargeWorkspace(page)` — `await page.goto("/app");` then `openDocument(page,
     "e2e/fixtures/large-model.thf")`, wait for node count 150 (timeout 5000ms per D8).
  4. `seedMalformedWorkspace(page)` — `await page.goto("/app");` register a `page.once("dialog",
     ...)` handler capturing and dismissing the alert **before** triggering the open, then
     `openDocument(page, "tests/fixtures/thf/invalid/truncated.thf")`; return the captured alert
     so the caller asserts the complete user-visible text:
     `Open failed: This file is not a valid ThreatForge document: it could not be parsed.`
  5. `seedMultiTabWorkspace(page)` — `await page.goto("/app"); await openDocuments(page, 10);`.
  6. `seedEphemeralWorkspace(page)` — `await page.addInitScript(() => { Object.defineProperty(
     window, "indexedDB", { value: undefined }); }); await page.goto("/app");`.
  7. `seedWriteFailureWorkspace(page)` — `await page.goto("/app"); await createModel(page); await
     expect(page.getByTestId("local-persistence-status")).toContainText("Saved locally");` then
     `page.evaluate` to monkeypatch `IDBObjectStore.prototype.put` to throw
     `DOMException("forced failure", "UnknownError")`, then `await addPaletteItem(page,
     "palette-item-generic")` to trigger one more write. The calling test, not this seed helper,
     scopes the one fully anchored warning allowlist with `test.use`.
  8. `seedStaleManifestWorkspace(page)` — `await page.goto("/app"); await createModel(page); await
     waitForLocalSave(page);` so production creates the complete v1 IndexedDB schema, real
     document/revision records, and exact Zustand localStorage wrapper. In `page.evaluate`, parse
     the existing `WORKSPACE_STORAGE_NAMESPACE` value, append one exact
     `WorkspaceManifestEntry`-shaped orphan to `wrapper.state.documents` while preserving every
     existing wrapper/state field, write it back, then `page.reload()`. Do not create or rewrite
     any IndexedDB store for this fixture.
  9. `seedCorruptSoleDocumentWorkspace(page)` — create and persist one real document through the
     same public path, read its active id from the existing manifest, open the already-created
     `WORKSPACE_DB_VERSION` database, read that document's real `currentRevisionId` from
     `STORE_DOCUMENTS`, and replace only the matching `STORE_REVISIONS.thf` value with invalid YAML
     (`"not: valid: yaml: ["`) in one readwrite transaction. Preserve the document pointer, index,
     meta store/markers, manifest wrapper, and all other revision fields; then `page.reload()`.
     Imported storage/store/version constants are passed into `page.evaluate` as serializable
     arguments, never duplicated as string literals.
  Export `WORKSPACE_FIXTURE_VERSION = 1 as const`; every function's body is wrapped in
  `test.step(\`seed:<name>@v${WORKSPACE_FIXTURE_VERSION}\`, ...)` (D1/D7).
- **Targeted verification:** covered by step 6's dedicated discriminating spec (each fixture gets
  its own proving test there); `npx tsc --noEmit`; `npx biome check e2e/`.
- **Intent validation:** owner confirms each test-adapter fixture (6-9) writes only within the
  current test's own isolated browser context (no shared state across tests — Playwright's
  per-test context isolation, already relied on by `browser-restore.spec.ts`'s own doc comment)
  and touches no file outside the sandboxed browser storage APIs.

### 6. `e2e/workspace-fixtures.spec.ts` — discriminating proof for every fixture

- **Behavior:** one test per fixture in D1's table (9 tests) asserting exactly the "renders/
  asserts" column of that table, plus the one console-policy-is-not-a-no-op test from step 2.
- **Files:** `e2e/workspace-fixtures.spec.ts` (new).
- **Implementation:** import each `seed*` function and assert its defining, discriminating state —
  e.g. for `seedCorruptSoleDocumentWorkspace`: tab count 1, `aria-selected="true"`,
  `empty-canvas` visible, then click the always-present `btn-new-document` and assert a second tab
  appears and is selected (proves the app is not bricked) — matching exactly the behavior confirmed
  in this plan's probes, not a guess.
  The write-failure test alone applies a fully anchored
  `allowedConsolePatterns` entry for the complete safe warning shape; no file- or suite-wide
  default is widened. The failure-policy proof emits an unallowed `console.error` under
  `test.fail()` so it passes only when fixture teardown actually reports the violation.
- **Targeted verification:** `npx playwright test e2e/workspace-fixtures.spec.ts` — all 9 (+1)
  tests pass; re-run with `--headed` (D5) once locally as the headed/headless parity proof for
  this spec specifically.
- **Intent validation:** owner reviews that no assertion in this file claims the unreachable
  "Recovery needed" text (D9) and that the corrupt-sole-document test's comment explicitly cites
  the `use-workspace-restore.ts` doc comment establishing this is deliberate pre-`#55` behavior,
  not a gap this spec is pretending to have fixed.

### 7. `playwright.config.ts` and `package.json` — config-level determinism and headed script

- **Behavior:** `reducedMotion: "reduce"` is the default for every test; `npm run test:e2e:headed`
  runs the full suite headed.
- **Files:** `playwright.config.ts`, `package.json`.
- **Implementation:** add `reducedMotion: "reduce"` to the existing `use` block (no other key
  changes); add `"test:e2e:headed": "playwright test --headed"` alongside the existing
  `test:e2e`/`test:e2e:ui` scripts.
- **Targeted verification:** `npx playwright test` (full suite) still green with the new
  `reducedMotion` default — this is the discriminating check that no existing spec silently
  depended on an animation timing that `reducedMotion` now removes; `npm run test:e2e:headed --
  e2e/workspace-fixtures.spec.ts` runs visibly headed and passes.
- **Intent validation:** owner runs the headed script locally at least once to confirm it visibly
  opens a real browser window and completes without a headless-only-passing discrepancy.

### 8. Documentation: `.github/instructions/e2e.instructions.md` and a short `e2e/support/README.md`

- **Behavior:** the binding e2e instructions gain two bullets pointing at the new shared layer and
  the failure-policy default; a short README inside `e2e/support/` documents the module layout,
  the fixture-versioning convention (D1), and the artifact/workflow seam notes for `#66`/`#67`
  (D7) so those issues' authors do not have to re-derive this plan's reasoning.
- **Files:** `.github/instructions/e2e.instructions.md` (modified — additive bullets only);
  `e2e/support/README.md` (new).
- **Implementation:** add to `e2e.instructions.md`: "Console errors, unhandled rejections, and
  failed network requests fail the test by default (`e2e/support/base.ts`); extend the allowlist
  narrowly with `test.use({ allowedConsolePatterns })` rather than disabling the check." and "Reuse
  the shared helpers in `e2e/support/interactions.ts` and the versioned fixtures in
  `e2e/support/workspace-fixtures.ts` instead of duplicating a create/open/switch/drag/connect
  pattern already covered there; add a new one there, not inline in a spec." Write
  `e2e/support/README.md` describing `base.ts`/`interactions.ts`/`workspace-fixtures.ts`'s
  responsibilities, the fixture inventory table (D1, reproduced or linked back to this plan), and
  the `seed:<name>@v<version>`/`<verb>: <summary>` step-naming convention `#66` will parse.
- **Targeted verification:** none beyond prose review (`npx biome check .` does not lint Markdown;
  a manual read-through is the check).
- **Intent validation:** owner confirms the instructions bullet is narrow enough not to imply every
  future console message needs an allowlist entry (the default is zero-tolerance; the allowlist is
  the documented narrow exception) and that the README does not restate `#66`/`#67`'s own scope,
  only the seam this plan leaves for them.

## Cross-cutting requirements

- **Security and privacy:** all seeded content is synthetic (no real names, no PII, no secrets).
  Test-adapter seeding (fixtures 6-9) writes only inside each test's own isolated Playwright
  browser context (`IndexedDB`/`localStorage` scoped to that context, never the host's real
  browser profile); each test starts with empty storage (already relied upon by
  `browser-restore.spec.ts`'s own isolation doc comment), so no cross-test leakage risk. The
  `IDBObjectStore.prototype.put` monkeypatch in `seedWriteFailureWorkspace` is scoped to that
  page's own global prototypes, which do not persist beyond the test's browser context. No fixture
  or helper imports `seedAnthropicApiKey` or any keychain-namespaced value, and none is added to
  one. The one production change (step 1) adds no new data flow, permission, or IPC surface —
  purely a test-observability attribute.
- **`.thf` compatibility:** no schema change, no version bump anywhere in this plan. Every fixture
  (realistic template, large `.thf`, malformed `.thf`) targets the current `"1.0"` schema and is
  validated by opening it through the real, unmodified production reader
  (`readThreatModelText`/`parseThreatModelYaml`) — the same discriminating check the `.thf` corpus
  README already prescribes for its own fixtures. The malformed fixture is reused, not duplicated,
  from `tests/fixtures/thf/invalid/`, preserving that corpus's single-source-of-truth contract.
- **Browser and desktop:** entirely browser-only; no desktop (`src-tauri`) file is touched, no
  desktop E2E spec is added or modified. The plan explicitly does not attempt adapter parity work
  here (desktop has no analogous "IndexedDB unavailable"/"stale manifest" states to fixture,
  since the filesystem is its source of truth).
- **AI safety:** untouched. No fixture seeds or asserts against AI/chat state; `seedAnthropicApiKey`
  is unchanged and unreferenced by the new modules.
- **Accessibility and UX:** no UX change (step 1 is a DOM attribute only). The recovery fixtures
  assert existing accessible states (`aria-selected`) without adding new ones. The plan does not
  add a new visible UI state to fix the corrupt-sole-document silence — it is explicitly out of
  scope (D9, Non-goals) and flagged for owner awareness rather than silently patched.
- **Observability and evidence:** the PR includes: the full `npx playwright test` run (with the new
  failure policy and `reducedMotion` active) staying green; the new
  `e2e/workspace-fixtures.spec.ts` output showing all 9(+1) fixtures individually proven; the
  recorded command/result from one headed local run (per D5), without inventing a new artifact
  format owned by #66; and a note confirming `bash scripts/ci-local.sh --e2e` passes identically to
  the CI job.

## Verification gate

Targeted, in order, while iterating:

```bash
npx tsc --noEmit
npx biome check .
npx playwright test e2e/document-tabs.spec.ts e2e/browser-restore.spec.ts
npx playwright test e2e/workspace-fixtures.spec.ts
npx playwright test e2e/canvas-handles.spec.ts e2e/dirty-state.spec.ts e2e/element-editing.spec.ts
! grep -E 'import .*test.* from "@playwright/test"' e2e/*.spec.ts
npx playwright test
npm run test:e2e:headed -- e2e/workspace-fixtures.spec.ts
```

Final required gate:

```bash
npm run ci:local
```

Because this issue is entirely E2E-scoped, also run the real browser suite before handoff:

```bash
bash scripts/ci-local.sh --e2e
```

Rust is untouched; no `cargo` work beyond what `ci:local` runs.

## Owner validation

Deterministic checks cannot decide these plausible-but-wrong outcomes:

1. **The failure-policy diagnostic is actionable.** The expected-failure test deterministically
   proves an unallowed console error fails; inspect its output once to confirm the aggregate names
   the offending channel/message rather than reporting only a generic teardown failure.
2. **The large fixture looks like a real (if oversized) model, not visual garbage.** Deterministic
   counts (150/100) cannot see whether the grid layout is visually sane; open it headed once (D5)
   and eyeball it.
3. **The corrupt-sole-document silence is an acceptable, visible-enough interim state.** Confirm
   the owner is comfortable that, until `#55` ships, a user with a corrupt sole document sees a
   selected-but-empty tab with no explanation rather than an error message — this plan's fixture
   proves the state is *safe* (non-crashing, recoverable by creating a new document), not that the
   UX is ideal. If the owner judges this unacceptable to leave silent even short-term, the
   resolution is a new, narrowly-scoped follow-up issue (a status-bar or empty-canvas hint when
   `activeDocumentId` is null but the manifest is non-empty) — not a silent scope-expansion of
   this plan.
4. **Headed runs feel representative of what an agent would actually see.** Confirm `npm run
   test:e2e:headed` opens a real, visibly-interactive browser window during
   `e2e/workspace-fixtures.spec.ts` and that the fixtures' pacing (no artificial slowdown) is
   still fast enough for practical local inspection.
5. **No fixture accidentally weakens an existing spec's intent.** Confirm the two migrated specs
   (`document-tabs.spec.ts`, `browser-restore.spec.ts`) still read as clearly as before after their
   helper imports moved — a mechanical diff review, not just a green run.

## Specialist review

- [ ] PR reviewer
- [ ] Slop auditor — applies directly: verify no helper/fixture asserts a mock stand-in for real
      behavior, verify the corrupt-sole-document test does not claim unreachable UI text, verify no
      existing spec's assertions were quietly weakened during migration.
- [ ] Security auditor — narrow applicability: confirm the `IDBObjectStore.prototype.put`
      monkeypatch, manifest-only localStorage mutation, and current-revision IndexedDB mutation are
      contained to each test's isolated browser context and introduce no cross-test or host-profile
      leakage.
- [ ] Threat-model expert — not applicable (no `.thf` schema, STRIDE, or threat-model-domain change).

## Concurrent-work seams

| File | Contending issue | Nature and mitigation |
|------|-------------------|------------------------|
| `e2e/fixtures.ts` | none known | Its `test` extends the new failure-aware base before applying the existing overlay suppression; every current named export keeps its signature and existing suppression behavior. |
| `e2e/document-tabs.spec.ts`, `e2e/browser-restore.spec.ts` | none known | Only the two named local helpers move to a shared module; no assertion changes. |
| `src/components/canvas/edges/data-flow-edge.tsx` | none known | Single additive `data-testid` prop; no other edit. |
| `.github/instructions/e2e.instructions.md` | `#66`, `#67` (may also want to add bullets) | Additive-only bullets here; `#66`/`#67` should append their own rather than restructure this file. |
| `playwright.config.ts` | `#66` (may add reporters/baselines), `#67` (may not touch this file) | This plan adds only `use.reducedMotion`; `#66`'s reporter/baseline additions are a different key in the same object and should not conflict. |

## Out of scope / future (do not implement here)

- Artifact/manifest standardization, visual baselines, and the quality rubric — `#66`.
- The documented agent E2E runbook and single-command launch workflow — `#67`.
- The browser recovery screen and any UI fix for the corrupt-sole-document silence identified in
  D9/Owner validation item 3 — `#55` or a new narrowly-scoped follow-up, not this plan.
- `.thf` schema changes of any kind.
- Desktop (Tauri) E2E fixtures or helpers — `#68`.
- New Playwright projects, additional browser engines, or worker-parallelism changes.
- A `private-mode`-specific fixture distinct from `unavailable` — confirmed to render identical
  text; not worth a second fixture (D1).

## Replan log

Append changes; do not rewrite prior decisions.

| Date | Change | Evidence and reason |
|------|--------|----------------------|
| 2026-07-24 (initial plan) | Initial plan | Issue `#65`, parent `#45`, dependents `#66`/`#67` read via `gh`; current `main` at `4d56b92` re-derived directly from source (`e2e/**`, `src/lib/persistence/**`, `src/stores/workspace-store.ts`, `src/hooks/use-workspace-{restore,persistence}.ts`, `src/components/layout/status-bar.tsx`, `src/lib/templates.ts`, `src/lib/adapters/browser-file-adapter.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`, `scripts/ci-local.sh`, `tests/fixtures/thf/README.md`, installed `@xyflow/react` source) rather than copied from `#53`/`#54`/`#56`'s plan prose. Every risk-bearing design choice (Playwright alias resolution into `@/lib/persistence/*`, console/network noise baseline, `page.clock` behavior, ReactFlow strict-connection handle targeting, `BaseEdge` prop-spreading, large-fixture render performance at 150/100, IndexedDB-unavailable/private-mode text equivalence, stale-manifest reconciliation, corrupt-sole-document reachability of the "Recovery needed" text, forced-write-failure console/status behavior, and the real-download nature of Save/Export) was independently reproduced via short-lived, deleted probe spec files against the running dev server before being written into this plan — none of it is asserted from memory of the sibling plans' prose. |
| 2026-07-24 (pre-commit review) | Tightened failure-policy and recovery-fixture contracts | Independent execution-risk review found four pre-implementation ambiguities. The failure policy is now a separate base inherited by every spec, with an empty global allowlist and only the forced-write test receiving a fully anchored local exception; onboarding keeps real first-run state and screenshot utilities keep shared suppression. Stale/corrupt fixtures now let production create the complete IndexedDB schema and exact Zustand wrapper before narrowly mutating only the orphan manifest entry or current revision body, avoiding an incomplete hand-built v1 database. The malformed alert expectation now includes the `use-file-operations` `Open failed:` prefix, and the corrupt-workspace liveness assertion names the always-present `btn-new-document` selector. |
