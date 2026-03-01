# Threat Forge - TODO List

Shared execution plan for humans and LLM agents. Update this file before, during, and after every work session.

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
