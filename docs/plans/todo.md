# Threat Forge - TODO List

Shared execution plan for humans and LLM agents. Update this file before, during, and after every work session.

---

## 2026-03-03 — Text Element Feature (Architecture Annotations)

### Context
Adding a Text element type so users can place annotation labels, callouts, and descriptions directly on the canvas. Text elements are non-connectable and excluded from STRIDE analysis.

### Plan
- [x] Step 1: Data model — add `font_size`, `font_weight` to Element (Rust + TS)
- [x] Step 2: Component library — add "text" entry with `ShapeCategory: "text"`, `StrideCategory: "none"`
- [x] Step 3: STRIDE engine exclusion (TS skip "none" category, Rust add `Annotation` variant)
- [x] Step 4: Canvas store — route text elements to `textAnnotation` node type
- [x] Step 5: Create `TextAnnotationNode` component (borderless, no handles, inline edit)
- [x] Step 6: Register `textAnnotation` in DfdCanvas, reject text node connections
- [x] Step 7: Add "Text" to component palette GENERIC_ITEMS
- [x] Step 8: Properties panel — text-specific controls (hide irrelevant fields, add font size/weight)
- [x] Step 9: Tests — component library, STRIDE engine, Rust round-trip + backward compat
- [x] Step 10: Lint & validate — biome, tsc, vitest (415/415), cargo clippy, cargo test (59/59), cargo fmt

### Deep Audit (breadth pass)
- [x] AI prompts: add "text" to element type lists in `ai-prompt.ts` and `prompt.rs`
- [x] MCP server: add "text" to `VALID_ELEMENT_TYPES` in `mcp/server.rs`
- [x] Context menu: hide "View Threats" for text annotation nodes (`canvas-context-menu.tsx` + `dfd-canvas.tsx`)
- [x] Context menu test: added test for `isTextAnnotation` flag excluding "View Threats"
- [x] Docs: update component counts (44 typed + text annotations) in `README.md`, `overview.md`, `product-design.md`, `roadmap.md`
- [x] Docs: add Text (Annotation) row to STRIDE mapping table in `glossary.md`
- [x] Docs: add text annotations to elements description in `file-format.md`
- [x] Onboarding: update component count in `whats-new-overlay.tsx` (28 → 44 + text annotations)
- [x] Validate: biome clean, tsc clean, vitest 416/416, cargo clippy clean, cargo test 59/59, cargo fmt clean

### Notes
- New ReactFlow node type `textAnnotation` (alongside `dfdElement` and `trustBoundary`)
- Text styling via existing `fill_color`/`fill_opacity` (text color) + new `font_size`/`font_weight`
- No breaking schema changes — new fields are optional with serde defaults

### Files Created
| File | Purpose |
|------|---------|
| `src/components/canvas/nodes/text-annotation-node.tsx` | Text element ReactFlow node component |

### Files Modified
| File | Change |
|------|--------|
| `src-tauri/src/models/threat_model.rs` | Added `font_size`, `font_weight` to `Element` + 3 round-trip tests |
| `src-tauri/src/stride/mod.rs` | Added `Annotation` category, skip text elements, test for zero threats |
| `src-tauri/src/ai/prompt.rs` | Updated Element struct literals with new fields |
| `src-tauri/src/mcp/server.rs` | Updated Element struct literal with new fields |
| `src/types/threat-model.ts` | Added `font_size`, `font_weight` to `Element` interface |
| `src/lib/component-library.ts` | Added `"text"` ShapeCategory, `"none"` StrideCategory, Type icon, text component def |
| `src/lib/component-library.test.ts` | Updated valid shape/stride lists, 5 new text component tests |
| `src/lib/stride-engine.ts` | Skip `"none"` category elements |
| `src/lib/stride-engine.test.ts` | 2 new tests: text produces zero threats, doesn't affect other counts |
| `src/stores/canvas-store.ts` | Route text to `textAnnotation` node type, added `fontSize`/`fontWeight` to DfdNodeData |
| `src/components/canvas/dfd-canvas.tsx` | Register `TextAnnotationNode`, reject text node connections |
| `src/components/palette/component-palette.tsx` | Added "Text" to GENERIC_ITEMS |
| `src/components/panels/properties-tab.tsx` | Text-specific properties (hide irrelevant, add font controls) |
| `docs/plans/todo.md` | This plan |

---

## 2026-03-03 — Revamp Pre-Made Templates (Show-Stopper Level)

### Context
Current templates are basic — generic types (no proper shapes/icons), no colors, no threats, linear/wonky layouts, only 3 templates. Need to make them professional, complex, and visually impressive.

### Plan
- [x] Rewrite 3 existing templates with proper component library types
  - [x] Use `web_browser`, `api_gateway`, `sql_database`, `cdn`, `load_balancer`, etc. for proper shapes (hexagon, database barrel, rect)
  - [x] Add 12-13 elements per template (up from 5-8)
  - [x] Add colored trust boundaries (different colors per zone type)
  - [x] Add 5 pre-populated STRIDE threats with mitigations per template
  - [x] Add rich descriptions, technologies, stores on all elements
  - [x] Design professional spatial layouts (layered, hub-and-spoke)
- [x] Add 3 new templates (total 6 for 2x3 grid)
  - [x] SaaS Platform
  - [x] IoT Smart Building
  - [x] Healthcare Data Platform
- [x] Update EmptyCanvas grid layout for 6 templates (2x3 grid, per-template icons + accent colors)
- [x] Visual validation with Playwright
  - [x] Screenshot each template after loading
  - [x] Fix onboarding suppression (correct localStorage keys + format)
  - [x] Iterate on positions — spread columns wider for flow label clarity
  - [x] Verify colors, shapes, boundary sizing — all rendering correctly
- [x] Validate: biome clean, tsc clean, vitest 408/408 pass

### Files Modified
| File | Change |
|------|--------|
| `src/lib/templates.ts` | Complete rewrite — 6 templates (was 3), 12-13 elements each, colored boundaries, 5 STRIDE threats per template, proper component library types |
| `src/components/canvas/canvas.tsx` | 2x3 template grid (was max-w-lg), per-template Lucide icons + accent colors |
| `e2e/screenshot-templates.spec.ts` | New — Playwright visual validation script for all templates |
| `docs/plans/todo.md` | This plan |

### Files Deleted
| File | Why |
|------|-----|
| `scripts/screenshot-templates.ts` | Superseded by `e2e/screenshot-templates.spec.ts` |

### Notes
- Template 1: E-Commerce Platform (revamp of Web Application)
- Template 2: Cloud Microservices (revamp of Microservices)
- Template 3: Mobile Banking (revamp of Mobile App)
- Template 4: SaaS Platform (new)
- Template 5: IoT Smart Building (new)
- Template 6: Healthcare Data Platform (new)

---

## 2026-03-03 — Remove Keyboard Shortcuts Dialog + Fix Broken E2E Tests

### Context
3 E2E tests were failing: `Cmd+/` (opens removed dialog), `Escape` (depends on Cmd+/), and `Cmd+,` (focus issue in headless Chrome). Removed the standalone shortcuts dialog entirely since keyboard shortcuts are already listed in the Settings dialog's Shortcuts tab — which was also removed since it duplicated the standalone dialog.

### Plan
- [x] Settings store: remove `shortcutsDialogOpen`, `openShortcutsDialog`, `closeShortcutsDialog`, `"shortcuts"` tab
- [x] App layout: remove `ShortcutsDialog` import, state selector, and render
- [x] Keyboard shortcuts hook: remove `case "/"` (Cmd+/) and shortcuts Escape branch
- [x] Native menu hook: remove `case "help-shortcuts"` handler
- [x] Command registry: remove `settings:shortcuts` command
- [x] Settings dialog: remove "Shortcuts" from SECTIONS, ShortcutsSection function, Keyboard icon import
- [x] Delete `src/components/panels/shortcuts-dialog.tsx`
- [x] Fix E2E tests: delete Cmd+/ and Escape tests; fix Cmd+, test with canvas focus pattern
- [x] Update unit tests: remove shortcuts dialog references from settings-store.test.ts and settings-dialog.test.tsx
- [x] Validate: `npx biome check --write .` — clean (only pre-existing !important warning)
- [x] Validate: `npx tsc --noEmit` — zero type errors
- [x] Validate: `npx vitest --run` — 408/408 tests pass
- [x] Validate: `npm run build:web` — builds successfully
- [x] Validate: `npx playwright test e2e/keyboard-shortcuts.spec.ts` — 3/3 pass
- [x] Validate: `npx playwright test` — 39/39 E2E tests pass (all green)

### Deep Documentation Scan (round 2)
- [x] Remove `shortcuts` entry (Cmd+/) from `KEYBOARD_SHORTCUTS` array in `src/types/settings.ts`
- [x] Remove `help_shortcuts` menu item from native Help menu in `src-tauri/src/menu.rs`
- [x] Update `docs/knowledge/product-design.md` — Settings tab list corrected to "General, Appearance, AI, Updates, Support"
- [x] Re-validate: cargo clippy clean, cargo test 55/55, cargo fmt clean, biome clean, tsc clean, vitest 408/408, build:web success, E2E 39/39

### Files Deleted
| File | Why |
|------|-----|
| `src/components/panels/shortcuts-dialog.tsx` | Standalone dialog removed; shortcuts info lived in Settings |

### Files Modified
| File | Change |
|------|--------|
| `src/stores/settings-store.ts` | Removed `"shortcuts"` tab, `shortcutsDialogOpen` state, open/close actions |
| `src/stores/settings-store.test.ts` | Removed shortcuts dialog test + state reset field |
| `src/components/layout/app-layout.tsx` | Removed ShortcutsDialog import, state selector, render |
| `src/hooks/use-keyboard-shortcuts.ts` | Removed Cmd+/ handler and Escape→shortcuts branch |
| `src/hooks/use-native-menu.ts` | Removed `help-shortcuts` case |
| `src/lib/command-registry.ts` | Removed `settings:shortcuts` command |
| `src/components/panels/settings-dialog.tsx` | Removed Shortcuts tab, ShortcutsSection, Keyboard import, KEYBOARD_SHORTCUTS import |
| `src/components/panels/settings-dialog.test.tsx` | Removed shortcuts tab test, updated tab labels assertion |
| `e2e/keyboard-shortcuts.spec.ts` | Deleted Cmd+/ and Escape tests; fixed Cmd+, test (canvas focus) |
| `src/types/settings.ts` | Removed `shortcuts` (Cmd+/) entry from `KEYBOARD_SHORTCUTS` array |
| `src-tauri/src/menu.rs` | Removed `help_shortcuts` menu item from native Help menu |
| `docs/knowledge/product-design.md` | Updated Settings tab list (removed Editor + Shortcuts, added Updates) |
| `docs/plans/todo.md` | This plan |

---

## 2026-03-03 — Product Website (Landing, Downloads, Legal, About, Support)

### Plan
- [x] Install `react-router-dom`
- [x] Create shared page components
  - [x] `src/hooks/use-scrollable-page.ts` — toggles body overflow for marketing pages
  - [x] `src/hooks/use-document-title.ts` — sets document.title per route
  - [x] `src/pages/shared/nav-bar.tsx` — sticky top nav with logo, links, "Try Online" CTA
  - [x] `src/pages/shared/page-footer.tsx` — footer with product/company/legal links
  - [x] `src/pages/shared/page-shell.tsx` — wrapper: scrollable page + title + nav + footer
- [x] Build landing page (`src/pages/landing-page.tsx`)
  - [x] Hero section with headline + dual CTAs (Download / Try Online)
  - [x] Features grid (4 cards: STRIDE, YAML, AI, Cross-Platform)
  - [x] YAML showcase section with .thf code sample
  - [x] Final CTA section
- [x] Build GitHub releases utility (`src/lib/github-releases.ts`)
  - [x] `detectOs()` — OS detection from user agent
  - [x] `categorizeAssets()` — groups release assets by OS
  - [x] `fetchLatestRelease()` — fetches from GitHub API with sessionStorage cache (5-min TTL)
  - [x] `formatBytes()` — human-readable file sizes
- [x] Build release hook (`src/hooks/use-latest-release.ts`)
- [x] Build downloads page (`src/pages/downloads-page.tsx`)
  - [x] Primary download button for detected OS
  - [x] All-platforms grid (macOS, Windows, Linux)
  - [x] Loading skeleton + error fallback
- [x] Build about page (`src/pages/about-page.tsx`)
- [x] Build privacy policy page (`src/pages/privacy-page.tsx`)
- [x] Build terms of service page (`src/pages/terms-page.tsx`)
- [x] Build support page (`src/pages/support-page.tsx`)
- [x] Add router to `src/App.tsx` — lazy-loaded routes with named export pattern
- [x] Update `public/sitemap.xml` — added all new routes
- [x] Write tests (`src/lib/github-releases.test.ts`) — 16 tests
- [x] Validate: `npx biome check --write .` — clean (only pre-existing !important warning)
- [x] Validate: `npx tsc --noEmit` — zero type errors
- [x] Validate: `npx vitest --run` — 334/334 tests pass (16 new)
- [x] Validate: `npm run build:web` — builds successfully with proper code splitting

### Code Review Fixes
- [x] **Tauri window URL (critical)** — `"url": "app"` in `tauri.conf.json` would look for literal file `dist/app` in production (doesn't exist). Reverted to default `index.html`; added `isTauri()` check in `App.tsx` to redirect `/` → `/app` in the desktop app
- [x] **Malformed cache crash** — `JSON.parse` on sessionStorage cache was unguarded; a corrupted entry would throw `SyntaxError`. Wrapped in try/catch, removes bad entry and falls through to network fetch
- [x] **Download links navigate away** — Binary download links (`<a href="...dmg">`) had no `target`/`rel`, causing browser to navigate away from the page. Added `target="_blank" rel="noopener noreferrer"` to primary download button and per-asset links
- [x] **Plain anchor bypasses router** — `<a href="/app">` on downloads page caused full page reload instead of client-side navigation. Replaced with `<Link to="/app">` from react-router-dom
- [x] **iOS/iPadOS false positive** — `detectOs()` matched `"mac"` in iPhone/iPad user agents ("like Mac OS X"), showing macOS `.dmg` as primary download. Added mobile UA filter: checks for `"iphone"`, `"ipad"`, `"android"` before desktop OS patterns
- [x] **Missing test coverage** — Added 5 tests: malformed cache JSON fallback, network failure (fetch rejects), iOS/iPadOS/Android UA detection
- [x] Validate post-fixes: biome clean, tsc clean, 339/339 tests pass, build:web succeeds

### Post-fix validation
- [x] `npx biome check .` — clean (only pre-existing !important warning)
- [x] `npx tsc --noEmit` — zero type errors
- [x] `npx vitest --run` — 339/339 tests pass (21 new total)
- [x] `npm run build:web` — builds successfully
- [x] `cargo clippy -D warnings` — clean (no Rust changes)
- [x] `cargo test` — 55/55 Rust tests pass
- [ ] Manual: `npm run dev:web` → verify all routes render
- [ ] Manual: navigation between pages works, scrolling works on marketing pages
- [ ] Manual: `npm run tauri dev` → app loads at `/app`, no landing page flash

### Notes
- All routes are lazy-loaded with `.then((m) => ({ default: m.X }))` pattern for named exports
- Marketing pages are separate chunks (3-7KB each); AppLayout is the main chunk (434KB)
- `useScrollablePage` hook toggles `overflow: auto` on html/body, restores on unmount
- Tauri desktop redirect: `isTauri()` at module scope in `App.tsx` sets `homePage` to `<Navigate to="/app" replace />` — no tauri.conf.json changes needed
- No CSP change needed — desktop users never visit marketing pages; browser CSP is handled by Vercel
- Vite dev server has built-in SPA fallback — all paths serve `index.html` for client-side routing
- Vercel catch-all rewrite `/(.*) → /` already works for client-side routing

### Files Created
| File | Purpose |
|------|---------|
| `src/hooks/use-scrollable-page.ts` | Toggles body overflow for scrollable marketing pages |
| `src/hooks/use-document-title.ts` | Sets document.title per route |
| `src/hooks/use-latest-release.ts` | Hook wrapping GitHub releases fetch with loading/error states |
| `src/pages/shared/nav-bar.tsx` | Shared sticky nav bar for marketing pages |
| `src/pages/shared/page-footer.tsx` | Shared footer for marketing pages |
| `src/pages/shared/page-shell.tsx` | Shared wrapper: scrollable + title + nav + footer |
| `src/pages/landing-page.tsx` | Landing: hero, features, YAML showcase, CTA |
| `src/pages/downloads-page.tsx` | Downloads: OS detection, primary download, all-platforms grid |
| `src/pages/about-page.tsx` | About: project mission, open source, Exit Zero Labs |
| `src/pages/privacy-page.tsx` | Privacy Policy |
| `src/pages/terms-page.tsx` | Terms of Service |
| `src/pages/support-page.tsx` | Support: GitHub Issues, email, FAQ |
| `src/lib/github-releases.ts` | detectOs, categorizeAssets, fetchLatestRelease, formatBytes |
| `src/lib/github-releases.test.ts` | 21 tests for OS detection, asset categorization, fetch + cache |

### Files Modified
| File | Change |
|------|--------|
| `package.json` | Added `react-router-dom` dependency |
| `src/App.tsx` | Replaced `<AppLayout />` with `BrowserRouter` + 7 lazy routes + Tauri `/app` redirect |
| `public/sitemap.xml` | Added all new route entries |
| `docs/plans/todo.md` | This plan |

---

## 2026-03-03 — Website Polish: Logo, Nav, CTAs, Downloads UX, Theme Settings Modal

### Plan
- [x] Step 1: NavBar — logo swap + simplification
  - [x] Replace `<Shield>` icon with `<img src="/logo_square.png">`
  - [x] Remove "Downloads" and "GitHub" links from nav
  - [x] Keep "About" link + "Try Online" CTA
- [x] Step 2: Landing page — CTA priority flip + icons
  - [x] HeroSection: "Try in Browser" primary (Signal green bg), "Download" secondary (outline), add Globe + Download icons
  - [x] CtaSection: same swap + change "View on GitHub" to "Download for Free" secondary
- [x] Step 3: Downloads page — unified grid with highlighted OS card
  - [x] Remove `PrimaryDownload` component
  - [x] Add `detectedOs` and `highlighted` props to `AllPlatforms`/`PlatformCard`
  - [x] Highlighted card: Signal border, "Recommended" badge, prominent download button
- [x] Step 4: Create website settings modal (`src/pages/shared/website-settings-modal.tsx`)
  - [x] Theme mode (Light/Dark/System) via ThemePicker
  - [x] Font size selector (Small/Default/Large)
  - [x] Reduce motion toggle
  - [x] Overlay modal with close on backdrop/Escape/X
- [x] Step 5: Footer gear icon + PageShell wiring
  - [x] Add Settings icon button to footer copyright bar
  - [x] Lift `isSettingsOpen` state to PageShell
  - [x] Pass `onOpenSettings` to PageFooter, render modal in PageShell
- [x] Step 6: Settings button prominence + attribution
  - [x] Footer settings button: changed from icon-only to outline button with text "Appearance" + Settings icon
  - [x] Footer copyright: "Exit Zero Labs LLC" with link to exitzerolabs.com
  - [x] Footer brand: "Built by Exit Zero Labs" with link to exitzerolabs.com
  - [x] About page: "Exit Zero Labs LLC" with link to exitzerolabs.com
  - [x] Updated tests to match new button (role-based queries) + added attribution tests
- [x] Validate: `npx biome check --write .` — clean (only pre-existing !important warning)
- [x] Validate: `npx tsc --noEmit` — zero type errors
- [x] Validate: `npx vitest --run` — **402/402 tests** pass
- [x] Validate: `npm run build:web` — builds successfully
- [x] Validate: `cargo clippy -D warnings` — clean
- [x] Validate: `cargo test` — all pass
- [x] Validate: `cargo fmt --check` — clean
- [ ] Manual: verify all routes render, CTA order correct, downloads grid, settings modal

### Code Review Fixes
- [x] **Modal focus management** — Added `role="dialog"`, `aria-modal="true"`, `aria-label`, `tabIndex={-1}`, and `useRef` + `useEffect` to focus the dialog on open
- [x] **Modal close button aria-label** — Added `aria-label="Close"` to the X button
- [x] **Explicit ReactNode import** — Replaced implicit `React.ReactNode` with explicit `import type { ReactNode }` per project convention
- [x] **PlatformCard os prop type** — Tightened from `OsType` to `Exclude<OsType, "unknown">` so the download button label can never produce "Download for your platform"
- [x] **Landing page formatting** — Re-ran `biome check --write` to fix spaces→tabs formatting drift
- [x] Re-validated: biome clean, tsc clean, 339/339 tests pass, build:web succeeds
- [x] **Footer settings button prominence** — Changed from subtle icon-only button to outline button with "Appearance" text + Settings icon
- [x] **Exit Zero Labs LLC attribution** — Added company name with LLC suffix and exitzerolabs.com links to footer (brand + copyright) and about page

### Tests Added
- [x] `src/hooks/use-document-title.test.ts` — 3 tests (set title, restore on unmount, update on prop change)
- [x] `src/hooks/use-scrollable-page.test.ts` — 2 tests (set overflow on mount, clear on unmount)
- [x] `src/hooks/use-latest-release.test.ts` — 5 tests (loading state, detected OS, fetch resolve, fetch error, non-Error throw)
- [x] `src/pages/shared/nav-bar.test.tsx` — 6 tests (logo, brand link, About, CTA, no Downloads, no GitHub)
- [x] `src/pages/shared/page-footer.test.tsx` — 9 tests (product/company/legal links, copyright LLC, company link, brand attribution, Appearance button render/click, no button without callback)
- [x] `src/pages/shared/page-shell.test.tsx` — 7 tests (children, title, scrolling, nav, footer, modal open via Appearance button, modal close)
- [x] `src/pages/shared/website-settings-modal.test.tsx` — 13 tests (open/close, ARIA, reduce motion, font size, theme picker, X button, backdrop click, Escape key)
- [x] `src/pages/landing-page.test.tsx` — 8 tests (headline, CTA order, links, features, YAML showcase, bottom CTA, no GitHub)
- [x] `src/pages/downloads-page.test.tsx` — 10 tests (heading, version, platforms, highlight, download button, unknown OS, loading, error, web fallback, asset names)
- [x] Added `__APP_VERSION__` define to `vitest.config.ts` for test environment
- [x] Full validation: biome clean, tsc clean, **402/402 tests** (63 new), build:web clean, cargo clippy clean, cargo test pass, cargo fmt clean

### Notes
- NavBar now uses `<img src="/logo_square.png">` instead of Lucide Shield icon
- Removed unused `GITHUB_URL` constant from landing-page.tsx after CtaSection update
- Downloads page: `PrimaryDownload` removed; `PlatformCard` accepts `highlighted` + `os` props; highlighted card gets Signal border, "Recommended" pill badge, and prominent download button
- Settings modal reuses `ThemePicker` directly; duplicates `SettingRow`, `ToggleSwitch`, `FontSizeSelector` (private to settings-dialog.tsx)
- Footer settings button is now an outline button with "Appearance" text + Settings icon (more discoverable than icon-only)
- PageShell lifts modal state; passes `onOpenSettings` callback to footer
- Exit Zero Labs LLC attribution: footer brand ("Built by Exit Zero Labs"), footer copyright ("Exit Zero Labs LLC"), about page — all link to exitzerolabs.com

### Files Modified
| File | Change |
|------|--------|
| `src/pages/shared/nav-bar.tsx` | Logo swap (Shield → img), removed Downloads/GitHub links |
| `src/pages/landing-page.tsx` | Swapped CTA priority, added Globe/Download icons, removed unused GITHUB_URL |
| `src/pages/downloads-page.tsx` | Unified grid: removed PrimaryDownload, highlighted detected OS card |
| `src/pages/shared/page-footer.tsx` | Outline "Appearance" button in copyright bar, Exit Zero Labs LLC attribution with links |
| `src/pages/shared/page-shell.tsx` | Settings modal state management |

### Files Created
| File | Purpose |
|------|--------|
| `src/pages/shared/website-settings-modal.tsx` | Lightweight appearance modal (theme, font size, reduce motion) |
| `src/hooks/use-document-title.test.ts` | 3 unit tests for document title hook |
| `src/hooks/use-scrollable-page.test.ts` | 2 unit tests for scrollable page hook |
| `src/hooks/use-latest-release.test.ts` | 5 unit tests for latest release hook |
| `src/pages/shared/nav-bar.test.tsx` | 6 unit tests for navbar |
| `src/pages/shared/page-footer.test.tsx` | 7 unit tests for footer |
| `src/pages/shared/page-shell.test.tsx` | 7 integration tests for page shell |
| `src/pages/shared/website-settings-modal.test.tsx` | 13 unit tests for settings modal |
| `src/pages/landing-page.test.tsx` | 8 unit tests for landing page |
| `src/pages/downloads-page.test.tsx` | 10 unit tests for downloads page |

### Files Modified (tests)
| File | Change |
|------|--------|
| `vitest.config.ts` | Added `__APP_VERSION__` define for test environment |

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

### Files Changed (Items 1-6)
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

---

## 2026-03-02 — 8 Attachment Points + Connector Grab Handles

### Plan
- [x] Step 1: Expand `HandlePosition` to 8 values, rewrite `getSmartHandlePair` with octant-based angle routing (`canvas-utils.ts`)
- [x] Step 2: Add 8 corner `Handle` components (4 corners × source/target) to `NodeHandles` (`shared-handles.tsx`)
- [x] Step 3: Add `reconnectEdge` store action with history support (`canvas-store.ts`)
- [x] Step 4: Wire `edgesReconnectable`, `onReconnect`, `onReconnectStart`, `onReconnectEnd` in DfdCanvas (`dfd-canvas.tsx`)
- [x] Step 5: Style `.react-flow__edgeupdater` grab handles (`styles.css`)
- [x] Step 6: Update tests — tie-break, diagonal routing, `reconnectEdge` (`canvas-utils.test.ts`, `canvas-store.test.ts`)
- [x] Validate: `npx tsc --noEmit` — zero type errors
- [x] Validate: `npx biome check --write .` — clean (only pre-existing !important warning)
- [x] Validate: `npx vitest --run` — all 288 tests pass (12 new tests added)

### Notes
- HandlePosition expanded from 4 to 8 values (4 cardinal + 4 corners)
- Smart routing uses `atan2` angle → 8 octants (each 45°) for precise connector paths
- Corner handles positioned via CSS `left` offsets (15%/85%) on top/bottom sides
- Edge reconnection uses ReactFlow v12's `onReconnect` API with automatic snap-back on miss
- `reconnectEdge` store action pushes history snapshot for undo support
- Backward-compatible: existing 4-handle IDs still exist in the new 8-handle set

### Files Changed
| File | Change |
|------|--------|
| `src/lib/canvas-utils.ts` | Expanded `HandlePosition` to 8 positions, rewrote `getSmartHandlePair` with octant routing, added `angleToHandlePosition` + `oppositeHandle` |
| `src/components/canvas/nodes/shared-handles.tsx` | Added 8 corner Handle components (4 corners × source/target) |
| `src/stores/canvas-store.ts` | Added `reconnectEdge` action with history support |
| `src/components/canvas/dfd-canvas.tsx` | Wired `edgesReconnectable`, `onReconnect`, `onReconnectStart`, `onReconnectEnd` |
| `src/styles.css` | Styled `.react-flow__edgeupdater` grab handles |
| `src/lib/canvas-utils.test.ts` | Updated tie-break test, added 4 diagonal + 4 angleToHandlePosition + 4 oppositeHandle tests |
| `src/stores/canvas-store.test.ts` | Added `reconnectEdge` test |
| `docs/plans/todo.md` | This plan |

---

## 2026-03-02 — AI Chat Output Quality + Per-Action Apply

### Plan
- [x] Step 1: Add `sortActionsByDependency` + `executeSingleAction` to `ai-action-executor.ts`
- [x] Step 2: Rewrite `ActionPreview` + add `ActionRow` in `ai-chat-tab.tsx`
- [x] Step 3: Add `<response>` tag instructions to `ai-prompt.ts` and `prompt.rs`
- [x] Step 4: Update `AssistantContent` display logic with `extractDisplayContent`
- [x] Step 5: Update `ai-prompt.test.ts` and `prompt.rs` test assertions
- [x] Validate: `npx tsc --noEmit` — zero type errors
- [x] Validate: `npx biome check --write .` — clean (only pre-existing !important warning)
- [x] Validate: `npx vitest --run` — 290/290 tests pass
- [x] Validate: `cargo test` — 55/55 Rust tests pass

### Code Review Fixes (round 1)
- [x] **Undo on failure (single)** — `executeSingleAction` was pushing undo snapshot before checking if action succeeds; moved `pushSnapshot` after `applyAction` success check
- [x] **Batch status mapping** — `handleApplyRemaining` was marking partial failures as "applied"; now marks all as "failed" if any fail (conservative)
- [x] **Empty response tags** — empty `<response></response>` suppressed fallback; now filters empty parts before checking length
- [x] **Fallback strips response tags** — fallback path now also strips `<response>` tags (test exposed this bug)
- [x] **Redundant export** — removed `export { sortActionsByDependency }` at bottom, added `export` on declaration
- [x] **Partial streaming tags** — `stripBlocksForStreaming` now handles partial tags at end of stream
- [x] **Single-pass count** — replaced triple Map iteration with single loop for `appliedCount`/`failedCount`
- [x] **Test coverage** — added 24 tests for new functions

### Code Review Fixes (round 2)
- [x] **Undo on failure (batch)** — `executeActions` was pushing orphaned undo snapshot when all actions fail; moved `pushSnapshot` inside `applied > 0` guard
- [x] **Broader partial tag regex** — `/<\/?resp(on(se?)?)?$/` now catches `<resp`, `</resp` in addition to longer partials
- [x] **Double-sort removed** — `handleApplyRemaining` was pre-sorting before calling `executeActions` which sorts internally; removed redundant pre-sort and unused `sortActionsByDependency` import
- [x] **Test: batch all-fail undo** — added test verifying no undo snapshot when entire batch fails
- [x] **Test: batch partial success undo** — added test verifying undo snapshot when at least one action succeeds
- [x] **Test: `<resp` partial tag** — added tests for shorter partial tag fragments
- [x] Validate: `npx tsc --noEmit` — zero type errors
- [x] Validate: `npx biome check .` — clean (only pre-existing !important warning)
- [x] Validate: `npx vitest --run` — 318/318 tests pass (28 new total)
- [x] Validate: `cargo test` — 55/55 Rust tests pass
- [x] Validate: `cargo clippy -D warnings` — clean
- [x] Validate: `cargo fmt --check` — clean

### Notes
- `sortActionsByDependency` sorts by priority: adds (elements/boundaries) → adds (flows/threats) → updates → deletes (dependents) → deletes (containers)
- Both `executeSingleAction` and `executeActions` push undo snapshot only on success for clean undo history
- `executeActions` sorts actions internally; callers don't need to pre-sort
- `ActionRow` mirrors `ThreatSuggestionCard` layout: text on left, icon button on right
- `extractDisplayContent` tries `<response>` tag extraction first, falls back to block stripping for backward compat
- Streaming mode uses simple block stripping since `<response>` tags may be incomplete mid-stream

### Files Changed
| File | Change |
|------|--------|
| `src/lib/ai-action-executor.ts` | Added `sortActionsByDependency`, `executeSingleAction`; sorting + conditional undo in `executeActions` |
| `src/components/panels/ai-chat-tab.tsx` | Rewrote `ActionPreview` with per-action tracking, added `ActionRow`, added `extractDisplayContent`/`stripBlocksForStreaming` |
| `src/lib/ai-prompt.ts` | Added `<response>` tag format instructions |
| `src-tauri/src/ai/prompt.rs` | Mirrored `<response>` tag instructions + updated test |
| `src/lib/ai-prompt.test.ts` | Added response format assertion |
| `src/lib/ai-action-executor.test.ts` | **New** — 12 tests for sortActionsByDependency, executeSingleAction, executeActions |
| `src/lib/ai-display-content.test.ts` | **New** — 16 tests for extractDisplayContent + stripBlocksForStreaming |
| `docs/plans/todo.md` | This plan |
