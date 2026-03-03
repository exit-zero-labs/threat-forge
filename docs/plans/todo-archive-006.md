# Threat Forge - TODO List

Shared execution plan for humans and LLM agents. Update this file before, during, and after every work session.

---

## 2026-03-02 — Drive backlog to completion

Working through all 10 backlog items in priority order (P0 → P4).

### P0 — Bug Fixes

- [x] **#1 Fix drag-to-canvas positioning**
  - [x] Read and analyze `dfd-canvas.tsx:onDrop()` coordinate conversion
  - [x] Read and analyze `component-palette.tsx` drag handlers
  - [x] Identify root cause: addElement didn't store position on model; onDrop didn't clear draggedType early enough
  - [x] Implement fix: store position on model Element/TrustBoundary; clear draggedType immediately in onDrop; use inline position as fallback in resolvePosition
  - [x] Validate: `npx vitest --run` — 244 tests pass

### P1 — Core Feature Gaps

- [x] **#2 Flow numbering**
  - [x] Add `flow_number: Option<u32>` to Rust `DataFlow` struct
  - [x] Add round-trip + backward compat tests in Rust (3 new tests)
  - [x] Validate: `cargo test` — 55 tests pass; `cargo clippy` clean
  - [x] Add `flow_number?: number` to TS `DataFlow` interface
  - [x] Compute + set flow number in `canvas-store.ts:addDataFlow()`
  - [x] Sync `flow_number` into `DfdEdgeData` for rendering
  - [x] Display flow number badge in `data-flow-edge.tsx`
  - [x] Add editable "Flow #" field in properties panel
  - [x] Validate: `npx biome check --write .` + `npx vitest --run` — 244 tests pass

- [x] **#3 Export (HTML report + diagram)**
  - [x] Create `src/lib/export/export-html.ts` — self-contained HTML generation
  - [x] Build diagram page: positioned divs for elements, SVG arrows for flows, dashed boundaries
  - [x] Build report page: cover, summary stats (severity/STRIDE), threat table, inventories
  - [x] Self-contained dark mode styling with print-optimized @media print
  - [x] Sticky nav with anchor links: Diagram, Summary, Threats, Elements, Flows, Boundaries
  - [x] Add Export button (FileOutput icon) to top menu bar
  - [x] Add `Cmd+Shift+E` keyboard shortcut
  - [x] Add "Export as HTML…" to native Rust File menu
  - [x] Create `write_text_file` Rust command for file writing
  - [x] Add `exportAsHtml` to FileAdapter interface + both implementations
  - [x] Add `exportAsHtml` to `use-file-operations` hook
  - [x] Wire native menu handler in `use-native-menu.ts`
  - [x] Add shortcut to KEYBOARD_SHORTCUTS array in settings.ts
  - [x] 13 unit tests for HTML generation + XSS escaping
  - [x] Validate: biome clean, clippy clean, 257 frontend tests pass, 55 Rust tests pass

- [x] **#4 AI-based editing (XL)**
  - [x] Phase 1: Design AI action protocol — 12 action types (add/update/delete for elements, flows, boundaries, threats) in JSON format
  - [x] Phase 2: Update system prompts (both TS `ai-prompt.ts` and Rust `prompt.rs`) with action protocol + examples
  - [x] Phase 3: Create `src/lib/ai-actions.ts` — parser (regex + JSON), validator (type/field checks), action types, describeAction()
  - [x] Phase 4: Action preview/approval UI in `ai-chat-tab.tsx` — ActionPreview component with "Apply All" button, per-action listing
  - [x] Phase 5: Create `src/lib/ai-action-executor.ts` — applies actions to model via stores, handles undo snapshot, cascading deletes
  - [x] Phase 6: UI polish — removes actions/threats blocks from displayed text, streaming indicator preserved
  - [x] Phase 7: 19 unit tests for parser + validator + describer
  - [x] Validate: biome clean, clippy clean, 276 frontend tests pass, 55 Rust tests pass

### P2 — Major Features

- [x] **#5 Component icons**
  - [x] Create `src/lib/service-icons.ts` — inline SVG icon registry (8 icons: AWS, Docker, PostgreSQL, Redis, MongoDB, NGINX, GraphQL, Kafka)
  - [x] Update `dfd-element-node.tsx` — dual Lucide/SVG rendering pipeline with `ResolvedIcon` union type
  - [x] Icon resolution priority: service icon (subtype/icon) > subtype library > component type > direct icon
  - [x] `NodeIcon` component renders either Lucide component or inline SVG `<path>`
  - [x] Validate: biome clean, 276 frontend tests pass

- [x] **#6 Attachment points — hover-only handles**
  - [x] Set all handles to `opacity: 0` by default in `shared-handles.tsx`
  - [x] Add CSS hover rule for `.react-flow__node:hover .react-flow__handle` in `styles.css`
  - [x] Add `isConnecting` state + setter to canvas store
  - [x] Force handles visible during connection drag via `isConnecting` → `!opacity-100`
  - [x] Reduce handle visual size (1.5×1.5), keep hitbox via pointer-events
  - [x] Wire `onConnectStart`/`onConnectEnd` in `dfd-canvas.tsx` to set `isConnecting`
  - [x] Validate: biome clean + `npx vitest --run` — 244 tests pass

### P3 — Infrastructure & Platform

- [x] **#7 Auto-update** (infrastructure ready, blocked on code signing for actual updates)
  - [x] Add `tauri-plugin-updater` to Cargo.toml + lib.rs
  - [x] Configure updater endpoint in tauri.conf.json (points to GitHub Releases)
  - [x] Add `updater:default` to Tauri capabilities
  - [x] Create `update_commands.rs` with `check_for_update` + `install_update` commands
  - [x] Create `update-store.ts` frontend store with auto-check on launch (24h interval)
  - [x] Add "Updates" section to settings dialog (current version, check now button, update info)
  - [x] Add `UpdateBar` notification component (Install Now / Later / Skip)
  - [x] Wire background check on app launch in `app-layout.tsx`
  - [x] Validate: biome clean, clippy clean, 276 frontend tests pass, 55 Rust tests pass
  - Note: Updater pubkey not yet set — requires code signing setup before updates work end-to-end

- [x] **#8 MCP server** (benefits from #4 AI action protocol)
  - [x] Research MCP spec — chose stdio transport via `rmcp` official Rust SDK (v0.17)
  - [x] Create `src-tauri/src/mcp/` module with `server.rs`
  - [x] Implement 12 tools: get_model, list_elements, list_threats, add/update/delete element, add/delete data_flow, add/delete trust_boundary, add/delete threat
  - [x] File-based state: reload from disk before reads, write after mutations
  - [x] Cascading deletes (element → connected flows + boundary refs)
  - [x] Create `src-tauri/src/bin/threatforge-mcp.rs` — standalone binary entry point
  - [x] Create `docs/mcp-server.md` — setup docs for Claude Code, VS Code, Cursor
  - [x] Validate: clippy clean, 55 Rust tests pass

- [ ] **#9 GitHub branch protection** (BLOCKED — requires admin access)
  - [ ] Configure via `gh` CLI or GitHub Settings UI
  - [ ] Verify admin bypass works
  - Note: Current user lacks admin permissions on exit-zero-labs/threat-forge. Requires org admin to configure.

### P4 — Process & Documentation

- [x] **#10 Runbooks**
  - [x] Create `docs/runbooks/` directory
  - [x] `adding-a-feature.md` — branch workflow, implementation steps, testing, PR checklist
  - [x] `releasing-a-version.md` — version bump, tag, release workflow, verification
  - [x] `schema-migration.md` — adding optional fields, round-trip tests, backward compat
  - [x] `responding-to-issues.md` — triage labels, fix workflow, security handling
  - [x] `onboarding-a-contributor.md` — prerequisites, setup, architecture overview, first tasks
  - [x] `debugging-tauri-ipc.md` — common issues, debugging tools, adding commands
  - [x] Link from CLAUDE.md (added runbooks reference to docs tree and architecture section)

### Notes
- Starting session: 2026-03-02
- Working through items sequentially by priority
- Each item gets its own branch
- All 10 items addressed: 9 completed, 1 blocked (#9 requires admin access)
