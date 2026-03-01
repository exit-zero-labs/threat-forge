# ThreatForge — Next Up

Comprehensive task list for all remaining work. Organized into parallelizable workstreams with explicit dependencies, pre-requisites, and validation steps.

**Generated:** 2026-03-01
**Based on:** `docs/todo.md`, `docs/todo-archive-001.md`, full codebase audit

---

## Status Summary

### Completed — Feature Code (verified via codebase audit — 92 frontend tests, 33 Rust tests, all passing)

Note: "Feature code complete" means the implementation code is merged. Some features have open test items or polish tasks tracked in the workstreams below.

- Foundation scaffold (Tauri v2, React 19, TypeScript, Tailwind 4, shadcn/ui, Zustand, ReactFlow)
- DFD canvas (custom nodes/edges, trust boundaries, palette drag-drop, selection sync)
- STRIDE engine (Rust + TS port, 14 rules, cross-boundary severity boost, dedup)
- File operations (new/open/save/save-as, YAML read/write, schema validation, dirty tracking)
- AI chat pane (BYOK streaming for Anthropic + OpenAI, threat extraction, one-click accept)
- Browser support (adapter pattern, web build on port 3000, Vercel-ready)
- CI/CD (GitHub Actions manual-dispatch, Docker local CI, pre-push hooks, release workflow)
- Theme system (6 presets across light/dark/system, theme picker, CSS variable injection) — visual smoke test pending (WS8.4)
- Settings modal (5 tabs: General, Appearance, Editor, AI, Shortcuts) — some tests + AI tab wiring pending (WS8.1, WS8.3)
- Autosave (debounced, configurable interval, dirty-aware, skip when no filePath) — unit tests pending (WS8.3)
- Canvas improvements (smart handles, inline node/edge editing, context menus, edge validation, trust boundary resize/colors, threat badges, draggable edge labels, parallel edge separation, edge naming, flow animation) — component/visual regression tests pending (WS4.6, WS5.5); trust boundary colors + edge label offsets not yet persisted to disk (resolved by WS1)
- Branding (logos, favicons, Tauri app icons)
- Keyboard shortcuts (Cmd+N/O/S/Shift+S/D, Cmd+L, Cmd+,, Cmd+/, 1/2/3 tab switch, Escape)
- Keytip badges (visible, toggleable via settings)

### Not Started

- Onboarding / guided tours
- E2E testing (Playwright)
- Component icon library (extensive tech/service icons)
- Native title bar controls
- Cmd+K command palette
- MCP integration
- SEO optimization

### Partially Complete (deferred items)

- Canvas UX polish (ghost previews, drop zones, node glow, handle labels)
- Component tests (0 `.test.tsx` files exist — inline editing, context menus, visual regression all needed)
- AI settings dialog migration (content extracted to `ai-settings-content.tsx`, but chat tab still uses standalone dialog)
- File-scoped settings (`FileSettings` type defined in `src/types/settings.ts`, no persistence)
- Keyboard accessibility audit (deferred)
- Extended keyboard shortcuts (undo/redo, copy/paste, arrow movement, zoom, panel toggles)
- YAML format consolidation (positions in YAML instead of separate JSON — also blocks persisting trust boundary colors and edge label offsets)
- Component library entity type revamp
- Evaluate `getSmoothStepPath` orthogonal routing vs current bezier (deferred from canvas improvements — low priority)

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

- [ ] 1.1 Design the consolidated YAML schema
  - [ ] Add `position: { x, y }` to each element in the YAML
  - [ ] Add `size: { width, height }` to trust boundaries
  - [ ] Add `label_offset: { x, y }` to data flows (for dragged edge labels)
  - [ ] Add visual properties to elements: `fill_color`, `stroke_color`, `fill_opacity`, `stroke_opacity`
  - [ ] Add `diagrams[].viewport: { x, y, zoom }` for saved viewport state
  - [ ] Decide: keep layout data inline under each element, or add a top-level `layout:` section
  - [ ] Document the new schema in `docs/yaml-schema.md` or update the CLAUDE.md YAML section
  - **Validation:** Write 3 sample YAML files by hand, commit to a test branch, make typical edits, verify git diffs are still clean and readable

- [ ] 1.2 Update Rust types and serialization
  - [ ] Add position/size/color fields to `Element`, `TrustBoundary`, `DataFlow` in `src-tauri/src/models/threat_model.rs`
  - [ ] Use `#[serde(default)]` on all new fields for backward compatibility with existing files
  - [ ] **Important:** If `#[serde(deny_unknown_fields)]` is used anywhere, remove it or switch to `#[serde(default)]` — `deny_unknown_fields` will reject files with new fields and break forward compatibility
  - [ ] Remove or deprecate the separate `DiagramLayout` struct and `layouts/*.json` path
  - [ ] Remove `pendingLayout` field from `canvas-store.ts` if it exists (used for deferred layout application)
  - [ ] Update `file_io/reader.rs` and `file_io/writer.rs` to handle the consolidated format
  - [ ] Update `commands/file_commands.rs` — remove layout-only read/write commands if no longer needed
  - [ ] Add migration logic: if opening an old file + matching layout JSON exists, merge positions into the model
  - **Validation:** `cargo test` — all existing tests pass, add round-trip tests for new fields

- [ ] 1.3 Update TypeScript types and stores
  - [ ] Update `src/types/threat-model.ts` to add position/size/color fields
  - [ ] Update `canvas-store.ts` `syncFromModel()` — read positions from model elements instead of separate layout
  - [ ] Update layout capture in `use-file-operations.ts` (where `captureLayout()` is called before save) — write positions back into model elements instead of separate layout file
  - [ ] Update `model-store.ts` — remove layout-specific state if it exists separately
  - [ ] Update `use-file-operations.ts` — remove separate layout file save/load
  - [ ] Update browser file adapter — remove layout handling
  - [ ] Update tauri file adapter — remove layout handling
  - **Validation:** `npx vitest --run` — all 92 tests pass (update tests as needed for new field paths)

- [ ] 1.4 Update `.claude/rules/yaml-format.md` to reflect the new structure
  - **Validation:** Re-read the rule file end-to-end and verify it matches the implementation

- [ ] 1.5 End-to-end validation
  - [ ] Create a model with 5+ elements, flows, boundaries — save — reopen — verify all positions, colors, sizes restored
  - [ ] Open an old-format file (with separate layout JSON) — verify migration works — save — verify consolidated format
  - [ ] Commit the saved YAML to git, make edits (move element, add threat), verify diffs are clean
  - **Validation:** `npm run ci:local` passes; manual verification of save/load round-trip

---

## Workstream 2: Entity System Revamp + Component Library

**Goal:** Replace the current 4-type palette (Process, Data Store, External Entity, Trust Boundary) with a 2-type system (Entity + Boundary) where entity sub-types are set via properties, and add an extensive searchable library of pre-crafted technology components with icons.

**Pre-requisites:**
- Workstream 1 (YAML format) should be done or at least the schema finalized, since entity sub-types and icon references go into the YAML. Note: element color fields (`fill_color`, `stroke_color`, etc.) are added in WS1 — WS2 only adds `subtype` and `icon`.
- Workstream 3.1 (undo/redo) should ideally be done first, so entity CRUD actions integrate with the history store from the start.

### Tasks

- [ ] 2.1 Design the entity sub-type system
  - [ ] Define all entity sub-types (research extensively): `web_service`, `api`, `database`, `queue`, `cache`, `load_balancer`, `cdn`, `storage`, `function`, `container`, `mobile_app`, `desktop_app`, `browser`, `iot_device`, `user`, `third_party_service`, `internal_service`, `gateway`, `proxy`, `firewall`, `dns`, `auth_provider`, `logging`, `monitoring`, `ci_cd`, etc.
  - [ ] Map each sub-type to a shape variant (rounded rect, cylinder, rectangle, hexagon, etc.)
  - [ ] Define how sub-type changes affect the YAML `type` field — extend the enum or add a separate `subtype` field
  - [ ] Define which properties are editable for pre-fabricated items vs custom entities (prefab: label only, no color/type change; custom: full control)
  - **Validation:** Review sub-type list against 3 real-world architecture diagrams (e.g., web app + microservices + IoT); verify all common components can be represented

- [ ] 2.2 Build the icon library infrastructure
  - [ ] Create `src/lib/icons/` directory with icon registry
  - [ ] Define `ComponentIcon` interface: `id`, `name`, `category`, `svg` (inline SVG string or path), `tags` (for search)
  - [ ] Create icon categories: `cloud_providers` (AWS, Azure, GCP), `languages` (Python, Go, Rust, Java, etc.), `databases` (PostgreSQL, MySQL, Redis, MongoDB, etc.), `dev_tools` (Docker, Kubernetes, GitHub, Jenkins, etc.), `security` (Vault, KMS, WAF, etc.), `messaging` (Kafka, RabbitMQ, SQS, etc.), `frontend` (React, Vue, Angular, etc.)
  - [ ] Source or create SVG icons for each entry (use simple, consistent style — monochrome or two-tone)
  - [ ] Create `src/lib/icons/registry.ts` exporting all icons indexed by id and category
  - **Validation:** Registry loads without errors; search returns correct results for 5 test queries ("postgres", "aws", "react", "docker", "firewall")

- [ ] 2.3 Revamp the left palette UI
  - [ ] Split into two sections: **top** = Entity + Boundary drag items; **bottom** = Library
  - [ ] Library section: horizontally scrollable category tabs at top (`All`, `AWS`, `Azure`, `Languages`, `Dev Tools`, `Databases`, `Security`, `Messaging`, `Frontend`, etc.)
  - [ ] Below tabs: searchable grid/list of pre-crafted components with icons and names
  - [ ] Add search bar at top of library section (fast, fuzzy search across name + tags)
  - [ ] Clicking a category tab filters the list; `All` tab shows everything with subtle category headers
  - [ ] Double-click on any library item adds it to the canvas at the center of the current viewport
  - [ ] Drag-and-drop from library to canvas also supported
  - **Validation:** Manual: drag from library to canvas works; double-click adds to center; search filters correctly; tab switching works

- [ ] 2.4 Update node rendering for entity sub-types
  - [ ] Refactor node components to accept a `subtype` prop that determines shape
  - [ ] Render the icon from the icon registry on the node
  - [ ] For pre-fabricated items: lock fill/stroke color to the library definition, only allow label editing
  - [ ] For custom entities: full property editing (color, type, label)
  - [ ] Implement "swap" functionality: right-click — Swap Component — pick from library — keep position + connections, change icon/type/colors
  - [ ] Ensure all entity CRUD operations (add, delete, update, swap) push to undo/redo history (WS3.1)
  - **Validation:** Manual: verify icon renders on node; swap preserves connections and position; prefab colors locked

- [ ] 2.5 Update properties panel for entity sub-types
  - [ ] Add entity sub-type selector in properties panel (dropdown or visual picker)
  - [ ] Add fill/stroke color pickers (reuse trust boundary color picker pattern) for custom entities
  - [ ] Disable color pickers for pre-fabricated library items
  - [ ] Show the component icon in the properties panel header
  - **Validation:** Manual: select prefab item — color pickers disabled; select custom entity — color pickers enabled and functional

- [ ] 2.6 Update YAML schema for entity sub-types
  - [ ] Add `subtype` field to `Element` (or extend `type` enum)
  - [ ] Add `icon` field to `Element` (references library icon id)
  - [ ] Note: `fill_color`, `stroke_color`, `fill_opacity`, `stroke_opacity` are already added in WS1 — do not duplicate
  - [ ] Update Rust serde types + TypeScript types for `subtype` and `icon`
  - **Validation:** Round-trip test: YAML with new fields — Rust — YAML — assert equal

- [ ] 2.7 Testing
  - [ ] Unit test icon registry: all icons load, categories are valid, search works
  - [ ] Unit test sub-type to shape mapping
  - [ ] Unit test swap functionality (preserves connections + position)
  - [ ] Verify entity operations are undoable (integration with WS3.1 history store)
  - [ ] Update existing canvas-store tests for new entity structure
  - **Validation:** `npx vitest --run` passes; `cargo test` passes; `npx biome check .` clean

---

## Workstream 3: Keyboard, Navigation & Command System

**Goal:** Full keyboard-driven UX with undo/redo, copy/paste, Cmd+K command palette, and panel toggle shortcuts.

**Pre-requisites:** None — can start immediately. However, undo/redo is a significant system that affects the store layer.

### Tasks

- [ ] 3.1 Implement undo/redo system (20-action history)
  - [ ] **Architecture decision:** Prefer a state-snapshot approach over action-replay. The codebase uses a dual-store pattern (model-store + canvas-store) which makes action-replay complex. A simpler approach: snapshot the full `model` object before each mutation, push to a history stack, and restore on undo. Zustand's `temporal` middleware or a manual implementation both work.
  - [ ] Create `src/stores/history-store.ts` (or add history middleware to model-store)
  - [ ] Implement history stack with max 20 entries (oldest dropped when full)
  - [ ] `undo()` restores previous model snapshot; `redo()` restores next snapshot
  - [ ] Wire `Cmd/Ctrl+Z` to undo and `Cmd/Ctrl+Shift+Z` / `Cmd/Ctrl+Y` to redo
  - [ ] Show undo/redo state in status bar or as disabled/enabled buttons
  - [ ] Ensure canvas-store syncs after undo/redo (call `syncFromModel()`)
  - **Validation:** Unit test: perform 5 actions — undo 3 — redo 1 — verify state at each step

- [ ] 3.2 Implement copy/cut/paste for canvas elements
  - [ ] `Cmd/Ctrl+C` — copy selected node(s) to internal clipboard (store in Zustand, not system clipboard)
  - [ ] `Cmd/Ctrl+X` — cut (copy + delete)
  - [ ] `Cmd/Ctrl+V` — paste at mouse position or offset from original, with new IDs
  - [ ] For connectors: copy properties only (protocol, data, name) — not position
  - [ ] `Option/Alt+Click+Drag` — instant duplicate (copy + paste in one gesture)
  - **Validation:** Unit test: copy element — paste — verify new IDs, same properties, offset position

- [ ] 3.3 Add remaining keyboard shortcuts
  - [ ] `Cmd/Ctrl+B` — toggle left panel
  - [ ] `Cmd/Ctrl+I` — toggle right panel
  - [ ] `Cmd/Ctrl+Shift+I` — open AI tab in right panel
  - [ ] `Cmd/Ctrl+0` — fit canvas to view (`fitView()` from ReactFlow)
  - [ ] `+` / `-` (or `Cmd/Ctrl+=` / `Cmd/Ctrl+-`) — zoom in/out
  - [ ] Arrow keys when element selected — nudge element by grid size (or 1px if grid snap off)
  - [ ] Arrow keys when nothing selected — pan canvas
  - [ ] `Cmd/Ctrl+Shift+L` — lock/unlock canvas (prevent accidental edits). Note: `Cmd+L` stays as AI chat focus (already shipped); lock uses Shift modifier to avoid conflict.
  - [ ] `Cmd/Ctrl+A` — select all elements on canvas
  - [ ] Note: `Cmd/Ctrl+D` (duplicate) and `Delete`/`Backspace` (delete) are already implemented — verify they integrate with undo/redo history after WS3.1
  - **Validation:** Manual test each shortcut; update `KEYBOARD_SHORTCUTS` array in `src/types/settings.ts`; update shortcuts dialog

- [ ] 3.4 Build Cmd+K command palette
  - [ ] Create `src/components/command-palette.tsx` — Spotlight-style overlay
  - [ ] Create `src/lib/commands/command-registry.ts` — registry of all available commands
  - [ ] Command types: `file` (New, Open, Save, Save As), `view` (toggle panels, zoom, fit), `canvas` (add entity, add boundary, select all, deselect), `navigate` (focus properties, focus threats, focus AI), `settings` (open settings, toggle theme), `library` (search and add component by name)
  - [ ] Fuzzy search across command names + aliases
  - [ ] Keyboard navigation: arrow keys to move, Enter to execute, Escape to close
  - [ ] Recent commands shown when palette is empty
  - [ ] Wire `Cmd/Ctrl+K` to open the palette
  - **Validation:** Open palette — type "save" — verify Save command appears — press Enter — model saves

- [ ] 3.5 Testing
  - [ ] Unit test undo/redo: action history, stack limits, state correctness
  - [ ] Unit test copy/paste: ID generation, property preservation
  - [ ] Unit test command registry: search, execution, recent tracking
  - **Validation:** `npx vitest --run` passes; all shortcuts listed in shortcuts dialog

---

## Workstream 4: Testing Infrastructure

**Goal:** Comprehensive test coverage — component tests, E2E tests, visual regression baseline.

**Pre-requisites:** None — can start immediately and run in parallel with all other workstreams. Should start early to catch regressions.

### Tasks

- [ ] 4.1 Set up Playwright infrastructure
  - [ ] `npm install -D @playwright/test`
  - [ ] `npx playwright install chromium` (Chromium only for local speed)
  - [ ] Create `playwright.config.ts`:
    - `testDir: "e2e"`
    - `webServer: { command: "npm run dev:web", port: 3000, reuseExistingServer: !process.env.CI }`
    - `use: { baseURL: "http://localhost:3000", screenshot: "only-on-failure", trace: "on-first-retry", video: "retain-on-failure" }`
    - `reporter: [["html", { open: "never" }], ["list"]]`
  - [ ] Create `e2e/` directory
  - [ ] Add npm scripts: `"test:e2e": "playwright test"`, `"test:e2e:ui": "playwright test --ui"`
  - [ ] Add `playwright-report/`, `test-results/` to `.gitignore`
  - **Validation:** `npx playwright test` runs (even with 0 tests) without config errors

- [ ] 4.2 Add `data-testid` attributes to critical UI elements
  - [ ] `app-layout` — root layout container
  - [ ] `top-menu-bar` — menu bar
  - [ ] `btn-new`, `btn-open`, `btn-save` — file action buttons
  - [ ] `canvas-area` — DFD canvas container
  - [ ] `component-palette` — left sidebar palette
  - [ ] `right-panel` — right panel container
  - [ ] `tab-properties`, `tab-threats`, `tab-ai` — right panel tab buttons
  - [ ] `status-bar` — bottom status bar
  - [ ] `empty-canvas` — empty state container
  - [ ] `settings-dialog`, `shortcuts-dialog` — dialog containers
  - **Validation:** `npx biome check .` passes; visual check that testids don't affect rendering

- [ ] 4.3 Create E2E test utilities
  - [ ] Create `e2e/fixtures.ts` with shared fixtures: `appPage` (waits for shell render), `emptyCanvas` (asserts empty state), `modelPage` (creates new model)
  - [ ] Create `e2e/helpers.ts` with actions: `createNewModel()`, `addElement(type, position)`, `connectElements(source, target)`, `openRightPanel(tab)`, `saveModel()`
  - **Validation:** Fixtures compile without TypeScript errors

- [ ] 4.4 Write core E2E tests (top 5 workflows)
  - [ ] `e2e/new-model.spec.ts` — Click "New Model" — verify canvas active, title shows "Untitled Threat Model", counts at 0
  - [ ] `e2e/dfd-construction.spec.ts` — Create model — drag elements — connect — add boundary — verify counts
  - [ ] `e2e/element-editing.spec.ts` — Select node — verify properties panel — edit fields — verify canvas label updates
  - [ ] `e2e/stride-threats.spec.ts` — Create model with elements — Run STRIDE — verify threats — edit/delete threats
  - [ ] `e2e/save-reopen.spec.ts` — Create — add elements — save (browser localStorage adapter) — reopen — verify preserved
  - **Validation:** `npx playwright test` — all 5 specs pass

- [ ] 4.5 Write edge case E2E tests
  - [ ] `e2e/dirty-state.spec.ts` — Make edits — try new model — verify unsaved changes prompt
  - [ ] `e2e/keyboard-shortcuts.spec.ts` — Test Cmd/Ctrl+N, O, S, Escape
  - [ ] `e2e/delete-operations.spec.ts` — Select — Delete — verify removal + connected edges cleaned up
  - [ ] `e2e/empty-states.spec.ts` — Verify empty states in threats tab, properties tab, canvas
  - [ ] `e2e/ai-chat.spec.ts` — Open AI tab — verify settings prompt — verify empty state
  - **Validation:** `npx playwright test` — all edge case specs pass

- [ ] 4.6 Write component tests (React Testing Library)
  - [ ] `src/components/panels/settings-dialog.test.tsx` — Render, navigate tabs, toggle settings, verify live updates
  - [ ] `src/components/ui/keytip.test.tsx` — Visible when setting on, hidden when off
  - [ ] `src/hooks/use-autosave.test.ts` — Debounce timing, dirty flag, skip when no filePath
  - [ ] `src/components/canvas/canvas-context-menu.test.tsx` — Node menu items, edge menu items, click actions
  - [ ] `src/components/panels/properties-tab.test.tsx` — Render with element, edit fields, verify store updates
  - [ ] `src/components/canvas/nodes/process-node.test.tsx` — Inline label editing: double-click enters edit mode, Enter commits, Escape cancels (closes todo.md "Component test inline editing on nodes and edges")
  - [ ] `src/components/canvas/edges/data-flow-edge.test.tsx` — Edge label inline editing: click opens editor, fields commit to store
  - [ ] Integration test: change a setting in settings dialog — close/reopen app (remount) — setting persists from localStorage
  - **Validation:** `npx vitest --run` — all new component tests pass

- [ ] 4.7 Integrate E2E into CI
  - [ ] Update `Dockerfile.ci` — add `npx playwright install --with-deps chromium`
  - [ ] Update `scripts/ci-local.sh` — add optional `--e2e` flag
  - [ ] Add `e2e` job to `.github/workflows/ci.yml` (depends on `test`, uploads artifacts on failure)
  - [ ] Update `compose.yml` to support Vite dev server + Playwright in Docker
  - **Validation:** `npm run ci:docker` includes E2E and passes; GitHub Actions `e2e` job runs

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

- [ ] 5.1 Drag ghost preview from palette
  - [ ] On dragstart from palette item, create a semi-transparent preview element attached to cursor
  - [ ] Use HTML5 drag API `setDragImage()` with a styled clone of the node component
  - [ ] Remove the ghost on dragend
  - **Validation:** Drag from palette — see node preview following cursor — drop on canvas — preview disappears

- [ ] 5.2 Drop zone highlighting for trust boundaries
  - [ ] During drag-over on canvas, detect if cursor is within a trust boundary's bounding box
  - [ ] If inside a boundary, add a highlight class (subtle glow or border color change) to that boundary node
  - [ ] On drop inside boundary, auto-assign element to boundary (assignment already works — just need the visual)
  - **Validation:** Drag element over trust boundary — boundary highlights — drop — element assigned

- [ ] 5.3 Connected node glow on edge select
  - [ ] When edge is selected, find source and target node IDs
  - [ ] Apply a subtle glow/ring class to those nodes (e.g., `ring-2 ring-tf-signal/30`)
  - [ ] Remove glow when edge is deselected
  - **Validation:** Click edge — source and target nodes glow — click elsewhere — glow removed

- [ ] 5.4 Port/handle labels on hover
  - [ ] When hovering over a node handle, show a small tooltip with the protocol of connected flows
  - [ ] Look up edges connected to that handle and extract protocol info
  - [ ] Position tooltip near the handle, dismiss on mouse leave
  - **Validation:** Hover over handle with connected flow — tooltip shows protocol — move away — tooltip disappears

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

- [ ] 6.1 Design and build the onboarding framework
  - [ ] Create `src/types/onboarding.ts`: `OnboardingStep` (id, targetSelector, title, content, placement, action?, triggerCondition?), `OnboardingGuide` (id, name, steps, version, showOnce)
  - [ ] Create `src/stores/onboarding-store.ts`: tracks completedGuides, activeGuide, activeStepIndex, dismissedGuides; persists to localStorage; actions: startGuide, nextStep, prevStep, dismissGuide, resetGuide
  - [ ] Create `src/lib/onboarding/guides/` directory for individual guide configs
  - **Validation:** Types compile; store actions work in isolation (verified by unit tests in WS6.6)

- [ ] 6.2 Build overlay UI components
  - [ ] `src/components/onboarding/guide-overlay.tsx` — spotlight/dim overlay highlighting target element
  - [ ] `src/components/onboarding/guide-tooltip.tsx` — positioned tooltip with title, content, step counter, Next/Back/Dismiss
  - [ ] `src/components/onboarding/guide-provider.tsx` — wrapper in App.tsx, listens to store, renders overlay when active
  - [ ] Accessibility: focus trap in tooltip, Escape to dismiss, screen reader announcements
  - **Validation:** Manual: start a test guide — spotlight highlights correct element, tooltip positions correctly, Next/Back/Dismiss buttons work, Escape closes

- [ ] 6.3 Implement trigger system
  - [ ] Trigger types: `"first-launch"`, `"first-model-created"`, `"first-element-added"`, `"feature-version"`
  - [ ] Hook triggers into model-store and canvas-store actions
  - [ ] Help button (? icon) in top menu — guide picker dialog listing all available guides
  - **Validation:** Manually trigger each guide type; verify guides appear at correct moments and do not re-fire after dismissal

- [ ] 6.4 Create initial guides
  - [ ] **Welcome guide** (first-launch): canvas overview, create/open, palette, right panel, AI assistant
  - [ ] **DFD Basics guide** (first model): add process — data store — entity — connect flow — add boundary
  - [ ] **STRIDE Analysis guide** (first threats tab): Run Analysis, threat list, edit/mitigate
  - [ ] **AI Assistant guide** (first AI tab): configure key, ask questions, accept suggestions
  - **Validation:** Each guide's steps reference valid `data-testid` selectors (from WS4.2); each guide completes without errors in manual walkthrough

- [ ] 6.5 Build "What's New" changelog overlay
  - [ ] `src/components/onboarding/whats-new-dialog.tsx` — modal shown once per new version
  - [ ] `src/lib/onboarding/changelog.ts` — structured entries per version with feature list + guide links
  - [ ] Version check against localStorage `last-seen-version`
  - **Validation:** Set `last-seen-version` to an old version in localStorage — reopen app — "What's New" dialog appears; dismiss — reopen — does not appear again

- [ ] 6.6 Testing
  - [ ] Unit test onboarding-store: progression, persistence, dismissal, reset
  - [ ] Unit test trigger logic: fires on correct conditions, no re-fire after completion
  - [ ] Component test guide-overlay: spotlight renders, tooltip positions, keyboard nav
  - [ ] Smoke test each guide end-to-end in the running app (walk through every step of all 4 guides)
  - **Validation:** `npx vitest --run` passes; all 4 guides walk through correctly without visual glitches

---

## Workstream 7: Platform Features

**Goal:** Native title bar, MCP integration, SEO.

**Pre-requisites:** None — independent of other workstreams.

### Tasks

- [ ] 7.1 Native title bar controls
  - [ ] Research Tauri v2 window decoration options (custom title bar vs native with overlay)
  - [ ] Add native menu items: File (New, Open, Save, Save As, Close), Edit (Undo, Redo, Cut, Copy, Paste), View (Toggle Panels, Zoom, Fit), Help (Shortcuts, About)
  - [ ] Ensure all menu actions map to existing keyboard shortcuts and store actions
  - [ ] Platform-specific: macOS app menu in menu bar, Windows/Linux window menu
  - **Validation:** Menu items visible and functional on macOS; `cargo clippy` clean

- [ ] 7.2 MCP integration (local MCP server)
  - [ ] Research MCP protocol spec for local tool servers
  - [ ] Define ThreatForge MCP tools: `get_model` (read current model), `add_element`, `add_flow`, `run_stride`, `add_threat`, `get_threats`, `save_model`
  - [ ] Implement MCP server as Tauri sidecar or embedded HTTP server on localhost
  - [ ] Register MCP server discovery (stdio or SSE transport)
  - [ ] Test with Claude Code / GitHub Copilot as MCP client
  - **Validation:** Claude Code can read and modify a threat model via MCP tools

- [ ] 7.3 SEO optimization (for web build / landing page)
  - [ ] Add `<meta>` tags to `index.html`: title, description, og:title, og:description, og:image, twitter:card
  - [ ] Add structured data (JSON-LD) for SoftwareApplication schema
  - [ ] Ensure web build has proper `<title>` and `<meta name="description">`
  - [ ] Verify fast load times: check bundle size, lazy-load heavy components (ReactFlow)
  - [ ] Add `robots.txt` and `sitemap.xml` to public/
  - **Validation:** Lighthouse audit score >90 for SEO; Open Graph preview renders correctly; JSON-LD validates via Google Rich Results Test; `robots.txt` and `sitemap.xml` accessible at their URLs in `dev:web` build

---

## Workstream 8: Code Quality & Debt

**Goal:** Close remaining deferred items, fix integration gaps, improve test coverage.

**Pre-requisites:** None — can run continuously alongside other workstreams.

### Tasks

- [ ] 8.1 AI settings dialog migration (finish)
  - [ ] Add `initialTab` field to settings-store (alongside `settingsDialogOpen`) — this is necessary because `SettingsDialog` is rendered in `app.tsx` without props, so the initial tab must come from the store
  - [ ] Create `openSettingsDialogAtTab(tab: SettingsSection)` action in settings-store that sets both `settingsDialogOpen: true` and `initialTab`
  - [ ] Update `settings-dialog.tsx` to read `initialTab` from store and use it as initial `useState` value
  - [ ] Update AI chat tab's settings gear button to call `settingsStore.openSettingsDialogAtTab("ai")`
  - [ ] Remove standalone `ai-settings-dialog.tsx` import/usage from `ai-chat-tab.tsx`
  - [ ] Keep `ai-settings-content.tsx` as the shared component rendered inside settings modal
  - **Validation:** Click settings gear in AI chat tab — settings modal opens at AI tab; standalone dialog no longer used

- [ ] 8.2 File-scoped settings (design + implement)
  - [ ] Decision: store in `.threatforge.yaml` `metadata.settings` section vs `.threatforge/settings.json`
  - [ ] Implement read/write for file settings (grid size, default element colors, STRIDE config)
  - [ ] Update Rust types + file I/O if adding to YAML
  - [ ] Update settings-store to load file settings when a model is opened
  - **Validation:** Change a file setting — save — reopen — setting persists

- [ ] 8.3 Settings and autosave unit tests
  - [ ] Expand `src/stores/settings-store.test.ts`: verify persistence to localStorage, reset clears storage, dialog state transitions
  - [ ] Create `src/hooks/use-autosave.test.ts`: verify debounce timing, dirty flag watching, skip when no filePath, cancel on manual save
  - **Validation:** `npx vitest --run` — new tests pass

- [ ] 8.4 Theme visual smoke test (closes todo.md "Visual smoke test: verify all screens in both light and dark modes")
  - [ ] Manually verify all screens in all 6 theme presets:
    - Canvas with nodes, edges, boundaries
    - Properties panel with element selected
    - Threats panel with threats listed
    - AI chat panel with messages
    - Settings modal (all tabs)
    - Empty state / welcome screen
    - Context menus
  - [ ] Document any visual issues and fix them
  - **Validation:** No visual artifacts, all text readable, all interactive elements visible in every theme

- [ ] 8.5 Keyboard accessibility audit (closes todo.md "Audit all interactive elements for keyboard reachability" and "Keyboard navigation test: Tab through all controls")
  - [ ] Tab through all interactive elements: menu bar — palette — canvas — right panel — status bar
  - [ ] Verify every button, tab, input, select is focusable and activatable via keyboard
  - [ ] Verify focus indicators are visible (not hidden by CSS)
  - [ ] Verify dialogs trap focus when open
  - [ ] Fix any gaps (add `tabIndex`, `role`, `aria-label` as needed)
  - **Validation:** Complete keyboard-only session: create model — add elements — run STRIDE — save — all without mouse

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
