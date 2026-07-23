# Issue 54 — Add the multi-tab document workspace experience

## Objective

Turn the merged document registry into a visible workspace: a user can hold at least ten
documents open at once, see which one is active and which have unsaved changes, switch
between them with the pointer or the keyboard, reorder and pin them, close one without
affecting the others, and be warned about every dirty document before the window closes —
with a tab strip that conforms to the WAI-ARIA tabs pattern rather than approximating it.

## Issue contract

- **Issue:** `#54`
- **Parent initiative:** `#48`
- **Type:** `Feature`
- **Size:** `L`
- **Priority:** `P0`
- **Autonomy:** `Automatable`
- **Dependencies:** `#53` (document registry) is `Done` and merged. `#56` (IndexedDB
  persistence) is **in flight and not merged**; this plan must not assume it. Nothing in
  `#54` blocks on `#56`, `#55`, or `#63`.
- **Project metadata note:** Project 2 `Status` for `#54` is `Backlog` at plan time. The
  issue is otherwise settled (criteria, size, autonomy, parent, model tier), so it is
  plannable; an owner must move it to `Ready` before implementation starts.
- **Non-goals:**
  - Persisting tab order, pin state, or the active tab across a reload. `#54` writes
    nothing to `localStorage` or IndexedDB. `#56` owns the manifest and restore.
  - A per-tab storage/persistence indicator and a per-tab external-change indicator
    (decision **D2** below — nothing can truthfully drive them yet).
  - Renaming a document from the tab strip. The existing double-click rename in
    `top-menu-bar.tsx` keeps working against the active document.
  - Split view, tab groups, tab detach, "Close Others"/"Close All", middle-click close, and
    a tab context menu.
  - Multi-window. ThreatForge remains one window with one active document.
  - Palette/inspector information architecture and narrow-window redesign — `#58`.
  - Playwright workspace fixtures and seeded multi-tab storage helpers — `#65`.
  - Any `.thf` schema change. No document id, tab order, or pin state enters a `.thf` file.

## Current behavior and evidence

Verified on `main` at `7b2e025`.

### The registry already hosts many documents; nothing renders them

`src/stores/document-registry.ts` owns `documents`, `openDocumentIds`, and
`activeDocumentId`, and exposes `createDocument`, `activateDocument`, `closeDocument`,
`setDocumentFileSettings`, `setDocumentChatSessionId`, `getDocumentStores`, and
`useDocumentStores(id)` (`:207-209`). `docs/knowledge/architecture.md` ("Document registry
and per-document state scope") records the bundle-swap rule (ADR-010) and names
`useDocumentStores(id)` as the seam `#54` consumes to render a per-tab title and dirty
indicator without activating the document.

### Every entry point still closes before it creates — the app is single-document by policy

| Call site | Current sequence |
|-----------|------------------|
| `src/hooks/use-file-operations.ts:121-125` (`newModel`) | `confirmDiscard` if dirty → `closeDocument(active)` → `createDocument` |
| `src/hooks/use-file-operations.ts:163-166` (`openModel`) | same |
| `src/hooks/use-file-operations.ts:250-255` (`importModel`) | same |
| `src/hooks/use-native-menu.ts:24-27` (`openFileByPath`) | `closeDocument(active)` → `createDocument` |
| `src/components/canvas/canvas.tsx:54-57` (template) | `closeDocument(active)` → `createDocument` |
| `src/hooks/use-file-operations.ts:214-225` (`closeModel`) | `confirmDiscard` if dirty → `closeDocument(active)` |

So `openDocumentIds.length` never exceeds `1` in production today. This is the single
largest behavior change in the issue, and it invalidates existing E2E expectations
(`e2e/dirty-state.spec.ts` asserts that `Cmd+N` with unsaved changes raises the discard
`confirm`; after `#54`, `New` opens another tab and must not prompt at all).

### `activateDocument`'s `isSwitch` branch has never run in production

`src/stores/document-registry.ts:96-100` states the invariant explicitly: *"Creation flows
(New, Open, Import, template) reach here with `prevActiveId === null` because they close the
previous document first."* Removing the close-first step makes `isSwitch === true` for
creation flows for the first time, which reaches the viewport branch at `:135-144`.

That branch reads `session.stores.canvas.getState().nodes` — but a document created
milliseconds earlier has **not** been synced yet (`syncFromModel` runs from the `DfdCanvas`
effect after React commits), so `nodes.length === 0` and `rfFitView()` is called against the
*outgoing* document's still-rendered nodes.

The follow-up sync in `src/components/canvas/dfd-canvas.tsx:113-132` only corrects this when
`pendingLayout` was non-null, because `initialSyncDone` (`:107`) is a ref on a component that
never unmounts once a document is open. Concretely, this is a real defect the moment
create-without-close lands: `importModel` on a TM7 file produces `pendingLayout === null`
(`buildLayoutFromModel` returns `null` when no element or boundary carries a `position` —
`src/lib/model-layout-utils.ts:4-16`), so the imported diagram renders at the previous
document's pan/zoom and can be entirely off-screen. Step 7 fixes this.

### No close guard exists on either platform

`grep -rn "beforeunload\|onCloseRequested\|CloseRequested" src src-tauri/src` returns
nothing. `FileAdapter.confirmDiscard()` (`src/lib/adapters/file-adapter.ts:25`) takes no
argument; both implementations render a fixed string
(`browser-file-adapter.ts:80-82`, `tauri-file-adapter.ts:90-97`), so a prompt cannot name
which document it is about.

`@tauri-apps/api` implements `onCloseRequested` as a listener that calls
`this.destroy()` when the handler does not `preventDefault`
(`node_modules/@tauri-apps/api/window.js:1632-1641`). `src-tauri/capabilities/default.json`
grants `core:default`, whose window set (`src-tauri/gen/schemas/acl-manifests.json`,
`core:window.default_permission`) does **not** include `allow-destroy`. A desktop close
guard therefore requires one new capability entry.

### No ARIA tab pattern exists to copy

`grep -rn 'role="tab' src` returns nothing. `src/components/panels/right-panel.tsx:16-39`
renders a visual "tab bar" from plain `<button>`s with no `role`, no `aria-selected`, and no
roving tabindex; it is **not** a pattern to reuse. There is no shadcn/ui or Radix dependency
(`package.json`; `src/components/ui/` contains only `keytip.tsx` and `resize-handle.tsx`), so
the tablist is hand-built with Tailwind and `cn`, matching the rest of the app.

ReactFlow nodes remain focusable (`nodesFocusable` is not disabled in
`src/components/canvas/dfd-canvas.tsx`), which decides one APG detail below: the canvas
tabpanel must not take `tabindex="0"`.

### Persistence is scaffolded but has no producer

`src/stores/workspace-store.ts` (merged with `#132`) declares
`persistence: Record<DocumentId, DocumentPersistenceState>`, `persistenceAvailable`, and
`setPersistenceState`. `grep -rn "useWorkspaceStore\|setPersistenceState\|getWorkspaceStorage" src`
outside `src/stores/workspace-store*` and `src/lib/persistence/` returns **nothing**: no
production code writes or reads it. `WorkspaceManifestEntry`
(`src/lib/persistence/types.ts:64-75`) carries `order` but no `pinned`.

### Existing keyboard surface

`src/hooks/use-keyboard-shortcuts.ts` binds bare `1`/`2`/`3` to the right-panel tabs and,
under `Cmd/Ctrl`, only `n o s e z y b i l 0 = - k , a c x v`. Arrow keys are handled only
when no modifier is held. `src-tauri/tauri.conf.json:18` sets `minWidth: 900` — the
documented minimum desktop window width.

Canonical references: `docs/knowledge/architecture.md`,
`docs/plans/53-document-registry.md`, `docs/plans/56-indexeddb-persistence.md`,
`docs/plans/roadmap.md` Phase 1.

## Design decisions

Settled here. Each was left provisional by `#53` or is newly forced by rendering tabs.

### D1 — Close-activation policy: right neighbor, then left

When the active document closes, activate the document to its **right** in rendered order;
when the closed document was rightmost, activate its **left** neighbor; when none remain,
`activeDocumentId` becomes `null` and the empty state returns.

Expressed as one pure function over the order *before* the close:

```
remaining = order without closedId
next      = remaining[min(indexOf(closedId), remaining.length - 1)] ?? null
```

Rationale, against the alternatives:

- **A tab strip is a spatial control.** Right-neighbor keeps the next tab under the pointer,
  so closing a run of tabs by clicking the same X repeatedly works. This is the behavior of
  Chrome, Firefox, and Safari tab strips, and it is the non-MRU option offered by editors
  that make this configurable (VS Code's `workbench.editor.focusRecentEditorAfterClose`,
  JetBrains' "When the current tab is closed, activate:").
- **MRU is invisible state.** With the scroll-strip overflow chosen in D3, an MRU jump can
  activate a tab that is scrolled out of view, so the user cannot predict or explain the
  result from what is on screen.
- **MRU needs a second source of truth.** It requires an activation stack kept consistent
  across close, reorder, pin, and (with `#56`) restore. ADR-010 chose bundle-swap precisely
  to avoid state that must be remembered and can silently drift. Right-neighbor derives
  entirely from `openDocumentIds`, which already exists and is already the persisted order.
- It is a pure function of existing state, so it is unit-testable without React.

This **changes merged behavior**: `document-registry.ts:176` currently activates
`remainingIds[remainingIds.length - 1]` (the last open document), which the file itself
labels as provisional and owned by `#54`.

### D2 — Which per-tab indicators ship here

The issue lists four. Two are real now; two would be decoration.

| Indicator | Verdict | Reason |
|-----------|---------|--------|
| Title | **Ship** | Derivable from each document's own `model`/`filePath` today. Rendered from a shared helper (step 2) so the tab, window title, and menu bar cannot drift. |
| Dirty | **Ship** | `isDirty` lives on each document's own model store and is readable without activating it, which is exactly the seam `#53` documented. |
| Storage / persistence | **Defer to `#56`** | `workspace-store.persistence` has no producer anywhere in `src/`. Rendering it would show `idle` forever for every document — a success-shaped indicator that means nothing. `#56` step 7 introduces the writer and step 9 the first reader. |
| External change | **Defer, needs its own issue** | There is no file watcher, no stored mtime or content hash, and no cross-tab write detection in the repo. `#56` scopes out multi-tab conflict resolution and promises only "a detectable stale-write signal". Nothing can set this state truthfully, on either platform. |
| Rename from a tab | **Out of scope** | Renaming today is entangled with `saveModelAs()` (`top-menu-bar.tsx:45-54`). A second rename entry point with different save semantics is a divergence, not a feature. |

Consequence to record on the issue: acceptance criterion *"Show title, dirty state, storage
state, and external-change state per tab"* is met for two of four states in `#54`. The tab
component takes no placeholder props, renders no disabled indicator, and reserves no layout
slot for the deferred states — `#56` and the external-change issue add them with their
producers. See **Owner validation** item 2.

### D3 — Overflow: shrink to a floor, then scroll; discoverability via the command palette

- Tabs are flex items with `min-width: 7rem` and `max-width: 14rem`; pinned tabs cap at
  `8rem`. Titles truncate with `text-overflow: ellipsis` and carry a `title` attribute
  holding the full title and file path.
- Once every tab is at its floor, the tablist scrolls horizontally
  (`overflow-x: auto; overscroll-behavior-x: contain`). `overscroll-behavior-x: contain`
  prevents a trackpad swipe over the strip from triggering browser back-navigation in the
  web build.
- No custom wheel handler: a horizontally scrollable container with no vertical scroll
  already receives vertical wheel deltas as horizontal scroll in Chromium and WebKit.
- Focus and activation call `scrollIntoView({ block: "nearest", inline: "nearest" })`, so
  keyboard navigation can never leave the focused tab off-screen. `behavior` is `"smooth"`
  unless `settings.reduceMotion` is set, in which case `"auto"`.
- **Rejected: a dropdown/overflow menu.** It is a second, redundant switcher. The command
  palette already exists and is extended in step 10 with `Switch to Document…` entries, which
  scales past ten documents better than a menu and is already keyboard-first.
- **Rejected: shrink-to-fit with no floor.** Below roughly `7rem` a tab shows two characters
  and an ellipsis, which fails the "overflow remains usable with ten documents" criterion in
  substance while passing it in pixels.
- **Minimum viable width:** the contract is specified and tested at the documented desktop
  minimum, `900px` (`src-tauri/tauri.conf.json:18`). At `900px` with both side panels at
  their minimums (`180` + `260`, `ui-store.ts:21-25`) the strip gets `≈460px`, which shows
  four tabs at the floor plus scroll. Below `900px` the strip degrades gracefully (tabs stay
  at the floor, the strip scrolls) but a designed narrow-window layout is `#58`.

### D4 — Accessibility: the WAI-ARIA APG tabs pattern, manual activation

Structure:

- The strip container is a plain `<div>`. It always renders in `/app`. The
  **new-document button lives in the container, outside the tablist**, so it is always
  present and is never mistaken for a tab.
- The tablist renders **only when at least one document is open**: `role="tablist"`,
  `aria-label="Open documents"`, `aria-orientation="horizontal"`. A tablist with zero tabs is
  never rendered.
- Each tab: `role="tab"`, `id="tab-<documentId>"`, `aria-selected` (`"true"` on exactly one),
  `aria-controls="document-panel"`.
- The panel: the canvas wrapper inside `<main>` gets `id="document-panel"`,
  `role="tabpanel"`, and `aria-labelledby="tab-<activeDocumentId>"`. It goes on the wrapper,
  **not** on `<main>`, so the `main` landmark survives. It does **not** get `tabindex="0"`:
  APG adds that only when the panel has no focusable content, and ReactFlow nodes are
  focusable. When no document is open, the wrapper carries neither role nor `aria-labelledby`.
- All tabs point `aria-controls` at the one panel element, because ThreatForge renders one
  canvas and swaps its content; the panel is always in the DOM while the tablist exists.

Keyboard, scoped to the tablist (element-scoped handlers, so no global shortcut conflicts):

| Key | Behavior |
|-----|----------|
| `ArrowRight` / `ArrowLeft` | Move focus to the next/previous tab, wrapping. **Does not activate.** |
| `Home` / `End` | Move focus to the first/last tab. |
| `Enter` / `Space` | Activate the focused tab. |
| `Delete` | Close the focused tab, through the same dirty-confirmation path as the close button. |
| `Ctrl`/`Cmd` + `Shift` + `ArrowLeft`/`ArrowRight` | Move the focused tab one position within its pinned/unpinned block; focus follows the tab. |

**Manual activation** (arrows move focus only) is the APG-recommended choice when activating
a tab is expensive. It is the correct choice here for a concrete, near-term reason: `#56`
hydrates inactive documents lazily from IndexedDB on activation, so automatic activation
would trigger a storage read and a full canvas re-sync for every intermediate tab an arrow
key passes over.

Roving tabindex: exactly one tab has `tabindex="0"` at all times. It is the **focused** tab
while focus is inside the tablist, and the **selected** tab otherwise; a `focusedId` piece of
component state resets to the selected id when focus leaves the tablist.

The close control is a real `<button>` with `tabindex="-1"` and
`aria-label="Close <title>"`, so each tab remains a single tab stop and the roving tabindex
stays intact, while the action stays available to pointer users and, for keyboard users, via
`Delete` on the tab.

Non-visual state: the dirty marker is a dot **plus** a visually hidden `", unsaved changes"`
inside the tab's accessible name; pinning adds a visually hidden `", pinned"`. Colour alone
never carries state.

Focus after close, in all input modalities (never let focus fall to `<body>`):

- Closing a non-last tab focuses the tab that becomes active under **D1**.
- Closing the last remaining tab focuses the new-document button, which always exists.

Reduced motion: the active-tab indicator transition, the drag-reorder transform, and
`scrollIntoView` all honour `useSettingsStore(s => s.settings.reduceMotion)`, the existing
convention (`src/components/canvas/canvas.tsx:173,208`).

### D5 — Pin semantics

Pinning is ordering plus identity, not protection. A pinned document sorts into a leading
pinned block and renders compactly (`max-width: 8rem`) with a pin marker. `openDocumentIds`
stays the single rendered order, and `reorderDocument` clamps a move into the block matching
the document's pinned state, so pinned and unpinned tabs cannot interleave. Pinned tabs are
still closable. "Close Others"-style protection arrives with that feature, not before it.

Pin state and tab order live in the registry session only and are **not** persisted by `#54`
(see the `#56` seam). A reload today loses the entire workspace, so this is a not-yet, not a
regression.

### D6 — Close guards

- **Per-tab.** `FileAdapter.confirmDiscard()` gains one **optional** parameter,
  `documentTitle?: string`, so every existing call site keeps compiling and the message can
  name the document. With ten tabs open, an unnamed "You have unsaved changes" prompt cannot
  be answered correctly, which makes this a correctness fix rather than polish.
- **Browser window.** A `beforeunload` listener is registered **only while at least one
  document is dirty**, and removed as soon as none are. Browsers replace any custom string
  with their own text, so the in-app summary is not achievable there; the guard's job is to
  stop silent loss. Conditional registration matters: `#56` D2 deliberately avoids
  `beforeunload` because an always-registered handler disables bfcache. Registering it only
  while dirty keeps both properties.
- **Desktop window.** `getCurrentWindow().onCloseRequested` calls
  `event.preventDefault()` **first**, then renders an in-app summary listing every dirty
  document by title; `Cancel` returns, `Discard and close` calls
  `getCurrentWindow().destroy()`. `preventDefault` must be first because the Tauri API
  destroys the window if the handler throws before preventing
  (`node_modules/@tauri-apps/api/window.js:1637-1639`) — the default is fail-open, and
  fail-open here means data loss. The handler is wrapped so that any failure falls back to
  `window.confirm` rather than either losing data or leaving an unclosable window.
- This requires adding `core:window:allow-destroy` to
  `src-tauri/capabilities/default.json`. It is a single narrowly scoped permission on the
  `main` window and is the minimum for the guard to work; the security lane reviews it.

### D7 — No new global keyboard chord for switching documents

Element-scoped tablist keys (D4) plus command-palette commands (step 10) cover the
acceptance criteria. A global next/previous-document chord is deliberately **not** added,
because the chords users expect for this (`Cmd/Ctrl+1..9`, `Ctrl+Tab`,
`Cmd+Opt+Arrow`, `Cmd+Shift+[`/`]`, `Ctrl+PageUp`/`PageDown`) are all reserved by the host
browser for its own tab strip in the web build, and shipping a chord that works on desktop
and is silently swallowed in the browser is worse than shipping none. A desktop-only
`Window` menu with accelerators is a named follow-up (`src-tauri/src/menu.rs` is untouched
here; `file-new` and `file-close` acquire tab semantics automatically through the frontend).

## Implementation steps

Each step leaves the app working, `npx vitest --run` green, and `npx tsc --noEmit` clean.
Steps 1–2 are state and helpers; 3–5 build and mount the shell; 6–7 flip the lifecycle and
repair the activation interaction it exposes; 8–9 add reorder/pin and the close guards;
10 wires the remaining surfaces, updates E2E, and documents the result.

### 1. Tab order, pin state, and the close-activation policy

- **Behavior:** the registry gains `pinned` per session, `reorderDocument`,
  `setDocumentPinned`, and the **D1** close-activation policy. `openDocumentIds` is the one
  rendered order and keeps pinned ids ahead of unpinned ids.
- **Files:** `src/stores/document-registry.ts`, `src/types/document.ts`,
  `src/stores/document-registry.test.ts`.
- **Implementation:**
  1. Add `pinned: boolean` to `DocumentSession` (`src/types/document.ts`), defaulted to
     `false` in `createDocument`. Document that it is session-scoped and unpersisted.
  2. Export three pure functions from `document-registry.ts` (no new module — the registry is
     the only caller):
     - `nextActiveDocumentId(orderBeforeClose, closedId): DocumentId | null` implementing D1;
     - `moveDocumentInOrder(order, id, toIndex, isPinned, pinnedCount): DocumentId[]`
       clamping `toIndex` into the correct block;
     - `applyPinnedOrder(order, pinnedIds): DocumentId[]` producing the pinned-first order.
  3. Replace `closeDocument`'s fallback (`:176`) with `nextActiveDocumentId`. Keep the
     scratch-bundle install when nothing remains — that isolation guarantee is unchanged.
  4. Add `reorderDocument(id, toIndex)` and `setDocumentPinned(id, pinned)` actions. Neither
     changes `activeDocumentId`.
  5. Do not add persistence, hydration, or manifest writes. `#56` owns those.
- **Targeted verification:** `npx vitest --run src/stores/document-registry.test.ts`.
  Discriminating assertions: with order `[A,B,C]` and `A` active, `closeDocument(A)` leaves
  `B` active — the merged implementation activates `C` and fails this; closing the rightmost
  tab activates its left neighbour; `reorderDocument` cannot move an unpinned tab ahead of a
  pinned one; `setDocumentPinned` does not change which document is active; the existing
  ten-case isolation suite still passes unchanged.
- **Intent validation:** owner confirms right-neighbour is the desired close behavior and
  that pin means ordering only in this issue.

### 2. One shared document display title

- **Behavior:** the tab, the window/tab title, and the menu-bar title derive the displayed
  name from one function, and a Windows path resolves to its basename everywhere.
- **Files:** `src/lib/document-display-title.ts` (new),
  `src/lib/document-display-title.test.ts` (new),
  `src/components/layout/top-menu-bar.tsx`,
  `src/components/layout/top-menu-bar.test.tsx` (new),
  `src/hooks/use-window-title.ts`. The module is named `document-display-title` rather than
  `document-title` because `src/hooks/use-document-title.ts` already exists and serves the
  unrelated marketing routes.
- **Implementation:**
  1. `documentDisplayTitle(model: ThreatModel | null, filePath: string | null): string`
     returns the `filePath` basename with its extension stripped when a path exists,
     otherwise `model.metadata.title`, otherwise `"Threat Forge"`. Split on `/` **and** `\`,
     which is what `use-window-title.ts:29` already does and what
     `top-menu-bar.tsx:34-37` does not.
  2. Rewire both existing call sites. `top-menu-bar.tsx` keeps appending `" *"` when dirty;
     `use-window-title.ts` keeps its `"Threat Forge - "` prefix. No visible change on POSIX
     paths.
- **Targeted verification:** `npx vitest --run src/lib/document-display-title.test.ts
  src/components/layout/top-menu-bar.test.tsx`. Discriminating assertion:
  `documentDisplayTitle(model, "C:\\models\\payments.thf")` is `"payments"`, and a
  `TopMenuBar` render with that path shows `payments` — today it renders the entire backslash
  path, so the test fails against pre-change code.
- **Intent validation:** owner confirms the title rule (basename over metadata title) is the
  one they want repeated on every tab.

### 3. The `DocumentTab` component

- **Behavior:** one tab renders its own document's title and dirty state — read from that
  document's own store bundle, not from the active-document facade — plus a pin marker and a
  close control, with full APG tab semantics.
- **Files:** `src/components/layout/document-tab.tsx` (new),
  `src/components/layout/document-tab.test.tsx` (new).
- **Implementation:**
  1. Props: `{ documentId, stores, selected, focused, pinned, onActivate, onClose, onPin }`.
     `stores: DocumentStores` is passed by the strip, which already holds the sessions;
     calling `useDocumentStores(id)` inside the component would force either a conditional
     `useStore` call or an unreachable null branch. `useDocumentStores(id)` remains the
     documented seam for single-document consumers.
  2. Subscribe with `useStore(stores.model, s => s.model)`, `…s.filePath`, `…s.isDirty` and
     render `documentDisplayTitle(...)`.
  3. Markup:

     ```tsx
     <button
       role="tab"
       id={`tab-${documentId}`}
       aria-selected={selected}
       aria-controls="document-panel"
       tabIndex={focused ? 0 : -1}
     >
       {/* truncated title, dirty dot, sr-only ", unsaved changes" / ", pinned" */}
       <button tabIndex={-1} aria-label={`Close ${title}`} />
     </button>
     ```

     The visually hidden suffixes are inside the tab so they join its accessible name.
  4. `title` attribute carries the full title and file path for the truncated case.
  5. Theme variables and `cn` only; no new dependency. Honour `reduceMotion` on the
     selected-state transition.
- **Targeted verification:** `npx vitest --run src/components/layout/document-tab.test.tsx`.
  Discriminating assertions: render tabs for two documents, mutate **document B's** model
  store directly while **A** is active, and assert B's tab shows the unsaved-changes state
  while A's does not — an implementation that reads `useModelStore` shows the change on the
  wrong tab and fails; the tab exposes `role="tab"` with the correct `aria-selected` and
  `aria-controls`; the close button is `tabIndex={-1}` and has an accessible name naming the
  document; `getByRole("tab", { name: /unsaved changes/ })` resolves for the dirty tab.
- **Intent validation:** owner confirms the dirty affordance is legible in both themes and
  that truncation keeps documents distinguishable.

### 4. The `DocumentTabStrip`: tablist, keyboard, overflow, focus

- **Behavior:** the strip renders the tablist and the always-present new-document button, and
  implements D3 overflow and the full D4 keyboard and focus contract.
- **Files:** `src/components/layout/document-tab-strip.tsx` (new),
  `src/components/layout/document-tab-strip.test.tsx` (new).
- **Implementation:**
  1. Read `openDocumentIds`, `activeDocumentId`, and `documents` from the registry; render one
     `DocumentTab` per id in order, passing each session's `stores`.
  2. Local `focusedId` state; roving tabindex per D4; reset `focusedId` to `activeDocumentId`
     on `blur` leaving the tablist and whenever `activeDocumentId` changes.
  3. `onKeyDown` on the tablist implementing the D4 table. Arrow keys wrap. `Delete` routes
     through the same close handler the close button uses.
  4. After a close, move focus per D4: the newly active tab, or the new-document button when
     the tablist disappears.
  5. Overflow per D3: floor/ceiling widths, `overflow-x-auto`,
     `overscroll-behavior-x: contain`, and `scrollIntoView({ block: "nearest", inline:
     "nearest", behavior: reduceMotion ? "auto" : "smooth" })` on focus change and on
     activation.
  6. New-document button: `data-testid="btn-new-document"`, `aria-label="New document"`,
     calls the `newModel` file operation.
- **Targeted verification:**
  `npx vitest --run src/components/layout/document-tab-strip.test.tsx`.
  Discriminating assertions: with three tabs, `ArrowRight` moves DOM focus to the next tab and
  `aria-selected` **does not** move — an automatic-activation implementation fails this;
  exactly one element in the tablist has `tabindex="0"` after every navigation; `Enter`
  activates the focused tab; `Home`/`End` jump to the ends; `Delete` on the middle tab closes
  it and `document.activeElement` is the tab that became active, never `document.body`;
  closing the only tab moves focus to `btn-new-document`; with `reduceMotion` enabled,
  `scrollIntoView` is called with `behavior: "auto"`.
- **Intent validation:** owner tab-navigates the strip with a screen reader and confirms the
  announced name, position, and selected state are correct and not chatty.

### 5. Mount the strip and wire the tabpanel relationship

- **Behavior:** the strip appears above the canvas, the canvas becomes the labelled tabpanel,
  and the zero-document launch view is unchanged apart from the strip's new-document button.
- **Files:** `src/components/layout/app-layout.tsx`,
  `src/components/layout/app-layout.test.tsx` (new).
- **Implementation:**
  1. Change `<main className="flex-1 overflow-hidden">` (`:86-88`) to a flex column
     containing `<DocumentTabStrip />` and a wrapper `<div className="flex-1
     overflow-hidden">` around `<Canvas />`. Placing the strip inside `<main>` keeps the side
     panels full-height and puts the tablist adjacent to the panel it controls.
  2. When `activeDocumentId` is non-null the wrapper carries `id="document-panel"`,
     `role="tabpanel"`, and an `aria-labelledby` whose value is the active tab's DOM id
     (`tab-` + the active `DocumentId`); when it is null it carries none of them. No
     `tabindex` in either case (D4).
  3. No change to `TopMenuBar`, `StatusBar`, `ComponentPalette`, or `RightPanel`.
- **Targeted verification:** `npx vitest --run src/components/layout/app-layout.test.tsx`.
  Discriminating assertions: with two documents open, `getByRole("tabpanel")` is labelled by
  the selected tab's accessible name, and every `aria-controls` value resolves to an element
  that exists; with zero documents, no `tablist` and no `tabpanel` role is present while
  `btn-new-document` still is; `<main>` still exposes the `main` landmark role.
- **Intent validation:** owner confirms the strip's placement, height, and border read as part
  of the editor rather than as a second toolbar, in both themes.

### 6. Open in a new tab instead of replacing the document

- **Behavior:** `New`, `Open`, `Import`, template open, and desktop file-association open each
  add a document and activate it, leaving open documents untouched. `Close` closes only the
  active document, and its dirty prompt names that document.
- **Files:** `src/hooks/use-file-operations.ts`, `src/hooks/use-native-menu.ts`,
  `src/components/canvas/canvas.tsx`, `src/lib/adapters/file-adapter.ts`,
  `src/lib/adapters/browser-file-adapter.ts`, `src/lib/adapters/tauri-file-adapter.ts`,
  `src/hooks/use-file-operations.test.ts`.
- **Implementation:**
  1. Delete the `if (registry.activeDocumentId) registry.closeDocument(...)` line and the
     preceding `isDirty` → `confirmDiscard` guard from `newModel` (`:106-110`, `:121-122`),
     `openModel` (`:130-134`, `:163-165`), and `importModel` (`:228-232`, `:250-251`); same
     for `use-native-menu.ts:24-26` and `canvas.tsx:54-56`. Opening a document is no longer
     destructive, so there is nothing to confirm.
  2. `closeModel` keeps its guard and passes the active document's display title:
     `adapter.confirmDiscard(documentDisplayTitle(model, filePath))`.
  3. Add the optional `documentTitle?: string` parameter to `FileAdapter.confirmDiscard` and
     both implementations: `You have unsaved changes in "<title>". Discard them?`, falling
     back to today's exact string when the argument is absent.
  4. `isDirty` is no longer read by `newModel`/`openModel`/`importModel`; drop it from their
     dependency arrays.
- **Targeted verification:** `npx vitest --run src/hooks/use-file-operations.test.ts`.
  Discriminating assertions: with a dirty document open, `newModel()` results in
  `openDocumentIds.length === 2`, the new document active, `confirmDiscard` **not** called,
  and the first document's `isDirty`, `model`, and history depth unchanged — today it prompts
  and closes, so the test fails against pre-change code; `closeModel()` on a dirty document
  calls `confirmDiscard` with that document's title; declining leaves the document open.
- **Intent validation:** owner confirms that `New`/`Open` no longer prompting is the intended
  change and that "Close" is now the only destructive single-document action.

### 7. Repair first-sync and viewport on activation — **the riskiest step**

- **Behavior:** activating any document — newly created or revisited — renders that
  document's nodes at that document's viewport, with the existing fit-to-view fallback for a
  document that has never been laid out. No document inherits another's pan or zoom.
- **Files:** `src/components/canvas/dfd-canvas.tsx`, `src/stores/document-registry.ts`,
  `src/components/canvas/dfd-canvas.test.tsx` (new, ReactFlow instance handles stubbed
  through `canvas-instance-store`).
- **Implementation:**
  1. Subscribe `DfdCanvas` to `activeDocumentId` and reset `initialSyncDone.current = false`
     when it changes, so the post-sync viewport decision runs once per activation instead of
     once per component lifetime (`dfd-canvas.tsx:107,113-132`).
  2. Make the viewport decision after `syncFromModel()` has populated the document's nodes:
     restore `useCanvasStore.getState().viewport` when the document has nodes, otherwise
     `fitViewFn()`. This closes the `pendingLayout === null` hole — an imported model with no
     inline positions currently keeps `initialSyncDone` latched and never re-fits.
  3. In `activateDocument`, remove the pre-sync `nodes.length` test at
     `document-registry.ts:135-144` and keep only the outgoing-viewport flush at `:115-117`.
     The incoming document's viewport is owned by the canvas effect, which is the only place
     that runs after the sync. Update the surrounding comments, which currently assert the
     now-false "creation flows arrive with `prevActiveId === null`" invariant.
- **Targeted verification:** `npx vitest --run src/components/canvas/dfd-canvas.test.tsx
  src/stores/document-registry.test.ts`. Discriminating assertions: with document `A` panned
  to `{x:120,y:-40,zoom:2}`, importing a model whose elements carry **no** `position` (so
  `buildLayoutFromModel` returns `null`) results in `fitView` being called *after* the new
  document's nodes are synced, and the stubbed instance never receives `A`'s viewport — the
  pre-change build latches `initialSyncDone` and fails; switching back to `A` restores
  `{120,-40,2}`; the existing isolation cases still pass. Then
  `npx playwright test e2e/canvas-elements.spec.ts e2e/canvas-visual.spec.ts`.
- **Intent validation:** owner opens a template, creates a second document, imports a TM7
  file, and switches back and forth, confirming nothing jumps, re-fits unexpectedly, or lands
  off-screen. **Why this is the riskiest step:** it is the only step that changes behavior on
  the single most-used path (open a file and see it), it depends on React commit ordering
  between the registry action and a canvas effect, its failure mode is a silent visual
  regression rather than a thrown error, and it invalidates an invariant that merged code
  states in a comment. It is also the step where the temptation to weaken the E2E visual
  snapshot instead of fixing the ordering is highest.

### 8. Pointer reorder and the pin affordance

- **Behavior:** a tab can be dragged to a new position within its block, and pinned or
  unpinned from a control on the tab. Reordering never changes which document is active.
- **Files:** `src/components/layout/document-tab.tsx`,
  `src/components/layout/document-tab-strip.tsx`,
  `src/components/layout/document-tab-strip.test.tsx`.
- **Implementation:**
  1. HTML5 drag-and-drop, matching the palette's existing pattern
     (`src/components/palette/component-palette.tsx:212-223`), with a dedicated MIME type
     `application/x-threatforge-tab` carrying the `DocumentId`. Do **not** call
     `setDraggedComponent`: the canvas drop handler is gated on
     `useCanvasInstanceStore.draggedType` (`dfd-canvas.tsx:204-210`), so a tab dropped on the
     canvas is already a no-op, and this keeps it that way.
  2. Compute the drop index from the pointer position relative to each tab's midpoint and call
     `reorderDocument`, which clamps into the correct block (step 1).
  3. Pin control: a small pin button inside the tab, `tabIndex={-1}`, with an `aria-label` of
     `Pin <title>` or `Unpin <title>`, calling `setDocumentPinned`. Pinned tabs render at the
     compact width from D3.
  4. Keyboard reorder is already covered by step 4's `Ctrl`/`Cmd`+`Shift`+arrow binding; this
     step adds no second keyboard path.
- **Targeted verification:**
  `npx vitest --run src/components/layout/document-tab-strip.test.tsx`. Discriminating
  assertions: a simulated drag of the third tab onto the first yields order `[C,A,B]` while
  `activeDocumentId` is unchanged; dragging an unpinned tab into the pinned block leaves it at
  the head of the unpinned block; pinning the third tab moves it to index `0` and its rendered
  width class changes; `Cmd+Shift+ArrowLeft` on a focused tab produces the same order change
  as the equivalent drag, and focus stays on the moved tab.
- **Intent validation:** owner confirms drag feels precise at the tab floor width and that pin
  reads as "keep this at the front", not as "protect from closing".

### 9. Window and application close guards

- **Behavior:** closing the browser tab or the desktop window while any document is dirty
  cannot lose work silently; the desktop path lists every dirty document by title.
- **Files:** `src/hooks/use-close-guard.ts` (new), `src/hooks/use-close-guard.test.ts` (new),
  `src/components/layout/app-layout.tsx` (mount the hook),
  `src-tauri/capabilities/default.json`.
- **Implementation:**
  1. `useCloseGuard()` derives the dirty document list by subscribing to each open session's
     own model store, so a dirty background document counts.
  2. Browser: register a `beforeunload` listener **only while the dirty list is non-empty**,
     removing it when it empties (D6 — keeps bfcache and `#56`'s `pagehide` flush intact).
     The handler calls `event.preventDefault()`; no custom string is set, because browsers
     ignore it.
  3. Desktop (`isTauri()`): `getCurrentWindow().onCloseRequested(async (event) => { … })`
     calls `event.preventDefault()` as its **first** statement, then renders the in-app
     summary (a modal listing each dirty document's title with `Cancel` and
     `Discard and close`). `Discard and close` calls `getCurrentWindow().destroy()`. The whole
     body is wrapped so that any thrown error falls back to `window.confirm` and never leaves
     the window unclosable or closes it without asking.
  4. Add `"core:window:allow-destroy"` to `src-tauri/capabilities/default.json`, with a
     comment-free minimal diff, and note in the PR body why it is required.
  5. Unregister every listener on unmount.
- **Targeted verification:** `npx vitest --run src/hooks/use-close-guard.test.ts`.
  Discriminating assertions: with zero dirty documents, `window.addEventListener` is never
  called with `"beforeunload"` — an always-registered implementation fails this and would
  silently disable bfcache; making a **background** document dirty registers the listener and
  the handler calls `preventDefault`; cleaning that document removes it; with a stubbed Tauri
  window, a close request with two dirty documents calls `preventDefault` before anything
  else, lists both titles, and calls `destroy` only after confirmation; a handler that throws
  still results in a confirmation prompt and never an unguarded `destroy`. Then
  `bash scripts/ci-local.sh --build` to prove the capability file still validates.
- **Intent validation:** owner closes the desktop window with two dirty documents and confirms
  the summary names both, that `Cancel` returns to the app, and that the window can still be
  closed normally with no dirty documents. Owner also confirms the browser guard appears only
  when work is unsaved.

### 10. Command palette, E2E, and documentation

- **Behavior:** every tab action is reachable from the command palette, the invalidated E2E
  expectations are corrected rather than weakened, and a ten-document workflow is proven
  end-to-end.
- **Files:** `src/lib/command-registry.ts`, `src/lib/command-registry.test.ts`,
  `src/components/command-palette.tsx`, `e2e/dirty-state.spec.ts`,
  `e2e/document-tabs.spec.ts` (new), `docs/knowledge/architecture.md`,
  `docs/plans/54-multi-tab-workspace.md` (replan log).
- **Implementation:**
  1. Add file-category commands `Close Document`, `Next Document`, `Previous Document`, and
     one `Switch to: <title>` per open document, built from the registry so the list tracks
     the open set. Keep `buildCommands`'s existing dependency-injection shape.
  2. Rewrite the two `e2e/dirty-state.spec.ts` cases that assert a discard prompt on `Cmd+N`
     to assert the new contract: `Cmd+N` with unsaved changes opens a **second** tab, prompts
     nothing, and leaves the first document's node on its own tab. Keep the `File > Close`
     prompt cases, retargeted at close. Do not delete a case to make it pass.
  3. `e2e/document-tabs.spec.ts`: create ten documents; assert ten `role="tab"` elements and
     that the tenth is selected; keyboard-navigate with `Home`/`ArrowRight`/`Enter` and assert
     the canvas content changes with the selection; close a middle tab and assert the
     right-neighbour becomes selected (D1); scroll the strip and assert the selected tab is
     scrolled into view; add an element in tab 3, switch away and back, and assert it is still
     there. Use role-based selectors per `.github/instructions/e2e.instructions.md`.
  4. Extend the architecture doc's "Document registry" section with a "Document tab
     workspace" subsection: D1, D3, D4, D5, the tabpanel relationship, and the explicit
     statement that order and pin are unpersisted until `#56`.
  5. Append the replan-log row.
- **Targeted verification:** `npx vitest --run src/lib/command-registry.test.ts`, then
  `npx playwright test e2e/document-tabs.spec.ts e2e/dirty-state.spec.ts e2e/new-model.spec.ts`.
  Discriminating assertions: the palette exposes exactly one `Switch to:` command per open
  document and none when no document is open; the ten-document spec fails on a build with the
  merged close-activation fallback (it activates the last tab, not the right neighbour).
- **Intent validation:** owner reads the updated E2E diff and confirms no assertion was
  loosened to accommodate the new lifecycle, and that the architecture doc matches what
  shipped.

## Cross-cutting requirements

- **Security and privacy:** no new IPC command, no new network call, no credential path. One
  capability is added — `core:window:allow-destroy` on the `main` window — and it is the
  minimum required for the desktop close guard to close the window it just prevented from
  closing (`@tauri-apps/api/window.js:1632-1641`); it grants no filesystem, shell, or
  cross-window authority. Document titles rendered in tabs, `title` attributes, and the close
  summary come from `.thf` metadata and file paths, so they are rendered as text only — no
  `dangerouslySetInnerHTML`, no HTML interpolation. The tab drag payload is a `DocumentId`, a
  random `doc-<uuid>` that encodes nothing about the file. The registry still stores no
  credentials and no conversation content.
- **`.thf` compatibility:** no schema change, no version bump, no migration. Tab order, pin
  state, active-tab identity, and document ids never enter a `.thf` file. `captureCanvasIntoModel`
  and the deprecated `diagrams[].layout_file` fallback (`use-file-operations.ts:156-158`) are
  untouched, so save output for a given document is byte-identical before and after. Step 7
  changes when the viewport is *pushed to ReactFlow*, not what is written to disk; the
  `diagrams[].viewport` capture path is unchanged.
- **Browser and desktop:** the tab strip, keyboard contract, reorder, and pin are identical on
  both platforms. Two differences are deliberate and documented: the window close summary is
  an in-app modal on desktop and the browser's own generic dialog in the web build (browsers
  ignore custom `beforeunload` text); and desktop file-association open
  (`use-native-menu.ts:17-28`) adds a tab rather than replacing the document, matching the
  in-app `Open`. `src-tauri/src/menu.rs` needs no change: `file-new` and `file-close` acquire
  tab semantics through the frontend handlers.
- **AI safety:** unchanged, with one inherited guarantee worth re-testing. `activateDocument`
  already calls `useChatStore.getState().stopGenerating()` on every switch
  (`document-registry.ts:107`), which now runs far more often because switching becomes a
  routine action. The `#53` regression test for "a stream started in document A does not
  append into document B" must stay green; no new AI surface, no new AI-driven mutation, and
  no change to approval, cancellation, or undo.
- **Accessibility and UX:** the full D4 contract — `tablist`/`tab`/`tabpanel` roles,
  `aria-selected`, `aria-controls`, `aria-labelledby`, roving tabindex, manual activation,
  `Arrow`/`Home`/`End`/`Enter`/`Space`/`Delete`, deterministic focus after close, visually
  hidden dirty and pinned state, and `reduceMotion` on every transition and on
  `scrollIntoView`. The `main` landmark survives. Existing empty, loading, and error states
  are preserved: `EmptyCanvas` still owns the zero-document view, the `Suspense` canvas
  fallback is unchanged, and the status bar's `No model open` text is unchanged.
- **Observability and evidence:** the PR includes before/after screenshots of the workspace at
  `1280px` and at the `900px` minimum with ten documents open, in both themes; a keyboard-only
  walkthrough capture covering `Tab` into the strip, `ArrowRight`, `Enter`, and `Delete`; the
  Playwright trace for `e2e/document-tabs.spec.ts`; and an explicit statement of which two of
  the four issue-listed indicators shipped and why (D2). No screenshot may stand in for the
  keyboard evidence.

## Verification gate

Targeted, in order, while iterating:

```bash
npx tsc --noEmit
npx biome check .
npx vitest --run src/stores/document-registry.test.ts src/lib/document-display-title.test.ts
npx vitest --run src/components/layout src/hooks/use-close-guard.test.ts
npx vitest --run src/hooks src/lib src/components src/stores
npx playwright test e2e/document-tabs.spec.ts e2e/dirty-state.spec.ts e2e/new-model.spec.ts \
  e2e/canvas-elements.spec.ts e2e/canvas-visual.spec.ts e2e/keyboard-shortcuts.spec.ts
```

Final required gate:

```bash
npm run ci:local
```

Because this change alters the canvas activation path and every file-lifecycle entry point,
also run the full browser suite before handoff:

```bash
bash scripts/ci-local.sh --e2e
```

Step 9 edits `src-tauri/capabilities/default.json`, which is validated only during a Tauri
build, so also run:

```bash
bash scripts/ci-local.sh --build
```

No Rust source changes, so no additional `cargo` work beyond what `ci:local` already runs.

## Owner validation

Deterministic checks cannot decide these. Each is a plausible-but-wrong outcome this design
can produce.

1. **Right-neighbour close feels wrong in practice (D1).** Tests prove the policy is
   implemented; only the owner can judge whether closing a tab should return to the previously
   used document instead. Exercise: open five documents, work in the second and fifth, close
   the fifth, and decide whether landing on the fourth or on the second is correct. If MRU
   wins, that is a replan, not a bug fix.
2. **Two of four indicators shipped (D2).** Confirm that deferring the storage and
   external-change indicators — rather than rendering states nothing can drive — is the right
   call, and that `#54` may close with the issue's indicator criterion partially met. If not,
   `#54` must block on `#56` step 7 and a new external-change issue.
3. **Isolation that is really amnesia.** Switch between documents with different pan/zoom,
   selections, and undo depth and confirm each returns exactly as left. Step 7 changes when
   the viewport is applied; a technically green build can still make a document "jump" or
   re-fit on every visit.
4. **Losing the replace-on-open habit.** `New` and `Open` no longer prompt and no longer close
   the current document. Confirm this is desired, and that a user who opens ten files by
   habit is not surprised by ten tabs. This is the change most likely to feel wrong to an
   existing user.
5. **Unpersisted order and pin.** Reordering and pinning are lost on reload until `#56` lands.
   Confirm that shipping this before persistence is acceptable, given that a reload currently
   loses the entire workspace anyway.
6. **Close-guard proportionality.** Confirm the browser's generic unload dialog and the
   desktop summary modal are the right level of friction, and that the desktop window is never
   unclosable — including after a failure in the guard itself.
7. **Screen-reader quality, not just conformance.** Automated tests assert roles and
   attributes. Only a human can judge whether ten tabs announce usefully, whether the
   visually hidden ", unsaved changes" suffix is helpful or noisy, and whether `Delete` as the
   close key is discoverable enough given that the close button is deliberately outside the
   tab sequence.
8. **New-issue judgement.** External-change detection has no issue yet. Confirm one should be
   filed under `#48`, and confirm the deferred items in "Out of scope" belong in `#58`, `#56`,
   or new issues rather than in `#54`.

## Specialist review

Ran to convergence on PR #174; verdicts and evidence in "Completion and validation" below.

- [x] PR reviewer — merge-ready, 0 must-fix; one should-fix (desktop-WebKit drag-reorder) applied.
- [x] Slop auditor — minor, 0 must-fix; one should-fix (stale `closeDocument` JSDoc) applied; the
      five regenerated canvas-visual baselines were verified benign (pre-change PNGs extracted and
      pixel-compared — a 36 px `fitView` reframe, tolerance unchanged), not a blessed regression.
- [x] Security auditor — security-clean, 0 must-fix; `core:window:allow-destroy` is least-privilege
      and reachable only from the close guard, the close guard is fail-closed, and `.thf`-sourced
      titles render text-only (DOM ids are UUIDs, never derived from the title/path). One consider
      (title bidi/length strip, pre-existing) → `#175`.
- [x] Threat-model expert — narrow concern verified by inspection and the security lane rather than a
      separate run: `#54` changes no `.thf` serializer and adds no schema field, so no document id,
      tab order, or pin state reaches a `.thf` file and per-document save output is unchanged.

## Concurrent-work seams

Contention is expected on these files; the listed mitigation keeps conflicts mechanical.

| File | Contending issue | Nature and mitigation |
|------|------------------|-----------------------|
| `src/stores/document-registry.ts` | `#56` (in flight) | `#56` adds only the additive `hydrateDocument` action; `#54` adds `pinned`, `reorderDocument`, `setDocumentPinned`, and replaces the close-activation fallback at `:176`. Different regions. Whichever merges second re-applies over the other's shape. `hydrateDocument` must default `pinned` to `false`. |
| `src/types/document.ts` | `#56` | `#54` appends one field to `DocumentSession`; `#56` may add a shared hydration input type. Append-only. |
| `src/lib/persistence/types.ts` | `#56` | `#54` writes **no** manifest and does **not** add `pinned` to `WorkspaceManifestEntry` — an unwritten field would be dead code. `#56` (or the follow-up that persists workspace layout) must add `pinned` and persist it alongside `order`, or pin state stays session-only. Flagged for `#56`'s review. |
| Browser unload handling | `#56` | `#54` registers `beforeunload` **only while dirty**; `#56` D2 uses `visibilitychange`/`pagehide` and explicitly avoids `beforeunload` for bfcache reasons. The two are compatible only under the conditional registration in step 9 — do not make it unconditional. `#56` should also revisit whether local autosave makes the browser guard unnecessary for browser-only documents. |
| `src/components/layout/app-layout.tsx` | `#56`, `#58` | `#56` mounts persistence hooks in the hook block; `#54` restructures `<main>`; `#58` reorganizes the panels. Distinct regions, but `#58` must preserve the `role="tabpanel"` wrapper and the `main` landmark. |
| `src/components/layout/status-bar.tsx` | `#56` | `#54` does not touch it. `#56` adds the persistence indicator there, which is also where the deferred per-tab storage state will get its producer. |
| `src/components/palette/component-palette.tsx`, `src/components/panels/properties-tab.tsx` | `#58` | `#54` does not touch them. `#58` consumes the tab shell and owns narrow-window layout below `900px`. |
| `e2e/*`, `e2e/fixtures.ts` | `#65` | `#54` adds `e2e/document-tabs.spec.ts` with local helpers only. `#65` owns versioned fixtures and shared multi-tab helpers and should fold `#54`'s helpers into them; `#54` must not pre-build a fixture framework for it. |
| `src/lib/command-registry.ts` | `#58` | `#54` appends file/navigate commands; `#58` reworks palette-related commands. Append-only. |
| `docs/knowledge/architecture.md` | `#56`, `#57`, `#61` | Additive subsection; append, do not restructure. |

## Out of scope / future (do not implement here)

- Persisting tab order, pin state, and the active tab, and restoring them at boot — `#56`.
- A per-tab storage/persistence indicator — `#56` (needs the autosave writer first).
- External-change detection and its per-tab indicator — **no issue exists**; file it under
  `#48`. Needs a desktop file watcher plus the browser cross-tab stale-write signal `#56`
  promises.
- "Close Others", "Close All", "Close to the Right", a tab context menu, and middle-click
  close.
- Renaming a document from its tab; a desktop `Window` menu with next/previous accelerators
  and their Rust menu entries (D7).
- Split view, tab groups, detaching a tab to a second window, and vertical tab layout.
- Designed narrow-window and responsive layout below `900px` — `#58`.
- Shared browser-workspace E2E fixtures and multi-tab seeding helpers — `#65`.

## Completion and validation (2026-07-23)

Implementation is complete on `feat/54-multi-tab-workspace`, open as **PR #174**, with all three
review lanes converged. This is the drive-to-`Done` record: verified evidence, the owner judgement
that remains, and the linked follow-ups that let `#54` close without them. It appends to the plan
and supersedes no decision above.

### Acceptance criteria → evidence

| Issue criterion | Status | Evidence |
|---|---|---|
| Create, open, switch, reorder, pin, close tabs | met | Steps 1–8. `document-registry.test.ts` (D1 close-activation, reorder clamp, pin, active-unchanged-on-non-active-close), `document-tab-strip.test.tsx` (drag + `Cmd/Ctrl+Shift+Arrow` reorder, incl. the desktop-WebKit empty-`getData` regression), `dfd-canvas.test.tsx` (step-7 activation viewport), `use-file-operations.test.ts` (open-in-a-new-tab). |
| Title + dirty state per tab | met | `document-tab.tsx` reads each document's own model store; `document-tab.test.tsx` proves a background document's dirty state lands on its own tab. |
| Storage + external-change state per tab | deferred by design (D2) | Nothing can truthfully drive them yet: the storage indicator waits on `#56`'s autosave writer; external-change detection has no issue and is to be filed under `#48`. Gated on owner-validation item 2. |
| Closing one dirty tab prompts only for that document | met | `closeDocumentById` guards the *addressed* document's own store, so closing a dirty background tab still prompts; `use-file-operations.test.ts`. |
| Closing app/window summarizes all dirty docs, no silent loss | met, security-verified | `use-close-guard.tsx`; `use-close-guard.test.tsx` (7 cases incl. the throw→`window.confirm` fail-safe). Security lane confirmed fail-closed — the window is never unclosable and never destroyed without asking. |
| File / menu / palette / keyboard target the active tab | met | Step 6 rewire (`use-file-operations`, `use-native-menu`, `canvas`); `command-registry.ts` adds Close / Next / Previous / Switch-to-`<title>`; `command-registry.test.ts`. |
| Overflow usable at ≥ 10 documents | met | D3 shrink-to-floor-then-scroll with command-palette discoverability; live usefulness is owner item 7. |
| A11y: keyboard nav, focus visibility, labels, reduced-motion | met, with one gap | D4 ARIA tablist/tab/tabpanel, roving tabindex, manual activation, deterministic focus after close, `reduceMotion`; `document-tab.test.tsx`, `document-tab-strip.test.tsx`, `app-layout.test.tsx`. **Gap:** pin/unpin is pointer-only (D4 defines no pin key) — a keyboard/palette affordance is a follow-up under `#48`. |

Five criteria are fully met and verified; the indicator criterion is a deliberate D2 partial (owner
item 2 confirms `#54` may close with it partially met); accessibility is met with the pin-keyboard
follow-up noted.

### Verification evidence

- `tsc` 0 · `biome` 0 · `vitest` 416 pass across the workspace and the integrated step-10 areas (full
  suite 997 at implementation) · `playwright` 51 pass (incl. `document-tabs.spec.ts` and the rewritten
  `dirty-state.spec.ts`) · `cargo check` (the Tauri ACL codegen validates `core:window:allow-destroy`)
  · `npm run build:web`.
- Deferred to CI / a release build, not run locally: full `npm run ci:local`, and
  `scripts/ci-local.sh --build` — the packaged Tauri build is the only step that validates the
  capability file at package time; `cargo check` covers the ACL codegen it depends on.

### Remaining path to Done

**Agent-drivable:**

1. Land PR #174 once required CI is green — squash-merge under the authorized autonomous-run policy;
   the PR body records what a reviewer could not verify.
2. Deferred work is already linked, so `#54` can close: `#175` (title bidi/length hardening); the D2
   storage indicator under `#56`; external-change detection and the pin-keyboard affordance to be
   filed under `#48` (owner item 8); and the command-palette "Switch to:" staleness consider.

**Owner validation** — deterministic checks cannot decide the eight items in "Owner validation"
above (D1 right-neighbour feel, the D2 two-of-four indicators call, isolation-not-amnesia across
pan/zoom/selection/undo, the replace-on-open habit change, unpersisted order/pin, close-guard
proportionality, screen-reader quality at ten tabs, and the new-issue judgement). Two more the tests
cannot reach:

- A **live WKWebView / WebKitGTK desktop build** confirming drag-reorder end-to-end. The unit
  regression pins the empty-`getData` contract WebKit exhibits; only a real build proves the platform.
- The plan's observability artifacts: before/after screenshots at 1280 px and 900 px in both themes,
  and the keyboard-only walkthrough capture.

**Definition of Done:** PR #174 merged; owner-validation items 1–8 resolved; and the deferred items
filed as linked issues under `#48`/`#56` per owner item 8. None of the deferred items block the close.

## Replan log

Append changes; do not rewrite prior decisions.

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-07-21 | Initial plan | Issue `#54`, parent `#48`, roadmap Phase 1, and repository evidence read on `main` @ `7b2e025`: registry actions and the provisional close fallback (`document-registry.ts:153-182`), the `isSwitch` invariant comment (`:96-100`) and viewport branch (`:135-144`), `useDocumentStores` (`:207-209`); close-then-create at every entry point (`use-file-operations.ts:121-125`, `:163-166`, `:250-255`, `use-native-menu.ts:24-27`, `canvas.tsx:54-57`); latched `initialSyncDone` (`dfd-canvas.tsx:107,113-132`) and `buildLayoutFromModel` returning `null` without inline positions (`model-layout-utils.ts:4-16`); argument-less `confirmDiscard` (`file-adapter.ts:25`, `browser-file-adapter.ts:80-82`, `tauri-file-adapter.ts:90-97`); no `beforeunload`/`CloseRequested` anywhere; `onCloseRequested` calling `destroy()` (`@tauri-apps/api/window.js:1632-1641`) against a capability set without `allow-destroy` (`capabilities/default.json`, `gen/schemas/acl-manifests.json`); zero production consumers of `workspace-store`; `WorkspaceManifestEntry` without `pinned` (`lib/persistence/types.ts:64-75`); no `role="tab"` anywhere in `src/`; no shadcn/Radix dependency; `minWidth: 900` (`tauri.conf.json:18`); panel minimums `180`/`260` (`ui-store.ts:21-25`); the canvas drop handler gated on `draggedType` (`dfd-canvas.tsx:204-210`); and `e2e/dirty-state.spec.ts` asserting a discard prompt on `Cmd+N`. |
| 2026-07-23 | Implemented steps 1–10 | Executed on a worktree off `main` @ `84e7fb6`, which is **ahead of the `7b2e025` plan snapshot**: `#56` (IndexedDB persistence) has substantially landed — `hydrateDocument`, `useWorkspacePersistence` (which already flushes on `pagehide`/`visibilitychange` and deliberately avoids `beforeunload`), `useWorkspaceRestore`, the `workspace-store.persistence` producer, and the status-bar `#56` indicator all exist. Honored the plan against this newer reality: **D2** still ships only title+dirty — the per-tab storage indicator stays out of scope (the status bar already carries `#56`'s producer); **step 9** browser `beforeunload` is registered only-while-dirty and coexists with the existing `pagehide` flush; `hydrateDocument` now defaults `pinned` to `false`; `WorkspaceManifestEntry` is left unchanged. Three documented refinements: (1) `DocumentTab` uses `<div role="tab">` with the pin/close `<button>`s as **siblings** (not children) because a `tab` role makes its children presentational — a nested real button vanishes from the a11y tree — with the tab's accessible name set via `aria-label` so the state suffixes join it cleanly; (2) step 7's viewport rule is implemented as `hadPendingLayout OR (nodes>0 && non-default viewport) → restore, else fitView`, refining the plan's literal "restore when the document has nodes, otherwise fit" — a pure node-count rule cannot distinguish a freshly-imported document (nodes present, default viewport → must fit, per the plan's own test) from a revisited one (nodes present, flushed viewport → must restore); (3) the close guard is `use-close-guard.tsx` (not `.ts`) because the hook returns the desktop summary modal it must render. `closeDocumentById` was added to `use-file-operations` as the shared per-tab close guard that both the close button and `Delete` use (`closeModel` now delegates to it). |
| 2026-07-23 | Preflight converged; completion plan added | Three lanes ran on PR #174 — pr-review *merge-ready*, slop *minor*, security *security-clean*; **0 must-fix**. Applied should-fixes: (1) desktop-WebKit drag-reorder now tracks the dragged id in a strip ref set on `onDragStart` (`document-tab.tsx`, `document-tab-strip.tsx`) instead of reading `dataTransfer.getData` — WKWebView returns an empty `getData()` for a custom MIME at `drop`, mirroring the palette's existing workaround — with a discriminating regression test; (2) the stale `closeDocument` JSDoc corrected to the D1 neighbour. Snapshot regeneration verified benign (pre-change PNGs pixel-compared). Deferred considers filed/linked: `#175` (title bidi/length hardening); pin-keyboard affordance and external-change detection to be filed under `#48`; the "Switch to:" staleness consider noted. Merged `main` @ `f449c84` (incl. `#61` step 10) into the branch conflict-free. Added the "Completion and validation" section mapping every acceptance criterion to evidence and the remaining owner-validation path. |
