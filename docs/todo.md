# Threat Forge - TODO List

Shared execution plan for humans and LLM agents. Update this file before, during, and after every work session.

---

## 2026-03-02 — Feature batch: UX improvements, file format, theming, bugs

### Overview

13 items from the high-level TODO, grouped into logical implementation units. Ordered by dependency (foundational changes first, then features that build on them).

NOTE: No backwards compatibility is needed, so breaking changes to the file format, Rust types, etc. are fine.

---

### 1. File format extension change (`.threatforge.yaml` → `.thf`)

Change the file extension everywhere. This is a breaking change (no migration needed per the NOTE).

- [ ] **Frontend — Tauri file adapter** (code)
  - [ ] `src/lib/adapters/tauri-file-adapter.ts` line 7-8: change `YAML_FILTER` from `{ name: "ThreatForge Model", extensions: ["threatforge.yaml", "yaml", "yml"] }` to `{ name: "ThreatForge Model", extensions: ["thf"] }`
  - [ ] `src/lib/adapters/tauri-file-adapter.ts` line 33: change `defaultPath` from `"model.threatforge.yaml"` to `"model.thf"`
- [ ] **Frontend — Browser file adapter** (code)
  - [ ] `src/lib/adapters/browser-file-adapter.ts` line 42: change `pickFile` accept from `".yaml,.yml"` to `".thf,.yaml,.yml"` (keep yaml/yml for backward compat in browser)
  - [ ] `src/lib/adapters/browser-file-adapter.ts` line 73: change download filename from `` `${filename}.threatforge.yaml` `` to `` `${filename}.thf` ``
- [ ] **Rust backend — doc comments** (cosmetic, update references)
  - [ ] `src-tauri/src/models/threat_model.rs` line 5: doc comment mentions `.threatforge.yaml`
  - [ ] `src-tauri/src/file_io/reader.rs` line 6: doc comment mentions `.threatforge.yaml`
  - [ ] `src-tauri/src/file_io/writer.rs` line 5: doc comment mentions `.threatforge.yaml`
- [ ] **Rust backend — test files** (update test filenames)
  - [ ] `src-tauri/src/file_io/reader.rs` lines 281, 365: test paths use `"test.threatforge.yaml"` → `"test.thf"`
  - [ ] `src-tauri/src/file_io/writer.rs` lines 64, 78, 88: test paths use `"test.threatforge.yaml"` → `"test.thf"`
- [ ] **Docs & config** (update extension references)
  - [ ] `README.md` line 92: `.threatforge.yaml` format reference
  - [ ] `CLAUDE.md` line 103: `.threatforge.yaml` file format reference
  - [ ] `.claude/rules/yaml-format.md` lines 3, 13, 45: three `.threatforge.yaml` references
  - [ ] `.claude/agents/threat-model-expert.md` line 30: `.threatforge.yaml` reference
  - [ ] `CONTRIBUTING.md` line 102: `.threatforge.yaml` reference
- [ ] Validate: open/save a file with the new `.thf` extension in dev mode
- [ ] Validate: Rust tests pass with new filenames (`cargo test`)

---

### 2. Add `source_handle` / `target_handle` to DataFlow model (prerequisite for undo/redo fix + self-loops)

Connectors need to persist their attachment point handles in the model so undo/redo restores exact handle pairs, and so self-loops can specify which handles to use.

- [ ] **TypeScript types**
  - [ ] `src/types/threat-model.ts`: add `source_handle?: string` and `target_handle?: string` to `DataFlow` interface
- [ ] **Rust types**
  - [ ] `src-tauri/src/models/threat_model.rs`: add `source_handle: Option<String>` and `target_handle: Option<String>` to `DataFlow` struct (with `#[serde(skip_serializing_if = "Option::is_none")]`)
- [ ] **Canvas store — write handles to model**
  - [ ] `src/stores/canvas-store.ts` — `addDataFlow()`: after determining handles (either from opts or smart routing), write them to the `newFlow` model object as `source_handle` / `target_handle`
  - [ ] `src/stores/canvas-store.ts` — `reverseEdge()`: also swap `source_handle` / `target_handle` on the model's `DataFlow` entry
  - [ ] `src/hooks/use-file-operations.ts` — `captureCanvasIntoModel()` (lines 44-55): currently only captures `label_offset` from edges. Add capture of `edge.sourceHandle` → `f.source_handle` and `edge.targetHandle` → `f.target_handle` in the `data_flows` map
- [ ] **Canvas store — read handles from model**
  - [ ] `src/stores/canvas-store.ts` — `flowToEdge()`: read `flow.source_handle` / `flow.target_handle` and set them on the edge (as `sourceHandle` / `targetHandle`)
  - [ ] `src/stores/canvas-store.ts` — `syncFromModel()`: the existing code that reads `existing?.sourceHandle` is now redundant since `flowToEdge` carries it — but keep it as a fallback for edges not yet saved with handles
- [ ] **Browser stride adapter**: no change needed (doesn't touch handles)
- [ ] Validate: create connectors, save, close, reopen — handles preserved
- [ ] Validate: undo after connector delete — handles restored to exact positions
- [ ] Update round-trip Rust tests if any test the DataFlow fields

---

### 3. Support same-node connectors (self-loops)

Allow data flows from a node to itself. Requires handle logic changes and a custom self-loop edge path.

- [ ] **Remove self-loop block**
  - [ ] `src/lib/canvas-utils.ts`: keep `isSelfLoop()` function but change its purpose (now just a detection helper, not a blocker)
  - [ ] `src/stores/canvas-store.ts` — `addDataFlow()`: remove the `if (isSelfLoop(...)) return null` guard
  - [ ] `src/components/canvas/dfd-canvas.tsx` — `isValidConnection()`: remove the `isSelfLoop` check
- [ ] **Handle assignment for self-loops**
  - [ ] `src/stores/canvas-store.ts` — `addDataFlow()`: when `sourceId === targetId`, if no explicit handles provided, pick a default pair (e.g., `right-source` → `top-target` or `bottom-source` → `right-target`) that creates a visible loop. If explicit handles are the same (e.g., both `right`), offset slightly
  - [ ] `src/lib/canvas-utils.ts`: add a `getSelfLoopHandlePair()` helper that returns a default handle pair for self-loops
- [ ] **Self-loop edge rendering**
  - [ ] `src/components/canvas/edges/data-flow-edge.tsx`: detect self-loop (`source === target`) and render a custom cubic bezier path that loops out from the source handle and back to the target handle (arc shape), instead of `getBezierPath()` which collapses to zero length for same-node connections
  - [ ] The loop path should arc outward from the node (e.g., 60-80px offset), creating a visible curved loop
  - [ ] Label positioning for self-loops: place at the apex of the loop arc
- [ ] **Duplicate edge detection for self-loops**
  - [ ] `src/lib/canvas-utils.ts` — `isDuplicateEdge()`: ensure self-loop edges can detect duplicates (same source+target+handles)
- [ ] **Validation in Rust**: no change needed — the validator doesn't block `from === to`
- [ ] Validate: drag a connector from a node back to itself — loop appears
- [ ] Validate: self-loop persists through save/reload
- [ ] Validate: undo/redo on self-loop preserves handles
- [ ] Update tests: `canvas-utils.test.ts` — update `isSelfLoop` tests, add `getSelfLoopHandlePair` tests

---

### 4. Undo/Redo for connectors fix + backspace delete fix

Two related bugs: (a) undo after connector delete doesn't restore exact handles, (b) can't delete connectors via backspace when they have properties.

Bug (a) is mostly fixed by item #2 above (persisting handles in model). This item covers the remaining edge cases and bug (b).

- [ ] **Bug (a) — verify fix from item #2**
  - [ ] **Verified root cause:** When undo fires, `syncFromModel()` rebuilds edges from the model snapshot. It tries to get handle info from `existingEdgeMap` (built from `get().edges`), but the edge was already removed from the canvas during deletion. And `flowToEdge()` produces edges with NO handles set (the `DataFlow` type has no handle fields). Result: edge re-created with wrong/default handles.
  - [ ] After item #2 is implemented, `flowToEdge()` will read `flow.source_handle` / `flow.target_handle` from the model snapshot — handles will be correctly restored.
  - [ ] Test: create connector with specific handles → delete → undo → verify handles restored at exact attachment points
- [ ] **Bug (b) — backspace/delete on connectors with properties**
  - [ ] **Verified root cause:** This is NOT a focus issue. The exact chain:
    1. `deleteKeyCode={null}` on `<ReactFlow>` (dfd-canvas.tsx line 334) disables ReactFlow's native delete
    2. A manual `onKeyDown` handler on the wrapper `<div>` (dfd-canvas.tsx lines 182-189) calls `deleteSelected()` on Delete/Backspace
    3. When user clicks the label `<button>` (data-flow-edge.tsx), the `pointerdown` handler calls `e.stopPropagation()` (line 108), preventing ReactFlow from seeing the click
    4. This means ReactFlow never sets `edge.selected = true` in its internal edge state — only `useModelStore.setSelectedEdge(id)` is called (model store, not canvas store)
    5. `deleteSelected()` checks `edges.filter(e => e.selected)` — finds nothing — early return
    6. Clicking the edge PATH (not label) works because ReactFlow handles the click natively and sets `edge.selected = true`
  - [ ] **Fix in `src/components/canvas/edges/data-flow-edge.tsx`:** In the `pointerdown` handler (around line 127), after calling `useModelStore.getState().setSelectedEdge(id)`, also mark the edge as selected in the canvas store:
    ```ts
    // Set edge as selected in canvas store so deleteSelected() can find it
    useCanvasStore.getState().setEdges?.(edges =>
      edges.map(e => ({ ...e, selected: e.id === id }))
    );
    ```
    Or use `useCanvasStore.setState` to update the `edges` array directly, setting `selected: true` on the matching edge and `false` on all others. (Note: need to also deselect all nodes when selecting an edge this way)
  - [ ] **Alternative (simpler):** In `deleteSelected()` (`canvas-store.ts` line 503+), also check `useModelStore.getState().selectedEdgeId` as a fallback — if no edges are selected in ReactFlow but an edge is selected in the model store, delete that edge
- [ ] Validate: click connector LABEL → press Backspace → connector deleted
- [ ] Validate: click connector PATH → press Backspace → connector deleted
- [ ] Validate: delete connector → undo → exact handles restored

---

### 5. Add authoring (name/email settings + edit tracking)

Add user identity settings and record authoring metadata on the model and elements.

- [ ] **Settings store**
  - [ ] `src/types/settings.ts` — `UserSettings`: add `authorName: string` (default: `""`) and `authorEmail: string` (default: `""`)
  - [ ] `src/stores/settings-store.ts`: add defaults for new settings
- [ ] **Settings UI**
  - [ ] `src/components/panels/settings-dialog.tsx` — `GeneralSection`: add "Author name" and "Author email" text inputs at the top of the section. These are the user's identity for authoring metadata
- [ ] **TypeScript types — metadata**
  - [ ] `src/types/threat-model.ts` — `Metadata`: add `created_by?: string` (name + email format)
  - [ ] `src/types/threat-model.ts` — `Metadata`: change `modified` to remain as-is (ISO date string) but add `modified_by?: string`
  - [ ] `src/types/threat-model.ts` — `Metadata`: add `last_edit_timestamp?: number` (Unix timestamp for git blame friendliness)
- [ ] **Rust types**
  - [ ] `src-tauri/src/models/threat_model.rs`: add `created_by: Option<String>`, `modified_by: Option<String>`, `last_edit_timestamp: Option<i64>` to `Metadata` struct (all with `skip_serializing_if`)
- [ ] **Auto-populate authoring on save**
  - [ ] `src/hooks/use-file-operations.ts` — `saveModel()`: before calling the file adapter, update `model.metadata.modified` to today's date, `model.metadata.modified_by` to `"{name} <{email}>"` from settings, `model.metadata.last_edit_timestamp` to `Math.floor(Date.now() / 1000)`
  - [ ] On `newModel()`: set `model.metadata.created_by` to `"{name} <{email}>"` from settings, set `model.metadata.author` to the name from settings if author is empty
- [ ] Validate: create new model with name/email set → save → check YAML has `created_by` and `modified_by`
- [ ] Validate: open existing model → make change → save → `modified_by` and `last_edit_timestamp` updated

---

### 6. File naming (editable title in top bar + save-as behavior)

The top-left title should be editable and trigger save-as behavior.

- [ ] **TopMenuBar component**
  - [ ] `src/components/layout/top-menu-bar.tsx`: replace the static `<span>` for `displayTitle` with an editable component
  - [ ] On double-click: enter edit mode (show an `<input>` in place of the span, pre-filled with current title)
  - [ ] On Enter: commit the new title. If the file has never been saved (no `filePath`), trigger "Save As" dialog. If the file has been saved before, trigger "Save As" with the new name
  - [ ] On Escape / blur: if new file with no path, trigger "Save As". If existing file, cancel the edit (revert to original title)
  - [ ] Update `model.metadata.title` in the model store when title changes
  - [ ] The display should show the file name (from `filePath` basename without extension) when a file is saved, or the model title when unsaved. Show `*` suffix when dirty
- [ ] **Model store**
  - [ ] `src/stores/model-store.ts`: add a `updateMetadata(updates: Partial<Metadata>)` action (no such method currently exists — the store only has `setModel` for full model replacement and `updateElement` for elements). Pattern: `set({ model: { ...model, metadata: { ...model.metadata, ...updates } }, isDirty: true })`
- [ ] Validate: double-click title → edit → press Enter → save-as dialog appears (for new file)
- [ ] Validate: double-click title on saved file → edit → press Enter → save-as with new name
- [ ] Validate: title reflects file name after saving

---

### 7. Theme selection improvements

Redesign the theme picker to support separate light/dark theme selection, and add more themes.

- [ ] **New themes** (add to `src/lib/themes/presets.ts`)
  - [ ] **Dark themes to add:**
    - [ ] `dracula` — Dracula color scheme (purple/pink/green on dark bg)
    - [ ] `monokai` — Monokai-inspired (warm tones on dark brown/black)
    - [ ] `github-dark` — GitHub's dark theme colors
    - [ ] `one-dark` — Atom One Dark colors
    - [ ] `catppuccin-mocha` — Catppuccin Mocha palette
  - [ ] **Light themes to add:**
    - [ ] `github-light` — GitHub's light theme colors
    - [ ] `solarized-light` — Solarized Light palette
    - [ ] `one-light` — Atom One Light colors
    - [ ] `catppuccin-latte` — Catppuccin Latte palette
  - [ ] Each theme needs all ~30 oklch tokens. Research the source palettes and map to the token schema
- [ ] **Theme state model change**
  - [ ] `src/stores/ui-store.ts`: change persisted state from `{ mode, presetId }` to `{ mode, lightPresetId, darkPresetId }`
  - [ ] `src/stores/ui-store.ts` — `setTheme()`: update to accept `mode`, `lightPresetId`, and/or `darkPresetId` separately
  - [ ] `src/stores/ui-store.ts` — `resolvePresetForMode()`: when mode is `"light"` or resolved to light, use `lightPresetId`; when dark, use `darkPresetId`
  - [ ] `src/stores/ui-store.ts` — `loadPersistedTheme()`: handle migration from old format `{ mode, presetId }` to new format `{ mode, lightPresetId, darkPresetId }` — map old `presetId` to the correct light/dark slot based on the preset's mode
- [ ] **Theme picker UI redesign**
  - [ ] `src/components/panels/theme-picker.tsx` — current UI already shows Mode selector + "Dark Themes" + "Light Themes" sections. Changes needed:
    1. Wire up `handlePresetChange` to call the new `setTheme` which accepts separate light/dark preset IDs
    2. Show a check mark on the active light preset AND the active dark preset (currently only one preset is marked active)
    3. Section labels: change "Dark Themes" → "For dark mode:" and "Light Themes" → "For light mode:"
    4. When mode is Light, visually dim the dark themes section (but still allow selection for when user switches)
    5. When mode is Dark, visually dim the light themes section
    6. When mode is System, both sections are fully active
  - [ ] Each swatch already shows a color dot + name + check icon — enhance with 2-3 representative color dots (background, primary, accent from the theme tokens)
- [ ] Validate: switch between modes → correct themes applied
- [ ] Validate: set different light and dark themes → switch to System mode → both are used correctly
- [ ] Validate: persist and reload — both theme selections survive browser refresh

---

### 8. Empty state / welcome screen redesign

Replace the basic empty canvas with an engaging welcome experience.

- [ ] **Brand logo**
  - [ ] `src/components/canvas/canvas.tsx` — `EmptyCanvas`: replace `<Shield>` icon with the actual logo (`<img src="/logo_square.png">` or a larger version). Make it bigger (e.g., `h-20 w-20` or `h-24 w-24`)
- [ ] **Rotating tips/quotes**
  - [ ] Create `src/lib/tips.ts` with an array of 20-30 tips/quotes. Include the user's examples plus more:
    - Security proverbs and wisdom
    - Threat modeling tips
    - STRIDE methodology reminders
    - Motivational security quotes
  - [ ] `src/components/canvas/canvas.tsx` — `EmptyCanvas`: add a `<RotatingTip />` component that:
    - Displays one tip at a time with a fade-in/fade-out animation (CSS opacity transition, ~500ms)
    - Rotates every 6-8 seconds
    - Picks randomly from the array (no immediate repeat)
    - Respects `reduceMotion` setting (if set, just show static text, no animation)
    - Styled in italic, muted-foreground, max-width so it wraps nicely
- [ ] **Footer**
  - [ ] Add a footer at the bottom of the empty state with:
    - "Built by Exit Zero Labs LLC" text
    - GitHub link (icon + "GitHub")
    - "Documentation" link
    - Version number
  - [ ] Footer should be `absolute bottom-0` or flexbox pushed to bottom, subtle `text-muted-foreground text-xs`
- [ ] **Layout polish**
  - [ ] Center the main content (logo, title, description, buttons) vertically with some upward bias (not dead center — more like 40% from top)
  - [ ] Add subtle background decoration (optional — maybe a very faint grid pattern or gradient)
- [ ] Validate: open app with no file → see redesigned empty state
- [ ] Validate: tips rotate smoothly, no flicker
- [ ] Validate: reduce motion setting disables animation

---

### 9. Custom scrollbars (cross-platform theme-aware)

Implement custom scrollbar styling that follows the current theme on all platforms.

- [ ] **Global scrollbar CSS**
  - [ ] `src/styles.css`: add `::-webkit-scrollbar` rules that use the theme's CSS custom properties. NOTE: the theme uses oklch values, and `opacity` on scrollbar pseudo-elements is ignored in WebKit — use `oklch(... / alpha)` syntax instead:
    ```css
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: oklch(from var(--color-muted-foreground) l c h / 0.4); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: oklch(from var(--color-muted-foreground) l c h / 0.6); }
    ::-webkit-scrollbar-corner { background: transparent; }
    ```
    NOTE: `oklch(from ...)` relative color syntax may not work in all WebView versions. Fallback: use a hardcoded semi-transparent gray (`rgba(128,128,128,0.3)`) and override per-theme via the `applyTheme()` function if needed. Test in Tauri's WebView.
  - [ ] Also add Firefox scrollbar styling: `scrollbar-width: thin; scrollbar-color: var(--color-muted-foreground) transparent;` on `*` or `html`
- [ ] **Component palette horizontal scroll padding**
  - [ ] `src/components/palette/component-palette.tsx`: the horizontal scrolling category tabs area — add `pb-1` or `pb-1.5` padding so the scrollbar doesn't overlap content. Remove `scrollbar-none` class if present (or keep it if the scrollbar is truly not needed here) — actually keep `scrollbar-none` on the small tab row, but ensure the main component list below has proper scrollbar visibility
- [ ] **Right panel scrollbar**
  - [ ] Verify the right panel's `overflow-y-auto` areas pick up the new scrollbar styling
- [ ] **Settings dialog**
  - [ ] Verify the settings dialog content area picks up the new scrollbar styling
- [ ] Validate: dark theme → scrollbars match theme colors on macOS, Windows, Linux
- [ ] Validate: light theme → scrollbars match light theme colors
- [ ] Validate: component palette library section has proper padding for scrollbar visibility

---

### 10. Settings panel improvements

Fix font sizes, remove "?" icon, update shortcuts, add Support section.

- [ ] **Font size increase**
  - [ ] `src/components/panels/settings-dialog.tsx`:
    - [ ] Section nav buttons: change `text-xs` → `text-sm`
    - [ ] `SettingRow` label: change `text-xs` → `text-sm`
    - [ ] `SettingRow` description: change `text-[10px]` → `text-xs`
    - [ ] Section header in content area: change `text-xs` → `text-sm`
    - [ ] Input elements: change `text-xs` → `text-sm`
    - [ ] Shortcuts section shortcut labels: change `text-xs` → `text-sm`
    - [ ] Shortcuts section kbd elements: change `text-[10px]` → `text-xs`
    - [ ] Category headers in shortcuts: change `text-[10px]` → `text-xs`
    - [ ] Overall dialog: consider increasing height from `h-[520px]` to `h-[560px]` to accommodate larger text
- [ ] **Remove "?" (HelpCircle) icon from top menu bar**
  - [ ] `src/components/layout/top-menu-bar.tsx`: remove the `MenuButton` for `btn-shortcuts-dialog` that shows the `<HelpCircle>` icon. The shortcuts section is accessible via Settings → Shortcuts tab and via `Cmd+/`
- [ ] **Update shortcuts section**
  - [ ] `src/types/settings.ts` — `KEYBOARD_SHORTCUTS`: verify completeness. Currently 26 shortcuts listed. Add any missing ones:
    - [ ] `Cmd+K` — Command Palette (already present)
    - [ ] `3` — AI Tab (already present)
    - [ ] Arrow keys — Nudge Selected (already present)
    - [ ] Check for Duplicate shortcut (`Cmd+D` or `Alt+Drag`) — already listed as `alt-drag-duplicate`
    - [ ] Add any new shortcuts added during this batch (e.g., minimap toggle if we add one)
  - [ ] Ensure category grouping is correct (some shortcuts like "Open Settings" are under "view" but could be "settings")
- [ ] **Add "Support" section tab**
  - [ ] `src/components/panels/settings-dialog.tsx` — `SECTIONS` array: add a new tab `{ id: "support", label: "Support", icon: <LifeBuoy> }`
  - [ ] `src/stores/settings-store.ts` line 7: add `"support"` to `SettingsTab` union type (currently `"general" | "appearance" | "editor" | "ai" | "shortcuts"`)
  - [ ] Create `SupportSection` component with:
    - [ ] GitHub repo link: `https://github.com/exit-zero-labs/threat-forge` (verified from README.md line 43)
    - [ ] Contact email: `admin@exitzerolabs.com` (as a `mailto:` link)
    - [ ] "Report a bug" link → `https://github.com/exit-zero-labs/threat-forge/issues/new?template=bug-report.yml` (verified from CONTRIBUTING.md)
    - [ ] "Feature request" link → `https://github.com/exit-zero-labs/threat-forge/issues/new?template=feature-request.yml` (verified from CONTRIBUTING.md)
    - [ ] App version display
    - [ ] Links should open in external browser (`window.open` or `@tauri-apps/plugin-shell` `open()`)
- [ ] Validate: settings dialog fonts are readable
- [ ] Validate: "?" icon is gone from top bar
- [ ] Validate: Support tab shows all links and they open correctly

---

### 11. Resizable left and right panes

Make both sidebar panes draggable with min/max width constraints.

- [ ] **Create a `ResizeHandle` component**
  - [ ] `src/components/ui/resize-handle.tsx`: a vertical bar (~4px wide) that appears on the inner edge of each panel
  - [ ] On hover: show a subtle grab cursor and change background (e.g., `bg-border` → `bg-primary/50`)
  - [ ] On drag: track mouse delta, call a width setter
  - [ ] Use `onPointerDown` + `onPointerMove` + `onPointerUp` (not drag events) for smooth resize
  - [ ] Add `user-select: none` to body during drag to prevent text selection
- [ ] **UI store — panel widths**
  - [ ] `src/stores/ui-store.ts`: add `leftPanelWidth: number` (default: `224` = w-56), add `setLeftPanelWidth(width: number)` action
  - [ ] `setRightPanelWidth` already exists (line 34) — just ensure it's wired up in the layout
  - [ ] Define constants: `LEFT_PANEL_MIN = 180`, `LEFT_PANEL_MAX = 400`, `RIGHT_PANEL_MIN = 260`, `RIGHT_PANEL_MAX = 500`
  - [ ] Persist widths in localStorage: the ui-store uses manual `localStorage` (not Zustand persist middleware) for theme. Add a similar `loadPersistedPanelWidths()` / `persistPanelWidths()` pattern with a `"threatforge-panel-widths"` key, or extend the existing theme storage key to include widths
- [ ] **App layout integration**
  - [ ] `src/components/layout/app-layout.tsx`:
    - [ ] Left panel: replace `w-56` with `style={{ width: leftPanelWidth }}`. Render `<ResizeHandle>` on the right border of the left panel
    - [ ] Right panel: replace `w-80` with `style={{ width: rightPanelWidth }}`. Render `<ResizeHandle>` on the left border of the right panel
    - [ ] The hide/show toggle should still work as before
- [ ] **Grab handle visual**
  - [ ] The handle should be a thin vertical bar (2-4px) that's invisible by default, shows a subtle line on hover, and shows a more prominent line while dragging
  - [ ] CSS cursor: `col-resize` on hover/drag
- [ ] Validate: drag left panel border → width changes between min and max
- [ ] Validate: drag right panel border → width changes between min and max
- [ ] Validate: hide panel → show panel → width is remembered
- [ ] Validate: widths persist across page reloads

---

### 12. Minimap improvements

Make the minimap slightly smaller, add hide toggle, add border.

- [ ] **Settings store**
  - [ ] `src/types/settings.ts` — `UserSettings`: add `minimapVisible: boolean` (default: `true`)
  - [ ] Add to `DEFAULT_USER_SETTINGS`
- [ ] **Settings UI**
  - [ ] `src/components/panels/settings-dialog.tsx` — `EditorSection`: add a "Show minimap" toggle
- [ ] **Minimap rendering**
  - [ ] `src/components/canvas/dfd-canvas.tsx`: conditionally render `<MiniMap>` based on `minimapVisible` setting
  - [ ] Add `style={{ width: 160, height: 120 }}` (slightly smaller than default ~200x150) or use `nodeBorderRadius`, `nodeStrokeWidth` etc.
  - [ ] Add border: `className="!bg-card !border !border-border !rounded-md !shadow-sm"` (or similar — the `!` is for overriding ReactFlow defaults)
- [ ] **Quick hide button on minimap**
  - [ ] NOTE: `<MiniMap>` is rendered inside `<ReactFlow>` and uses `position: absolute; bottom: 0; right: 0;` internally. Cannot wrap it in a container div inside ReactFlow. Instead, add a sibling `<div>` after `<MiniMap>` inside `<ReactFlow>` that is also positioned `absolute bottom-0 right-0` with a small close button overlaid in the top-right corner of the minimap area. Use `pointer-events-none` on the container and `pointer-events-auto` on the button.
  - [ ] The icon (e.g., `<EyeOff>` or `<X>` from Lucide, 12-14px) appears on hover over the minimap area (use a group hover pattern)
  - [ ] Clicking it calls `useSettingsStore.getState().updateSetting("minimapVisible", false)`
  - [ ] Can be re-enabled via Settings → Editor → Show minimap toggle
- [ ] **Keyboard shortcut** (optional)
  - [ ] Consider adding a shortcut to toggle minimap (e.g., `Cmd+M` if not taken) — add to shortcuts list if implemented
- [ ] Validate: minimap shows with border, slightly smaller
- [ ] Validate: hover over minimap → hide icon appears → click → minimap hidden
- [ ] Validate: settings toggle re-shows minimap
- [ ] Validate: setting persists across reloads

---

### 13. More library components + Cmd+K integration

Add more component types and make all components placeable via the command palette.

- [ ] **New components** (add to `src/lib/component-library.ts`)
  - [ ] **Networking category** (new):
    - [ ] `vpn_gateway` — VPN Gateway (Shield icon or similar)
    - [ ] `api_endpoint` — API Endpoint
    - [ ] `webhook` — Webhook Receiver
    - [ ] `service_mesh` — Service Mesh (e.g., Istio, Linkerd)
  - [ ] **Storage category** (add to existing Databases):
    - [ ] `file_storage` — File Storage / NAS
    - [ ] `data_lake` — Data Lake
    - [ ] `backup_service` — Backup Service
  - [ ] **Security category** (add to existing):
    - [ ] `waf` — Web Application Firewall
    - [ ] `siem` — SIEM / Log Aggregator
    - [ ] `identity_provider` — Identity Provider (IdP)
    - [ ] `key_management` — Key Management Service (KMS)
  - [ ] **Cloud/Platform category** (new):
    - [ ] `kubernetes` — Kubernetes Cluster
    - [ ] `serverless_platform` — Serverless Platform
    - [ ] `ci_cd_pipeline` — CI/CD Pipeline
    - [ ] `container_registry` — Container Registry
  - [ ] **Clients category** (add to existing):
    - [ ] `api_client` — API Client / SDK
    - [ ] `cli_tool` — CLI Tool
  - [ ] For each new component: define `type`, `label`, `category`, `icon` (pick from Lucide icons), `shape`, `strideCategory`, `tags` for search
- [ ] **Update STRIDE mappings**
  - [ ] `src/lib/component-library.ts` — `getStrideCategoryForType()`: add stride categories for all new types
  - [ ] `src-tauri/src/stride/mod.rs` — `stride_category_for_type()`: add the same mappings in Rust
  - [ ] `src/lib/stride-engine.ts` — browser STRIDE engine: uses `getStrideCategoryForType` from component-library, so no separate change needed
- [ ] **Cmd+K integration — add component placement commands**
  - [ ] `src/lib/command-registry.ts` line 14: update `Command` category type from `"file" | "view" | "canvas" | "navigate" | "settings"` to include `"component"`
  - [ ] `src/lib/command-registry.ts` — `buildCommands()`: dynamically generate commands from `getAllComponents()` (from component-library.ts). For each component:
    - ID: `component:{type}` (e.g., `component:sql_database`)
    - Label: `Add {label}` (e.g., `Add SQL Database`)
    - Category: `"component"`
    - Action: call `useCanvasStore.getState().addElement(type, viewportCenter, { subtype, icon, name })` where `viewportCenter` is computed from the current viewport
  - [ ] Component commands should only appear when `useModelStore.getState().model !== null` — filter in `buildCommands()` or `searchCommands()`
  - [ ] Viewport center calculation: given viewport `{x, y, zoom}` and canvas container dimensions, center = `{ x: (-viewport.x + containerWidth/2) / viewport.zoom, y: (-viewport.y + containerHeight/2) / viewport.zoom }`
  - [ ] `src/components/command-palette.tsx`: add `"component"` to the category labels/groups, ensure the component category renders well (maybe with a small icon from the component's icon map)
- [ ] Validate: search for a component in Cmd+K → select → component placed on canvas
- [ ] Validate: Cmd+K search filters components correctly by name
- [ ] Validate: component commands only appear when a model is open

---

### 14. Component bugs (arrow key focus + canvas panning)

Two bugs: (a) arrow key nudge loses node focus, (b) arrow keys don't pan canvas when nothing is selected.

- [ ] **Bug (a) — arrow key loses focus**
  - [ ] **Verified root cause — this is a cascade of re-renders, NOT a simple selection issue:**
    1. `nudgeSelected()` (canvas-store.ts lines 625-644) does THREE things per arrow keypress:
       - `useHistoryStore.getState().pushSnapshot(...)` — mutates history store + `structuredClone` of entire model
       - `set({ nodes: updatedNodes })` — mutates canvas store
       - `useModelStore.setState({ model: updated, isDirty: true })` — mutates model store ← THIS IS THE PROBLEM
    2. `DfdCanvas` has a `useEffect` (dfd-canvas.tsx line 93) with `model` in its dependency array
    3. Changing the `model` reference triggers `syncFromModel()` which rebuilds ALL nodes from scratch
    4. All node DOM elements are destroyed and recreated → **focus is lost**
    5. Additionally, `pushSnapshot()` runs `structuredClone(model)` on every keypress (30+ times/sec when holding a key), which is expensive
  - [ ] **Fix — two-part:**
    - [ ] **(a) Don't trigger `syncFromModel` during nudge.** The `nudgeSelected()` function should NOT call `useModelStore.setState` with a new model reference. Instead, it should only update canvas node positions via `set({ nodes: updatedNodes })`. The model store should be updated only once when the nudge "gesture" ends (similar to how drag works with `preDragSnapshot`).
    - [ ] **(b) Debounce history snapshots for nudge.** Use the same pattern as node drag: capture a `preNudgeSnapshot` on the first arrow keypress. Only push the snapshot once the nudge ends (detect via a timeout or keyup event). This prevents 30 snapshots per second of holding an arrow key.
  - [ ] **Implementation in `canvas-store.ts` — `nudgeSelected()`:**
    - [ ] Add a module-level `preNudgeSnapshot: ThreatModel | null` variable (like `preDragSnapshot`)
    - [ ] On first nudge call: capture `preNudgeSnapshot = writePositionsToModel(model, get().nodes)`, don't push to history
    - [ ] On each nudge: only `set({ nodes: updatedNodes })` — no model store update
    - [ ] Add a debounced flush (e.g., 300ms after last nudge): push `preNudgeSnapshot` to history, then write final positions to model store, then clear `preNudgeSnapshot`
    - [ ] This matches the drag behavior and avoids the `syncFromModel` cascade
  - [ ] **Verify:** `DfdCanvas` useEffect should NOT fire during nudge because `model` reference doesn't change
- [ ] **Bug (b) — arrow keys pan canvas when nothing selected**
  - [ ] `src/hooks/use-keyboard-shortcuts.ts` — arrow key handler: currently does nothing when `hasSelection` is false. Add an `else` branch that pans the canvas
  - [ ] Best approach: capture `panBy` from `useReactFlow()` via `setReactFlowActions`:
    - [ ] `src/stores/canvas-store.ts`: add `rfPanBy: ((delta: {x: number, y: number}) => void) | null` to state, capture it in `setReactFlowActions`
    - [ ] `src/components/canvas/dfd-canvas.tsx`: pass `panBy` from `useReactFlow()` into `setReactFlowActions`
    - [ ] `src/hooks/use-keyboard-shortcuts.ts`: in the arrow key handler when `!hasSelection`, call `useCanvasStore.getState().rfPanBy?.({ x: -dx, y: -dy })`
  - [ ] NOTE: using `setViewport` directly has zoom-scaling issues; `panBy` from ReactFlow handles this correctly
- [ ] Validate: select node → hold arrow key → node moves smoothly AND stays selected (can nudge repeatedly without focus loss)
- [ ] Validate: deselect all → arrow key → canvas pans
- [ ] Validate: both behaviors work in sequence

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
