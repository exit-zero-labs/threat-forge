# ThreatForge — Backlog

Prioritized implementation backlog. Each item includes scope, dependencies, estimated complexity, and an exhaustive task breakdown. Items are ordered by priority within tiers.

**Priority tiers:**

- **P0** — Bugs / broken functionality (fix first)
- **P1** — Core feature gaps (high user value, enables workflows)
- **P2** — Major features (significant effort, high strategic value)
- **P3** — Infrastructure & platform (needed for launch / ecosystem)
- **P4** — Process & admin

**Complexity:** S = hours, M = 1-2 days, L = 3-5 days, XL = 1-2 weeks

---

## P0 — Bug Fixes

### 1. Fix component drag-to-canvas positioning

**Problem:** When dragging a component from the left palette onto the canvas, the component lands near the bottom center instead of where the mouse was released.

**Root cause area:** `dfd-canvas.tsx:onDrop()` converts screen coordinates to flow coordinates via `screenToFlowPosition()`. The WKWebView workaround (storing drag data in Zustand instead of `dataTransfer`) may be interfering with coordinate calculation. The `clientX`/`clientY` from the drop event may not account for panel offsets or ReactFlow viewport transforms correctly.

**Complexity:** S
**Dependencies:** None
**Parallelizable:** Yes

**Tasks:**

- [ ] Reproduce the bug — drag component from palette, verify incorrect placement
- [ ] Add console logging in `dfd-canvas.tsx:onDrop()` to capture: `event.clientX/Y`, `screenToFlowPosition()` output, and final node position
- [ ] Check if `reactFlowBounds` from `reactFlowWrapper.current.getBoundingClientRect()` correctly accounts for the left panel width
- [ ] Verify `screenToFlowPosition({ x: event.clientX, y: event.clientY })` returns the correct canvas-space coordinates
- [ ] If the issue is panel offset: subtract left panel width from clientX before conversion
- [ ] If the issue is viewport transform: ensure `screenToFlowPosition` accounts for current pan/zoom
- [ ] Test with left panel at different widths (180px, 400px)
- [ ] Test with canvas zoomed in/out and panned
- [ ] Test double-click to add from palette (should also position correctly)
- [ ] Run `npx vitest` to ensure no regressions

---

## P1 — Core Feature Gaps

### 2. Flow numbering

**What:** Add a visible flow number to each data flow. Auto-increment on creation. Allow manual editing for flexibility. Display the number on the canvas edge.

**Current state:** Flows have auto-generated IDs (`flow-1`, `flow-2`, etc.) but no user-facing number field. The ID is internal and not displayed on the canvas.

**Complexity:** M
**Dependencies:** None
**Parallelizable:** Yes

**Tasks:**

Schema & backend:

- [ ] Add `flow_number: Option<u32>` to `DataFlow` struct in `src-tauri/src/models/threat_model.rs`
- [ ] Update `serde` serialization — field is optional, omitted when `None` (backward compatible)
- [ ] Add round-trip test: YAML with `flow_number` → Rust → YAML, assert preserved
- [ ] Add backward compat test: YAML without `flow_number` still parses
- [ ] Run `cargo test` and `cargo clippy`

Frontend types:

- [ ] Add `flow_number?: number` to `DataFlow` in `src/types/threat-model.ts`

Canvas store:

- [ ] In `canvas-store.ts:addDataFlow()`, compute next flow number: `Math.max(...existingFlows.map(f => f.flow_number ?? 0)) + 1`
- [ ] Set `flow_number` on new flow creation
- [ ] Sync `flow_number` into `DfdEdgeData` for rendering

Edge rendering:

- [ ] In `data-flow-edge.tsx`, display flow number as a small badge/chip at the start of the edge (near source handle)
- [ ] Style: small circle with number, semi-transparent background, positioned near source node
- [ ] Show number even if edge has no label text

Properties panel:

- [ ] In the data flow properties section, add an editable "Flow #" field
- [ ] Validate: must be positive integer, warn on duplicates (but allow — user choice)
- [ ] On edit, update `DataFlow.flow_number` via `modelStore.updateDataFlow()`

Testing:

- [ ] Unit test: auto-increment logic in canvas store
- [ ] Unit test: flow number persists through save/load
- [ ] Run `npx biome check --write .` and `npx vitest`

### 3. Export (unified HTML report + diagram)

**What:** Single export action (`Cmd+Shift+E`) generates a self-contained, multi-page HTML file. Page 1 is the visual diagram, Page 2+ is the threat report. The HTML file is opened in a new browser window — from there the user can print to PDF, save, or share. One shortcut, one output, everything included.

**Current state:** No export functionality exists. The only output format is `.thf` YAML.

**Complexity:** L
**Dependencies:** None
**Parallelizable:** Yes

**Tasks:**

Export infrastructure:

- [ ] Create `src/lib/export/` directory
- [ ] Create `src/lib/export/export-html.ts` — single export module

Diagram page (HTML):

- [ ] Render elements as styled divs positioned absolutely (using element positions from model)
- [ ] Style elements by type: process (rounded rect), data store (parallel lines / cylinder), external entity (square)
- [ ] Render data flows as SVG paths between elements with arrowheads
- [ ] Include flow numbers on edges (if present)
- [ ] Include flow labels (name, protocol) on edges
- [ ] Render trust boundaries as dashed rectangles with name labels
- [ ] Include a legend: element type shapes, STRIDE category colors

Report page (HTML):

- [ ] Cover section: model title, author, created/modified dates, description
- [ ] Summary stats: total elements, total flows, total threats by severity, by mitigation status
- [ ] Threat table: columns — #, Title, STRIDE Category, Element/Flow, Severity, Status, Description, Mitigation
- [ ] Group threats by severity (Critical → High → Medium → Low → Info)
- [ ] Element inventory: table of all elements with type, trust zone, technologies
- [ ] Data flow inventory: table of all flows with source, target, protocol, data, authenticated flag
- [ ] Footer: "Generated by ThreatForge" with timestamp

Styling:

- [ ] Self-contained — all CSS embedded inline or in `<style>` tags, no external dependencies
- [ ] Clean, professional look — use system fonts, sensible spacing, subtle colors
- [ ] Support light and dark variants (based on current app theme at export time)
- [ ] Print-optimized: `@media print` rules with page breaks between diagram and report sections
- [ ] Ensure diagram scales to fit within page width for printing
- [ ] Black/white-friendly tables (severity indicated by text, not color alone)

Navigation within HTML:

- [ ] Tab-style navigation at top: "Diagram" | "Report" (switches between pages via JS)
- [ ] Or simple anchor links: jump to diagram, jump to report sections
- [ ] Sticky header with model title

UI integration:

- [ ] Add "Export" button to top menu bar (single action, no submenu)
- [ ] Add keyboard shortcut `Cmd+Shift+E` / `Ctrl+Shift+E` in `src/types/settings.ts`
- [ ] Register shortcut in `use-keyboard-shortcuts.ts`
- [ ] On trigger: generate HTML string → open in new Tauri webview window or system browser
- [ ] Show toast notification: "Export opened in browser"
- [ ] Add "Export" to native menu in `src-tauri/src/menu.rs`
- [ ] Disable when no model is loaded

Tauri integration:

- [ ] Write HTML to a temp file via Tauri command, then open with system browser via `tauri-plugin-opener`
- [ ] OR open a new Tauri webview window with the HTML content (keeps it in-app)
- [ ] Create `export_to_temp_file(html: String) -> Result<String, String>` Rust command that writes to OS temp dir and returns path

Testing:

- [ ] Unit test: HTML export produces valid HTML with all elements, flows, boundaries
- [ ] Unit test: report section includes all threats grouped by severity
- [ ] Unit test: handles empty model (no elements, no threats)
- [ ] Unit test: handles model with self-loop edges
- [ ] Manual test: exported HTML renders correctly in Chrome, Safari, Firefox
- [ ] Manual test: print to PDF produces clean, paginated output
- [ ] Run `npx biome check --write .` and `npx vitest`

### 4. AI-based editing

**What:** Expand AI from read-only threat suggestions to full model editing — create/modify/delete elements, flows, boundaries, and threats via natural language commands.

**Current state:** AI can suggest threats via YAML code blocks in chat. User manually clicks "Accept" to add. No ability to modify elements, flows, or boundaries.

**Complexity:** XL
**Dependencies:** None
**Parallelizable:** Yes

**Tasks:**

Phase 1 — Define AI action protocol:

- [ ] Design an action format for AI responses (structured JSON blocks or YAML blocks with action types)
- [ ] Action types: `add_element`, `update_element`, `delete_element`, `add_flow`, `update_flow`, `delete_flow`, `add_boundary`, `update_boundary`, `delete_boundary`, `add_threat`, `update_threat`, `delete_threat`
- [ ] Each action specifies: `action`, `target_id` (for update/delete), and `data` (fields to set)
- [ ] Document the protocol in the system prompt

Phase 2 — Update system prompt:

- [ ] Extend `src-tauri/src/ai/prompt.rs` system prompt with action protocol documentation
- [ ] Include examples of each action type
- [ ] Instruct AI to wrap actions in fenced code blocks (` ```actions ... ``` `)
- [ ] Keep backward compat: threat-only suggestions still work

Phase 3 — Frontend action parser:

- [ ] Create `src/lib/ai-actions.ts` — parse AI response for action blocks
- [ ] Validate each action: required fields present, referenced IDs exist
- [ ] Return parsed actions with validation status

Phase 4 — Action preview & approval UI:

- [ ] In `ai-chat-tab.tsx`, render parsed actions as a diff-like preview
- [ ] Show what will be added/changed/deleted with before/after
- [ ] "Accept All" button to apply all actions at once
- [ ] Individual "Accept" / "Reject" per action
- [ ] Color-coded: green for add, yellow for update, red for delete

Phase 5 — Action execution:

- [ ] Create `src/lib/ai-action-executor.ts` — applies validated actions to the model
- [ ] Use existing store actions: `addElement()`, `updateElement()`, `deleteSelected()`, etc.
- [ ] Wrap all actions in a single history snapshot (one undo undoes the entire AI edit)
- [ ] Handle position assignment for new elements (auto-layout or smart placement)

Phase 6 — Polish and presentation:

- [ ] Ensure AI edits trigger canvas re-render with smooth transitions
- [ ] Add toast notifications for applied changes ("3 elements added, 2 flows updated")
- [ ] Handle edge cases: invalid actions, partial failures, conflicting updates
- [ ] Ensure AI actions are included in the model's change history for undo/redo
- [ ] Revamp the chat surface to better accommodate action previews (e.g., larger preview area, clearer separation from chat messages), and more intuitive accept/reject workflow. Also better display of markdown chat messages (currently just raw markdown text).
- [ ] Add processing and error states for AI actions (e.g., "Processing AI response...", "Failed to apply action: invalid element type") along with notifications for ready / success / failure outcomes.
- [ ] Build up system prompts and example interactions to encourage more complex multi-action edits (e.g., "Add a new process called 'Payment Processor' that receives data from 'Web App' and sends data to 'Database'. Then add a STRIDE threat for this new process related to spoofing.") Goal of the platform is to allow users to have a natural language conversation with the AI to iteratively build and refine their threat model and in turn their system architecture, without needing to manually manipulate the canvas at all if they don't want to.

Phase 7 — Testing:

- [ ] Unit test: action parser handles all action types
- [ ] Unit test: action executor modifies model correctly
- [ ] Unit test: invalid actions rejected gracefully
- [ ] Unit test: history snapshot covers entire AI edit batch
- [ ] Integration test: end-to-end AI edit flow with mock responses
- [ ] Run all linters and tests

---

## P2 — Major Features

### 5. Component icons — pre-packaged service icons

**What:** Add recognizable icons for popular cloud/tech services: AWS, GCP, Azure, Railway, Supabase, Postgres, React, Docker, Kubernetes, etc. Cover backend, frontend, devops, AI, and data science technologies.

**Current state:** 48 component types using Lucide React icons (generic shapes like `globe`, `database`, `router`). No vendor-specific icons (no AWS logo, no GCP logo, etc.).

**Complexity:** L
**Dependencies:** None
**Parallelizable:** Yes

**Tasks:**

Icon sourcing:

- [ ] Identify icon sources: [Simple Icons](https://simpleicons.org/) (SVG, free), cloud provider icon sets (AWS Architecture Icons, GCP icons, Azure icons)
- [ ] Verify licensing: all icons must be MIT/Apache/CC or free for use in open-source tools
- [ ] Create icon inventory — target list of ~50-80 service icons across categories

Icon categories needed:

- [ ] **Cloud Providers:** AWS (S3, Lambda, EC2, RDS, DynamoDB, SQS, SNS, API Gateway, CloudFront, ECS, EKS), GCP (Cloud Run, BigQuery, Firestore, Pub/Sub, GKE), Azure (App Service, Cosmos DB, Service Bus, AKS, Functions)
- [ ] **Databases:** PostgreSQL, MySQL, MongoDB, Redis, Elasticsearch, Neo4j, CockroachDB, Supabase
- [ ] **Infrastructure:** Docker, Kubernetes, Terraform, Nginx, Apache, HAProxy, Traefik
- [ ] **Platforms:** Railway, Vercel, Netlify, Cloudflare, Heroku, Fly.io, DigitalOcean
- [ ] **Frontend:** React, Vue, Angular, Svelte, Next.js, Vite, Webpress
- [ ] **Languages/Runtimes:** Node.js, Python, Go, Rust, Java, .NET, Ruby, PHP, etc.
- [ ] **AI/ML:** OpenAI, Anthropic, Hugging Face, TensorFlow, PyTorch, etc.
- [ ] **Messaging:** Kafka, RabbitMQ, NATS
- [ ] **Auth/Security:** OAuth, Auth0, Okta, Vault (HashiCorp)
- [ ] **Monitoring:** Datadog, Grafana, Prometheus, Sentry

Icon integration:

- [ ] Create `public/icons/services/` directory for SVG files
- [ ] Standardize SVG dimensions (24x24 viewBox) and colors (single-color, theme-aware)
- [ ] Create `src/lib/service-icons.ts` — maps service name to SVG import/path
- [ ] Decide rendering approach: inline SVG components vs. `<img>` tags with SVG files

Component library expansion:

- [ ] Extend `src/lib/component-library.ts` with new entries for each service
- [ ] Each entry: `{ id, label, icon, shape, strideCategory, tags, subtypes }`
- [ ] Organize into existing + new categories in the palette
- [ ] Add category: "Cloud Providers", "AI/ML", "Monitoring"
- [ ] Update search tags for discoverability

Palette UI:

- [ ] Ensure service icons render correctly in palette items (drag ghost, palette list)
- [ ] Test icon rendering on canvas nodes (`dfd-element-node.tsx`)
- [ ] Verify icons serialize/deserialize in `.thf` files (stored as icon name string)

Testing:

- [ ] Visual test: all icons render at correct size and color
- [ ] Unit test: component library entries all have valid icon references
- [ ] Run linters

### 6. Attachment points — visibility and UX polish

**What:** Make connection handle dots smaller and only visible on hover or during connector drag. Currently, 8 handles exist (4 positions × source/target) but some are always visible.

**Current state:** 8 handles defined in `shared-handles.tsx`. Outbound handles (bottom-source, right-source) and inbound handles (top-target, left-target) are visible by default. They use a 10×10px size.

**Complexity:** S
**Dependencies:** None
**Parallelizable:** Yes

**Tasks:**

Handle visibility:

- [ ] In `shared-handles.tsx`, set all handles to `opacity: 0` by default
- [ ] Add CSS: on node hover (`:hover` or parent `.react-flow__node:hover`), set handles to `opacity: 1`
- [ ] During connection drag (ReactFlow's `connectingNodeId` state), show all handles on all nodes
- [ ] Use CSS transition for smooth fade: `transition: opacity 150ms ease`

Handle sizing:

- [ ] Reduce handle size from 10×10 to 6×6 or 8×8
- [ ] Increase hover hitbox independently (keep a larger invisible click target, smaller visible dot)
- [ ] Use `pointer-events: all` on the handle wrapper even when visually hidden

Canvas store integration:

- [ ] Track `isConnecting: boolean` in canvas store (set on `onConnectStart`, cleared on `onConnectEnd`)
- [ ] Pass `isConnecting` to node components via data or context
- [ ] When `isConnecting`, all nodes show handles regardless of hover

Testing:

- [ ] Manual test: handles appear on hover, disappear on mouse leave
- [ ] Manual test: during connector drag, all target handles visible
- [ ] Manual test: connection still works with smaller handles
- [ ] Run linters

---

## P3 — Infrastructure & Platform

### 7. Automated update checks and downloads

**What:** Auto-check for updates (configurable frequency), notify user, and auto-install. Default: every 7 days. Settings: frequency slider, on/off toggle, manual "Check Now" button.

**Current state:** No auto-updater. `tauri-plugin-updater` is NOT in `Cargo.toml`. Release workflow creates GitHub releases with binaries but no update manifest. macOS code signing is commented out (secrets not configured).

**Complexity:** L
**Dependencies:** macOS code signing must be configured first (otherwise macOS users can't auto-update)
**Parallelizable:** Yes (except signing dependency)

**Tasks:**

Prerequisites:

- [ ] Configure Apple Developer signing certificates in GitHub Secrets
- [ ] Uncomment signing env vars in `.github/workflows/release.yml`
- [ ] Verify signed builds work on macOS
- [ ] Configure Windows code signing (optional but recommended)

Tauri updater plugin:

- [ ] Add `tauri-plugin-updater` to `src-tauri/Cargo.toml`
- [ ] Add updater plugin to Tauri app setup in `lib.rs`
- [ ] Configure updater endpoint in `tauri.conf.json` (point to GitHub Releases API or a static JSON manifest)
- [ ] Generate update manifest as part of release workflow (JSON with version, download URLs, signatures)

Rust commands:

- [ ] Create `src-tauri/src/commands/update_commands.rs`
- [ ] `check_for_update() -> Result<Option<UpdateInfo>, String>` — checks for new version
- [ ] `install_update() -> Result<(), String>` — downloads and installs update
- [ ] Register commands in `lib.rs`

Frontend store:

- [ ] Create `src/stores/update-store.ts`
  - State: `lastCheckTime`, `updateAvailable`, `updateVersion`, `updateProgress`, `isChecking`, `isInstalling`
  - Actions: `checkForUpdate()`, `installUpdate()`, `dismissUpdate()`
  - Persist `lastCheckTime` to localStorage

Settings UI:

- [ ] Add "Updates" tab or section to settings dialog
- [ ] Toggle: "Check for updates automatically" (default: on)
- [ ] Dropdown: Check frequency — "Every day", "Every 7 days", "Every 30 days", "Never"
- [ ] Button: "Check Now" — triggers manual check
- [ ] Display: current version, latest available version, last check time

Update notification:

- [ ] When update found, show non-intrusive notification bar at top or bottom of app
- [ ] "Update available: v1.2.3 — [Install Now] [Later] [Skip This Version]"
- [ ] "Install Now" downloads and prompts restart
- [ ] "Skip This Version" dismisses for this version only

Background checking:

- [ ] On app launch, check if enough time has passed since `lastCheckTime`
- [ ] If yes, run `checkForUpdate()` silently in background
- [ ] If update found, show notification

Testing:

- [ ] Unit test: update check interval logic
- [ ] Manual test: end-to-end update flow (publish test release, verify check + install)
- [ ] Run linters

### 8. Local MCP server support

**What:** Expose ThreatForge's threat model data and actions via MCP (Model Context Protocol) so external AI tools (VS Code Copilot, Claude Code, Cursor, etc.) can read and modify threat models.

**Current state:** No MCP infrastructure. No plugin system. App uses Tauri IPC for all frontend-backend communication.

**Complexity:** XL
**Dependencies:** AI-based editing (action protocol) should be designed first so MCP can reuse the same action format
**Parallelizable:** Partially (MCP server scaffold is independent)

**Tasks:**

Research & design:

- [ ] Study MCP specification (modelcontextprotocol.io) — required server capabilities, transport options
- [ ] Decide transport: stdio (for local tools) vs. HTTP/SSE (for remote tools)
- [ ] Define MCP resources: `threat-model` (full model), `elements`, `data-flows`, `trust-boundaries`, `threats`
- [ ] Define MCP tools: `add_element`, `update_element`, `delete_element`, `add_flow`, `analyze_threats`, etc.
- [ ] Decide: run MCP server as a separate process spawned by the Tauri app, or embedded in the Tauri backend

MCP server implementation:

- [ ] Create `src-tauri/src/mcp/` module
- [ ] Implement MCP server using Rust MCP SDK (or raw JSON-RPC if no mature SDK)
- [ ] Resource handlers: expose current threat model data as read-only resources
- [ ] Tool handlers: expose model mutation actions (reuse AI action protocol)
- [ ] Handle concurrent access: MCP mutations must go through the same model store as the UI

State synchronization:

- [ ] When MCP modifies the model, emit events to the frontend to trigger canvas refresh
- [ ] When the UI modifies the model, MCP resources reflect the latest state
- [ ] Implement resource change notifications (MCP `resources/updated` notification)

Settings & lifecycle:

- [ ] Add "MCP Server" toggle in settings (default: off)
- [ ] When enabled, start MCP server on a local port or stdio pipe
- [ ] Display connection info (port number, config snippet for external tools)
- [ ] Auto-stop server when setting disabled or app closes

Documentation:

- [ ] Create `docs/mcp-server.md` — setup instructions for each supported tool
- [ ] Include example configurations for VS Code, Claude Code, Cursor
- [ ] Document available resources and tools

Testing:

- [ ] Unit test: MCP resource handlers return correct model data
- [ ] Unit test: MCP tool handlers modify model correctly
- [ ] Integration test: connect MCP client, read model, modify element, verify
- [ ] Run linters

### 9. GitHub branch protection

**What:** Configure branch protection rules for the `main` branch. PRs required for all contributors except `admin-exitzerolabs` who can push directly.

**Complexity:** S
**Dependencies:** None
**Parallelizable:** Yes

**Tasks:**

- [ ] Go to GitHub repo Settings → Branches → Branch protection rules
- [ ] Add rule for `main`:
  - [ ] Require pull request before merging
  - [ ] Require at least 1 approval
  - [ ] Dismiss stale pull request approvals when new commits are pushed
  - [ ] Require status checks to pass before merging (CI lint + test)
  - [ ] Require branches to be up to date before merging
  - [ ] Do NOT restrict who can push to matching branches (admin bypass via GitHub admin role)
- [ ] OR use `gh` CLI: `gh api repos/OWNER/REPO/branches/main/protection -X PUT ...`
- [ ] Verify `admin-exitzerolabs` has admin role on the repo (admins bypass branch protection by default)
- [ ] Test: create a PR, verify checks run and merge is blocked until passing
- [ ] Test: verify admin can force-push to main (emergency only)

---

## P4 — Process & Documentation

### 10. Runbooks

**What:** Create operational runbooks and templates for common development workflows: adding features, deployments, migrations, responding to support tickets, etc.

**Complexity:** M
**Dependencies:** None
**Parallelizable:** Yes

**Tasks:**

- [ ] Create `docs/runbooks/` directory
- [ ] `adding-a-feature.md` — Branch workflow, implementation steps, testing requirements, PR checklist
- [ ] `releasing-a-version.md` — Version bump, changelog, tag creation, release workflow, verify auto-updater
- [ ] `schema-migration.md` — How to add/modify `.thf` schema fields while maintaining backward compatibility
- [ ] `responding-to-issues.md` — Triage labels, reproduction steps, fix workflow, security issue handling
- [ ] `onboarding-a-contributor.md` — Dev setup, architecture overview, coding conventions, PR process
- [ ] `debugging-tauri-ipc.md` — Common IPC issues, logging, debugging Rust ↔ React communication
- [ ] Link runbooks from `CLAUDE.md` and/or project README

---

## Dependency Graph

```
P0: Fix drag-to-canvas ──────────────────────────────────────── (standalone)

P1: Flow numbering ──────────────────────────────────────────── (standalone)
P1: Export (HTML report + diagram) ──────────────────────────── (standalone)
P1: AI-based editing ────────────────────────────────────────── (standalone)

P2: Component icons ─────────────────────────────────────────── (standalone)
P2: Attachment points ───────────────────────────────────────── (standalone)

P3: Auto-update ─────────────────── depends on ── Code signing configured
P3: MCP server ──────────────────── benefits from ── AI-based editing (action protocol)
P3: GitHub branch protection ────────────────────────────────── (standalone, admin-only)

P4: Runbooks ────────────────────────────────────────────────── (standalone)
```

## Parallelization Plan

These items can be worked on simultaneously by independent contributors:

| Stream A                | Stream B                          | Stream C                      |
| ----------------------- | --------------------------------- | ----------------------------- |
| Fix drag-to-canvas (P0) | Flow numbering (P1)               | Component icons (P2)          |
| Export (P1)             | AI-based editing — Phase 1-3 (P1) | Attachment points (P2)        |
| Auto-update (P3)        | AI-based editing — Phase 4-6 (P1) | GitHub branch protection (P3) |
|                         | MCP server (P3)                   | Runbooks (P4)                 |
