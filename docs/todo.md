# Threat Forge - TODO List

Shared execution plan for humans and LLM agents. Update this file before, during, and after every work session.

---

## 2026-02-27 - Theme Support

Need to add support for themes in the UI. Currently only a dark theme is available, but we should allow users to not just choose between light and dark (and follow system), but also to select from a variety of color schemes and styles. Will have 2-3 themes for light and 2-3 themes for dark at launch, and then add more over time.

**Current state:** Implemented on branch `feat/theme-support`.

**Tasks:**

- [x] Define theme data structure and registry
  - [x] Create `src/types/theme.ts` with `ThemeMode` (`"light" | "dark" | "system"`), `ThemePreset` interface (id, name, mode, token overrides), and `ThemeConfig` type
  - [x] Create `src/lib/themes/` directory with a registry of built-in themes — each theme is a record of CSS variable names to oklch values
  - [x] Design 2-3 dark presets (e.g., "Midnight" default, "Slate", "Nord-inspired") and 2-3 light presets (e.g., "Daylight", "Warm Sand", "High Contrast")
  - [x] Ensure each preset defines ALL shadcn-compatible tokens (`background`, `foreground`, `card`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `chart-1` through `chart-5`, sidebar tokens)
  - [x] Brand accent colors (`tf-signal`, `tf-ember`) should remain constant across themes for brand consistency; only surface/text/border tokens change
- [x] Implement theme state management
  - [x] Add `themeMode`, `themePresetId`, and `setTheme(mode, presetId)` to `src/stores/ui-store.ts`
  - [x] Persist theme preference to localStorage (via manual JSON serialization with validation on load)
  - [x] Add system theme detection via `window.matchMedia("(prefers-color-scheme: dark)")` with a listener for live changes when mode is `"system"`
- [x] Implement runtime theme application
  - [x] Create `src/lib/themes/apply-theme.ts` utility that takes a `ThemePreset` and applies CSS variable overrides to `document.documentElement.style`
  - [x] Toggle `dark`/`light` class on `<html>` element based on resolved mode (needed for Tailwind dark variant if used)
  - [x] Remove hardcoded `class="dark"` from `index.html` — set it dynamically on app init
  - [x] `applyTheme()` called on store initialization (module-level side effect in ui-store.ts) and whenever `setTheme()` is called
- [x] Refactor `src/styles.css` for multi-theme support
  - [x] Keep current dark-mode oklch tokens in `@theme` as defaults; override via inline styles at runtime — best approach for Tailwind v4's `@theme` system
  - [x] Define a light-mode base set of tokens under `html.light` scope as a fallback for CSS-only theming
  - [x] Verify all components render correctly in light mode — canvas nodes, edges, panels, dialogs, status bar, minimap colors use semantic tokens
- [x] Add theme selector UI
  - [x] Add theme picker popover to top menu bar (Palette icon) — will be migrated to Settings modal when that feature is built
  - [x] Show mode toggle (Light / Dark / System) and a list of available presets with color swatches
  - [x] Provide live preview — applying a theme is instant, no page reload
- [x] Update canvas-specific styling
  - [x] ReactFlow `<MiniMap>` now reads CSS variables reactively via `useMemo` keyed on `themePresetId`
  - [x] ReactFlow `<Background>` dot color adapts to theme via CSS variable
  - [x] ReactFlow `<Controls>` styles already use semantic Tailwind classes (`!bg-card`, `!border-border`, etc.)
  - [x] Edge marker (arrowhead) colors inherit from edge stroke classes which use semantic tokens
- [x] Testing
  - [x] Unit test theme application: verify CSS variables are set on documentElement after `applyTheme()` (8 tests in `apply-theme.test.ts`)
  - [x] Unit test system preference detection logic (guarded for jsdom environment)
  - [x] Unit test theme persistence round-trip (save to localStorage → reload → correct theme applied) (12 tests in `ui-store.test.ts`)
  - [ ] Visual smoke test: verify all screens in both light and dark modes (manual)

### Notes

- Theme is applied at module initialization of `ui-store.ts` via side effect — no ThemeProvider wrapper needed
- `matchMedia` guarded with `typeof window.matchMedia !== "function"` to handle jsdom test environment
- All 65 tests pass, Biome lint clean

## 2026-02-27 - Onboarding and Quick Start Guides

Need to create a framework for onboarding materials and quick start guides for new users and new features whenever one is added. This should include both written documentation and interactive tutorials within the app itself. The goal is to make it as easy as possible for new users to get up and running quickly, and to help existing users understand new features as they are released.

**Current state:** No onboarding exists. The app opens directly to an empty canvas (`canvas.tsx`) showing a Shield icon, "ThreatForge" title, and two buttons ("New Model" / "Open Existing"). There are no tooltips, guided tours, feature highlights, or contextual help. The only modal in the codebase is `ai-settings-dialog.tsx` (fixed overlay with `bg-black/50` backdrop, keyboard dismiss). No tour libraries are installed. Keyboard shortcut hints are shown in button tooltips in `top-menu-bar.tsx` but only on hover.

**Tasks:**

- [ ] Design the onboarding framework architecture
  - [ ] Define an `OnboardingStep` interface in `src/types/onboarding.ts`: `id`, `targetSelector` (CSS selector or ref for highlighting), `title`, `content` (React node or markdown), `placement` ("top" | "bottom" | "left" | "right"), `action?` (optional callback on step completion), `triggerCondition?` (when to auto-show)
  - [ ] Define an `OnboardingGuide` interface: `id`, `name`, `steps: OnboardingStep[]`, `version` (for re-triggering on feature updates), `showOnce: boolean`
  - [ ] Design guide registry pattern: a `src/lib/onboarding/guides/` directory where each guide is a separate file exporting an `OnboardingGuide` config
- [ ] Implement onboarding state management
  - [ ] Create `src/stores/onboarding-store.ts` with Zustand: tracks `completedGuides: Record<string, string>` (guide ID → version completed), `activeGuide: string | null`, `activeStepIndex: number`, `dismissedGuides: string[]`
  - [ ] Persist to localStorage so guides don't re-show after completion
  - [ ] Provide `startGuide(id)`, `nextStep()`, `prevStep()`, `dismissGuide()`, `resetGuide(id)` actions
- [ ] Build the guide overlay UI components
  - [ ] Create `src/components/onboarding/guide-overlay.tsx`: a spotlight/highlight component that dims the rest of the UI and highlights the target element (use a CSS box-shadow or SVG mask approach — no heavy library needed)
  - [ ] Create `src/components/onboarding/guide-tooltip.tsx`: a positioned tooltip next to the highlighted element showing step title, content, step counter (e.g., "2 of 5"), and Next/Back/Dismiss buttons
  - [ ] Create `src/components/onboarding/guide-provider.tsx`: a wrapper component (rendered in `App.tsx`) that listens to `onboarding-store` and renders the overlay when a guide is active
  - [ ] Ensure the overlay is accessible: trap focus in the tooltip, support Escape to dismiss, announce step changes to screen readers
- [ ] Implement trigger system for contextual guides
  - [ ] Define trigger types: `"first-launch"`, `"first-model-created"`, `"first-element-added"`, `"feature-version"` (re-trigger when a feature version bumps)
  - [ ] Hook triggers into relevant actions: e.g., in `model-store.ts` `setModel()` → check if "first model" guide should show; in `canvas-store.ts` `addElement()` → check if "first element" guide should show
  - [ ] Support manual trigger: a "Help" or "?" button in the top menu bar that opens a guide picker dialog listing all available guides
- [ ] Create initial set of guides
  - [ ] **Welcome guide** (first-launch): Introduce the empty canvas, show where to create/open models, point out the component palette, right panel, and AI assistant
  - [ ] **DFD Basics guide** (first model created): Walk through adding a process, data store, external entity, connecting them with a data flow, and adding a trust boundary
  - [ ] **STRIDE Analysis guide** (first time opening threats tab): Explain the Run STRIDE Analysis button, how threats are generated, and how to review/edit/mitigate them
  - [ ] **AI Assistant guide** (first time opening AI tab): Show how to configure an API key, ask the AI questions about the model, and accept suggested threats
- [ ] Add "What's New" changelog overlay
  - [ ] Create `src/components/onboarding/whats-new-dialog.tsx`: a modal shown once per new version (check app version vs. last-seen version in localStorage)
  - [ ] Content sourced from a `src/lib/onboarding/changelog.ts` file with structured entries per version
  - [ ] Each entry has: version, date, list of features with optional guide link to trigger the relevant walkthrough
- [ ] Testing
  - [ ] Unit test `onboarding-store`: verify guide progression, persistence, dismissal, and reset
  - [ ] Unit test trigger logic: verify guides fire on the correct conditions and don't re-fire after completion
  - [ ] Component test `guide-overlay`: verify spotlight renders, tooltip positions, and keyboard navigation works
  - [ ] Smoke test each guide end-to-end in the running app

## 2026-02-27 - E2E UI Testing

Need to implement end-to-end UI testing to ensure that the user interface is functioning correctly and to catch any regressions or bugs before they reach users. This will involve setting up a testing framework, writing test cases for various user interactions and workflows, and integrating these tests into our CI/CD pipeline. Every flow needs to be tested, including edge cases and error handling, to ensure a smooth and reliable user experience. This should run headless locally in docker and also in CI/CD pipelines. Any failures should be reported with detailed logs and screenshots to help with debugging.

**Current state:** No E2E tests exist. The implementation plan (Section 8.1) specifies Playwright + Tauri WebDriver for the top 5 user workflows. Frontend unit tests use Vitest + jsdom + React Testing Library (`vitest.config.ts`, `src/test-setup.ts`). Local CI runs via `scripts/ci-local.sh` (lint + unit tests). Docker CI uses `compose.yml` + `Dockerfile.ci` (Ubuntu 22.04, Node 20, Rust stable). GitHub Actions CI (`.github/workflows/ci.yml`) is manual-only (`workflow_dispatch`) with lint, test, and cross-platform build jobs. The app can also run as a web app via `npm run dev:web` on port 3000, which simplifies E2E testing since Playwright can test the web version without needing Tauri WebDriver.

**Tasks:**

- [ ] Set up Playwright infrastructure
  - [ ] Install Playwright: `npm install -D @playwright/test` and run `npx playwright install` to download browser binaries
  - [ ] Create `playwright.config.ts` at project root:
    - `testDir: "e2e"` (separate from unit tests in `src/`)
    - `webServer: { command: "npm run dev:web", port: 3000, reuseExistingServer: !process.env.CI }` — Playwright auto-starts the Vite dev server
    - `use: { baseURL: "http://localhost:3000", screenshot: "only-on-failure", trace: "on-first-retry", video: "retain-on-failure" }`
    - Projects: Chromium only for local dev speed; add Firefox + WebKit in CI matrix (WebKit is closest to Tauri's WKWebView)
    - `reporter: [["html", { open: "never" }], ["list"]]` for CI-friendly output + detailed HTML report
  - [ ] Create `e2e/` directory for test files
  - [ ] Add npm scripts: `"test:e2e": "playwright test"`, `"test:e2e:ui": "playwright test --ui"` (interactive mode for debugging)
- [ ] Create E2E test utilities and fixtures
  - [ ] Create `e2e/fixtures.ts` with shared Playwright fixtures:
    - `appPage`: navigates to base URL and waits for the app shell to render (wait for `[data-testid="app-layout"]` — will need to add data-testid attributes to key components)
    - `emptyCanvas`: fixture that asserts the empty canvas state
    - `modelPage`: fixture that creates a new model via the "New Model" button
  - [ ] Create `e2e/helpers.ts` with common actions: `createNewModel()`, `addElement(type, position)`, `connectElements(source, target)`, `openRightPanel(tab)`, `saveModel()`
  - [ ] Add `data-testid` attributes to critical UI elements: top menu buttons, canvas area, palette items, panel tabs, panel content areas, dialog buttons — prefer `data-testid` over fragile CSS selectors
- [ ] Write core workflow E2E tests (the "top 5 workflows" from the implementation plan)
  - [ ] **Test 1: New model creation** (`e2e/new-model.spec.ts`)
    - Click "New Model" → verify canvas becomes active (DFD canvas renders)
    - Verify title shows "Untitled Threat Model" in top bar
    - Verify status bar shows element/flow/threat counts at 0
  - [ ] **Test 2: DFD diagram construction** (`e2e/dfd-construction.spec.ts`)
    - Create new model → drag Process from palette to canvas → verify node appears
    - Drag Data Store and External Entity → verify all three nodes are on canvas
    - Connect Process to Data Store with a data flow → verify edge appears
    - Add a Trust Boundary → verify dashed-border group node appears
    - Verify status bar counts update correctly
  - [ ] **Test 3: Element editing** (`e2e/element-editing.spec.ts`)
    - Create model with elements → click a node to select it
    - Verify Properties tab opens in right panel with correct element data
    - Edit name, trust zone, description, technologies → verify changes reflect on canvas node label
    - Verify dirty indicator (\*) appears in title bar after edits
  - [ ] **Test 4: STRIDE analysis and threat management** (`e2e/stride-threats.spec.ts`)
    - Create model with 2-3 elements and flows → open Threats tab
    - Click "Run STRIDE Analysis" → verify threats appear in the list
    - Expand a threat → edit severity, add mitigation notes → verify changes persist
    - Delete a threat → verify it's removed
    - Filter threats by selected element → verify filtering works
  - [ ] **Test 5: Save and reopen cycle** (`e2e/save-reopen.spec.ts`)
    - Note: File dialogs are OS-native and can't be tested directly via Playwright in web mode. Mock the file adapter or use the browser adapter's localStorage-based save
    - Create model → add elements → save → close model → reopen → verify all elements, flows, and properties are preserved
    - Verify layout (node positions) is restored correctly
- [ ] Write edge case and error handling tests
  - [ ] **Dirty state guard** (`e2e/dirty-state.spec.ts`): Make edits → try to create new model / open another → verify "unsaved changes" prompt appears
  - [ ] **Keyboard shortcuts** (`e2e/keyboard-shortcuts.spec.ts`): Test Cmd/Ctrl+N, O, S, L shortcuts trigger expected actions
  - [ ] **Delete operations** (`e2e/delete-operations.spec.ts`): Select element → press Delete → verify element and connected edges are removed, verify threats linked to deleted element are handled
  - [ ] **Empty states** (`e2e/empty-states.spec.ts`): Verify correct empty state messages in threats tab, properties tab, and canvas
  - [ ] **AI chat panel** (`e2e/ai-chat.spec.ts`): Open AI tab → verify settings dialog opens → verify empty state when no API key → (mock API responses for chat interaction tests)
- [ ] Integrate into CI/CD pipeline
  - [ ] Update `Dockerfile.ci` to install Playwright browsers: add `npx playwright install --with-deps chromium` after npm ci step
  - [ ] Update `scripts/ci-local.sh` to add an optional `--e2e` flag that runs `npx playwright test` after unit tests
  - [ ] Add a new job to `.github/workflows/ci.yml`:
    - `e2e` job that depends on `test`, runs on ubuntu-latest
    - Uses Playwright's recommended GH Actions setup (`actions/playwright-test`)
    - Uploads test report + screenshots + videos as artifacts on failure
    - Run with WebKit browser project (closest to Tauri's WKWebView)
  - [ ] Update `compose.yml` to support E2E in Docker: the Vite dev server needs to run inside the container alongside Playwright
- [ ] Reporting and debugging infrastructure
  - [ ] Configure Playwright HTML reporter: generates detailed report in `playwright-report/` directory
  - [ ] Add `playwright-report/` and `test-results/` to `.gitignore`
  - [ ] Configure screenshot capture on failure (already in Playwright config above)
  - [ ] Configure video recording on retry (already in Playwright config above)
  - [ ] Configure trace recording for first retry (provides step-by-step debugging in Playwright Trace Viewer)
- [ ] Testing
  - [ ] Run full E2E suite locally and verify all tests pass
  - [ ] Run E2E suite in Docker and verify it works headless
  - [ ] Verify CI pipeline correctly runs E2E tests and uploads artifacts on failure

## 2026-02-27 - Component Library and Iconography

Need to develop a comprehensive icon library for components on the canvas. Icons for all offerings of major services, technologies, platforms, and tools should be included. They should be very easy to select for a component on the canvas (and connectors for technologies that integrate with other technologies) and should be visually consistent and recognizable. Custom icons should also be supported for users who want to upload their own or for technologies that don't have widely recognized icons.

**Current state:** The `Element` type in `src/types/threat-model.ts` already has an `icon?: string` optional field — it's defined but unused. Canvas nodes (`process-node.tsx`, `data-store-node.tsx`, `external-entity-node.tsx`) display only a text label and optional trust zone — no icon rendering. `DfdNodeData` in `canvas-store.ts` has no icon field. The component palette (`component-palette.tsx`) shows DFD element types with `lucide-react` icons (Box, Database, Globe, ShieldAlert) but these are generic element type indicators, not component-specific icons. The app uses `lucide-react` (^0.575.0) for all UI icons.

**Tasks:**

- [ ] Design the icon system architecture
  - [ ] Define icon source categories and decide on the format:
    - **SVG-based** (recommended): lightweight, scalable, theme-able via CSS `currentColor`, works offline
    - Icons should be organized by provider/category: `aws/`, `azure/`, `gcp/`, `generic/`, `tech/`, `languages/`, `custom/`
  - [ ] Choose an icon sourcing strategy (in priority order):
    1. Use established open-source icon sets with permissive licenses: [Simple Icons](https://simpleicons.org/) (CC0, 3000+ brand SVGs), [DevIcons](https://devicon.dev/) (MIT, 800+ dev tool icons), cloud provider official icon sets (AWS Architecture Icons, Azure Icons, GCP Icons — all freely available for diagramming)
    2. Ship a curated subset (~200-300 most-used icons) as static SVG files in `public/icons/` or as an importable module
    3. Support user-uploaded custom SVGs for anything not in the library
  - [ ] Define an `IconMetadata` type: `{ id: string, name: string, category: string, tags: string[], svgPath: string }` for the searchable icon registry
  - [ ] Create `src/lib/icons/icon-registry.ts` with the full searchable icon catalog (array of `IconMetadata`)
- [ ] Build the icon catalog
  - [ ] **Cloud providers** (~100-150 icons):
    - AWS: EC2, S3, Lambda, RDS, DynamoDB, API Gateway, CloudFront, SNS, SQS, ECS, EKS, IAM, VPC, Route53, Cognito, KMS, etc.
    - Azure: App Service, Functions, Blob Storage, Cosmos DB, SQL Database, AKS, Key Vault, AD, API Management, Event Hub, etc.
    - GCP: Compute Engine, Cloud Functions, Cloud Storage, BigQuery, Cloud SQL, GKE, Cloud Run, Pub/Sub, IAM, etc.
  - [ ] **Generic infrastructure** (~30 icons): Database, Server, Load Balancer, Firewall, CDN, Queue, Cache, Storage, API, Gateway, DNS, Certificate, Container, VM, Serverless Function, Mobile App, Web App, Desktop App, IoT Device, User/Actor
  - [ ] **Technologies** (~40 icons): Redis, Kafka, RabbitMQ, Elasticsearch, Kubernetes, Docker, Nginx, Apache, Terraform, Vault (HashiCorp), Consul, PostgreSQL, MySQL, MongoDB, Cassandra, GraphQL, gRPC, REST API, WebSocket, OAuth
  - [ ] **Languages and frameworks** (~30 icons): Python, Java, Node.js, Go, Rust, C#, TypeScript, JavaScript, React, Angular, Vue, Spring, Django, .NET, Ruby, PHP, Swift, Kotlin
  - [ ] **SaaS platforms** (~20 icons): GitHub, GitLab, Slack, Okta, Auth0, Stripe, Twilio, SendGrid, Datadog, Splunk, PagerDuty, Cloudflare, Vercel, Heroku
  - [ ] Store icons in `public/icons/{category}/{id}.svg` for static serving, or bundle via Vite's import system
- [ ] Wire icons into the data model and canvas
  - [ ] Add `icon?: string` to `DfdNodeData` in `canvas-store.ts` (`icon` maps to an icon registry ID)
  - [ ] Update `syncFromModel()` in `canvas-store.ts` to populate node data `icon` from `Element.icon`
  - [ ] Update all node components (`process-node.tsx`, `data-store-node.tsx`, `external-entity-node.tsx`) to render the icon:
    - Show icon (24x24 or 32x32) to the left of the label text inside the node
    - Fall back to the current icon-less layout if no icon is set
    - Icon should be rendered as an `<img>` for SVG files or an inline SVG component
  - [ ] Update `addElement()` in `canvas-store.ts` to accept an optional `icon` parameter
- [ ] Build the icon picker UI
  - [ ] Create `src/components/panels/icon-picker.tsx`: a searchable icon browser component
    - Search input at top with debounced filtering against `IconMetadata.name` and `tags`
    - Category tabs/filter chips for quick filtering (All, AWS, Azure, GCP, Generic, Tech, Languages, SaaS)
    - Grid of icon thumbnails (48x48 with name underneath), scrollable
    - Click to select → returns icon ID to parent
    - "None" option to clear the icon
  - [ ] Integrate the icon picker into the Properties tab (`properties-tab.tsx`):
    - Show current icon (or placeholder) next to the element name field
    - Click on it to open the icon picker as a popover or inline expandable section
    - Selecting an icon calls `updateElement(id, { icon: selectedIconId })` on model-store
  - [ ] Integrate into the component palette (`component-palette.tsx`):
    - When dragging an element type, optionally allow pre-selecting an icon (future enhancement — not required for v1)
- [ ] Support custom icons
  - [ ] Allow users to import a custom SVG file for any element via the Properties tab icon picker
  - [ ] Store custom icon SVGs in the `.threatforge/icons/` directory alongside the model file (mirrors the layout storage pattern)
  - [ ] Add a "Upload Custom" button in the icon picker that opens a file dialog (via the file adapter) for SVG files
  - [ ] Validate uploaded SVGs: check file size limit (64KB), verify it's valid SVG XML, sanitize (strip embedded scripts/event handlers for security)
  - [ ] Reference custom icons in the YAML as `custom:{filename}` to distinguish from built-in icon IDs
  - [ ] Implement custom icon read/write in the file adapters (`file-adapter.ts`, `tauri-file-adapter.ts`, `browser-file-adapter.ts`)
- [ ] Update the Rust backend for icon support
  - [ ] Verify the Rust `Element` model in `src-tauri/src/models/` already has `icon: Option<String>` (it should, since TS type has `icon?`)
  - [ ] Add custom icon file I/O commands: `save_custom_icon`, `load_custom_icon`, `delete_custom_icon` in `src-tauri/src/commands/file_commands.rs`
  - [ ] Sanitize custom SVG content on the Rust side before saving (strip `<script>` tags, `on*` event attributes)
  - [ ] Scope file access to the `.threatforge/icons/` directory using Tauri's path scoping
- [ ] Testing
  - [ ] Unit test icon registry: search, filter by category, handle empty results
  - [ ] Component test icon picker: render, search, select, clear
  - [ ] Unit test custom SVG sanitization logic
  - [ ] Integration test: set icon on element → save model → reopen → icon persists on node
  - [ ] Visual test: verify icons render at correct size and alignment in all three node types

## 2026-02-27 - Canvas Improvements

The canvas connector system requires significant improvements for better usability and reliability. Current issues include unstable connector positioning and organization, non-functional side connectors on nodes, and missing label support. Connectors need the ability to display text labels centered on their endpoints with background and stroke styling that matches the connector color. Connector labels should support inline editing as well as property pane configuration. Additionally, all nodes and components need enhanced features and improved interactivity.

**Current state:** Edges use `DataFlowEdge` (`data-flow-edge.tsx`) which renders a `BaseEdge` with `getBezierPath` and an `EdgeLabelRenderer` overlay for protocol + data labels. Labels are positioned at the midpoint via CSS `translate(-50%, -50%)` and show protocol · data text. Nodes have 4 handles each (top=target, left=target, bottom=source, right=source) but ReactFlow doesn't auto-route to the best handle — it uses the default connection handle which causes overlapping/crossing edges. Node handles are 8x8px dots styled `!bg-muted-foreground`. Edge labels are read-only (no inline editing). The `DfdEdgeData` type has `protocol`, `data[]`, and `authenticated` fields. Selection styling works (green border/stroke on select). Trust boundary nodes use a dashed border with ember accent.

**Tasks:**

- [ ] Fix connector handle positioning and smart routing
  - [ ] Implement a `getSmartHandlePositions` utility that, given source and target node positions, determines the optimal handle pair (top/bottom/left/right) to minimize edge crossings and path length
  - [ ] Apply this in `onConnect` handler in `canvas-store.ts`: when creating a new edge, store `sourceHandle` and `targetHandle` IDs so ReactFlow uses the correct handles
  - [ ] Assign unique IDs to each handle in node components (e.g., `id="top-target"`, `id="right-source"`) so they can be targeted programmatically
  - [ ] Consider switching from `getBezierPath` to `getSmoothStepPath` for cleaner orthogonal routing, or implement custom pathfinding that avoids nodes
  - [ ] Ensure handles on all four sides are functional: verify the `type` (source/target) assignment — currently top/left are target-only and bottom/right are source-only, which prevents some connection directions. Either make all handles bidirectional (`type="source"` on all, or use two overlapping handles per side) or explain the design constraint to users visually
- [ ] Improve edge label rendering and interaction
  - [ ] Add **inline label editing**: double-click on an edge label to enter edit mode (replace the label `<div>` with an `<input>` or `<textarea>`). On blur or Enter, commit the change to `canvas-store` and `model-store`
  - [ ] Support editing both `protocol` and `data[]` fields inline: show "protocol · data1, data2" as the display, and split the edit into two inputs (or one smart input with a separator)
  - [ ] Add edge label background styling that matches the edge color: selected edges should have `bg-tf-signal/10` label background, unselected edges keep `bg-card`
  - [ ] Show a "+" add label button on edge hover when no label is present (for edges with empty protocol and data)
  - [ ] Make edge labels draggable to adjust position offset from the midpoint (store a `labelOffset` in edge data) — this is an advanced feature, can be deferred
- [ ] Improve edge selection and interaction UX
  - [ ] Increase the clickable/hoverable area of edges (currently 2px stroke is hard to click) — use an invisible wider stroke (10-12px) behind the visible edge for hit testing
  - [ ] Add hover state: change edge color to a lighter version of the theme accent on hover (before click-to-select)
  - [ ] Show animated flow direction indicator on hover or selection (a moving dot along the edge path, or animated dashes)
  - [ ] When an edge is selected, highlight the connected source and target nodes with a subtle glow
- [ ] Enhance node features and interactivity
  - [ ] Add **inline node label editing**: double-click on a node label to edit the name in-place (replace the label `<div>` with an `<input>`). Commit on blur or Enter, updating both canvas-store and model-store
  - [ ] Add resize handles to trust boundary nodes (they're group containers and need to be resizable to contain child elements)
  - [ ] Add a visual indicator on nodes showing the count of linked threats (a small badge in the corner, e.g., "3 threats" with severity color)
  - [ ] Add context menu on right-click for nodes: Edit Properties, Delete, Duplicate, Change Type (for element nodes), View Threats
  - [ ] Add context menu on right-click for edges: Edit Properties, Delete, Reverse Direction
  - [ ] Show technology badges on nodes: if `technologies[]` is populated, display small pills/tags below the node label
  - [ ] Add port/handle labels showing the connected flow's protocol on hover (so you can see what's connected without selecting)
- [ ] Improve drag-and-drop from palette
  - [ ] Add visual feedback during drag: show a ghost preview of the node being dragged onto the canvas
  - [ ] Add drop zone highlighting: when dragging over a trust boundary, highlight it to indicate the element will be added inside it
  - [ ] Auto-assign elements to a trust boundary if dropped inside one (update `TrustBoundary.contains` array)
- [ ] Edge validation and constraints
  - [ ] Prevent duplicate edges: don't allow two edges between the same source→target pair (show a toast/notification explaining why)
  - [ ] Prevent self-loops: don't allow connecting a node to itself
  - [ ] Visual feedback on invalid connections: show a red highlight or "not allowed" cursor when hovering over an invalid target during edge creation
- [ ] Testing
  - [ ] Unit test smart handle position calculation
  - [ ] Unit test edge validation (no duplicates, no self-loops)
  - [ ] Component test inline editing on nodes and edges
  - [ ] Component test context menus render with correct actions
  - [ ] Visual regression test: verify node/edge renders haven't changed unexpectedly

## 2026-02-27 - Editor improvements and settings modal

Lets have a settings modal, accessible by a gear icon along with the hide left/right panels icons. should house things like language, autosave (need to build this functionality - should be off by default), theme, etc.
The overall editor needs to be more tuned for keyboard accessibility / shortcuts. Lets make keytips more visible by default on all controls (have a setting to turn them off). Some settings should be local to the user and some should be local to the file/diagram (need further discussion on which should be which).

**Current state:** Keyboard shortcuts are handled in `use-keyboard-shortcuts.ts` hook (Cmd/Ctrl+N, O, S, L). Shortcut hints are shown as tooltip text on hover in `top-menu-bar.tsx` buttons. There is no settings modal or settings persistence (except AI API keys via keychain). The UI store (`ui-store.ts`) manages panel open/close state and right panel tab/width but has no persistence — state resets on reload. Panel toggles are in the top menu bar alongside file action buttons. The only dialog in the codebase is `ai-settings-dialog.tsx` (API key management). There is no autosave feature. There is no localization/i18n system.

**Tasks:**

- [x] Design settings architecture and persistence
  - [x] Define settings scopes:
    - **User settings** (local to the machine, persist across files): theme, language, autosave on/off, keytips visibility, AI provider preferences, default zoom level, grid snap on/off
    - **File settings** (saved with / adjacent to the threat model file): diagram-specific grid size, default element colors/styles, STRIDE analysis configuration
  - [x] Create `src/types/settings.ts` with `UserSettings` and `FileSettings` interfaces
  - [x] Create `src/stores/settings-store.ts` with Zustand + `persist` middleware (localStorage for user settings)
    - Default values for all settings (autosave: off, keytips: on, gridSnap: on, gridSize: 16, etc.)
    - `updateUserSetting(key, value)` and `resetToDefaults()` actions
  - [ ] File settings stored in the `.threatforge.yaml` metadata section or in a separate `.threatforge/settings.json` — decide which (YAML metadata is simpler, separate file keeps the YAML clean) — deferred: user settings done, file settings need further discussion
- [x] Build the settings modal
  - [x] Create `src/components/panels/settings-dialog.tsx` following the same pattern as `ai-settings-dialog.tsx` (fixed overlay, z-50, bg-black/50 backdrop, Escape to close)
  - [x] Organize settings into sections/tabs within the modal:
    - **General**: Language (future — just show "English" as the only option for now with a "more coming" note), Autosave toggle, Default file location
    - **Appearance**: Theme mode (Light/Dark/System) + theme preset picker (see Theme Support section), Keytip visibility toggle, Sidebar default widths, Animation preferences (reduce motion)
    - **Editor**: Grid snap toggle, Grid size, Default zoom level, Confirm before delete toggle
    - **AI**: Move the current AI settings dialog content here — provider selector, API key management, model selection
    - **Keyboard Shortcuts**: Read-only list of all shortcuts (future: make them customizable)
  - [x] Add a gear icon button (⚙️ / `Settings` lucide icon) to the top menu bar in `top-menu-bar.tsx`, positioned alongside the panel toggle icons
  - [x] Wire settings updates to immediate UI response (no "Apply" button — changes take effect live)
- [x] Implement autosave
  - [x] Add autosave logic in a new `src/hooks/use-autosave.ts` hook:
    - Watch `model-store.isDirty` flag
    - When dirty becomes true, start a debounced timer (e.g., 30 seconds)
    - On timer fire: if model has a `filePath` (was previously saved), call `saveModel()` from `useFileOperations`
    - If model has never been saved (`filePath` is null), do NOT auto-save (don't trigger Save As dialog automatically)
    - Cancel the timer if the user manually saves or if dirty becomes false
    - Show a subtle indicator in the status bar: "Autosaving..." → "Autosaved at HH:MM"
  - [x] Add autosave settings to user settings: enabled/disabled (default: off), interval in seconds (default: 30)
  - [x] Mount the `useAutosave` hook in `AppLayout` when autosave is enabled
- [x] Improve keyboard accessibility
  - [ ] Audit all interactive elements for keyboard reachability: every button, tab, input, palette item should be focusable and activatable via keyboard — deferred to a follow-up
  - [x] Add visible keytip badges to UI controls:
    - Create a `src/components/ui/keytip.tsx` component: a small styled badge showing the keyboard shortcut (e.g., "⌘N") overlaid on or next to the control
    - Render keytips on: top menu bar buttons (already have tooltips — add persistent visible badges), palette items (if shortcuts are added), panel tab switches
    - Keytips should be rendered conditionally based on the `keytipsVisible` user setting
  - [x] Expand keyboard shortcuts in `use-keyboard-shortcuts.ts`:
    - `Cmd/Ctrl+Z`: Undo (requires undo/redo system — this is a large feature, add as separate TODO if out of scope)
    - `Cmd/Ctrl+Shift+Z` or `Cmd/Ctrl+Y`: Redo
    - `Cmd/Ctrl+,`: Open Settings
    - `Cmd/Ctrl+D`: Duplicate selected element
    - `Cmd/Ctrl+A`: Select all elements on canvas
    - `Escape`: Deselect all / close open dialogs
    - `Tab`: Cycle through canvas elements (focus navigation)
    - `1/2/3`: Quick-switch right panel tabs (Properties/Threats/AI)
    - `Cmd/Ctrl+Shift+S`: Save As
  - [x] Show a keyboard shortcuts cheat sheet: accessible via `Cmd/Ctrl+/` or a "?" button, displaying all available shortcuts in a modal
- [x] Improve top menu bar organization
  - [x] Group controls more clearly: File operations (left) | View toggles (center) | Settings + Help (right)
  - [x] Add a Help menu button (? icon) next to the settings gear: links to docs, keyboard shortcuts, and onboarding guides (see Onboarding section)
  - [x] Consider moving panel toggles to a "View" dropdown or keeping them as icon buttons — decided to keep as icon buttons with a divider separator
- [x] Migrate AI settings into the main settings modal
  - [ ] Move the content of `ai-settings-dialog.tsx` into the AI section of the settings modal
  - [ ] Update the AI chat tab's settings button to open the main settings modal with the AI tab pre-selected
  - [ ] Keep `ai-settings-dialog.tsx` as a component but have it render inside the settings modal rather than as a standalone dialog
- [ ] Testing
  - [ ] Unit test `settings-store`: verify defaults, updates, persistence to localStorage, and reset
  - [ ] Unit test `useAutosave` hook: verify debounce timing, dirty flag watching, skip when no filePath
  - [ ] Component test settings modal: render, navigate tabs, toggle settings, verify live preview
  - [ ] Component test keytip rendering: visible when setting is on, hidden when off
  - [ ] Integration test: change a setting → close/reopen app → setting persists
  - [ ] Keyboard navigation test: Tab through all controls, verify focus is visible and reachable
