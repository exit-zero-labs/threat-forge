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
