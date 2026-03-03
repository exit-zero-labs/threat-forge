# Threat Forge - TODO List

Shared execution plan for humans and LLM agents. Update this file before, during, and after every work session.

---

## 2026-03-02 — Backlog Batch #1: UX polish items

Six items from backlog, ordered by priority and dependency.

### Item 1: Window Titling
> Window/tab title should reflect the current file: "Threat Forge - {filename without extension}"

- [x] Add `"core:window:allow-set-title"` to `src-tauri/capabilities/default.json`
- [x] Create `src/hooks/use-window-title.ts` hook
  - [x] Watch `filePath`, `isDirty`, and `model` from model store
  - [x] Format: `"Threat Forge"` (no file), `"Threat Forge - {basename}"` (file open), `"Threat Forge - {basename} *"` (unsaved changes)
  - [x] Call `getCurrentWindow().setTitle()` from `@tauri-apps/api/window`
  - [x] Also set `document.title` as browser fallback
- [x] Wire hook into `AppLayout` component
- [ ] Validate: open file, check title; save, check title; new model, check title; close, check title

### Item 2: Default Theme to "System"
> Make default theme mode "System" instead of "Dark"

- [x] Change `defaultThemeState()` in `src/stores/ui-store.ts`: `themeMode: "dark"` → `"system"`
- [x] Update `ui-store.test.ts` — changed default theme expectation and beforeEach reset
- [ ] Validate: clear localStorage, reload — app should follow OS theme preference

### Item 3: Merge "Editor" Settings into "Appearance"
> Remove the "Editor" settings tab; merge its items into "Appearance"

- [x] In `src/components/panels/settings-dialog.tsx`:
  - [x] Remove `"editor"` entry from `SECTIONS` array
  - [x] Move Grid snap, Grid size, Show minimap into `AppearanceSection` under a "Canvas" divider
  - [x] Delete `EditorSection` function
- [x] In `src/stores/settings-store.ts`:
  - [x] Remove `"editor"` from `SettingsTab` union type
- [x] Update `src/components/panels/settings-dialog.test.tsx`:
  - [x] Remove tests that reference the "Editor" tab
  - [x] Add tests for canvas settings appearing in "Appearance" tab
- [ ] Validate: open Settings → Appearance; verify grid/minimap controls present; verify no "Editor" tab

### Item 4: Font Size Preferences
> Add font sizing options to the settings panel

- [x] In `src/types/settings.ts`:
  - [x] Add `fontSize: "small" | "default" | "large"` to `UserSettings`
  - [x] Add `FontSize` type and `FONT_SIZE_PX` mapping constant
  - [x] Add default `fontSize: "default"` to `DEFAULT_USER_SETTINGS`
- [x] In `src/components/panels/settings-dialog.tsx`:
  - [x] Add `FontSizeSelector` segmented control component (Small / Default / Large)
  - [x] Add font size selector to `AppearanceSection`
- [x] In `src/components/layout/app-layout.tsx`:
  - [x] Apply font size preference via `useEffect` setting `document.documentElement.style.fontSize`
- [x] Update `settings-store.test.ts` for the new `fontSize` default
- [ ] Validate: change font size in settings; verify UI text scales across all panels

### Item 5: Fix Alt+Drag Duplicate Behavior
> Alt+drag should drag a new copy, leaving the original in place (currently the original moves)

- [x] In `src/stores/canvas-store.ts`:
  - [x] Modify `duplicateElement` to return `string | null` (the new element ID)
- [x] In `src/components/canvas/dfd-canvas.tsx`:
  - [x] Add `altDragRef` to track Alt+drag state: `{ originalId, cloneId, startPos }`
  - [x] On `onNodeDragStart` with Alt: create clone at original position, store state in ref
  - [x] Add `onNodeDragStop` handler: if altDragRef is set, swap positions (move clone to drop point, move original back to start)
  - [x] Clear altDragRef after swap; select the clone
- [ ] Validate: Alt+drag a node → original stays in place, copy appears at drop location

### Item 6: Examples and Templates
> On empty state, add options to open pre-made example threat models

- [x] Create `src/lib/templates.ts` with 3 inline template builders:
  - [x] `web-application` — browser, web server, API, database, auth provider
  - [x] `microservices` — mobile app, API gateway, user/order services, MQ, cache, databases
  - [x] `mobile-app` — mobile client, API backend, DB, file storage, push notifications, analytics
- [x] In `src/components/canvas/canvas.tsx`:
  - [x] Add "Start from Template" section to `EmptyCanvas` with template cards
  - [x] Add `TemplateCard` component with name, description, file icon
  - [x] On click: load template via `loadTemplate()`, set pending layout, set model
- [ ] Validate: launch app → empty state shows templates; click template → model loads on canvas

### Validation & Cleanup
- [x] Run `npx biome check --write .` — lint/format clean (only pre-existing !important warning)
- [x] Run `npx vitest --run` — all 276 tests pass
- [x] Run `npx tsc --noEmit` — zero type errors
- [x] Run `cargo clippy` — no Rust changes, skip (confirmed clean)
- [ ] Manual smoke test: full workflow (new, open, edit, save, reopen)

### Deep Code Review Fixes (post-implementation)
- [x] **Alt+drag history corruption** — `duplicateElement` was pushing snapshot, `onNodesChange` drag-end was pushing `preDragSnapshot`, creating corrupt undo state. Fixed by:
  - Added `altDragActive` flag in canvas-store; `onNodesChange` skips drag-end history push when flag is set
  - Added `skipHistory` option to `duplicateElement` — Alt+drag passes `true` to avoid extra snapshot
  - `onNodeDragStart` captures pre-clone snapshot before cloning
  - `onNodeDragStop` pushes a single clean history entry
- [x] **Alt+drag cancellation leaves orphaned clone** — If drag stops on unexpected node, cleanup removes clone and reverts model to pre-clone snapshot
- [x] **Font size corrupted localStorage** — Added `null` guard on `FONT_SIZE_PX[fontSize]` lookup before setting `document.documentElement.style.fontSize`
- [x] **Window title async race condition** — Added version counter (`titleVersionRef`) so stale `setNativeTitle` calls are discarded after the async `import()` resolves
- [x] **Template loading robustness** — `setPendingLayout()` always called (not conditionally), handles `null` correctly
- [x] Re-ran full validation: tsc clean, biome clean, 276/276 tests pass

### Notes
- Window title: uses Tauri v2 `getCurrentWindow().setTitle()` with `document.title` browser fallback; async race prevented via version counter
- Theme default: only affects new users; existing users keep their persisted preference from localStorage
- Editor → Appearance merge: canvas settings appear under a "Canvas" sub-heading with a border divider
- Font size: sets `<html>` font-size (14/16/18px) so all rem-based Tailwind sizes cascade; guarded against invalid values
- Alt+drag: position-swap approach — clone created on drag start for visual ghost, positions swapped on drag stop so original returns to start and clone moves to drop point; single history entry via `altDragActive` flag
- Templates: inline TypeScript builders (no yaml dependency needed); 3 templates covering common architectures

### Files Changed
| File | Change |
|------|--------|
| `src-tauri/capabilities/default.json` | Added `core:window:allow-set-title` permission |
| `src/hooks/use-window-title.ts` | **New** — hook for dynamic window title with async race guard |
| `src/components/layout/app-layout.tsx` | Wired window title hook + font size effect with null guard |
| `src/stores/ui-store.ts` | Default theme mode: `"dark"` → `"system"` |
| `src/stores/ui-store.test.ts` | Updated default theme expectations |
| `src/stores/settings-store.ts` | Removed `"editor"` from `SettingsTab` type |
| `src/stores/settings-store.test.ts` | Added `fontSize` default assertion |
| `src/types/settings.ts` | Added `FontSize` type, `fontSize` field, `FONT_SIZE_PX` constant |
| `src/components/panels/settings-dialog.tsx` | Merged Editor into Appearance, added font size selector |
| `src/components/panels/settings-dialog.test.tsx` | Updated for Editor removal, canvas-in-Appearance |
| `src/stores/canvas-store.ts` | `duplicateElement` returns `string \| null` + `skipHistory` opt + `altDragActive` flag |
| `src/components/canvas/dfd-canvas.tsx` | Alt+drag position-swap with single history entry + cancellation cleanup |
| `src/lib/templates.ts` | **New** — 3 template builders for empty state |
| `src/components/canvas/canvas.tsx` | Template cards in empty state + robust layout handling |
| `docs/plans/todo.md` | This plan |
