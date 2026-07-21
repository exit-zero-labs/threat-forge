# Issue 53 — Introduce a document registry with isolated per-tab state

## Objective

Replace the singleton model lifecycle with a document registry that owns one isolated state
bundle per document, so that activating a different document cannot expose any canvas,
history, selection, or file-settings value belonging to another document, and so that a
document keeps its identity across `Save As`, rename, and path changes.

## Issue contract

- **Issue:** `#53`
- **Parent initiative:** `#48`
- **Type:** `Task`
- **Size:** `L`
- **Priority:** `P0`
- **Autonomy:** `Automatable`
- **Dependencies:** `None`. Eight issues gate on this one: `#54`, `#55`, `#56`, `#63`, `#58`,
  `#65`, `#66`, `#67`, `#68`.
- **Non-goals:**
  - Tab bar, tab ordering, pinning, overflow, or per-tab close UX (`#54`).
  - IndexedDB document bodies, workspace persistence, and restore (`#56`).
  - Browser recovery, export, and storage migration (`#55`).
  - AI conversation and tool-history persistence (`#63`); this issue stores only a session
    *reference*.
  - AI conversation/tool protocol changes (`#61`); `src/stores/chat-store.ts` is not modified.
  - `.thf` schema extension (`#57`); the document model stays an opaque payload.
  - Background autosave for non-active documents; autosave stays bound to the active document.
  - Any user-visible multi-document affordance. After this issue the app still shows exactly
    one document at a time; the registry API and its tests carry the multi-document contract
    until `#54` renders tabs.

## Current behavior and evidence

### Today's state topology

Seven Zustand stores exist in `src/stores/`. Verified responsibilities:

| Store | File | Holds today |
|-------|------|-------------|
| model | `src/stores/model-store.ts` | `model`, `filePath`, `isDirty`, four selection ids, `isAnalyzing`, all model mutators, `analyzeThreats` |
| canvas | `src/stores/canvas-store.ts` | `nodes`, `edges`, `viewport`, `pendingLayout`, palette drag fields, `isConnecting`, ReactFlow instance handles, canvas mutators, `syncFromModel` |
| history | `src/stores/history-store.ts` | `past`, `future` (max 20, `structuredClone` snapshots) |
| clipboard | `src/stores/clipboard-store.ts` | `clipboard`, `pasteCount`; reads canvas + model + history |
| chat | `src/stores/chat-store.ts` | sessions keyed by `filePath` in `localStorage`, streaming state, provider, `hasApiKey` |
| settings | `src/stores/settings-store.ts` | persisted `settings` (user), `fileSettings` (document), dialog state |
| ui | `src/stores/ui-store.ts` | panel sizes/visibility, theme, `canvasLocked`, palette/dialog flags |

Blast radius measured on this checkout: `find src -type f \( -name '*.ts' -o -name '*.tsx' \)`
returns 143 files; `grep -rl 'from "@/stores/' src` returns 51; `model-store` is referenced by
29 files and `canvas-store` by 18.

### The singleton assumptions that must be removed

1. **Document identity is the file path.** `src/stores/model-store.ts` stores `filePath` and
   `src/stores/chat-store.ts:33` derives its `localStorage` key from it
   (`threatforge-chat-sessions:<filePath>` or `:unsaved`).
   `src/lib/adapters/browser-file-adapter.ts:60` returns `path: file.name`, so in the browser
   two different documents named `model.thf` already collide. Path is adapter metadata, not
   identity.
2. **Module-level mutable state outside any store.** These values are shared by every document
   by construction and are the highest-risk leak vectors:
   - `src/stores/model-store.ts:66-68` — `lastDebouncedCaptureTime`, `lastDebouncedCaptureKey`
     (history debounce), exported `resetCaptureDebounce()`.
   - `src/stores/canvas-store.ts:158` — `preDragSnapshot` (pre-drag model snapshot).
   - `src/stores/canvas-store.ts:161-165` — `altDragActive` and exported `setAltDragActive()`.
   - `src/stores/canvas-store.ts:168-171` — `nudgeState` (snapshot + `setTimeout` handle).
   - `src/stores/canvas-store.ts:197-214` — `elementCounter`, `flowCounter`, `boundaryCounter`
     and the exported `generateElementId/generateFlowId/generateBoundaryId`, also used by
     `src/stores/clipboard-store.ts:124-132`.
   - `src/stores/chat-store.ts:21` — `currentAbortController` for the in-flight stream.
3. **Cross-store writes reach "the" store, not "this document's" store.**
   `src/stores/canvas-store.ts` calls `useModelStore.getState()` / `useModelStore.setState()` /
   `useHistoryStore.getState()` in 20+ places (for example lines 336-343, 386-396, 461-483,
   696-699, 796-805). Any canvas store that resolves the global model store would write into
   whichever document happened to be active.
4. **Document-owned state parked in a workspace store.** `fileSettings` lives in
   `src/stores/settings-store.ts:14`. It is written by `src/hooks/use-file-operations.ts:113`,
   `:144`, `:198`, `:235`, `src/hooks/use-native-menu.ts:26`, and
   `src/components/canvas/canvas.tsx:60`, and is currently read only by
   `src/stores/settings-store.test.ts`.
5. **The mounted ReactFlow instance is conflated with document canvas state.**
   `rfFitView/rfZoomIn/rfZoomOut/rfPanBy` are stored in the canvas store and registered by an
   effect in `src/components/canvas/dfd-canvas.tsx:82-89` whose deps
   (`fitViewFn, zoomInFn, zoomOutFn, panByFn`) do not change when a document changes. If those
   handles became per-document, view commands in `src/lib/command-registry.ts:109-123`,
   `src/hooks/use-keyboard-shortcuts.ts:68-202`, and `src/hooks/use-native-menu.ts:158-164`
   would silently no-op after the first switch.
6. **Viewport is written to the store but only pushed back to ReactFlow on load.**
   `src/components/canvas/dfd-canvas.tsx:453` writes `onMoveEnd` into the store;
   `:119-127` pushes a viewport into ReactFlow only when `pendingLayout` was present, otherwise
   it calls `fitViewFn()` once and latches `initialSyncDone`. Without an explicit activation
   step, a newly activated document would inherit the previous document's on-screen viewport.

### Verified call-site shapes that constrain the design

- Every consumer uses one of three forms: `useXStore(selector)`, `useXStore.getState()`, or
  `useXStore.setState(partial)`. `grep -rn "useModelStore()\|useCanvasStore()\|useHistoryStore()\|\.subscribe(" src`
  returns nothing, so no consumer uses the selector-less hook form or `subscribe`.
- Pure helpers are imported from `@/stores/canvas-store` by
  `src/stores/clipboard-store.ts`, `src/hooks/use-file-operations.ts`,
  `src/components/canvas/dfd-canvas.tsx`, and `src/components/panels/properties-tab.tsx`
  (`elementToNode`, `boundaryToNode`, `flowToEdge`, `DfdNode`, `DfdEdge`, `DfdEdgeData`).
  Those import paths must keep working.
- `zustand@5` exports `useStore(api, selector)` from `zustand` and `createStore` from
  `zustand/vanilla` (`node_modules/zustand/react.d.ts`), so a vanilla store per document plus a
  hook-level indirection is a supported pattern.

### Design decision: swap bundles, never copy state

Two implementations were considered.

- *Checkpoint/restore*: keep today's singleton stores and copy document state in and out on
  every switch. Rejected: correctness depends on a hand-maintained field list, so every future
  field added by `#54`, `#56`, `#57`, or `#58` is a new leak opportunity, and the failure is
  silent.
- *Per-document store bundle with an active-bundle pointer*: each document owns real store
  instances; switching changes which bundle the exported hooks resolve to. Chosen. Nothing is
  copied, so no field can be forgotten. A document's canvas store is wired to its own model and
  history stores by constructor injection, so it is not able to write into another document.

### Scope rule for every piece of state

**Document-scoped** = must be exactly as the user left it when they return to the document.
**Workspace-scoped** = belongs to the single window, the single mounted canvas, or the user.

| Scope | State |
|-------|-------|
| Document | `model`, `filePath`, `isDirty`, selection ids, `isAnalyzing`, `nodes`, `edges`, `viewport`, `pendingLayout`, history `past`/`future`, id counters, history-debounce state, pre-drag and nudge gesture snapshots, `fileSettings`, active AI session reference |
| Workspace | ReactFlow instance handles (`rfFitView`, `rfZoomIn`, `rfZoomOut`, `rfPanBy`), in-flight pointer gesture state (`draggedType/Subtype/Icon/Name`, `isConnecting`, `altDragActive`), clipboard contents, `ui-store` (panels, theme, `canvasLocked`, dialogs), `settings-store.settings`, chat provider/`hasApiKey`, onboarding, update |

Anything not listed as workspace is document-scoped. Adding new document state means adding a
field to a factory-created store, which is per-document automatically.

### Module graph (must stay acyclic)

```
model-store-factory.ts ─┐
canvas-store-factory.ts ─┼─> document-stores.ts ─> document-registry.ts
history-store-factory.ts┘        ^
                                 │ (facade only)
        model-store.ts ──────────┤
        canvas-store.ts ─────────┤
        history-store.ts ────────┘
```

No store module imports `document-registry.ts`. The scratch bundle is created inside
`document-stores.ts` at module load, so a narrow unit test that imports only
`@/stores/model-store` still gets a model store wired to the same history store that
`@/stores/history-store` resolves to.

Canonical references: `docs/knowledge/architecture.md`, `docs/knowledge/file-format.md`,
`docs/plans/roadmap.md` Phase 1.

## Implementation steps

Each step leaves the application working, `npx vitest --run` green, and `npx tsc --noEmit`
clean. Steps 1-3 are preparatory refactors with no registry; step 4 introduces the registry;
steps 5-8 move ownership; steps 9-10 prove and document it.

### 1. Document identity primitives

- **Behavior:** a document id is a stable, opaque, randomly generated value that is never
  derived from a file path, title, or model content, and is never written to a `.thf` file.
- **Files:** `src/types/document.ts` (new), `src/lib/document-id.ts` (new),
  `src/lib/document-id.test.ts` (new).
- **Implementation:**
  1. In `src/types/document.ts` declare
     `export type DocumentId = string & { readonly __brand: "DocumentId" }` and the
     `DocumentSession` shape used from step 4 onward. The brand is deliberate: it makes
     "IDs are independent of file paths" a compile-time property, so a `filePath` can never be
     passed where a `DocumentId` is expected.
  2. In `src/lib/document-id.ts` export `createDocumentId(): DocumentId` returning
     `doc-<uuid>`. Use `globalThis.crypto.randomUUID()` when available; otherwise derive 16
     bytes from `globalThis.crypto.getRandomValues` and format them as a UUID. Throw a
     user-safe error if neither exists rather than falling back to `Math.random()` — `#56`
     will persist these ids, and a predictable id is a collision and workspace-integrity
     hazard, not a cosmetic one.
- **Targeted verification:** `npx vitest --run src/lib/document-id.test.ts`. Assertions: 1000
  generated ids are unique; the `randomUUID`-absent path produces a well-formed, unique id via
  a stubbed `getRandomValues`; the missing-crypto path throws instead of returning a value.
- **Intent validation:** owner confirms ids are runtime-only workspace identity and must never
  appear in `.thf` output.

### 2. Split the mounted-canvas state out of the canvas store

- **Behavior:** ReactFlow instance handles and in-flight pointer gesture state move to a
  workspace-scoped store. Canvas behavior is unchanged.
- **Files:** `src/stores/canvas-instance-store.ts` (new),
  `src/stores/canvas-instance-store.test.ts` (new), `src/stores/canvas-store.ts`,
  `src/components/canvas/dfd-canvas.tsx`,
  `src/components/canvas/nodes/shared-handles.tsx`,
  `src/components/canvas/nodes/trust-boundary-node.tsx`,
  `src/components/palette/component-palette.tsx`, `src/lib/command-registry.ts`,
  `src/hooks/use-keyboard-shortcuts.ts`, `src/hooks/use-native-menu.ts`,
  `src/stores/canvas-store.test.ts`, `src/lib/command-registry.test.ts`.
- **Implementation:**
  1. Create `useCanvasInstanceStore` holding `rfFitView`, `rfZoomIn`, `rfZoomOut`, `rfPanBy`,
     `setReactFlowActions`, `draggedType`, `draggedSubtype`, `draggedIcon`, `draggedName`,
     `setDraggedComponent`, `isConnecting`, `setIsConnecting`, `altDragActive`,
     `setAltDragActive`.
  2. Delete those fields from `CanvasState`. `onNodesChange` reads
     `useCanvasInstanceStore.getState().altDragActive` — the one intentional cross-store read;
     comment why.
  3. Update the consumers listed above. `setDraggedType` currently has no caller
     (`grep -rn "setDraggedType" src` matches only its definition); drop it with the move and
     say so in the PR body.
- **Targeted verification:**
  `npx vitest --run src/stores/canvas-store.test.ts src/stores/canvas-instance-store.test.ts src/lib/command-registry.test.ts`
  plus `npx playwright test e2e/canvas-elements.spec.ts`. Discriminating assertion: dropping a
  palette component onto the canvas still creates exactly one element (proves the
  `draggedType` read/clear ordering in `dfd-canvas.tsx:200-206` and
  `component-palette.tsx:218-234` survived the move).
- **Intent validation:** owner drags from the palette, drags a connection between two nodes,
  Alt+drags to duplicate, and uses `Cmd+0`/zoom to confirm no interaction regressed.

### 3. Convert the three document stores to injected factories

- **Behavior:** identical runtime behavior with exactly one implicit document, but model,
  canvas, and history stores are now produced by factories, and every module-level mutable
  value listed in evidence item 2 lives inside a factory closure or store state.
- **Files:** `src/stores/model-store-factory.ts` (new),
  `src/stores/canvas-store-factory.ts` (new), `src/stores/history-store-factory.ts` (new),
  `src/stores/document-stores.ts` (new), `src/stores/model-store.ts`,
  `src/stores/canvas-store.ts`, `src/stores/history-store.ts`,
  `src/stores/clipboard-store.ts`, `src/stores/model-store.test.ts`,
  `src/stores/canvas-store.test.ts`, `src/stores/clipboard-store.test.ts`.
- **Implementation:**
  1. Move the current store bodies into `create*Store` factories built on `createStore` from
     `zustand/vanilla`:
     `createHistoryStore()`,
     `createModelStore(deps: { history: StoreApi<HistoryState> })`,
     `createCanvasStore(deps: { model: StoreApi<ModelState>; history: StoreApi<HistoryState> })`.
     Replace every `useModelStore.getState()` / `useHistoryStore.getState()` inside the canvas
     factory with `deps.model.getState()` / `deps.history.getState()`. This is the change that
     makes cross-document writes structurally impossible.
  2. Move `lastDebouncedCaptureTime`/`lastDebouncedCaptureKey` into the model factory closure
     and expose `resetCaptureDebounce()` as a store action (its only caller is
     `src/stores/model-store.test.ts`). Move `preDragSnapshot`, `nudgeState`, and the three id
     counters into the canvas factory closure. Replace exported
     `generateElementId/generateFlowId/generateBoundaryId` with canvas store actions
     `nextElementId/nextFlowId/nextBoundaryId`, and update
     `src/stores/clipboard-store.ts:124-132` to call them through the canvas facade.
  3. Add `src/stores/document-stores.ts`: `export interface DocumentStores { model; canvas; history }`,
     `createDocumentStores(): DocumentStores` (history first, then model, then canvas — the
     dependency order is acyclic), and an internal one-field Zustand holder for the active
     bundle initialised with a scratch bundle, exposing `getActiveStores()`,
     `useActiveStores()`, and `setActiveStores()`.
  4. Reduce `model-store.ts`, `canvas-store.ts`, and `history-store.ts` to facade modules that
     export `useModelStore`/`useCanvasStore`/`useHistoryStore` as callable objects satisfying
     `UseBoundStore<StoreApi<T>>`: the hook form calls `useStore(useActiveStores().<kind>, selector)`;
     `getState`, `setState`, `subscribe`, and `getInitialState` delegate to the active bundle.
     Re-export the pure helpers and types (`elementToNode`, `boundaryToNode`, `flowToEdge`,
     `DfdNode`, `DfdEdge`, `DfdNodeData`, `DfdEdgeData`, `ModelState`, `HistoryState`,
     `CanvasState`) so all 51 consumer import paths stay valid and no consumer file changes.
  5. Add a shared facade helper only if all three facades are identical in shape; do not
     abstract earlier than that.
- **Targeted verification:** `npx vitest --run src/stores src/hooks src/lib` with **no
  changes to consumer files** other than `clipboard-store.ts`. Discriminating assertion: the
  existing `src/stores/canvas-store.test.ts` cases that assert canvas mutations land in the
  model store and history store still pass, proving injection reproduces the previous wiring.
- **Intent validation:** owner confirms the facade keeps `useXStore.setState(...)` available to
  tests and existing code, and that no consumer had to learn a new import path.

### 4. Add the document registry

- **Behavior:** a registry owns document sessions keyed by `DocumentId`, an ordered list of
  open ids, and the single active pointer. Creating a document creates a fresh bundle;
  activating a document points the facades at that bundle; closing disposes it. Nothing is
  copied between documents.
- **Files:** `src/stores/document-registry.ts` (new),
  `src/stores/document-registry.test.ts` (new), `src/types/document.ts`.
- **Implementation:**
  1. `DocumentSession = { id: DocumentId; createdAt: string; stores: DocumentStores;
     fileSettings: FileSettings | null; activeChatSessionId: string | null }`.
  2. `useDocumentRegistry` state:
     `{ documents: Record<DocumentId, DocumentSession>; openDocumentIds: DocumentId[]; activeDocumentId: DocumentId | null }`.
  3. Actions:
     - `createDocument({ model, filePath, pendingLayout }): DocumentId` — build a bundle, seed
       it with `stores.model.getState().setModel(model, filePath)` and
       `stores.canvas.setState({ pendingLayout })`, seed `fileSettings` from
       `model.metadata.settings ?? null`, append the id, and activate it. Passing
       `pendingLayout` at creation is required: today `src/hooks/use-file-operations.ts:133`
       sets it on the canvas store *before* `setModel`, which would land on the outgoing
       bundle.
     - `activateDocument(id)` — set the pointer and call `setActiveStores(session.stores)`.
     - `closeDocument(id)` — drop the session and its bundle; if it was active, activate the
       next open document or, when none remain, set `activeDocumentId` to `null` **and install
       a newly created scratch bundle** so nothing written while no document is open can
       surface in a later document.
     - `setDocumentFileSettings(id, fileSettings)`, `setDocumentChatSessionId(id, sessionId)`.
     - `getDocumentStores(id)` and `useDocumentStores(id)` — the read API `#54` needs to render
       a per-tab title and dirty indicator by subscribing to each document's own store; also
       used by the isolation tests in step 9.
  4. Do not add reorder, pin, duplicate, or persistence actions. `#54` and `#56` own those.
  5. The registry stores no credentials and no conversation content, matching `#56`'s
     "no API key in either workspace store" criterion.
- **Targeted verification:** `npx vitest --run src/stores/document-registry.test.ts`.
  Discriminating assertions: `createDocument` twice yields different ids and different store
  instances (`getDocumentStores(a).model !== getDocumentStores(b).model`); closing the last
  document yields `activeDocumentId === null` and a *different* scratch bundle object than
  before the close.
- **Intent validation:** owner confirms the registry API is the minimum `#54` needs and that
  nothing tab-shaped leaked into this issue.

### 5. Route document lifecycle through the registry

- **Behavior:** `New`, `Open`, `Import`, template open, file-association open, `Save`,
  `Save As`, and `Close` operate on registry documents. User-visible behavior is unchanged:
  one document at a time, same discard confirmation, same status bar and window title. A
  document's id survives `Save` and `Save As`.
- **Files:** `src/hooks/use-file-operations.ts`, `src/hooks/use-native-menu.ts`,
  `src/components/canvas/canvas.tsx`, `src/hooks/use-file-operations.test.ts` (new).
- **Implementation:**
  1. In `newModel`, `openModel`, and `importModel`: keep the existing
     `isDirty` → `adapter.confirmDiscard()` guard, then
     `closeDocument(activeDocumentId)` when one is open, then
     `createDocument({ model, filePath, pendingLayout })`. The explicit
     `useHistoryStore.getState().clear()` calls at `use-file-operations.ts:112`, `:143`, `:233`
     are deleted — a new document has a new history store.
  2. In `saveModel`/`saveModelAs`: keep `captureCanvasIntoModel` and keep calling
     `setModel(captured, savedPath)` so the existing post-save behavior (including the
     selection reset that `setModel` performs) is preserved exactly. **Do not** create a new
     document on `Save As`; the id is stable across path changes.
  3. `closeModel` calls `closeDocument(activeDocumentId)`. Delete the
     `useCanvasStore.getState().syncFromModel()` workaround at
     `use-file-operations.ts:200` — with no active document the facades resolve to a fresh
     scratch bundle, so the canvas is empty by construction.
  4. `openFileByPath` in `src/hooks/use-native-menu.ts:16-27` and the template path in
     `src/components/canvas/canvas.tsx:52-63` use `createDocument` the same way.
- **Targeted verification:**
  `npx vitest --run src/hooks/use-file-operations.test.ts` with a mocked file adapter.
  Discriminating assertions: `Save As` to `/a.thf` then `/b.thf` keeps `activeDocumentId`
  constant and preserves `past.length`; `openModel` after an edit produces a document whose
  `past` is empty and whose `nodes` do not contain the previous document's element ids.
  Then `npx playwright test e2e/new-model.spec.ts e2e/save-reopen.spec.ts e2e/dirty-state.spec.ts`.
- **Intent validation:** owner runs New → edit → Save As twice → Close → Open on desktop and
  in the browser build and confirms nothing about the single-document workflow changed.

### 6. Move `fileSettings` from the settings store to the document session

- **Behavior:** file-scoped settings belong to the document; user settings stay global.
- **Files:** `src/stores/settings-store.ts`, `src/stores/settings-store.test.ts`,
  `src/hooks/use-file-operations.ts`, `src/hooks/use-native-menu.ts`,
  `src/components/canvas/canvas.tsx`, `src/stores/document-registry.test.ts`.
- **Implementation:**
  1. Remove `fileSettings`, `loadFileSettings`, and `clearFileSettings` from
     `SettingsState`. `grep -rn "fileSettings" src` confirms the only current reader is
     `src/stores/settings-store.test.ts`, so no rendering surface changes.
  2. Populate `DocumentSession.fileSettings` from `model.metadata.settings` inside
     `createDocument`, and refresh it in `saveModel`/`saveModelAs` when metadata changed.
     Delete the five `loadFileSettings`/`clearFileSettings` call sites.
  3. Move the corresponding cases from `settings-store.test.ts` into
     `document-registry.test.ts` so the behavior keeps its coverage instead of losing it.
- **Targeted verification:**
  `npx vitest --run src/stores/settings-store.test.ts src/stores/document-registry.test.ts`.
  Discriminating assertion: opening a model with `metadata.settings.grid_size = 24`, then
  creating a second document from a model with no `settings`, leaves document two's
  `fileSettings` `null` while document one still reports `24`.
- **Intent validation:** owner confirms user-level settings (theme, autosave, author identity)
  remain global and are not accidentally scoped per document.

### 7. Make activation restore the visible canvas

- **Behavior:** activating a document restores that document's ReactFlow viewport and node/edge
  rendering; no rendered canvas state carries over from the previous document.
- **Files:** `src/components/canvas/dfd-canvas.tsx`, `src/stores/document-registry.ts`,
  `src/components/canvas/dfd-canvas.test.tsx` (new, RTL with a stubbed ReactFlow instance) or
  an equivalent hook-level test if stubbing ReactFlow proves brittle.
- **Implementation:**
  1. Read `activeDocumentId` in `DfdCanvas`. On change: reset `initialSyncDone.current`, call
     `syncFromModel()`, and push `useCanvasStore.getState().viewport` into ReactFlow via
     `setReactFlowViewport` inside `requestAnimationFrame`, mirroring the existing
     `pendingLayout` branch at `dfd-canvas.tsx:119-127`. When the activated document has never
     been laid out (`nodes.length === 0` after sync), keep the existing `fitViewFn()` behavior.
  2. Before deactivating, flush the live ReactFlow viewport into the outgoing document's canvas
     store. `onMoveEnd` (`dfd-canvas.tsx:453`) only fires at the end of a user gesture, so a
     switch immediately after a programmatic zoom would otherwise lose the viewport.
  3. Keep the ReactFlow instance handles in the workspace store from step 2, so the
     registration effect at `dfd-canvas.tsx:82-89` does not need document-dependent deps.
- **Targeted verification:** targeted Vitest run for the new test. Discriminating assertion:
  with document A at `viewport {x:120,y:-40,zoom:2}` and document B at `{x:0,y:0,zoom:1}`,
  activating B pushes `{0,0,1}` to the ReactFlow instance and re-activating A pushes
  `{120,-40,2}`; a build that omits the activation push keeps B at A's viewport and fails.
- **Intent validation:** owner confirms that returning to a document shows the same pan/zoom
  and does not "jump" or re-fit unexpectedly.

### 8. Bind AI session references and stop cross-document stream bleed

- **Behavior:** each document records which AI session it was last using; switching documents
  cancels any in-flight stream instead of letting it write into the newly visible document's
  chat panel. Conversation content stays owned by `#63`.
- **Files:** `src/components/panels/ai-chat-tab.tsx`, `src/stores/document-registry.ts`,
  `src/components/panels/ai-chat-tab.test.tsx` (new).
- **Implementation:**
  1. `src/stores/chat-store.ts` is **not modified**, to avoid contending with `#61`.
  2. In `activateDocument`, call `useChatStore.getState().stopGenerating()` before switching.
     `chat-store.ts:346-352` already aborts the module-level controller and clears
     `isStreaming`; without this call a stream started in document A keeps appending to the
     workspace chat store and appears under document B.
  3. Record the outgoing document's `useChatStore.getState().activeSessionId` into
     `DocumentSession.activeChatSessionId`, and on activation call `switchSession(savedId)`
     when that id still exists. `chat-store.ts:167-171` already no-ops for an unknown id, so the
     restore path fails safe.
  4. Add `activeDocumentId` to the session-loading effect at `ai-chat-tab.tsx:45-53` so it
     re-binds on switch, not only on `filePath` change.
  5. **Known limitation to state in the PR body and carry to `#63`:** while chat storage is
     still keyed by `filePath` (`chat-store.ts:33`), two documents that are both unsaved share
     the `threatforge-chat-sessions:unsaved` bucket. `#53` deliberately stores only a session
     *reference*; `#63` rekeys conversation storage to `DocumentId` and migrates.
- **Targeted verification:** `npx vitest --run src/components/panels/ai-chat-tab.test.tsx`.
  Discriminating assertion: with a fake streaming adapter that never resolves, activating a
  second document calls `stopGenerating` and leaves `isStreaming === false`; the pending
  chunk callback afterwards does not append text to the visible transcript.
- **Intent validation:** owner starts a long AI response, switches document, and confirms the
  response stops and does not appear under the other document.

### 9. Prove isolation with discriminating tests

- **Behavior:** the acceptance criterion "switching documents cannot leak canvas, history,
  selection, or settings state" is enforced by tests that fail for a leak *and* fail for the
  opposite defect of wiping state on every switch.
- **Files:** `src/stores/document-registry.test.ts`,
  `src/components/layout/status-bar.test.tsx` (new).
- **Implementation** — each case names the leak it discriminates:
  1. *Full-state isolation.* In A: add two elements and one flow, push history, select an
     element and a threat, set `viewport {x:100,y:200,zoom:2}`, load `fileSettings`. Activate B
     and assert `nodes: []`, `edges: []`, `past: []`, `future: []`, all four selection ids
     `null`, `viewport {0,0,1}`, `fileSettings: null`, `isDirty: false`, `filePath: null`.
  2. *Restore, not reset.* Re-activate A and assert every value from case 1 is byte-identical.
     This fails any implementation that "prevents leaks" by clearing state on switch.
  3. *Workspace negative control.* Set `useUiStore` `rightPanelTab: "threats"` and copy nodes to
     the clipboard while A is active; assert both are still present under B. This fails any
     implementation that scopes workspace state per document.
  4. *Id-counter isolation.* Create three elements in A (`comp-1..comp-3`), switch to B, add one
     element and assert it is `comp-1`, assert A's ids are untouched, switch back to A and
     assert the next element is `comp-4`. This fails the module-level counters described in
     evidence item 2.
  5. *History isolation.* `undo()` in B with empty history returns `null` and does not restore
     A's snapshot; `canUndo()` is `false` in B while `true` in A.
  6. *Async isolation.* With a deferred STRIDE adapter, call `analyzeThreats()` on A, activate
     B, then resolve. Assert the threats land on A, `A.isAnalyzing === false`, and B's model is
     untouched. This fails any design where the canvas or model store resolves "the active
     document" at completion time instead of holding its own bundle.
  7. *Opaque model payload (`#57` seam).* Round-trip a `ThreatModel` carrying an unknown extra
     field through push/undo/redo and a document switch, and assert the field survives. This
     fails any per-field snapshot or whitelist serializer.
  8. *Identity across paths.* `Save As` twice with different paths keeps the same `DocumentId`
     and the same history depth.
  9. *Ten documents.* Create ten documents with distinct element counts, activate them in a
     shuffled order, and assert each reports its own `nodes.length`, `past.length`, and
     selection. This matches `#48`'s "at least ten documents" exit criterion at the state
     layer.
  10. *React re-subscription.* `status-bar.test.tsx` renders `StatusBar`, which reads
      `model`, `isDirty`, `filePath`, `past.length`, and `future.length`
      (`src/components/layout/status-bar.tsx:6-11`). Assert the rendered counts and file path
      change when the active document changes, and change back on return. This proves the
      facade re-subscribes through React rather than serving a stale snapshot.
- **Targeted verification:**
  `npx vitest --run src/stores src/components/layout/status-bar.test.tsx`.
- **Intent validation:** owner reads the test names and confirms each one describes a real
  user-visible failure, not a restatement of the implementation.

### 10. Update architecture documentation and hand off the seams

- **Behavior:** `docs/knowledge/architecture.md` describes the document registry, the
  document/workspace scope rule, and the module graph, so `#54`, `#55`, `#56`, and `#63` do not
  rediscover it.
- **Files:** `docs/knowledge/architecture.md`, `docs/plans/53-document-registry.md`.
- **Implementation:**
  1. Add a "Document registry and state scope" subsection: the scope table, the
     bundle-swap-not-copy rule, the acyclic module graph, and the statement that document ids
     never enter `.thf`.
  2. Record the ADR-style decision (bundle swap over checkpoint/restore) alongside the existing
     ADR table.
  3. Append the handoff notes for `#54` (`useDocumentStores(id)` for per-tab subscriptions),
     `#56` (session record is the persistence unit; no credentials), and `#63`
     (`activeChatSessionId` is the only AI field this issue owns).
  4. Append the replan log row.
- **Targeted verification:** `npx biome check docs` is not applicable; verify links resolve and
  run `npm run ci:local`.
- **Intent validation:** owner confirms the documented scope rule matches the product intent
  before `#54` builds on it.

## Cross-cutting requirements

- **Security and privacy:** document ids come from `crypto.randomUUID`/`getRandomValues`, never
  `Math.random()`, because `#56` persists them and predictable ids create workspace collision
  and integrity problems. Ids are never derived from file paths or model content, so no path or
  title information is embedded in workspace metadata. The registry holds no API keys, no
  provider credentials, and no conversation content; `KeyStorage` and `chat-store` ownership are
  unchanged. No new Tauri command, capability, permission, or IPC surface is introduced — this
  issue is entirely frontend state ownership. Disposing a document drops its model, history
  snapshots, and canvas state so closed-document content is not retained in memory behind an
  inactive pointer.
- **`.thf` compatibility:** no schema change, no version bump, and no migration. The document
  model is stored and cloned as an opaque payload; the plan forbids any per-field document
  serializer or field whitelist, and step 9 case 7 enforces that with an unknown-field
  round-trip. `structuredClone` in the history factory already preserves unknown fields.
  Existing `.thf` read/write paths (`captureCanvasIntoModel`, the deprecated
  `diagrams[].layout_file` fallback at `use-file-operations.ts:134-137`) are preserved verbatim.
- **Browser and desktop:** both platforms use the same registry; only the file adapter differs.
  The browser adapter's `path: file.name` (`browser-file-adapter.ts:60`) stops being identity,
  which removes a real browser-only collision. Desktop file-association open
  (`use-native-menu.ts:16-27`) and native menu actions route through the same
  `createDocument`, so `#68`'s desktop smoke suite tests the same contract.
- **AI safety:** AI output handling is unchanged. The only AI-facing changes are cancelling an
  in-flight stream on switch and remembering a session id, both of which reduce the chance of
  AI content being attributed to the wrong document. `src/lib/ai-action-executor.ts` continues
  to push a history snapshot before mutating and to mark the model dirty, and now does so on the
  active document's own bundle, so undo of an AI mutation stays scoped to that document.
- **Accessibility and UX:** no visible UI is added or removed in this issue. Empty state
  (`EmptyCanvas`), loading state, dirty indicators, discard confirmation, window title, and
  status bar text must be byte-identical before and after. Focus and keyboard behavior are
  unchanged; step 2 must not alter handle visibility during connection drags
  (`shared-handles.tsx:25`).
- **Observability and evidence:** the PR must include the before/after `grep -rl 'from "@/stores/' src`
  count (expected to stay 51 or change only by the files this plan names), the full targeted
  Vitest output for `src/stores`, the Playwright run for the five regression specs, and a short
  note listing every module-level mutable value that was eliminated. No screenshots are required
  because no pixels change; state that explicitly rather than attaching unrelated captures.

## Verification gate

Targeted, in order, while iterating:

```bash
npx tsc --noEmit
npx biome check .
npx vitest --run src/stores
npx vitest --run src/hooks src/lib src/components
npx playwright test e2e/new-model.spec.ts e2e/save-reopen.spec.ts e2e/dirty-state.spec.ts \
  e2e/canvas-elements.spec.ts e2e/keyboard-shortcuts.spec.ts
```

Final required gate:

```bash
npm run ci:local
```

Because this change touches the canvas, file lifecycle, and keyboard surfaces, also run the
full browser suite before handoff:

```bash
bash scripts/ci-local.sh --e2e
```

Rust is untouched, so no `cargo` work is required beyond what `ci:local` already runs.

## Owner validation

Deterministic checks cannot decide these; each is a plausible-but-wrong outcome this design
could produce:

1. **Silent single-document regression.** Confirm New, Open, Import, template open, Save,
   Save As, Close, undo/redo, autosave, window title, and status bar behave exactly as before
   on desktop and in the browser build. A registry that is technically correct but changes when
   selection clears or when the canvas re-fits is a regression even with green tests.
2. **Isolation that is really amnesia.** Confirm that returning to a document restores its
   canvas, viewport, undo depth, and selection, rather than presenting a clean document. Step 9
   cases 2 and 3 test this, but only an owner can judge whether the restored view "feels" like
   the same document.
3. **Scope rule correctness.** Confirm the document/workspace table matches intent, especially
   `canvasLocked`, panel layout, theme, clipboard, and user settings staying global. If
   `canvasLocked` should be per-document, that is a separate issue, not a silent change here.
4. **AI attribution.** Confirm cancelling an in-flight AI stream on document switch is the
   desired behavior rather than letting it complete in the background, and confirm the
   unsaved-document chat-session sharing limitation is acceptable until `#63`.
5. **Scaffolding judgment.** `activateDocument` has no production caller until `#54` ships. The
   owner should confirm this decomposition (state layer first, tab UI second) is preferred over
   one larger issue, and that `#54` is scheduled next so the API does not sit unused.
6. **Handoff sufficiency.** Confirm that the documented registry API is what `#54`, `#56`, and
   `#63` need, before those issues start.

## Specialist review

- [ ] PR reviewer
- [ ] Slop auditor
- [ ] Security auditor — applies: document identity generation, disposal of closed-document
      state, and the "no credentials in the registry" boundary that `#56` inherits
- [ ] Threat-model expert — applies narrowly: confirm the document model stays an opaque
      payload, that `.thf` output is unchanged, and that document ids never enter the file

## Concurrent-work seams

Contention is expected on these files; the listed mitigation keeps the conflicts mechanical.

| File | Contending issue | Nature and mitigation |
|------|------------------|-----------------------|
| `src/types/threat-model.ts` | `#57` | `#53` makes **no** edits here. The model is opaque; step 9 case 7 proves unknown fields survive. `docs/plans/57-architecture-model.md` states it only appends optional members to existing interfaces and touches no store, so no real overlap is expected. |
| `src/stores/model-store.ts` / `src/stores/model-store-factory.ts` | `#57` | `#53` moves the body into a factory. `docs/plans/57-architecture-model.md` commits to touching no store file; if that changes, the conflict is a wrapper relocation and `#57` re-applies its mutators inside `createModelStore`. |
| `src/stores/canvas-store.ts` / `src/stores/canvas-store-factory.ts` | `#57`, `#58` | Same shape: file split plus dependency injection. Any new node kind added by `#57`/`#58` re-applies inside the factory unchanged. `#58` also reorganizes palette and inspector surfaces, which touch `component-palette.tsx` and `properties-tab.tsx` — both edited in step 2 of this plan. |
| `src/stores/chat-store.ts` | `#61` | `#53` makes **no** edits here, by design. It consumes only the existing `stopGenerating()`, `switchSession(id)`, and `activeSessionId`. `docs/plans/61-ai-conversation-protocol.md` commits to preserving `switchSession` and the other session actions, but it does rework cancellation around the module-level controller at `chat-store.ts:21`. The contract `#53` needs is narrow and should be restated in the `#61` PR: **cancelling must remain callable from outside the chat surface and must leave `isStreaming === false` with no further chunk writes.** |
| `src/components/panels/ai-chat-tab.tsx` | `#61`, `#63` | `#53` adds `activeDocumentId` to one existing effect (`:45-53`). `docs/plans/61-ai-conversation-protocol.md` also edits this file and states the second PR to merge rebases; the two diffs are in different regions (session-binding effect versus fenced-content parsing). |
| `src/stores/settings-store.ts` | none known | `fileSettings` removal is self-contained. |
| `src/hooks/use-file-operations.ts` | `#55`, `#56` | `#53` establishes `createDocument`/`closeDocument`; `#55`/`#56` extend the same call sites for browser storage and export. |
| `docs/knowledge/architecture.md` | `#57`, `#61` | Additive sections; append rather than restructure. |
| `docs/plans/0000-template.md` | `#96` | Template autonomy labels are being renamed to `Automatable`/`HITL`; this plan already uses the new names. |

## Replan log

Append changes; do not rewrite prior decisions.

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-07-21 | Initial plan | Issue `#53`, parent `#48`, roadmap Phase 1, and repository evidence read at commit `e6a721d`: seven stores in `src/stores/`, 51 of 143 `src/` files importing `@/stores/`, module-level mutable state at `model-store.ts:66-68` and `canvas-store.ts:158-214`, `fileSettings` in `settings-store.ts:14` with no production reader, `filePath`-keyed chat storage at `chat-store.ts:33`, `path: file.name` at `browser-file-adapter.ts:60`, and viewport push limited to the `pendingLayout` branch at `dfd-canvas.tsx:119-127`. |
| 2026-07-21 | Steps 9–10 delivered on branch `test/53-isolation-suite` (base `999d77e`) | Step 9: the ten-case isolation suite exists and is traceable. Cases 1–7 and 9 live in `src/stores/document-registry.test.ts` (case 8 pre-exists in `src/hooks/use-file-operations.test.ts`; case 10 is the new `src/components/layout/status-bar.test.tsx`), each carrying a plan-case → test-name mapping. Discrimination proven by temporarily sharing one history store (fails cases 1, 2, 5, 9) and one element-id counter (fails cases 2, 3, 4), both reverted. Step 10: `docs/knowledge/architecture.md` gains ADR-010 and a "Document registry and per-document state scope" section with the scope table, module graph, and `#54`/`#55`/`#56`/`#63` handoff seams. **Deviation:** steps 6–8 (`#127`) were not yet merged into the branch base, so the step-9 suite validates the state-layer contract that steps 1–5 provide; `#53` cannot fully close until `#127` (session-ownership UI wiring) also merges. |
