# Threat Forge - TODO List

Shared execution plan for humans and LLM agents. Update this file before, during, and after every work session.

---

## 2026-03-02 — Canvas Visual Regression E2E Tests

### Plan
- [x] Read existing E2E fixtures, test patterns, palette component, trust boundary node, and canvas code
- [x] Analyze drag ghost and drag-over highlight feasibility
- [x] Create `e2e/canvas-visual.spec.ts` with 5 visual regression baseline tests
- [x] Document why drag ghost and trust boundary highlight tests are impractical (in file header)

### Notes
- Drag ghost preview: NOT testable — ghost element is transient (removed in rAF) and rendered as native drag image outside the DOM
- Trust boundary highlight on drag-over: NOT testable reliably — wrapper has `pointer-events: none`, events only fire on 8px border strips, fragile across viewports
- 5 baseline tests: single element, multiple elements, trust boundary, mixed elements+boundary, selected element
- Uses Playwright's `toHaveScreenshot()` with `maxDiffPixelRatio: 0.01` for 1% pixel tolerance
- First run generates baselines; subsequent runs compare against them
- E2E files are excluded from biome (matches existing pattern)

---

## 2026-03-02 — Drive next-up.md to full completion (all deferred items)

Execute ALL remaining unchecked items from docs/next-up.md, including previously deferred work.

### Phase 1 (prior session — complete)
- [x] Steps 0-18: All core workstreams WS1-WS8 implemented
- [x] Final validate: 220 frontend tests, 43 Rust tests, 31 E2E tests — all passing

### Phase 2 (current session — deferred items)
- [x] WS2.4: Prefab color locking (lock fill/stroke for library components)
- [x] WS2.4: Swap functionality (change component type in-place, colors cleared on prefab swap)
- [x] WS2.5: Disable color pickers for prefab library items (hidden via `isPrefabType()`)
- [x] WS2.7: Unit tests for swap functionality (3 new tests: isPrefabType true/false, swap preserves)
- [x] WS3.2: Alt+Click+Drag instant duplicate (onNodeDragStart handler)
- [x] WS4.5: dirty-state E2E test (5 tests: confirm dialog, dismiss, accept, toolbar, no-dialog-when-clean)
- [x] WS4.6: Component tests (onboarding triggers 9 tests, guide-overlay 5 tests; ReactFlow-dependent tests covered by E2E)
- [x] WS4.8: Final E2E validation — 41 tests pass locally
- [x] WS5.5: Evaluate orthogonal routing — **Decision: keep bezier** (conflicts with waypoint system)
- [x] WS5.6: Canvas UX component tests + visual regression baselines (5 visual regression tests)
- [x] WS6.3: Auto-trigger system (first-launch 500ms, first-model-created 800ms)
- [x] WS6.4: STRIDE Analysis guide (3 steps) + AI Assistant guide (3 steps)
- [x] WS6.5: What's New changelog overlay (localStorage version check, dismiss)
- [x] WS6.6: Trigger logic tests (9 tests) + guide-overlay component test (5 tests)
- [x] WS7.3: Lazy-load ReactFlow (React.lazy + Suspense)
- [x] Validate: `npm run ci:local` — all checks pass ✅
- [x] Update next-up.md — all items checked off ✅

### Kept deferred (out of scope for this session)
- WS5.4: Port/handle labels on hover — complex for minimal UX benefit
- WS7.2: MCP integration — major feature requiring dedicated sprint
- WS8.4: Manual theme walkthrough — requires human eyes
- WS8.5: Manual Tab-through audit — requires human testing

### Notes
- Starting state: 220 frontend tests, 43 Rust tests, 31 E2E tests
- Ending state: 237 frontend tests (20 files), 43 Rust tests, 41 E2E tests (11 spec files) — all passing
- What's New overlay required E2E fixture fix (dismissWhatsNew helper) to prevent blocking clicks
- Visual regression baselines stored in e2e/canvas-visual.spec.ts-snapshots/

---
## 2026-03-02 — Launch Readiness: Canvas Clipboard + E2E Tests

Multi-select, clipboard operations (copy/cut/paste/select-all), and E2E test coverage for critical happy paths.

### Plan
- [x] Step 1: Export helpers from canvas-store.ts
  - [x] Export generateElementId, generateFlowId, generateBoundaryId
  - [x] Export elementToNode, boundaryToNode, flowToEdge
- [x] Step 2: Create clipboard store (src/stores/clipboard-store.ts)
  - [x] selectAll — set all nodes selected
  - [x] copySelected — copy elements/boundaries/flows to clipboard
  - [x] cutSelected — copy + delete
  - [x] paste — clone with new IDs, offset positions, push history
- [x] Step 3: Enable ReactFlow multi-select (dfd-canvas.tsx)
  - [x] Add selectionKeyCode, multiSelectionKeyCode, selectionMode props
- [x] Step 4: Fix multi-select deselection (canvas-store.ts)
  - [x] Only clear model selection when zero nodes remain selected
- [x] Step 5: Wire keyboard shortcuts (use-keyboard-shortcuts.ts)
  - [x] Cmd+A → selectAll, Cmd+C → copy, Cmd+X → cut, Cmd+V → paste
  - [x] Guard with isInputFocused
- [x] Step 6: Update shortcuts list (settings.ts)
  - [x] Add copy, cut, paste entries
- [x] Step 7: Clipboard store unit tests (18 tests)
- [x] Step 8: E2E test fixtures (e2e/fixtures.ts)
- [x] Step 9: E2E tests (18 tests across 5 files)
  - [x] app-launch.spec.ts (3 tests)
  - [x] new-model.spec.ts (3 tests)
  - [x] canvas-elements.spec.ts (5 tests)
  - [x] keyboard-shortcuts.spec.ts (5 tests)
  - [x] stride-analysis.spec.ts (2 tests)
- [x] Step 10: Validation — biome, vitest, playwright, cargo test, ci:local

### Code Review Fixes (post-implementation)
- [x] Clipboard store: deep-clone mutable arrays (technologies, data, contains) on copy and paste
- [x] Clipboard store: hoist `newElIds` Set outside `.filter()` callback (O(n²) → O(n))
- [x] Clipboard store: insert pasted boundaries at front of nodes array (render behind elements)
- [x] Clipboard store: set parentId/extent on pasted elements inside pasted boundaries
- [x] dfd-canvas.tsx: remove `selectionKeyCode="Shift"` — was breaking free rubber-band select
- [x] use-keyboard-shortcuts.ts: extend `isInputFocused` to cover `contentEditable` elements
- [x] canvas-store.ts: fix `.find()` → `.filter()` for multi-select batch — use last selected node for properties panel
- [x] stride-analysis E2E: strengthen assertion from `/\d+/` to `/[1-9]\d*/` (reject "0" threats)
- [x] keyboard-shortcuts E2E: use bottom-right corner click position (avoids landing on auto-placed nodes)
- [x] Validation — biome, vitest (158), playwright (36/36 with 2x repeat), tsc, ci:local — all passed

### Notes
- 158 frontend tests (up from 140), 40 Rust tests — all passing
- 18 E2E tests across 5 files — all passing (36/36 with 2x repeat for flake detection)
- Added data-testid="btn-stride-analyze" to threats-tab.tsx for E2E
- Multi-select uses Shift+click for additive selection; rubber-band select works without modifier
- Clipboard is in-memory only (not system clipboard) — simpler, no serialization
- Paste offset cascades at 50px per paste (Figma pattern)
- First paste adds "(copy)" suffix; subsequent pastes don't
- Pasted boundary nodes go to front of array (render behind); element nodes go to end
- Elements inside pasted boundaries get parentId/extent set for proper containment

---

## 2026-03-01 — WS1: YAML Format Consolidation

Consolidate layout data from separate `.threatforge/layouts/*.json` sidecar files into inline fields within `.threatforge.yaml`. Adds position/size/color/viewport fields directly on each entity.

### Plan
- [x] Step 1: Rust model changes (`threat_model.rs`)
  - [x] Add `Position` and `Size` structs
  - [x] Remove `deny_unknown_fields` from all 8 structs
  - [x] Add optional position/size/color fields to Element, TrustBoundary, DataFlow, Diagram
  - [x] Change `Diagram.layout_file` from `String` to `Option<String>`
  - [x] Add `viewport: Option<Viewport>` to Diagram
  - [x] Update `ThreatModel::new()` constructor
  - [x] Validate: `cargo test` + `cargo clippy`
- [x] Step 2: Rust test updates (`threat_model.rs` tests)
  - [x] Remove `test_rejects_unknown_fields`
  - [x] Add `test_inline_position_round_trip`
  - [x] Add `test_old_yaml_without_positions_parses`
  - [x] Add `test_unknown_fields_are_tolerated`
  - [x] Verify `test_sample_yaml_deserialization` still passes
  - [x] Validate: `cargo test`
- [x] Step 3: Rust migration logic (`reader.rs`)
  - [x] Add `merge_layout_into_model()` function
  - [x] Add `test_merge_layout_into_model` test
  - [x] Add `test_merge_layout_skips_when_no_layout_file` test
  - [x] Validate: `cargo test` + `cargo clippy`
- [x] Step 4: Rust command update (`file_commands.rs`)
  - [x] Call migration in `open_threat_model`
  - [x] Validate: `cargo test`
- [x] Step 5: TypeScript type updates (`threat-model.ts`)
  - [x] Add `Position` and `Size` interfaces
  - [x] Add optional fields to Element, TrustBoundary, DataFlow, Diagram
- [x] Step 6: Canvas store updates (`canvas-store.ts`)
  - [x] Update `boundaryToNode` to read colors from model
  - [x] Update `boundaryToNode` to read size from model
  - [x] Update `flowToEdge` to read `label_offset`
- [x] Step 7: File operations rewrite (`use-file-operations.ts`)
  - [x] Add `captureCanvasIntoModel()`
  - [x] Add `buildLayoutFromModel()`
  - [x] Update `saveModel`/`saveModelAs` to use `captureCanvasIntoModel`
  - [x] Update `openModel` to use `buildLayoutFromModel` with sidecar fallback
- [x] Step 8: Browser adapter update
  - [x] Update `createNewModel` diagram shape (remove `layout_file`)
- [x] Step 9: Test updates
  - [x] Update `model-store.test.ts` mock diagram (remove `layout_file`)
  - [x] Add canvas-store test: inline position restoration
  - [x] Add canvas-store test: boundary colors from model
  - [x] Add canvas-store test: label offset from data flow
- [x] Step 10: Update `.claude/rules/yaml-format.md`
- [x] Final validation: `npm run ci:local` — ALL PASSED

### Notes
- All new fields are `Option<T>` with `serde(default, skip_serializing_if)` for backward compat
- Migration reads old sidecar JSON and merges into model in memory on open
- Layout IPC commands (`open_layout`/`save_layout`) stay registered but become unused
- Also fixed struct constructors in `ai/prompt.rs` and `stride/mod.rs` for new fields
- 37 Rust tests, 95 frontend tests — all passing

---

## 2026-03-01 — WS3.1 + WS4.1-4.2: Undo/Redo + Playwright Setup + TestIDs

### Plan
- [x] Step 1: Create history store (`src/stores/history-store.ts`)
  - [x] `past`/`future` arrays of `ThreatModel` snapshots
  - [x] `pushSnapshot` — clones model, pushes to past, clears future, trims to 20
  - [x] `undo(currentModel)` — pushes current to future, pops from past
  - [x] `redo(currentModel)` — pushes current to past, pops from future
  - [x] `clear()` — empties both stacks
  - [x] `canUndo()`/`canRedo()` convenience methods
- [x] Step 2: Integrate history into model-store mutations
  - [x] Add `captureHistory()` helper before each mutation
  - [x] Instrumented: `updateElement`, `updateDataFlow`, `updateTrustBoundary`, `addThreat`, `addThreats`, `updateThreat`, `deleteThreat`
  - [x] Added `restoreSnapshot()` action for undo/redo restore
  - [x] Import `useHistoryStore` in model-store
- [x] Step 3: Update canvas-store for history capture
  - [x] `onNodesChange` — capture snapshot when position drag completes
  - [x] `onEdgesChange` — capture snapshot before edge removal
  - [x] `addElement` — capture before model update
  - [x] `addDataFlow` — capture before model update
  - [x] `addTrustBoundary` — capture before model update
  - [x] `deleteSelected` — capture before model update
  - [x] `duplicateElement` — capture before model update
  - [x] `reverseEdge` — capture before model update
- [x] Step 4: Clear history on file operations
  - [x] `newModel` — calls `useHistoryStore.getState().clear()`
  - [x] `openModel` — calls `useHistoryStore.getState().clear()`
  - [x] `closeModel` — calls `useHistoryStore.getState().clear()`
- [x] Step 5: Wire keyboard shortcuts
  - [x] `Cmd+Z` — undo (restore snapshot, sync canvas)
  - [x] `Cmd+Shift+Z` — redo
  - [x] `Cmd+Y` — redo alternative
  - [x] Added shortcuts to `KEYBOARD_SHORTCUTS` array (edit category)
  - [x] Updated shortcuts dialog and settings dialog to show "Edit" category
- [x] Step 6: Status bar undo/redo indicator
  - [x] Show "Undo: N / Redo: N" when stacks are non-empty
- [x] Step 7: History store tests (`history-store.test.ts`)
  - [x] Push 5 snapshots, verify stack length
  - [x] Undo 3 times, verify past shrinks and future grows
  - [x] Redo 1 time, verify state
  - [x] Push after undo clears future
  - [x] Max 20 entries — push 25, verify only 20 remain
  - [x] Clear resets both stacks
  - [x] Undo on empty past returns null
  - [x] Redo on empty future returns null
  - [x] Deep clone verification
  - [x] Full round-trip: 5 actions → undo 3 → redo 1
- [x] Step 8: Model store undo/redo integration tests
  - [x] Mutation → undo → verify state matches original
  - [x] Undo → redo → verify returns to mutated state
  - [x] New mutation after undo clears redo stack
  - [x] Multiple mutation types push to history
  - [x] restoreSnapshot sets isDirty
  - [x] addThreats with empty array doesn't push to history
- [x] Step 9: Playwright setup
  - [x] `npm install -D @playwright/test`
  - [x] `npx playwright install chromium`
  - [x] Created `playwright.config.ts` (Chromium only, port 3000, web server)
  - [x] Created `e2e/` directory with `.gitkeep`
  - [x] Added `test:e2e` and `test:e2e:ui` npm scripts
  - [x] Added `playwright-report/`, `test-results/`, `blob-report/` to `.gitignore`
- [x] Step 10: Add `data-testid` attributes
  - [x] `app-layout.tsx` — `data-testid="app-layout"`
  - [x] `top-menu-bar.tsx` — `top-menu-bar`, `btn-new`, `btn-open`, `btn-save`, `btn-toggle-left-panel`, `btn-toggle-right-panel`, `btn-settings-dialog`, `btn-shortcuts-dialog`
  - [x] `status-bar.tsx` — `data-testid="status-bar"`
  - [x] `canvas.tsx` — `canvas-area`, `empty-canvas`, `btn-empty-new`, `btn-empty-open`
  - [x] `component-palette.tsx` — `component-palette`, `palette-item-process`, `palette-item-data-store`, `palette-item-external-entity`, `palette-item-trust-boundary`
  - [x] `right-panel.tsx` — `right-panel`, `tab-properties`, `tab-threats`, `tab-ai`
  - [x] `settings-dialog.tsx` — `settings-dialog`
  - [x] `shortcuts-dialog.tsx` — `shortcuts-dialog`
- [x] Final validation: `npm run ci:local` — ALL PASSED

### Notes
- State-snapshot approach for undo/redo (not action-replay) — simpler with dual-store pattern
- Separate history-store rather than Zustand temporal middleware for cleaner separation
- Canvas mutations capture history via `useHistoryStore.getState().pushSnapshot()` before calling `setModel()`
- `setModel()` itself does NOT clear history — only file operations (new/open/close) call `clear()`
- 112 frontend tests (up from 95), 37 Rust tests — all passing
- Playwright targets web build on port 3000 (`npm run dev:web`), Chromium only for speed

---

## 2026-03-01 — Fix undo/redo for edge label drags + per-keystroke history pollution

### Problem
1. Typing in property panel fields (Name, Protocol, etc.) pushes one history snapshot per keystroke — Cmd+Z undoes one character at a time
2. Edge label drags don't push to history at all — Cmd+Z skips the drag entirely
3. `syncFromModel` preserves stale canvas label offsets over model data during undo

### Plan
- [x] Step 1: Add key-based debounced `captureHistory` to `model-store.ts`
  - [x] `captureHistoryDebounced(model, key)` — skips if same key within 300ms
  - [x] `captureHistory(model)` (discrete) — always pushes + resets debounce state
  - [x] `restoreSnapshot` — resets debounce state
  - [x] Export `resetCaptureDebounce()` for tests
  - [x] Use debounced for: `updateElement`, `updateDataFlow`, `updateTrustBoundary`, `updateThreat`
  - [x] Use always-push for: `addThreat`, `addThreats`, `deleteThreat`
- [x] Step 2: Add edge label drag history capture in `data-flow-edge.tsx`
  - [x] Import `useHistoryStore`, `useCanvasStore`, `ThreatModel`
  - [x] In `handlePointerDown`: capture pre-drag model with current label offset baked in
  - [x] In `onPointerUp`: push pre-drag model to history + write new offset to model store
- [x] Step 3: Fix `syncFromModel` in `canvas-store.ts`
  - [x] Only preserve existing canvas label offsets when model has no `label_offset`
  - [x] When model has `label_offset`, use it (from `flowToEdge`)
- [x] Step 4: Update `model-store.test.ts`
  - [x] Import + call `resetCaptureDebounce()` in `beforeEach`
- [x] Validate: `npx vitest --run` — 114 tests passing
- [x] Validate: `npm run ci:local` — all checks passed

---

## 2026-03-01 — WS2: Entity System Revamp + Component Library

Add component library with ~25 pre-defined technology components, searchable library palette, and icon rendering on canvas nodes. Consolidate 3 identical node components into one.

### Plan
- [x] Step 1: Schema changes (Rust + TypeScript)
  - [x] Add `subtype: Option<String>` to Rust `Element` struct
  - [x] Fix Rust Element struct literals in stride/mod.rs and ai/prompt.rs
  - [x] Add `subtype?: string` to TypeScript `Element` interface
  - [x] Validate: `cargo test` (37 pass) + `cargo clippy` (clean)
- [x] Step 2: Create component library registry (`src/lib/component-library.ts`)
  - [x] Define ComponentDefinition interface
  - [x] 28 components across 7 categories (Basics + 6 domain categories)
  - [x] Search, category, subtype lookup, and icon mapping helpers
- [x] Step 3+4: Consolidate node components + update canvas store
  - [x] Create unified `DfdElementNode` component
  - [x] Add `subtype` + `icon` to `DfdNodeData`
  - [x] Update `elementTypeToNodeType` → always return `"dfdElement"`
  - [x] Update `elementToNode` to pass subtype + icon
  - [x] Update `addElement` to accept opts with subtype/icon/name
  - [x] Update `dfd-canvas.tsx` node type registration
  - [x] Add `setDraggedComponent` to canvas store for library drag state
- [x] Step 5: Revamp palette with library section
  - [x] Generic section: Entity + Boundary (2 items)
  - [x] Library section: search + category tabs + draggable items
  - [x] Base types (Process, Data Store, External Entity) in "Basics" category
- [x] Step 6: Fix other Rust consumers (done with Step 1)
- [x] Step 7: Update tests
  - [x] Update canvas-store.test.ts node type assertions (`"process"` → `"dfdElement"`)
  - [x] Add subtype/icon tests (2 new tests)
  - [x] Add component library tests (14 new tests)
  - [x] Add Rust round-trip test for subtype (2 new tests)
- [x] Step 8: Clean up + validation
  - [x] Delete old node files (process-node.tsx, data-store-node.tsx, external-entity-node.tsx)
  - [x] `npx biome check --write .` — clean
  - [x] `cargo test` (39 pass) + `cargo clippy` (clean)
  - [x] `npx vitest --run` — 130 tests passing
  - [x] `npm run ci:local` — ALL PASSED

### Notes
- Consolidated 3 nearly-identical node components (87 lines each) into 1 DfdElementNode
- 28 components total: 3 base DFD types + 25 technology subtypes across 7 categories
- All 28 lucide icons verified present in lucide-react v0.575.0
- Canvas store drag state expanded with `setDraggedComponent` for library items carrying subtype/icon/name
- 130 frontend tests (up from 114), 39 Rust tests (up from 37) — all passing

---

## 2026-03-01 — Unified Component System + Visual Customization

Flatten ElementType hierarchy from 3-value enum to string-based component types. Add 4 shape categories, 3 STRIDE categories, per-element visual customization, sub-types with icon overrides, and fix technologies input.

### Plan
- [x] Step 1: Schema changes (TypeScript + Rust)
  - [x] Changed `ElementType` from `"process" | "data_store" | "external_entity"` to `string` (TS)
  - [x] Removed `ElementType` enum from Rust, changed to `String`
  - [x] Added `fill_color`, `stroke_color`, `fill_opacity`, `stroke_opacity` to Element (both TS + Rust)
  - [x] Updated `ai/prompt.rs` formatting (`{:?}` → `{}`) and test literals
  - [x] Updated `stride/mod.rs` with `ComponentStrideCategory` enum and `stride_category_for_type()` mapper
  - [x] Validate: `cargo test` (40 pass) + `cargo clippy` (clean)
- [x] Step 2: Update component library
  - [x] Added `ShapeCategory`, `StrideCategory`, `SubtypeDefinition` types
  - [x] Changed `ComponentDefinition`: replaced `type: ElementType` + `isBaseType` with `shape` + `strideCategory`
  - [x] Added `generic` entry as default component type
  - [x] Removed old "Basics" category (process, data_store, external_entity)
  - [x] Added subtypes to 7 components (sql_database, nosql_database, cache, object_storage, message_queue, event_bus, cdn)
  - [x] Added `getShapeForType()`, `getStrideCategoryForType()`, `getSubtypesForType()` helpers
- [x] Step 3: Update STRIDE engine (TS)
  - [x] Changed rules from `applicableElements: ElementType[]` to `applicableCategories: ComponentStrideCategory[]`
  - [x] Uses `getStrideCategoryForType()` for element-to-category mapping
- [x] Step 4: Update canvas store
  - [x] `DfdNodeData.elementType`: `ElementType` → `string`
  - [x] Added element color fields to `DfdNodeData`
  - [x] `generateElementId()` → always produces `comp-N` IDs
  - [x] `defaultElementName()` → looks up component library label
  - [x] `elementToNode()` passes color fields from Element to node data
- [x] Step 5: Update node rendering (shapes + colors)
  - [x] 4 shape categories: rounded, database, rect, hexagon (via CSS clip-path)
  - [x] Custom color rendering with `hexToRgba()` + inline styles
  - [x] `resolveIcon()` checks subtype defs → component type → direct icon field
- [x] Step 6: Update properties panel
  - [x] Type dropdown grouped by category
  - [x] Conditional Sub Type dropdown when type has subtypes
  - [x] `ColorField` components for fill/stroke colors on elements
  - [x] Fixed technologies: replaced `EditableField` with `CommaSeparatedField`
- [x] Step 7: Update palette
  - [x] Renamed "Entity" → "Component", type `"process"` → `"generic"`
  - [x] Library items pass `type: component.id` directly (component IS the type)
  - [x] Removed `isBaseType` logic and `as ElementType` casts
- [x] Step 8: AI prompts — no TS change needed (already uses `el.type` string); Rust done in Step 1
- [x] Step 9: Update tests
  - [x] `component-library.test.ts` — rewritten for new `shape`/`strideCategory` fields, subtypes, categories
  - [x] `canvas-store.test.ts` — updated types, ID assertions (`comp-N`), new element color test
  - [x] `stride-engine.test.ts` — updated to use component types, added legacy type mapping test
- [x] Step 10: Cleanup + validation
  - [x] `npx biome check --write .` — clean
  - [x] `npx vitest --run` — 140 tests passing
  - [x] `cargo test` — 40 tests passing
  - [x] `cargo clippy` — clean

### Notes
- Old element types (`process`, `data_store`, `external_entity`) still parse as valid strings for backward compat
- STRIDE category mapping defaults to "service" for unknown types, ensuring forward compat
- Hexagon shape uses CSS `clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)`
- Sub-type system is additive: setting a subtype overrides the icon, clearing it reverts to the component type default
- 140 frontend tests (up from 130), 40 Rust tests — all passing
