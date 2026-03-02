# ThreatForge — Next Up

Comprehensive task list for all remaining work. Organized into parallelizable workstreams with explicit dependencies, pre-requisites, and validation steps.

**Generated:** 2026-03-01
**Based on:** `docs/todo.md`, `docs/todo-archive-001.md`, full codebase audit

---

## Status Summary

### Current Test Counts (as of 2026-03-02)

- 220 frontend tests across 18 files — all passing
- 43 Rust tests — all passing
- 31 E2E tests across 9 files — all passing
- Biome, tsc, clippy, rustfmt — all clean
- `npm run ci:local` — passing

### Completed Workstreams

- **WS1** — YAML format consolidation (inline positions, no sidecar JSON)
- **WS2** — Entity system revamp + component library (28 typed components, 4 shapes, subtypes)
- **WS3** — Keyboard/navigation (undo/redo, copy/paste, 27 shortcuts, Cmd+K command palette)
- **WS4** (mostly) — Testing infrastructure (Playwright setup, E2E tests, component RTL tests, CI integration)
- **WS5** (mostly) — Canvas UX polish (drag ghost, drop zone highlight, connected node glow)
- **WS6** — Onboarding system (store, overlay, tooltip, guide picker, 2 guides, 15 store tests)
- **WS7** (mostly) — Platform features (native menus, SEO meta/OG/JSON-LD/robots/sitemap)
- **WS8** — Code quality (AI settings migration, file-scoped settings, autosave tests, theme/a11y audit)

### Deferred Items (not blocking launch)

- 4.8 Final E2E validation (Docker + CI environments)
- 5.4 Port/handle labels on hover
- 5.5 Evaluate orthogonal routing
- 5.6 Canvas UX component tests + visual regression baselines
- 6.4 STRIDE Analysis guide + AI Assistant guide
- 6.5 "What's New" changelog overlay
- 7.2 MCP integration (dedicated sprint)
- 8.4 Manual theme visual walkthrough
- 8.5 Manual Tab-through accessibility audit

---

## Dependency Map

```
Workstream 1 (YAML Format) ──> Workstream 2 (Entity System + Library) ──> Workstream 6 (Onboarding)
                                     ↑ WS2 should integrate with WS3.1 history store for undo/redo
Workstream 3 (Keyboard/Nav) ──────── independent, start anytime (WS3.1 ideally before WS2)
Workstream 4 (Testing) ──────────── runs in parallel with everything
Workstream 5 (Canvas Polish) ─────── independent, start anytime
Workstream 7 (Platform) ──────────── independent, start anytime
Workstream 8 (Code Quality) ──────── independent, start anytime
```

---

## Workstream 1: YAML Format Consolidation

**Goal:** Move ALL model data (including positions, colors, sizes) into the single `.threatforge.yaml` file for complete portability.

**Pre-requisites:** None — this is a foundational architecture change that should happen first.

**Why first:** This changes file I/O, store sync, Rust serialization, and the adapter layer. Other workstreams (entity system, command bar, E2E tests) should build on top of the final format.

### Tasks

- [x] 1.1 Design the consolidated YAML schema
  - [x] Add `position: { x, y }` to each element in the YAML
  - [x] Add `size: { width, height }` to trust boundaries
  - [x] Add `label_offset: { x, y }` to data flows (for dragged edge labels)
  - [x] Add visual properties to elements: `fill_color`, `stroke_color`, `fill_opacity`, `stroke_opacity`
  - [x] Add `diagrams[].viewport: { x, y, zoom }` for saved viewport state
  - [x] Decide: keep layout data inline under each element, or add a top-level `layout:` section — **Decision: inline under each element**
  - [x] Document the new schema in `docs/yaml-schema.md` or update the CLAUDE.md YAML section — **Updated `.claude/rules/yaml-format.md`**
  - **Validation:** ✅ Round-trip tests in Rust confirm clean serialization

- [x] 1.2 Update Rust types and serialization
  - [x] Add position/size/color fields to `Element`, `TrustBoundary`, `DataFlow` in `src-tauri/src/models/threat_model.rs`
  - [x] Use `#[serde(default)]` on all new fields for backward compatibility with existing files
  - [x] **Important:** Removed `deny_unknown_fields` from all 8 structs
  - [x] Remove or deprecate the separate `DiagramLayout` struct and `layouts/*.json` path — **Layout IPC commands stay registered but unused; migration reads old sidecar**
  - [x] Remove `pendingLayout` field from `canvas-store.ts` if it exists — **Still used for undo/redo layout restoration**
  - [x] Update `file_io/reader.rs` and `file_io/writer.rs` to handle the consolidated format
  - [x] Update `commands/file_commands.rs` — remove layout-only read/write commands if no longer needed
  - [x] Add migration logic: if opening an old file + matching layout JSON exists, merge positions into the model
  - **Validation:** ✅ `cargo test` — 40 tests pass, round-trip tests added

- [x] 1.3 Update TypeScript types and stores
  - [x] Update `src/types/threat-model.ts` to add position/size/color fields
  - [x] Update `canvas-store.ts` `syncFromModel()` — read positions from model elements instead of separate layout
  - [x] Update layout capture in `use-file-operations.ts` — `captureCanvasIntoModel()` writes positions back into model
  - [x] Update `model-store.ts` — layout integrated into model
  - [x] Update `use-file-operations.ts` — sidecar fallback on open, consolidated save
  - [x] Update browser file adapter — remove layout handling
  - [x] Update tauri file adapter — remove layout handling
  - **Validation:** ✅ `npx vitest --run` — 158 tests pass

- [x] 1.4 Update `.claude/rules/yaml-format.md` to reflect the new structure
  - **Validation:** ✅ Rule file reflects inline positions, documents legacy sidecar deprecation

- [x] 1.5 End-to-end validation
  - [x] Create a model with 5+ elements, flows, boundaries — save — reopen — verify all positions, colors, sizes restored
  - [x] Open an old-format file (with separate layout JSON) — verify migration works — save — verify consolidated format
  - [x] Commit the saved YAML to git, make edits (move element, add threat), verify diffs are clean
  - **Validation:** ✅ `npm run ci:local` passes

---

## Workstream 2: Entity System Revamp + Component Library

**Goal:** Replace the current 4-type palette (Process, Data Store, External Entity, Trust Boundary) with a 2-type system (Entity + Boundary) where entity sub-types are set via properties, and add an extensive searchable library of pre-crafted technology components with icons.

**Pre-requisites:**
- Workstream 1 (YAML format) should be done or at least the schema finalized, since entity sub-types and icon references go into the YAML. Note: element color fields (`fill_color`, `stroke_color`, etc.) are added in WS1 — WS2 only adds `subtype` and `icon`.
- Workstream 3.1 (undo/redo) should ideally be done first, so entity CRUD actions integrate with the history store from the start.

### Tasks

- [x] 2.1 Design the entity sub-type system
  - [x] Define all entity sub-types — 28 components across 7 categories (Cloud, Databases, Messages, Frontend, Security, DevOps, Generic)
  - [x] Map each sub-type to a shape variant — 4 shape categories: `rounded`, `database`, `rect`, `hexagon`
  - [x] Define how sub-type changes affect the YAML `type` field — flattened to string-based `type` field (component IS the type), separate `subtype` for sub-variants
  - [x] Define which properties are editable for pre-fabricated items vs custom entities — **Deferred: all entities allow full editing; prefab color locking not implemented**
  - **Validation:** ✅ 28 components with lucide icons verified

- [x] 2.2 Build the icon library infrastructure
  - [x] Created `src/lib/component-library.ts` with full registry
  - [x] `ComponentDefinition` interface: `id`, `name`, `category`, `icon` (lucide-react component), `shape`, `strideCategory`
  - [x] 7 categories: Cloud, Databases, Messages, Frontend, Security, DevOps, Generic
  - [x] Uses lucide-react icons (monochrome, consistent style)
  - [x] `searchComponents()`, `getComponentsByCategory()`, `getIconComponent()` helpers
  - **Validation:** ✅ 14 unit tests for library search, categories, and lookups

- [x] 2.3 Revamp the left palette UI
  - [x] Split into two sections: **top** = Component + Boundary drag items; **bottom** = Library
  - [x] Library section: category tabs (All + 6 domain categories)
  - [x] Below tabs: searchable grid of pre-crafted components with icons and names
  - [x] Search bar at top of library section (fast search across name)
  - [x] Category tab filtering; `All` shows everything
  - [x] Double-click on any library item adds it to canvas
  - [x] Drag-and-drop from library to canvas supported
  - **Validation:** ✅ E2E tests verify palette interaction

- [x] 2.4 Update node rendering for entity sub-types — **partially complete**
  - [x] Unified `DfdElementNode` component (consolidated 3 identical node components into 1)
  - [x] Render icon from component library on node
  - [ ] For pre-fabricated items: lock fill/stroke color — **Deferred**
  - [x] For custom entities: full property editing (color, type, label)
  - [ ] Implement "swap" functionality — **Deferred**
  - [x] All entity CRUD operations push to undo/redo history
  - **Validation:** ✅ Icons render on nodes; undo/redo works

- [x] 2.5 Update properties panel for entity sub-types — **partially complete**
  - [x] Type dropdown grouped by category
  - [x] Conditional Sub Type dropdown when type has subtypes
  - [x] Fill/stroke color pickers (ColorField components)
  - [ ] Disable color pickers for pre-fabricated library items — **Deferred**
  - [x] Show component icon in properties panel
  - **Validation:** ✅ Type/subtype/color editing works end-to-end

- [x] 2.6 Update YAML schema for entity sub-types
  - [x] Added `subtype` field to `Element` (Rust + TypeScript)
  - [x] Added `icon` field to `Element`
  - [x] Updated Rust serde types + TypeScript types
  - **Validation:** ✅ Round-trip tests pass (Rust + frontend)

- [x] 2.7 Testing — **partially complete**
  - [x] Unit test icon registry: 14 tests for library search, categories, lookups
  - [x] Unit test sub-type to shape mapping
  - [ ] Unit test swap functionality — **Deferred (swap not implemented)**
  - [x] Verify entity operations are undoable
  - [x] Update existing canvas-store tests for new entity structure
  - **Validation:** ✅ 158 frontend tests, 40 Rust tests pass

---

## Workstream 3: Keyboard, Navigation & Command System

**Goal:** Full keyboard-driven UX with undo/redo, copy/paste, Cmd+K command palette, and panel toggle shortcuts.

**Pre-requisites:** None — can start immediately. However, undo/redo is a significant system that affects the store layer.

### Tasks

- [x] 3.1 Implement undo/redo system (20-action history)
  - [x] **Architecture decision:** State-snapshot approach (not action-replay)
  - [x] Created `src/stores/history-store.ts` with `pushSnapshot`, `undo`, `redo`, `clear`
  - [x] Max 20 entries (oldest dropped when full), `structuredClone()` for deep copies
  - [x] `undo()` restores previous model snapshot; `redo()` restores next snapshot
  - [x] Wired `Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`, `Cmd/Ctrl+Y`
  - [x] Status bar shows "Undo: N / Redo: N" when stacks non-empty
  - [x] Canvas-store syncs after undo/redo via `syncFromModel()`
  - [x] Debounced capture for text field edits (300ms, key-based)
  - **Validation:** ✅ 10 unit tests + 6 integration tests pass

- [x] 3.2 Implement copy/cut/paste for canvas elements
  - [x] `Cmd/Ctrl+C` — copy selected node(s) to internal clipboard (Zustand, not system clipboard)
  - [x] `Cmd/Ctrl+X` — cut (copy + delete)
  - [x] `Cmd/Ctrl+V` — paste at offset from original, with new IDs, cascading 50px offsets
  - [x] Flows between copied elements are preserved with new IDs
  - [ ] `Option/Alt+Click+Drag` — instant duplicate — **Deferred**
  - **Validation:** ✅ 18 unit tests + E2E tests pass

- [x] 3.3 Add remaining keyboard shortcuts
  - [x] `Cmd/Ctrl+A` — select all elements on canvas
  - [x] `Cmd/Ctrl+B` — toggle left panel
  - [x] `Cmd/Ctrl+I` — toggle right panel
  - [x] `Cmd/Ctrl+Shift+I` — open AI tab in right panel
  - [x] `Cmd/Ctrl+0` — fit canvas to view (via ReactFlow actions stored in canvas-store)
  - [x] `+` / `-` and `Cmd/Ctrl+=` / `Cmd/Ctrl+-` — zoom in/out
  - [x] Arrow keys when element selected — nudge element by 16px grid
  - [x] `Cmd/Ctrl+Shift+L` — lock/unlock canvas (nodesDraggable, nodesConnectable, elementsSelectable)
  - [x] `Cmd/Ctrl+D` (duplicate) and `Delete`/`Backspace` (delete) integrated with undo/redo
  - **Validation:** ✅ KEYBOARD_SHORTCUTS array updated (26 shortcuts); `npx vitest --run` passes; `npx tsc --noEmit` clean

- [x] 3.4 Build Cmd+K command palette
  - [x] Created `src/components/command-palette.tsx` — Spotlight-style overlay with backdrop
  - [x] Created `src/lib/command-registry.ts` — registry with `buildCommands()`, `fuzzyMatch()`, `searchCommands()`
  - [x] Command types: `file` (4), `view` (5), `canvas` (2), `navigate` (3), `settings` (2) — 16 total commands
  - [x] Fuzzy search across command labels + IDs
  - [x] Keyboard navigation: ArrowUp/Down to move, Enter to execute, Escape to close
  - [x] Commands grouped by category when displayed
  - [x] Wired `Cmd/Ctrl+K` in use-keyboard-shortcuts.ts; state in ui-store (commandPaletteOpen)
  - **Validation:** ✅ 15 unit tests pass; `npx tsc --noEmit` clean; 173 frontend tests total

- [x] 3.5 Testing
  - [x] Unit test undo/redo: 10 history-store tests + 6 model-store integration tests
  - [x] Unit test copy/paste: 18 clipboard-store tests
  - [x] Unit test command registry: 15 tests (fuzzyMatch, buildCommands, searchCommands)
  - **Validation:** ✅ `npx vitest --run` passes; 27 shortcuts listed in shortcuts dialog

---

## Workstream 4: Testing Infrastructure

**Goal:** Comprehensive test coverage — component tests, E2E tests, visual regression baseline.

**Pre-requisites:** None — can start immediately and run in parallel with all other workstreams. Should start early to catch regressions.

### Tasks

- [x] 4.1 Set up Playwright infrastructure
  - [x] `npm install -D @playwright/test`
  - [x] `npx playwright install chromium` (Chromium only for local speed)
  - [x] Created `playwright.config.ts` (testDir: "e2e", webServer port 3000, screenshots/traces/video on failure)
  - [x] Created `e2e/` directory
  - [x] Added `test:e2e` and `test:e2e:ui` npm scripts
  - [x] Added `playwright-report/`, `test-results/`, `blob-report/` to `.gitignore`
  - **Validation:** ✅ `npx playwright test` runs successfully

- [x] 4.2 Add `data-testid` attributes to critical UI elements
  - [x] `app-layout`, `top-menu-bar`, `canvas-area`, `empty-canvas`, `status-bar`
  - [x] `btn-new`, `btn-open`, `btn-save`, `btn-toggle-left-panel`, `btn-toggle-right-panel`
  - [x] `btn-settings-dialog`, `btn-shortcuts-dialog`, `btn-stride-analyze`
  - [x] `component-palette`, `library-search`, `palette-item-*`
  - [x] `right-panel`, `tab-properties`, `tab-threats`, `tab-ai`
  - [x] `settings-dialog`, `shortcuts-dialog`
  - [x] `btn-empty-new`, `btn-empty-open`
  - **Validation:** ✅ 20+ testid attributes across all major UI components

- [x] 4.3 Create E2E test utilities
  - [x] Created `e2e/fixtures.ts` with `modKey`, `createModel()`, `addPaletteItem()`, re-exported `test`/`expect`
  - **Validation:** ✅ Fixtures compile and used by all spec files

- [x] 4.4 Write core E2E tests (top 5 workflows) — **5 of 5 complete**
  - [x] `e2e/new-model.spec.ts` — new model creation, canvas active, counts at 0 (3 tests)
  - [x] `e2e/canvas-elements.spec.ts` — add elements, verify on canvas, palette interaction (5 tests)
  - [x] `e2e/element-editing.spec.ts` — select node, verify properties panel, edit fields, verify canvas label (4 tests) ✅
  - [x] `e2e/stride-analysis.spec.ts` — STRIDE analysis workflow (2 tests)
  - [x] `e2e/save-reopen.spec.ts` — save triggers YAML download, model state includes elements, edited names persist (3 tests) ✅
  - **Additional:** `e2e/app-launch.spec.ts` (3 tests), `e2e/keyboard-shortcuts.spec.ts` (5 tests)
  - **Validation:** ✅ 31 tests across 9 spec files pass

- [x] 4.5 Write edge case E2E tests — **4 of 5 complete**
  - [x] `e2e/keyboard-shortcuts.spec.ts` — undo/redo, dialog shortcuts, escape ✅
  - [x] `e2e/empty-states.spec.ts` — Verify empty states in threats tab, properties tab, canvas, AI tab (4 tests) ✅
  - [x] `e2e/ai-chat.spec.ts` — AI tab no-API-key message, settings gear opens dialog at AI section (2 tests) ✅
  - [ ] `e2e/dirty-state.spec.ts` — Make edits — try new model — verify unsaved changes prompt — **Deferred: browser adapter uses window.confirm which is hard to test reliably**
  - [ ] `e2e/delete-operations.spec.ts` — covered by canvas-elements.spec.ts delete test
  - **Validation:** ✅ 31 E2E tests pass across 9 spec files

- [x] 4.6 Write component tests (React Testing Library) — **4 of 8 complete**
  - [x] `src/components/panels/settings-dialog.test.tsx` — Render, navigate tabs, toggle settings, Escape close, reset defaults (9 tests) ✅
  - [x] `src/components/ui/keytip.test.tsx` — Renders shortcut text (2 tests) ✅
  - [x] `src/hooks/use-autosave.test.ts` — Debounce timing, dirty flag, skip when no filePath (8 tests) ✅
  - [x] `src/components/canvas/canvas-context-menu.test.tsx` — Menu rendering, click actions, Escape/click-outside close, builder functions (8 tests) ✅
  - [ ] `src/components/panels/properties-tab.test.tsx` — Render with element, edit fields, verify store updates — **Deferred: complex multi-store setup**
  - [ ] `src/components/canvas/nodes/process-node.test.tsx` — Inline label editing — **Deferred: ReactFlow render context needed**
  - [ ] `src/components/canvas/edges/data-flow-edge.test.tsx` — Edge label inline editing — **Deferred: ReactFlow render context needed**
  - [ ] Integration test: settings persistence across remount — **Deferred: covered by settings-store.test.ts**
  - **Validation:** ✅ `npx vitest --run` — 200 tests pass across 17 files

- [x] 4.7 Integrate E2E into CI
  - [x] Update `Dockerfile.ci` — add `npx playwright install --with-deps chromium` ✅
  - [x] Update `scripts/ci-local.sh` — add optional `--e2e` flag ✅
  - [x] Add `e2e` job to `.github/workflows/ci.yml` (depends on `test`, uploads Playwright report on failure) ✅
  - [x] Docker compose works with `--e2e` flag via existing CMD
  - **Validation:** ✅ ci-local.sh, Dockerfile.ci, and ci.yml all updated

- [ ] 4.8 Final E2E validation
  - [ ] Run full E2E suite locally (`npx playwright test`) and verify all tests pass
  - [ ] Run E2E suite in Docker (`npm run ci:docker`) and verify it works headless
  - [ ] Verify CI pipeline correctly runs E2E tests and uploads artifacts on failure
  - **Validation:** All three environments (local, Docker, CI) pass E2E suite

---

## Workstream 5: Canvas UX Polish

**Goal:** Finish deferred canvas improvements for a polished drag-drop and interaction experience.

**Pre-requisites:** None — incremental improvements on the existing canvas.

### Tasks

- [x] 5.1 Drag ghost preview from palette
  - [x] `setDragGhost()` helper creates styled DOM element with component label
  - [x] Uses `setDragImage()` centered on the ghost
  - [x] Ghost cleaned up via `requestAnimationFrame(() => ghost.remove())`
  - **Validation:** ✅ Drag from palette shows styled label preview following cursor

- [x] 5.2 Drop zone highlighting for trust boundaries
  - [x] Trust boundary tracks `isDragOver` state and `isDraggingElement` from canvas store
  - [x] When dragging element over boundary, border/bg shift to signal color
  - [x] Resets on drag leave and drop
  - **Validation:** ✅ Drag element over trust boundary — boundary highlights green — drop/leave — resets

- [x] 5.3 Connected node glow on edge select
  - [x] DfdElementNode subscribes to `edges.some(e => e.selected && connected)`
  - [x] Regular nodes: `ring-2 ring-tf-signal/30` when connected edge selected
  - [x] Hexagon nodes: drop-shadow glow via filter
  - **Validation:** ✅ Click edge — source and target nodes glow — click elsewhere — glow removed

- [ ] 5.4 Port/handle labels on hover — **Deferred: requires per-handle hover state + edge lookup, complex for minimal UX benefit**

- [ ] 5.5 Evaluate orthogonal routing (low priority)
  - [ ] Test `getSmoothStepPath` from ReactFlow as alternative to `getBezierPath` for cleaner orthogonal edge routing
  - [ ] If it improves readability for complex diagrams, offer as a user preference in settings
  - **Validation:** Side-by-side comparison with 10+ element diagram; keep current bezier as default if orthogonal doesn't clearly improve UX

- [ ] 5.6 Testing
  - [ ] Component test: drag ghost renders during drag
  - [ ] Component test: boundary highlights during drag-over
  - [ ] Visual regression baseline: capture Playwright screenshots of canvas with various node/edge configurations for future comparison (closes todo.md "Visual regression test: verify node/edge renders haven't changed unexpectedly")
  - **Validation:** `npx vitest --run` passes; screenshot baseline saved

---

## Workstream 6: Onboarding & Help System

**Goal:** Guided tours for new users and contextual help for features.

**Pre-requisites:** Workstream 2 (entity system) should be at least designed, so guides reference the correct UI. Can start the framework before WS2 is complete.

### Tasks

- [x] 6.1 Design and build the onboarding framework
  - [x] Create `src/types/onboarding.ts`: `OnboardingStep` (targetSelector, title, content, placement), `OnboardingGuide` (id, name, steps, showOnce) ✅
  - [x] Create `src/stores/onboarding-store.ts`: tracks completedGuideIds, activeGuide, activeStepIndex, dismissedGuideIds; persists to localStorage; actions: startGuide, nextStep, prevStep, dismissGuide, resetGuide, resetAll ✅
  - [x] Create `src/lib/onboarding/guides.ts` with WELCOME_GUIDE (4 steps) and DFD_BASICS_GUIDE (3 steps) ✅
  - **Validation:** ✅ Types compile; 15 store unit tests pass

- [x] 6.2 Build overlay UI components
  - [x] `src/components/onboarding/guide-overlay.tsx` — SVG mask spotlight with dimmed background, highlight ring ✅
  - [x] `src/components/onboarding/guide-tooltip.tsx` — positioned tooltip with title, content, step counter, Next/Back/Skip/Done ✅
  - [x] `src/components/onboarding/guide-provider.tsx` — wrapper in AppLayout, listens to store, renders overlay when active ✅
  - [x] `src/components/onboarding/guide-picker.tsx` — dialog listing all guides with completion status ✅
  - [x] Accessibility: auto-focus on tooltip, Escape to dismiss, `role="dialog"`, `aria-label` ✅
  - **Validation:** ✅ Components render; GuideProvider wired into app-layout.tsx

- [x] 6.3 Implement trigger system — **partially complete**
  - [ ] Trigger types: `"first-launch"`, `"first-model-created"` — **Deferred: auto-triggers need careful UX tuning, manual guide picker is sufficient for now**
  - [x] Help button (BookOpen icon) in top menu bar — guide picker dialog listing all available guides ✅
  - **Validation:** ✅ Guide picker opens from top menu, lists all guides with completion status

- [x] 6.4 Create initial guides — **2 of 4 complete**
  - [x] **Welcome guide** (4 steps): canvas area, component palette, properties/analysis panel, save button ✅
  - [x] **DFD Basics guide** (3 steps): add component, trust boundaries, analyze threats ✅
  - [ ] **STRIDE Analysis guide** — **Deferred: needs threats tab-specific selectors**
  - [ ] **AI Assistant guide** — **Deferred: needs AI tab-specific selectors**
  - **Validation:** ✅ Guide selectors reference valid `data-testid` attributes

- [ ] 6.5 Build "What's New" changelog overlay — **Deferred: not needed until first public release**

- [x] 6.6 Testing
  - [x] Unit test onboarding-store: 15 tests covering progression, persistence, dismissal, reset, showOnce, edge cases ✅
  - [ ] Unit test trigger logic — **Deferred: auto-triggers not yet implemented**
  - [ ] Component test guide-overlay — **Deferred: requires DOM measurement mocking**
  - **Validation:** ✅ `npx vitest --run` — 215 tests pass across 18 files

---

## Workstream 7: Platform Features

**Goal:** Native title bar, MCP integration, SEO.

**Pre-requisites:** None — independent of other workstreams.

### Tasks

- [x] 7.1 Native title bar controls
  - [x] Created `src-tauri/src/menu.rs` — native menu with File, Edit, View, Help submenus ✅
  - [x] File: New, Open, Save, Save As, Close — all with standard keyboard accelerators ✅
  - [x] Edit: Undo, Redo, Cut, Copy, Paste, Select All, Delete ✅
  - [x] View: Toggle Palette, Toggle Panel, Zoom In/Out, Fit, Command Palette ✅
  - [x] Help: Keyboard Shortcuts, Guided Tours, About ✅
  - [x] Menu events forwarded to frontend via `menu-action` Tauri event ✅
  - [x] Created `src/hooks/use-native-menu.ts` — listens to Tauri events, dispatches to stores; no-op in web builds ✅
  - [x] Wired `useNativeMenu()` hook into `app-layout.tsx` ✅
  - **Validation:** ✅ `cargo clippy` clean; `cargo test` passes (40); `npx tsc --noEmit` clean

- [ ] 7.2 MCP integration (local MCP server) — **Deferred: requires significant research and design; will be a dedicated sprint**
  - [ ] Research MCP protocol spec for local tool servers
  - [ ] Define ThreatForge MCP tools: `get_model`, `add_element`, `add_flow`, `run_stride`, `add_threat`, `get_threats`, `save_model`
  - [ ] Implement MCP server as Tauri sidecar or embedded HTTP server on localhost
  - [ ] Register MCP server discovery (stdio or SSE transport)
  - [ ] Test with Claude Code / GitHub Copilot as MCP client

- [x] 7.3 SEO optimization (for web build / landing page)
  - [x] Added `<meta>` tags to `index.html`: title, description, og:title, og:description, og:image, twitter:card ✅
  - [x] Added structured data (JSON-LD) for SoftwareApplication schema ✅
  - [x] Updated `<title>` to "ThreatForge — Open-Source AI Threat Modeling" ✅
  - [x] Added `robots.txt` and `sitemap.xml` to public/ ✅
  - [ ] Verify Lighthouse audit score >90 for SEO — **Deferred to manual QA**
  - [ ] Lazy-load heavy components (ReactFlow) — **Deferred: not a bottleneck yet**
  - **Validation:** ✅ Meta tags, OG tags, JSON-LD, robots.txt, sitemap.xml all in place

---

## Workstream 8: Code Quality & Debt

**Goal:** Close remaining deferred items, fix integration gaps, improve test coverage.

**Pre-requisites:** None — can run continuously alongside other workstreams.

### Tasks

- [x] 8.1 AI settings dialog migration (finish)
  - [x] Add `initialTab` field to settings-store (alongside `settingsDialogOpen`) — this is necessary because `SettingsDialog` is rendered in `app.tsx` without props, so the initial tab must come from the store
  - [x] Create `openSettingsDialogAtTab(tab: SettingsSection)` action in settings-store that sets both `settingsDialogOpen: true` and `initialTab`
  - [x] Update `settings-dialog.tsx` to read `initialTab` from store and use it as initial `useState` value
  - [x] Update AI chat tab's settings gear button to call `settingsStore.openSettingsDialogAtTab("ai")`
  - [x] Remove standalone `ai-settings-dialog.tsx` import/usage from `ai-chat-tab.tsx`
  - [x] Keep `ai-settings-content.tsx` as the shared component rendered inside settings modal
  - **Validation:** Click settings gear in AI chat tab — settings modal opens at AI tab; standalone dialog no longer used

- [x] 8.2 File-scoped settings (design + implement)
  - [x] Decision: stored in `.threatforge.yaml` `metadata.settings` section (inline, not sidecar)
  - [x] Implement read/write for file settings (grid size, default element/boundary colors)
  - [x] Update Rust types (`FileSettings` struct, `Metadata.settings` field) + serde skip_serializing_if
  - [x] Update TypeScript types (`FileSettings` in threat-model.ts, re-exported from settings.ts)
  - [x] Update settings-store: `fileSettings`, `loadFileSettings`, `clearFileSettings` actions
  - [x] Wire into file operations: load on open, clear on new/close
  - [x] 3 Rust round-trip tests + 5 frontend settings-store tests
  - **Validation:** 43 Rust tests, 220 frontend tests — all pass; biome + clippy clean

- [x] 8.3 Settings and autosave unit tests
  - [x] `src/stores/settings-store.test.ts` exists with persistence, reset, dialog state tests ✅
  - [x] Create `src/hooks/use-autosave.test.ts`: verify debounce timing, dirty flag watching, skip when no filePath, cancel on manual save
  - **Validation:** `npx vitest --run` — 181 tests pass

- [x] 8.4 Theme visual smoke test — **Deferred to manual QA**
  - [x] Theme system is wired: 6 presets, CSS variable injection, ThemePicker in Appearance settings
  - [x] All components use Tailwind theme tokens (bg-card, text-foreground, border-border, etc.)
  - [ ] Manual walkthrough of all 6 presets still needs a human — visual issues can't be caught by automated tests
  - **Validation:** Theme system is functional; manual review recommended before launch

- [x] 8.5 Keyboard accessibility audit — **Deferred to manual QA**
  - [x] 27 keyboard shortcuts registered and working
  - [x] All buttons use semantic `<button>` elements with `type="button"`
  - [x] Settings/shortcuts dialogs close on Escape
  - [x] Toggle switches use `role="switch"` and `aria-checked`
  - [x] Trust boundary select buttons have `aria-label`
  - [ ] Full Tab-through audit needs human walkthrough — may reveal gaps
  - **Validation:** Keyboard shortcuts functional; Tab-through audit recommended before launch

Note: `Cmd+L` shortcut conflict (AI focus vs graph lock) is resolved in WS3.3 — `Cmd+L` stays as AI focus, `Cmd+Shift+L` for lock.

---

## Parallelization Guide

These workstreams can run concurrently:

| Parallel Group | Workstreams | Notes |
|---|---|---|
| **Group 1 (start immediately)** | WS4 (Testing), WS5 (Canvas Polish), WS8 (Code Quality) | Independent, no blockers |
| **Group 2 (start immediately)** | WS1 (YAML Format) | Foundational — do first or in parallel with Group 1 |
| **Group 3 (after WS1 schema finalized)** | WS2 (Entity System + Library) | Needs final YAML schema |
| **Group 4 (start immediately)** | WS3 (Keyboard/Nav) | Independent — undo/redo and command palette are standalone |
| **Group 5 (after WS2 designed)** | WS6 (Onboarding) | Guides should reference final UI |
| **Group 6 (start anytime)** | WS7 (Platform) | Fully independent |

**Recommended execution order for a solo developer:**

1. **WS1** (YAML format) — foundational, do first
2. **WS3.1** (Undo/redo) + **WS4.1-4.2** (Playwright setup + testids) — in parallel
3. **WS2** (Entity system + library) — biggest feature
4. **WS3.4** (Cmd+K) + **WS4.3-4.5** (E2E tests) — in parallel
5. **WS5** (Canvas polish) + **WS8** (debt cleanup) — in parallel
6. **WS6** (Onboarding) — after UI is stable
7. **WS7** (Platform) — when ready for launch prep

---

## Validation Checklist (run after each workstream)

- [ ] `npx biome check --write .` — lint + format clean
- [ ] `npx tsc --noEmit` — no type errors
- [ ] `npx vitest --run` — all unit tests pass
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` — all Rust tests pass
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml` — no warnings
- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml --check` — formatted
- [ ] `npm run ci:local` — full local CI passes
- [ ] Manual: open app, perform core workflow (new — draw — analyze — save — reopen)
