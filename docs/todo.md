# ThreatForge — Todo

Shared execution plan for humans and LLM agents. Update this file before, during, and after every work session.

---

## 2026-02-26 — README + repo compliance docs

### Plan

- [x] Rewrite `README.md` with proper project overview, dev setup, mission, contributing, license
- [x] Create `LICENSE` (Apache 2.0, owned by Exit Zero Labs LLC)
- [x] Create `NOTICE` (copyright attribution file for Apache 2.0)
- [x] Create `CONTRIBUTING.md` (how to contribute, code style, PR process)
- [x] Create `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1)
- [x] Create `SECURITY.md` (vulnerability reporting — critical for a security tool)
- [x] Create `.github/ISSUE_TEMPLATE/bug-report.yml` (structured bug reports)
- [x] Create `.github/ISSUE_TEMPLATE/feature-request.yml` (structured feature requests)
- [x] Create `.github/PULL_REQUEST_TEMPLATE.md` (PR checklist)
- [x] Create `.github/FUNDING.yml` (GitHub Sponsors)
- [x] Validate: all files created, links between docs are consistent

### Notes

- License: Apache 2.0 downloaded from apache.org — `NOTICE` file contains Exit Zero Labs LLC copyright
- Used YAML-based issue templates (`.yml`) for better structured input vs freeform Markdown
- SECURITY.md references GitHub private vulnerability reporting + email
- All emails point to `admin@exitzerolabs.com`, website to `exitzerolabs.com`
- README includes YAML file format example to hook developers immediately

---

## 2026-02-26 — Session 1: Foundation + Scaffold

Branch: `feat/foundation-scaffold`

### Plan

**Dependencies & Tooling**

- [x] Upgrade React 18 → React 19 + update types
- [x] Install and configure Tailwind CSS 4
- [x] Install and configure Biome (linting + formatting)
- [x] Install shadcn/ui + required dependencies (cva, clsx, tailwind-merge, lucide-react)
- [x] Install Zustand for state management
- [x] Install ReactFlow (xyflow) for diagramming (@xyflow/react v12)
- [x] Install Vitest + React Testing Library for frontend tests
- [x] Add Rust dependencies: `serde_yaml`, `thiserror`, `uuid`, `chrono`
- [x] Add format/lint npm scripts to package.json (check, format, test, test:watch)
- [x] Remove default scaffold code (App.tsx, App.css, greet command, logos)

**Tailwind + shadcn/ui + Dark Mode**

- [x] Configure Tailwind CSS 4 with Vite (@tailwindcss/vite plugin)
- [x] Set up ThreatForge design tokens (colors, fonts) in `src/styles.css`
- [x] Configure shadcn/ui with dark mode support (oklch color system)
- [x] Create base CSS with ThreatForge palette (Zero, Dusk, Signal, Ember, Canvas, Mist)

**App Shell**

- [x] Create app layout: left sidebar + main canvas + right panel
- [x] Create top menu bar component with panel toggles
- [x] Create left sidebar: component palette with DFD element types (drag support)
- [x] Create main area: canvas placeholder with empty state + "New Model" button
- [x] Create right panel: properties/threats tabs (collapsible)
- [x] Create bottom status bar component (element/flow/threat counts, dirty indicator)
- [x] Wire up basic Zustand store for UI state (panel visibility, tab selection)
- [x] Wire up model store for threat model state (model, file path, dirty, selection)

**Rust Backend Structure**

- [x] Set up module structure: `commands/`, `models/`, `stride/`, `file_io/`, `errors.rs`
- [x] Define core YAML schema types in `models/` (ThreatModel, Element, DataFlow, TrustBoundary, Threat, Diagram, Metadata, DiagramLayout)
- [x] Add serialization/deserialization tests (round-trip, sample YAML, unknown fields, layout)
- [x] Create Tauri commands for file operations (create, open, save model + layout)
- [x] Add file I/O with schema validation (version check, ID uniqueness, reference integrity)
- [x] Define error types with `thiserror` (FileRead, FileWrite, YamlParse, InvalidReference, etc.)
- [x] Run `cargo clippy` — passes (2 expected dead_code warnings for unused utility fns)

**Validation**

- [ ] Validate: `npm run dev` launches the app with new shell (needs manual check)
- [x] Validate: `npx biome check .` passes — 23 files, 0 errors
- [x] Validate: `cargo clippy` passes — clean
- [x] Validate: `npx vitest --run` passes — 11 tests in 2 files
- [x] Validate: `cargo test` passes — 13 tests in 3 modules
- [x] Validate: `npx tsc --noEmit` passes — no type errors
- [ ] Validate: dark mode renders correctly (needs manual check)

### Notes

- React upgraded to 19.2.4 (from 18.3.1)
- @xyflow/react v12 installed (this is ReactFlow's new package name)
- Biome v2.4.4 with `tailwindDirectives: true` for CSS parsing
- Biome configured with `noDefaultExport: error` + biome-ignore comments on config files (Vite/Vitest require default exports)
- Biome `noStaticElementInteractions` disabled — palette items need drag handlers on divs
- serde_yaml v0.9 is marked deprecated but still the standard for YAML in Rust (serde_yml is the successor but less mature)
- Rust tests validate the full YAML schema from the project document: elements, data flows, trust boundaries, threats, diagrams
- File reader validates: schema version, duplicate IDs, element/flow cross-references in threats and boundaries
- TypeScript types in `src/types/threat-model.ts` mirror the Rust types exactly
- Zustand stores: `ui-store` (panel state) and `model-store` (threat model state, selection, dirty tracking)
- Tauri window increased to 1280x800 (from 800x600) with 900x600 minimum
- CSP tightened from `null` to proper policy
- App identifier changed to `com.exitzerolabs.threatforge`

---

## 2026-02-26 — Session 2: ReactFlow Canvas

Branch: `feat/reactflow-canvas`

### Plan

**Architecture: Store ↔ Canvas sync**
- [x] Create `canvas-store.ts` — manages ReactFlow nodes/edges, viewport, derived from model-store
- [x] Conversion functions: model elements → ReactFlow nodes, data flows → ReactFlow edges
- [x] Bidirectional sync: canvas changes propagate to model-store, model changes update canvas

**Custom DFD Node Types**
- [x] `ProcessNode` — rounded rectangle with name + icon (DFD process)
- [x] `DataStoreNode` — parallel-line style rectangle (DFD data store)
- [x] `ExternalEntityNode` — squared rectangle (DFD external entity)
- [x] Shared node styling: selected state, hover state, handles for connections
- [x] Register custom node types with ReactFlow

**Custom Edge Type**
- [x] `DataFlowEdge` — labeled edge with protocol and data info
- [x] Edge labels showing protocol (e.g., "HTTPS/TLS")
- [x] Animated edge style for authenticated flows

**Trust Boundaries**
- [x] Trust boundary rendered as ReactFlow group node
- [x] Visual: dashed border, label, contains child elements
- [x] Update palette to include trust boundary creation

**Canvas Integration**
- [x] Replace canvas placeholder with ReactFlow canvas (`DfdCanvas` component)
- [x] `ReactFlowProvider` wrapper in app layout
- [x] Canvas background (dots pattern)
- [x] Minimap for navigation
- [x] Canvas controls (zoom in/out/fit)

**Palette → Canvas drag-drop**
- [x] Handle drop events on canvas to create new elements
- [x] Auto-generate element IDs from type + counter
- [x] Place element at drop position
- [x] Mark model dirty after any canvas change

**Selection + Properties sync**
- [x] Node click → update selectedElementId in model-store
- [x] Right panel properties tab shows selected element (wired via existing right-panel component)
- [x] Click canvas background → deselect

**Edge Creation**
- [x] Connect two nodes by dragging from handle to handle
- [x] Create DataFlow in model-store on connection
- [x] Auto-generate flow IDs

**Testing**
- [x] Canvas store tests: 8 tests (sync, add element, add flow, add boundary, parent assignment, dirty tracking, ID counter reset)

**Validation**
- [x] Validate: `npx biome check .` passes — 31 files, 0 errors
- [x] Validate: `npx vitest --run` passes — 19 tests in 3 files
- [x] Validate: `npx tsc --noEmit` passes — no type errors
- [x] Validate: `cargo test` passes — 13 tests
- [ ] Validate: can drop elements from palette onto canvas (needs manual check)
- [ ] Validate: can connect elements with data flow edges (needs manual check)
- [ ] Validate: selecting node shows properties in right panel (needs manual check)
- [ ] Validate: trust boundaries render as groups (needs manual check)

### Notes

- `src/app.tsx` was missing from the merged PR — recreated as thin wrapper around `AppLayout`
- ReactFlow v12 `Node<T>` / `Edge<T>` generics require `T` to satisfy `Record<string, unknown>` — solved by using `type` with index signatures instead of `interface` for `DfdNodeData` / `DfdEdgeData`
- Node components use inline prop types `{ data: DfdNodeData; selected?: boolean }` instead of `NodeProps<T>` to avoid generic constraint mismatch with `NodeTypes`
- Edge component casts `data` from `EdgeProps` to `DfdEdgeData` since `EdgeTypes` has same constraint issue
- `applyNodeChanges` / `applyEdgeChanges` return generic `Node[]` / `Edge[]` — cast to `DfdNode[]` / `DfdEdge[]`
- Biome-ignore on useEffect dependency: `model` intentionally in deps to trigger re-sync when model changes
- Trust boundaries insert at beginning of nodes array so they render behind element nodes
- Palette now uses `type` prop directly instead of deriving from label string conversion
- Delete key (Delete/Backspace) removes selected nodes + connected edges from both canvas and model store

---

## 2026-02-26 — Session 3: STRIDE Engine + Threat Management

Branch: `feat/stride-engine`

### Plan

**Rust STRIDE Engine**
- [x] Implement STRIDE rule engine in `src-tauri/src/stride/mod.rs`
  - [x] Define `ThreatRule` struct with hardcoded rules
  - [x] Rules per element type: Process (S,T,R,ID,DoS,EoP), DataStore (T,ID,DoS), ExternalEntity (S,R)
  - [x] Rules per data flow: context-aware (cross-boundary severity boost)
  - [x] `analyze()` method: given a ThreatModel, return Vec<Threat> suggestions
  - [x] Deduplication: skip threats already in the model (match on element+category)
  - [x] Unit tests: 9 tests (per-element-type counts, total count, dedup, titles, cross-boundary boost)

**Tauri Command**
- [x] Create `src-tauri/src/commands/stride_commands.rs` with `analyze_stride` command
- [x] Register command in `lib.rs`
- [x] Wire up in `commands/mod.rs`

**Frontend: Model Store + Threat CRUD**
- [x] Add `addThreat`, `addThreats`, `updateThreat`, `deleteThreat` actions to model-store
- [x] Add `updateElement` action for property editing
- [x] Add `analyzeThreats` action that calls Tauri IPC `analyze_stride`
- [x] Add `isAnalyzing` state for loading indicator
- [x] Unit tests: 7 new tests (add, add-bulk, add-zero, update, delete, delete-clears-selection, updateElement)

**Frontend: Threat Analysis Panel**
- [x] Rewrite ThreatsTab: clickable threat cards, "Analyze" button, empty state with CTA
- [x] Threat detail editing: inline edit for title, severity, category, description, mitigation
- [x] Threat-to-element linking: click threat → navigate to linked element in properties
- [x] Element-to-threat filtering: toggle to show only threats for selected element
- [x] Mitigation tracking: status select + description textarea

**Frontend: Element Properties Editing**
- [x] Rewrite PropertiesTab: editable fields for name, trust zone, description, technologies
- [x] Changes propagate to model-store (`updateElement`) and canvas-store (node label + trust zone sync)
- [x] Related threats section: shows threats linked to the selected element with clickable links

**Validation**
- [x] Validate: `npx biome check .` passes — 33 files, 0 errors
- [x] Validate: `npx vitest --run` passes — 26 tests in 3 files
- [x] Validate: `npx tsc --noEmit` passes — no type errors
- [x] Validate: `cargo test` passes — 22 tests
- [x] Validate: `cargo clippy` passes — clean (1 expected dead_code warning)
- [ ] Validate: STRIDE analysis produces threats when clicking Analyze (needs manual check)
- [ ] Validate: threat editing inline form works (needs manual check)
- [ ] Validate: element property editing syncs to canvas (needs manual check)

### Notes

- STRIDE engine has 14 rules: 6 for Process (S,T,R,ID,DoS,EoP), 3 for DataStore (T,ID,DoS), 2 for ExternalEntity (S,R), 3 for DataFlow (T,ID,DoS)
- Cross-boundary severity boosting: flows crossing trust boundaries get bumped (Medium→High, Low→Medium)
- Deduplication uses (element_id, category) key pair to avoid duplicate threats
- ThreatsTab and PropertiesTab extracted to separate component files from right-panel.tsx
- PropertiesTab syncs name/trustZone changes directly to canvas-store nodes for immediate visual feedback
- Biome-ignore on FieldGroup label: `children` always contains a form control but Biome can't verify through the prop
- `invoke` from `@tauri-apps/api/core` is mocked in tests via `vi.mock`
