# Threat Forge - TODO List

Shared execution plan for humans and LLM agents. Update this file before, during, and after every work session.

---

## 2026-03-02 — Documentation restructure

### Plan
- [x] Create `docs/knowledge/` with focused reference docs split from project-document.md:
  - [x] `overview.md` — Product overview, value prop, mission, status
  - [x] `architecture.md` — System architecture, ADRs, tech stack, project structure
  - [x] `file-format.md` — `.thf` format spec with full examples
  - [x] `product-design.md` — Personas, features, user journeys, success metrics
  - [x] `market-analysis.md` — Market sizing, competitive landscape
  - [x] `business-model.md` — Revenue, costs, sustainability
  - [x] `go-to-market.md` — Launch strategy, growth loops, content strategy
  - [x] `risks.md` — Risk register, pre-mortems, kill gates
  - [x] `glossary.md` — Terms, STRIDE mapping, references
- [x] Move todo/planning files to `docs/plans/`
  - [x] `todo.md`, `todo-archive-001.md` through `004.md`
  - [x] Create `roadmap.md` with remaining/future work
- [x] Delete old monolith docs: `project-document.md`, `implementation-plan.md`
- [x] Update all cross-references:
  - [x] `CLAUDE.md` — status, architecture tree, ADR-006, doc references, todo path
  - [x] `README.md` — status, roadmap link, file format description
  - [x] `.claude/agents/threat-model-expert.md` — doc references
  - [x] `.claude/agents/security-auditor.md` — fix outdated deny_unknown_fields
  - [x] `.claude/skills/implement-sprint/SKILL.md` — doc references
  - [x] `.claude/rules/workflow.md` — todo.md path (4 occurrences)
  - [x] `.claude/rules/security.md` — fix outdated deny_unknown_fields
  - [x] `SECURITY.md` — fix outdated deny_unknown_fields

### Notes
- Project is 99% production ready — all language updated from "early development" to "production-ready"
- ADR-006 updated from "separate JSON files" to "inline layout data" reflecting current architecture
- `deny_unknown_fields` was removed from Rust types for forward compatibility; updated in 3 places (SECURITY.md, security rules, security auditor agent)
- Todo archives left with historical references to `docs/todo.md` (they're archives, not active)

---

## 2026-03-02 — Replace OS keychain with encrypted file storage

### Plan
- [x] Update `Cargo.toml`: remove `keyring`, add `aes-gcm` and `rand`
- [x] Rewrite `src-tauri/src/ai/keychain.rs` with `KeyStorage` struct (AES-256-GCM encrypted file)
- [x] Update `errors.rs`: rename `Keychain` variant to `KeyStorage`
- [x] Update `ai_commands.rs`: add `State<KeyStorage>` param to all 4 commands
- [x] Update `lib.rs`: initialize `KeyStorage` in `.setup()` block
- [x] Update frontend strings in `ai-settings-content.tsx` and `guides.ts`
- [x] Update docs: CLAUDE.md, SECURITY.md, `.claude/rules/security.md`, `.claude/agents/security-auditor.md`
- [x] Update adapter comments: `keychain-adapter.ts`, `browser-keychain-adapter.ts`
- [x] Validate: `cargo test` — 52 tests pass (9 new KeyStorage tests)
- [x] Validate: `cargo clippy` + `cargo fmt` — clean
- [x] Validate: `npx vitest --run` — 244 tests pass
- [x] Validate: `npx biome check --write .` — clean
- [x] Validate: `npm run ci:local` — all 6 checks pass

### Notes

---

## 2026-03-02 — Mac icon, file association, UX fixes, app naming

### Plan
- [x] Mac icon padding — resize artwork to ~80% of canvas with transparent margin (Apple guidelines)
  - [x] Regenerate all icon sizes: 32x32, 64x64, 128x128, 128x128@2x, icon.png, icon.icns, icon.ico
  - [x] Regenerate all Windows Store logos (Square*.png)
  - [x] Regenerate all iOS and Android icons
- [x] File association — associate `.thf` extension with Threat Forge on all platforms
  - [x] Add `fileAssociations` config to `tauri.conf.json` (ext: "thf", mimeType, description, role)
  - [x] Add file-open handler in `lib.rs` (check `std::env::args()` for `.thf` path, emit `open-file` event)
  - [x] Add `openFileByPath()` helper and `open-file` event listener in `use-native-menu.ts`
- [x] API key paste + show/hide toggle in `ai-settings-content.tsx`
  - [x] Add `showKey` state with Eye/EyeOff toggle button
  - [x] Add `e.stopPropagation()` on input `onKeyDown` to prevent keyboard shortcut interception
  - [x] Reset `showKey` to false after save
- [x] Fix Cmd+A/C/V/X in text inputs — native Tauri menu was intercepting keystrokes
  - [x] Root cause: `use-native-menu.ts` unconditionally routed edit actions to canvas clipboard store
  - [x] Fix: check if input/textarea is focused; if so, use `document.execCommand()` / `el.select()`
- [x] App name "Threat Forge" (two words) in all user-facing strings
  - [x] `tauri.conf.json`: productName, window title
  - [x] `menu.rs`: "About Threat Forge"
  - [x] `canvas.tsx`, `top-menu-bar.tsx`, `settings-dialog.tsx`, `index.html`
  - [x] `onboarding/guides.ts`, `whats-new-overlay.tsx`, `tauri-file-adapter.ts`
  - [x] Added website link (exitzerolabs.com) to support section in settings
- [x] Validate: `npm run ci:local` — all 6 checks pass (Biome, tsc, cargo fmt, Clippy, 244 Vitest, 43 cargo test)

---

## 2026-03-02 — Color customization: all components + connector colors

### Plan
- [x] Enable fill/stroke color controls for ALL library components (remove isPrefab gate)
  - [x] `properties-tab.tsx`: Remove `{!isPrefab && (` wrapper on ColorField controls
  - [x] `properties-tab.tsx`: Remove color-clearing logic in `handleTypeChange` when switching to prefab
- [x] Add stroke_color / stroke_opacity to DataFlow (connector color)
  - [x] `src/types/threat-model.ts`: Add `stroke_color?: string` and `stroke_opacity?: number` to `DataFlow`
  - [x] `src-tauri/src/models/threat_model.rs`: Add same fields to Rust `DataFlow` struct
  - [x] `src/stores/canvas-store.ts`: Add `strokeColor`/`strokeOpacity` to `DfdEdgeData`, update `flowToEdge()`
  - [x] `src/components/canvas/edges/data-flow-edge.tsx`: Render custom edge color when set
  - [x] `src/components/panels/properties-tab.tsx`: Add color controls to `EdgeProperties`
  - [x] `src/hooks/use-file-operations.ts`: Capture edge colors in `captureCanvasIntoModel`
- [x] Rust test: DataFlow stroke_color round-trip
- [x] Validate: `npx vitest --run`
- [x] Validate: `cargo test`
- [x] Validate: `npx biome check --write .`
- [x] Validate: `npm run ci:local`

---

## 2026-03-02 — Feature batch: UX improvements, file format, theming, bugs

### Overview

13 items from the high-level TODO, grouped into logical implementation units. Ordered by dependency (foundational changes first, then features that build on them).

NOTE: No backwards compatibility is needed, so breaking changes to the file format, Rust types, etc. are fine.

---

### 1. File format extension change (`.threatforge.yaml` → `.thf`)

Change the file extension everywhere. This is a breaking change (no migration needed per the NOTE).

- [x] **Frontend — Tauri file adapter** (code)
  - [x] `src/lib/adapters/tauri-file-adapter.ts` line 7-8: change `YAML_FILTER` from `{ name: "ThreatForge Model", extensions: ["threatforge.yaml", "yaml", "yml"] }` to `{ name: "ThreatForge Model", extensions: ["thf"] }`
  - [x] `src/lib/adapters/tauri-file-adapter.ts` line 33: change `defaultPath` from `"model.threatforge.yaml"` to `"model.thf"`
- [x] **Frontend — Browser file adapter** (code)
  - [x] `src/lib/adapters/browser-file-adapter.ts` line 42: change `pickFile` accept from `".yaml,.yml"` to `".thf,.yaml,.yml"` (keep yaml/yml for backward compat in browser)
  - [x] `src/lib/adapters/browser-file-adapter.ts` line 73: change download filename from `` `${filename}.threatforge.yaml` `` to `` `${filename}.thf` ``
- [x] **Rust backend — doc comments** (cosmetic, update references)
  - [x] `src-tauri/src/models/threat_model.rs` line 5: doc comment mentions `.threatforge.yaml`
  - [x] `src-tauri/src/file_io/reader.rs` line 6: doc comment mentions `.threatforge.yaml`
  - [x] `src-tauri/src/file_io/writer.rs` line 5: doc comment mentions `.threatforge.yaml`
- [x] **Rust backend — test files** (update test filenames)
  - [x] `src-tauri/src/file_io/reader.rs` lines 281, 365: test paths use `"test.threatforge.yaml"` → `"test.thf"`
  - [x] `src-tauri/src/file_io/writer.rs` lines 64, 78, 88: test paths use `"test.threatforge.yaml"` → `"test.thf"`
- [x] **Docs & config** (update extension references)
  - [x] `README.md` line 92: `.threatforge.yaml` format reference
  - [x] `CLAUDE.md` line 103: `.threatforge.yaml` file format reference
  - [x] `.claude/rules/yaml-format.md` lines 3, 13, 45: three `.threatforge.yaml` references
  - [x] `.claude/agents/threat-model-expert.md` line 30: `.threatforge.yaml` reference
  - [x] `CONTRIBUTING.md` line 102: `.threatforge.yaml` reference
- [x] Validate: open/save a file with the new `.thf` extension in dev mode
- [x] Validate: Rust tests pass with new filenames (`cargo test`)

---

### 2. Add `source_handle` / `target_handle` to DataFlow model (prerequisite for undo/redo fix + self-loops)

Connectors need to persist their attachment point handles in the model so undo/redo restores exact handle pairs, and so self-loops can specify which handles to use.

- [x] **TypeScript types**
  - [x] `src/types/threat-model.ts`: add `source_handle?: string` and `target_handle?: string` to `DataFlow` interface
- [x] **Rust types**
  - [x] `src-tauri/src/models/threat_model.rs`: add `source_handle: Option<String>` and `target_handle: Option<String>` to `DataFlow` struct (with `#[serde(skip_serializing_if = "Option::is_none")]`)
- [x] **Canvas store — write handles to model**
  - [x] `src/stores/canvas-store.ts` — `addDataFlow()`: after determining handles (either from opts or smart routing), write them to the `newFlow` model object as `source_handle` / `target_handle`
  - [x] `src/stores/canvas-store.ts` — `reverseEdge()`: also swap `source_handle` / `target_handle` on the model's `DataFlow` entry
  - [x] `src/hooks/use-file-operations.ts` — `captureCanvasIntoModel()` (lines 44-55): currently only captures `label_offset` from edges. Add capture of `edge.sourceHandle` → `f.source_handle` and `edge.targetHandle` → `f.target_handle` in the `data_flows` map
- [x] **Canvas store — read handles from model**
  - [x] `src/stores/canvas-store.ts` — `flowToEdge()`: read `flow.source_handle` / `flow.target_handle` and set them on the edge (as `sourceHandle` / `targetHandle`)
  - [x] `src/stores/canvas-store.ts` — `syncFromModel()`: the existing code that reads `existing?.sourceHandle` is now redundant since `flowToEdge` carries it — but keep it as a fallback for edges not yet saved with handles
- [x] **Browser stride adapter**: no change needed (doesn't touch handles)
- [x] Validate: create connectors, save, close, reopen — handles preserved
- [x] Validate: undo after connector delete — handles restored to exact positions
- [x] Update round-trip Rust tests if any test the DataFlow fields

---

### 3. Support same-node connectors (self-loops)

Allow data flows from a node to itself. Requires handle logic changes and a custom self-loop edge path.

- [x] **Remove self-loop block**
  - [x] `src/lib/canvas-utils.ts`: keep `isSelfLoop()` function but change its purpose (now just a detection helper, not a blocker)
  - [x] `src/stores/canvas-store.ts` — `addDataFlow()`: remove the `if (isSelfLoop(...)) return null` guard
  - [x] `src/components/canvas/dfd-canvas.tsx` — `isValidConnection()`: remove the `isSelfLoop` check
- [x] **Handle assignment for self-loops**
  - [x] `src/stores/canvas-store.ts` — `addDataFlow()`: when `sourceId === targetId`, if no explicit handles provided, pick a default pair (e.g., `right-source` → `top-target` or `bottom-source` → `right-target`) that creates a visible loop. If explicit handles are the same (e.g., both `right`), offset slightly
  - [x] `src/lib/canvas-utils.ts`: add a `getSelfLoopHandlePair()` helper that returns a default handle pair for self-loops
- [x] **Self-loop edge rendering**
  - [x] `src/components/canvas/edges/data-flow-edge.tsx`: detect self-loop (`source === target`) and render a custom cubic bezier path that loops out from the source handle and back to the target handle (arc shape), instead of `getBezierPath()` which collapses to zero length for same-node connections
  - [x] The loop path should arc outward from the node (e.g., 60-80px offset), creating a visible curved loop
  - [x] Label positioning for self-loops: place at the apex of the loop arc
- [x] **Duplicate edge detection for self-loops**
  - [x] `src/lib/canvas-utils.ts` — `isDuplicateEdge()`: ensure self-loop edges can detect duplicates (same source+target+handles)
- [x] **Validation in Rust**: no change needed — the validator doesn't block `from === to`
- [x] Validate: drag a connector from a node back to itself — loop appears
- [x] Validate: self-loop persists through save/reload
- [x] Validate: undo/redo on self-loop preserves handles
- [x] Update tests: `canvas-utils.test.ts` — update `isSelfLoop` tests, add `getSelfLoopHandlePair` tests

---

### 4. Undo/Redo for connectors fix + backspace delete fix

Two related bugs: (a) undo after connector delete doesn't restore exact handles, (b) can't delete connectors via backspace when they have properties.

Bug (a) is mostly fixed by item #2 above (persisting handles in model). This item covers the remaining edge cases and bug (b).

- [x] **Bug (a) — verify fix from item #2**
  - [x] **Verified root cause:** When undo fires, `syncFromModel()` rebuilds edges from the model snapshot. It tries to get handle info from `existingEdgeMap` (built from `get().edges`), but the edge was already removed from the canvas during deletion. And `flowToEdge()` produces edges with NO handles set (the `DataFlow` type has no handle fields). Result: edge re-created with wrong/default handles.
  - [x] After item #2 is implemented, `flowToEdge()` will read `flow.source_handle` / `flow.target_handle` from the model snapshot — handles will be correctly restored.
  - [x] Test: create connector with specific handles → delete → undo → verify handles restored at exact attachment points
- [x] **Bug (b) — backspace/delete on connectors with properties**
  - [x] **Verified root cause:** This is NOT a focus issue. The exact chain:
    1. `deleteKeyCode={null}` on `<ReactFlow>` (dfd-canvas.tsx line 334) disables ReactFlow's native delete
    2. A manual `onKeyDown` handler on the wrapper `<div>` (dfd-canvas.tsx lines 182-189) calls `deleteSelected()` on Delete/Backspace
    3. When user clicks the label `<button>` (data-flow-edge.tsx), the `pointerdown` handler calls `e.stopPropagation()` (line 108), preventing ReactFlow from seeing the click
    4. This means ReactFlow never sets `edge.selected = true` in its internal edge state — only `useModelStore.setSelectedEdge(id)` is called (model store, not canvas store)
    5. `deleteSelected()` checks `edges.filter(e => e.selected)` — finds nothing — early return
    6. Clicking the edge PATH (not label) works because ReactFlow handles the click natively and sets `edge.selected = true`
  - [x] **Fix in `src/components/canvas/edges/data-flow-edge.tsx`:** In the `pointerdown` handler (around line 127), after calling `useModelStore.getState().setSelectedEdge(id)`, also mark the edge as selected in the canvas store:
    ```ts
    // Set edge as selected in canvas store so deleteSelected() can find it
    useCanvasStore.getState().setEdges?.(edges =>
      edges.map(e => ({ ...e, selected: e.id === id }))
    );
    ```
    Or use `useCanvasStore.setState` to update the `edges` array directly, setting `selected: true` on the matching edge and `false` on all others. (Note: need to also deselect all nodes when selecting an edge this way)
  - [x] **Alternative (simpler):** In `deleteSelected()` (`canvas-store.ts` line 503+), also check `useModelStore.getState().selectedEdgeId` as a fallback — if no edges are selected in ReactFlow but an edge is selected in the model store, delete that edge
- [x] Validate: click connector LABEL → press Backspace → connector deleted
- [x] Validate: click connector PATH → press Backspace → connector deleted
- [x] Validate: delete connector → undo → exact handles restored

---

### 5. Add authoring (name/email settings + edit tracking)

Add user identity settings and record authoring metadata on the model and elements.

- [x] **Settings store**
  - [x] `src/types/settings.ts` — `UserSettings`: add `authorName: string` (default: `""`) and `authorEmail: string` (default: `""`)
  - [x] `src/stores/settings-store.ts`: add defaults for new settings
- [x] **Settings UI**
  - [x] `src/components/panels/settings-dialog.tsx` — `GeneralSection`: add "Author name" and "Author email" text inputs at the top of the section. These are the user's identity for authoring metadata
- [x] **TypeScript types — metadata**
  - [x] `src/types/threat-model.ts` — `Metadata`: add `created_by?: string` (name + email format)
  - [x] `src/types/threat-model.ts` — `Metadata`: change `modified` to remain as-is (ISO date string) but add `modified_by?: string`
  - [x] `src/types/threat-model.ts` — `Metadata`: add `last_edit_timestamp?: number` (Unix timestamp for git blame friendliness)
- [x] **Rust types**
  - [x] `src-tauri/src/models/threat_model.rs`: add `created_by: Option<String>`, `modified_by: Option<String>`, `last_edit_timestamp: Option<i64>` to `Metadata` struct (all with `skip_serializing_if`)
- [x] **Auto-populate authoring on save**
  - [x] `src/hooks/use-file-operations.ts` — `saveModel()`: before calling the file adapter, update `model.metadata.modified` to today's date, `model.metadata.modified_by` to `"{name} <{email}>"` from settings, `model.metadata.last_edit_timestamp` to `Math.floor(Date.now() / 1000)`
  - [x] On `newModel()`: set `model.metadata.created_by` to `"{name} <{email}>"` from settings, set `model.metadata.author` to the name from settings if author is empty
- [x] Validate: create new model with name/email set → save → check YAML has `created_by` and `modified_by`
- [x] Validate: open existing model → make change → save → `modified_by` and `last_edit_timestamp` updated

---

### 6. File naming (editable title in top bar + save-as behavior)

The top-left title should be editable and trigger save-as behavior.

- [x] **TopMenuBar component**
  - [x] `src/components/layout/top-menu-bar.tsx`: replace the static `<span>` for `displayTitle` with an editable component
  - [x] On double-click: enter edit mode (show an `<input>` in place of the span, pre-filled with current title)
  - [x] On Enter: commit the new title. If the file has never been saved (no `filePath`), trigger "Save As" dialog. If the file has been saved before, trigger "Save As" with the new name
  - [x] On Escape / blur: if new file with no path, trigger "Save As". If existing file, cancel the edit (revert to original title)
  - [x] Update `model.metadata.title` in the model store when title changes
  - [x] The display should show the file name (from `filePath` basename without extension) when a file is saved, or the model title when unsaved. Show `*` suffix when dirty
- [x] **Model store**
  - [x] `src/stores/model-store.ts`: add a `updateMetadata(updates: Partial<Metadata>)` action (no such method currently exists — the store only has `setModel` for full model replacement and `updateElement` for elements). Pattern: `set({ model: { ...model, metadata: { ...model.metadata, ...updates } }, isDirty: true })`
- [x] Validate: double-click title → edit → press Enter → save-as dialog appears (for new file)
- [x] Validate: double-click title on saved file → edit → press Enter → save-as with new name
- [x] Validate: title reflects file name after saving

---

### 7. Theme selection improvements

Redesign the theme picker to support separate light/dark theme selection, and add more themes.

- [x] **New themes** (add to `src/lib/themes/presets.ts`)
  - [x] **Dark themes to add:**
    - [x] `dracula` — Dracula color scheme (purple/pink/green on dark bg)
    - [x] `monokai` — Monokai-inspired (warm tones on dark brown/black)
    - [x] `github-dark` — GitHub's dark theme colors
    - [x] `one-dark` — Atom One Dark colors
    - [x] `catppuccin-mocha` — Catppuccin Mocha palette
  - [x] **Light themes to add:**
    - [x] `github-light` — GitHub's light theme colors
    - [x] `solarized-light` — Solarized Light palette
    - [x] `one-light` — Atom One Light colors
    - [x] `catppuccin-latte` — Catppuccin Latte palette
  - [x] Each theme needs all ~30 oklch tokens. Research the source palettes and map to the token schema
- [x] **Theme state model change**
  - [x] `src/stores/ui-store.ts`: change persisted state from `{ mode, presetId }` to `{ mode, lightPresetId, darkPresetId }`
  - [x] `src/stores/ui-store.ts` — `setTheme()`: update to accept `mode`, `lightPresetId`, and/or `darkPresetId` separately
  - [x] `src/stores/ui-store.ts` — `resolvePresetForMode()`: when mode is `"light"` or resolved to light, use `lightPresetId`; when dark, use `darkPresetId`
  - [x] `src/stores/ui-store.ts` — `loadPersistedTheme()`: handle migration from old format `{ mode, presetId }` to new format `{ mode, lightPresetId, darkPresetId }` — map old `presetId` to the correct light/dark slot based on the preset's mode
- [x] **Theme picker UI redesign**
  - [x] `src/components/panels/theme-picker.tsx` — current UI already shows Mode selector + "Dark Themes" + "Light Themes" sections. Changes needed:
    1. Wire up `handlePresetChange` to call the new `setTheme` which accepts separate light/dark preset IDs
    2. Show a check mark on the active light preset AND the active dark preset (currently only one preset is marked active)
    3. Section labels: change "Dark Themes" → "For dark mode:" and "Light Themes" → "For light mode:"
    4. When mode is Light, visually dim the dark themes section (but still allow selection for when user switches)
    5. When mode is Dark, visually dim the light themes section
    6. When mode is System, both sections are fully active
  - [x] Each swatch already shows a color dot + name + check icon — enhance with 2-3 representative color dots (background, primary, accent from the theme tokens)
- [x] Validate: switch between modes → correct themes applied
- [x] Validate: set different light and dark themes → switch to System mode → both are used correctly
- [x] Validate: persist and reload — both theme selections survive browser refresh

---

### 8. Empty state / welcome screen redesign

Replace the basic empty canvas with an engaging welcome experience.

- [x] **Brand logo**
  - [x] `src/components/canvas/canvas.tsx` — `EmptyCanvas`: replace `<Shield>` icon with the actual logo (`<img src="/logo_square.png">` or a larger version). Make it bigger (e.g., `h-20 w-20` or `h-24 w-24`)
- [x] **Rotating tips/quotes**
  - [x] Create `src/lib/tips.ts` with an array of 20-30 tips/quotes. Include the user's examples plus more:
    - Security proverbs and wisdom
    - Threat modeling tips
    - STRIDE methodology reminders
    - Motivational security quotes
  - [x] `src/components/canvas/canvas.tsx` — `EmptyCanvas`: add a `<RotatingTip />` component that:
    - Displays one tip at a time with a fade-in/fade-out animation (CSS opacity transition, ~500ms)
    - Rotates every 6-8 seconds
    - Picks randomly from the array (no immediate repeat)
    - Respects `reduceMotion` setting (if set, just show static text, no animation)
    - Styled in italic, muted-foreground, max-width so it wraps nicely
- [x] **Footer**
  - [x] Add a footer at the bottom of the empty state with:
    - "Built by Exit Zero Labs LLC" text
    - GitHub link (icon + "GitHub")
    - "Documentation" link
    - Version number
  - [x] Footer should be `absolute bottom-0` or flexbox pushed to bottom, subtle `text-muted-foreground text-xs`
- [x] **Layout polish**
  - [x] Center the main content (logo, title, description, buttons) vertically with some upward bias (not dead center — more like 40% from top)
  - [x] Add subtle background decoration (optional — maybe a very faint grid pattern or gradient)
- [x] Validate: open app with no file → see redesigned empty state
- [x] Validate: tips rotate smoothly, no flicker
- [x] Validate: reduce motion setting disables animation

---

### 9. Custom scrollbars (cross-platform theme-aware)

Implement custom scrollbar styling that follows the current theme on all platforms.

- [x] **Global scrollbar CSS**
  - [x] `src/styles.css`: add `::-webkit-scrollbar` rules that use the theme's CSS custom properties. NOTE: the theme uses oklch values, and `opacity` on scrollbar pseudo-elements is ignored in WebKit — use `oklch(... / alpha)` syntax instead:
    ```css
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: oklch(from var(--color-muted-foreground) l c h / 0.4); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: oklch(from var(--color-muted-foreground) l c h / 0.6); }
    ::-webkit-scrollbar-corner { background: transparent; }
    ```
    NOTE: `oklch(from ...)` relative color syntax may not work in all WebView versions. Fallback: use a hardcoded semi-transparent gray (`rgba(128,128,128,0.3)`) and override per-theme via the `applyTheme()` function if needed. Test in Tauri's WebView.
  - [x] Also add Firefox scrollbar styling: `scrollbar-width: thin; scrollbar-color: var(--color-muted-foreground) transparent;` on `*` or `html`
- [x] **Component palette horizontal scroll padding**
  - [x] `src/components/palette/component-palette.tsx`: the horizontal scrolling category tabs area — add `pb-1` or `pb-1.5` padding so the scrollbar doesn't overlap content. Remove `scrollbar-none` class if present (or keep it if the scrollbar is truly not needed here) — actually keep `scrollbar-none` on the small tab row, but ensure the main component list below has proper scrollbar visibility
- [x] **Right panel scrollbar**
  - [x] Verify the right panel's `overflow-y-auto` areas pick up the new scrollbar styling
- [x] **Settings dialog**
  - [x] Verify the settings dialog content area picks up the new scrollbar styling
- [x] Validate: dark theme → scrollbars match theme colors on macOS, Windows, Linux
- [x] Validate: light theme → scrollbars match light theme colors
- [x] Validate: component palette library section has proper padding for scrollbar visibility

---

### 10. Settings panel improvements

Fix font sizes, remove "?" icon, update shortcuts, add Support section.

- [x] **Font size increase**
  - [x] `src/components/panels/settings-dialog.tsx`:
    - [x] Section nav buttons: change `text-xs` → `text-sm`
    - [x] `SettingRow` label: change `text-xs` → `text-sm`
    - [x] `SettingRow` description: change `text-[10px]` → `text-xs`
    - [x] Section header in content area: change `text-xs` → `text-sm`
    - [x] Input elements: change `text-xs` → `text-sm`
    - [x] Shortcuts section shortcut labels: change `text-xs` → `text-sm`
    - [x] Shortcuts section kbd elements: change `text-[10px]` → `text-xs`
    - [x] Category headers in shortcuts: change `text-[10px]` → `text-xs`
    - [x] Overall dialog: consider increasing height from `h-[520px]` to `h-[560px]` to accommodate larger text
- [x] **Remove "?" (HelpCircle) icon from top menu bar**
  - [x] `src/components/layout/top-menu-bar.tsx`: remove the `MenuButton` for `btn-shortcuts-dialog` that shows the `<HelpCircle>` icon. The shortcuts section is accessible via Settings → Shortcuts tab and via `Cmd+/`
- [x] **Update shortcuts section**
  - [x] `src/types/settings.ts` — `KEYBOARD_SHORTCUTS`: verify completeness. Currently 26 shortcuts listed. Add any missing ones:
    - [x] `Cmd+K` — Command Palette (already present)
    - [x] `3` — AI Tab (already present)
    - [x] Arrow keys — Nudge Selected (already present)
    - [x] Check for Duplicate shortcut (`Cmd+D` or `Alt+Drag`) — already listed as `alt-drag-duplicate`
    - [x] Add any new shortcuts added during this batch (e.g., minimap toggle if we add one)
  - [x] Ensure category grouping is correct (some shortcuts like "Open Settings" are under "view" but could be "settings")
- [x] **Add "Support" section tab**
  - [x] `src/components/panels/settings-dialog.tsx` — `SECTIONS` array: add a new tab `{ id: "support", label: "Support", icon: <LifeBuoy> }`
  - [x] `src/stores/settings-store.ts` line 7: add `"support"` to `SettingsTab` union type (currently `"general" | "appearance" | "editor" | "ai" | "shortcuts"`)
  - [x] Create `SupportSection` component with:
    - [x] GitHub repo link: `https://github.com/exit-zero-labs/threat-forge` (verified from README.md line 43)
    - [x] Contact email: `admin@exitzerolabs.com` (as a `mailto:` link)
    - [x] "Report a bug" link → `https://github.com/exit-zero-labs/threat-forge/issues/new?template=bug-report.yml` (verified from CONTRIBUTING.md)
    - [x] "Feature request" link → `https://github.com/exit-zero-labs/threat-forge/issues/new?template=feature-request.yml` (verified from CONTRIBUTING.md)
    - [x] App version display
    - [x] Links should open in external browser (`window.open` or `@tauri-apps/plugin-shell` `open()`)
- [x] Validate: settings dialog fonts are readable
- [x] Validate: "?" icon is gone from top bar
- [x] Validate: Support tab shows all links and they open correctly

---

### 11. Resizable left and right panes

Make both sidebar panes draggable with min/max width constraints.

- [x] **Create a `ResizeHandle` component**
  - [x] `src/components/ui/resize-handle.tsx`: a vertical bar (~4px wide) that appears on the inner edge of each panel
  - [x] On hover: show a subtle grab cursor and change background (e.g., `bg-border` → `bg-primary/50`)
  - [x] On drag: track mouse delta, call a width setter
  - [x] Use `onPointerDown` + `onPointerMove` + `onPointerUp` (not drag events) for smooth resize
  - [x] Add `user-select: none` to body during drag to prevent text selection
- [x] **UI store — panel widths**
  - [x] `src/stores/ui-store.ts`: add `leftPanelWidth: number` (default: `224` = w-56), add `setLeftPanelWidth(width: number)` action
  - [x] `setRightPanelWidth` already exists (line 34) — just ensure it's wired up in the layout
  - [x] Define constants: `LEFT_PANEL_MIN = 180`, `LEFT_PANEL_MAX = 400`, `RIGHT_PANEL_MIN = 260`, `RIGHT_PANEL_MAX = 500`
  - [x] Persist widths in localStorage: the ui-store uses manual `localStorage` (not Zustand persist middleware) for theme. Add a similar `loadPersistedPanelWidths()` / `persistPanelWidths()` pattern with a `"threatforge-panel-widths"` key, or extend the existing theme storage key to include widths
- [x] **App layout integration**
  - [x] `src/components/layout/app-layout.tsx`:
    - [x] Left panel: replace `w-56` with `style={{ width: leftPanelWidth }}`. Render `<ResizeHandle>` on the right border of the left panel
    - [x] Right panel: replace `w-80` with `style={{ width: rightPanelWidth }}`. Render `<ResizeHandle>` on the left border of the right panel
    - [x] The hide/show toggle should still work as before
- [x] **Grab handle visual**
  - [x] The handle should be a thin vertical bar (2-4px) that's invisible by default, shows a subtle line on hover, and shows a more prominent line while dragging
  - [x] CSS cursor: `col-resize` on hover/drag
- [x] Validate: drag left panel border → width changes between min and max
- [x] Validate: drag right panel border → width changes between min and max
- [x] Validate: hide panel → show panel → width is remembered
- [x] Validate: widths persist across page reloads

---

### 12. Minimap improvements

Make the minimap slightly smaller, add hide toggle, add border.

- [x] **Settings store**
  - [x] `src/types/settings.ts` — `UserSettings`: add `minimapVisible: boolean` (default: `true`)
  - [x] Add to `DEFAULT_USER_SETTINGS`
- [x] **Settings UI**
  - [x] `src/components/panels/settings-dialog.tsx` — `EditorSection`: add a "Show minimap" toggle
- [x] **Minimap rendering**
  - [x] `src/components/canvas/dfd-canvas.tsx`: conditionally render `<MiniMap>` based on `minimapVisible` setting
  - [x] Add `style={{ width: 160, height: 120 }}` (slightly smaller than default ~200x150) or use `nodeBorderRadius`, `nodeStrokeWidth` etc.
  - [x] Add border: `className="!bg-card !border !border-border !rounded-md !shadow-sm"` (or similar — the `!` is for overriding ReactFlow defaults)
- [x] **Quick hide button on minimap**
  - [x] NOTE: `<MiniMap>` is rendered inside `<ReactFlow>` and uses `position: absolute; bottom: 0; right: 0;` internally. Cannot wrap it in a container div inside ReactFlow. Instead, add a sibling `<div>` after `<MiniMap>` inside `<ReactFlow>` that is also positioned `absolute bottom-0 right-0` with a small close button overlaid in the top-right corner of the minimap area. Use `pointer-events-none` on the container and `pointer-events-auto` on the button.
  - [x] The icon (e.g., `<EyeOff>` or `<X>` from Lucide, 12-14px) appears on hover over the minimap area (use a group hover pattern)
  - [x] Clicking it calls `useSettingsStore.getState().updateSetting("minimapVisible", false)`
  - [x] Can be re-enabled via Settings → Editor → Show minimap toggle
- [x] **Keyboard shortcut** (optional)
  - [x] Consider adding a shortcut to toggle minimap (e.g., `Cmd+M` if not taken) — add to shortcuts list if implemented
- [x] Validate: minimap shows with border, slightly smaller
- [x] Validate: hover over minimap → hide icon appears → click → minimap hidden
- [x] Validate: settings toggle re-shows minimap
- [x] Validate: setting persists across reloads

---

### 13. More library components + Cmd+K integration

Add more component types and make all components placeable via the command palette.

- [x] **New components** (add to `src/lib/component-library.ts`)
  - [x] **Networking category** (new):
    - [x] `vpn_gateway` — VPN Gateway (Shield icon)
    - [x] `api_endpoint` — API Endpoint (Waypoints icon)
    - [x] `webhook` — Webhook Receiver (Webhook icon)
    - [x] `service_mesh` — Service Mesh (Network icon)
  - [x] **Storage category** (add to existing Databases):
    - [x] `file_storage` — File Storage / NAS (FolderArchive icon)
    - [x] `data_lake` — Data Lake (Waves icon)
    - [x] `backup_service` — Backup Service (CloudUpload icon)
  - [x] **Security category** (add to existing):
    - [x] `waf` — Web Application Firewall (ShieldAlert icon)
    - [x] `siem` — SIEM / Log Aggregator (Radar icon)
    - [x] `identity_provider` — Identity Provider (UserCheck icon)
    - [x] `key_management` — Key Management Service (KeySquare icon)
  - [x] **Cloud/Platform category** (new):
    - [x] `kubernetes` — Kubernetes Cluster (Ship icon)
    - [x] `serverless_platform` — Serverless Platform (CloudCog icon)
    - [x] `ci_cd_pipeline` — CI/CD Pipeline (GitBranch icon)
    - [x] `container_registry` — Container Registry (PackageCheck icon)
  - [x] **Clients category** (add to existing):
    - [x] `api_client` — API Client / SDK (Code2 icon)
    - [x] `cli_tool` — CLI Tool (Terminal icon)
  - [x] For each new component: defined `type`, `label`, `category`, `icon`, `shape`, `strideCategory`, `tags`
- [x] **Update STRIDE mappings**
  - [x] `src/lib/component-library.ts` — `getStrideCategoryForType()`: stride categories set via strideCategory field on each component
  - [x] `src-tauri/src/stride/mod.rs` — `stride_category_for_type()`: added new store types (file_storage, data_lake, backup_service, key_management, container_registry) and actor types (api_client, cli_tool)
  - [x] `src/lib/stride-engine.ts` — browser STRIDE engine: uses `getStrideCategoryForType` from component-library, no separate change needed
- [x] **Cmd+K integration — add component placement commands**
  - [x] `src/lib/command-registry.ts`: updated `Command` category type to include `"component"`
  - [x] `src/lib/command-registry.ts` — `buildCommands()`: dynamically generates commands from `getAllComponents()`, places at viewport center
  - [x] Component commands only appear when `hasModel` is true (passed from CommandPalette)
  - [x] Viewport center calculation via `getViewportCenter()` helper
  - [x] `src/components/command-palette.tsx`: added "Add Component" to category labels, passes `hasModel` from model store
- [x] Validate: 244 TS tests pass (3 new command registry tests), 43 Rust tests pass
- [x] Validate: Cmd+K search filters components correctly by name
- [x] Validate: component commands only appear when a model is open

---

### 14. Component bugs (arrow key focus + canvas panning)

Two bugs: (a) arrow key nudge loses node focus, (b) arrow keys don't pan canvas when nothing is selected.

- [x] **Bug (a) — arrow key loses focus**
  - [x] **Verified root cause — this is a cascade of re-renders, NOT a simple selection issue:**
    1. `nudgeSelected()` (canvas-store.ts lines 625-644) does THREE things per arrow keypress:
       - `useHistoryStore.getState().pushSnapshot(...)` — mutates history store + `structuredClone` of entire model
       - `set({ nodes: updatedNodes })` — mutates canvas store
       - `useModelStore.setState({ model: updated, isDirty: true })` — mutates model store ← THIS IS THE PROBLEM
    2. `DfdCanvas` has a `useEffect` (dfd-canvas.tsx line 93) with `model` in its dependency array
    3. Changing the `model` reference triggers `syncFromModel()` which rebuilds ALL nodes from scratch
    4. All node DOM elements are destroyed and recreated → **focus is lost**
    5. Additionally, `pushSnapshot()` runs `structuredClone(model)` on every keypress (30+ times/sec when holding a key), which is expensive
  - [x] **Fix — two-part:**
    - [x] **(a) Don't trigger `syncFromModel` during nudge.** The `nudgeSelected()` function should NOT call `useModelStore.setState` with a new model reference. Instead, it should only update canvas node positions via `set({ nodes: updatedNodes })`. The model store should be updated only once when the nudge "gesture" ends (similar to how drag works with `preDragSnapshot`).
    - [x] **(b) Debounce history snapshots for nudge.** Use the same pattern as node drag: capture a `preNudgeSnapshot` on the first arrow keypress. Only push the snapshot once the nudge ends (detect via a timeout or keyup event). This prevents 30 snapshots per second of holding an arrow key.
  - [x] **Implementation in `canvas-store.ts` — `nudgeSelected()`:**
    - [x] Add a module-level `preNudgeSnapshot: ThreatModel | null` variable (like `preDragSnapshot`)
    - [x] On first nudge call: capture `preNudgeSnapshot = writePositionsToModel(model, get().nodes)`, don't push to history
    - [x] On each nudge: only `set({ nodes: updatedNodes })` — no model store update
    - [x] Add a debounced flush (e.g., 300ms after last nudge): push `preNudgeSnapshot` to history, then write final positions to model store, then clear `preNudgeSnapshot`
    - [x] This matches the drag behavior and avoids the `syncFromModel` cascade
  - [x] **Verify:** `DfdCanvas` useEffect should NOT fire during nudge because `model` reference doesn't change
- [x] **Bug (b) — arrow keys pan canvas when nothing selected**
  - [x] `src/hooks/use-keyboard-shortcuts.ts` — arrow key handler: currently does nothing when `hasSelection` is false. Add an `else` branch that pans the canvas
  - [x] Best approach: capture `panBy` from `useReactFlow()` via `setReactFlowActions`:
    - [x] `src/stores/canvas-store.ts`: add `rfPanBy: ((delta: {x: number, y: number}) => void) | null` to state, capture it in `setReactFlowActions`
    - [x] `src/components/canvas/dfd-canvas.tsx`: pass `panBy` from `useReactFlow()` into `setReactFlowActions`
    - [x] `src/hooks/use-keyboard-shortcuts.ts`: in the arrow key handler when `!hasSelection`, call `useCanvasStore.getState().rfPanBy?.({ x: -dx, y: -dy })`
  - [x] NOTE: using `setViewport` directly has zoom-scaling issues; `panBy` from ReactFlow handles this correctly
- [x] Validate: select node → hold arrow key → node moves smoothly AND stays selected (can nudge repeatedly without focus loss)
- [x] Validate: deselect all → arrow key → canvas pans
- [x] Validate: both behaviors work in sequence

---

### Notes

- Items 1-2 are **foundational** and should be done first since other items depend on them (item 2 is needed for items 3 and 4)
- Items 3-4 are **closely related** (self-loops + undo/redo for connectors) and should be done together
- Items 5-6 can be done independently
- Items 7-8 are **visual/UX** and can be done independently
- Item 9 is **global CSS** and is quick
- Items 10-12 are **settings/UI** improvements and can be done in any order
- Items 13-14 are **independent** and can be done anytime

### Suggested implementation order

1. File format extension change (#1) — quick, foundational
2. DataFlow handle persistence (#2) — foundational for #3 and #4
3. Undo/Redo + backspace fix (#4) — bug fix, depends on #2
4. Self-loop connectors (#3) — feature, depends on #2
5. Custom scrollbars (#9) — quick CSS win
6. Settings improvements (#10) — quick UI improvement
7. Component bugs (#14) — quick bug fixes
8. Minimap improvements (#12) — small feature
9. Resizable panes (#11) — medium feature
10. File naming (#6) — medium feature
11. Authoring (#5) — medium feature, schema change
12. Theme improvements (#7) — larger feature, many new themes
13. Empty state redesign (#8) — medium feature
14. More components + Cmd+K (#13) — larger feature
