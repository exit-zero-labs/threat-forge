# ThreatForge — Architecture

## System Architecture

```
ThreatForge Desktop App (Tauri v2)
├── Frontend (React 19 + TypeScript)
│   ├── UI Components (React + Tailwind CSS 4 + shadcn/ui)
│   ├── Diagramming Canvas (ReactFlow / xyflow)
│   ├── AI Chat Pane
│   ├── Threat Analysis View
│   └── State Management (Zustand)
│
├── Backend (Rust)
│   ├── File I/O (Read/Write YAML — serde + serde_yaml)
│   ├── Schema Validation (strict serde deserialization)
│   ├── STRIDE Engine (threat rule engine)
│   ├── Importers (TM7 XML → ThreatModel conversion)
│   ├── Secure Key Storage (AES-256-GCM encrypted file)
│   ├── Auto-Updater (Tauri plugin)
│   └── Opt-in Telemetry
│
└── IPC: Tauri IPC (JSON-RPC) between frontend and backend
```

**External connections:**
- AI Chat Pane → External LLM API (OpenAI / Anthropic / Ollama) via HTTPS with user's API key
- File I/O → Local filesystem (`.thf` files)
- Auto-Updater → GitHub Releases (signature-verified)

## Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| App Framework | Tauri v2 (Rust) | ~10MB binary vs 100MB+ Electron; native webview; security sandbox |
| Frontend | React 19 + TypeScript 5.x | Largest contributor pool; strong typing |
| Styling | Tailwind CSS 4 + shadcn/ui | Lightweight, dark mode, customizable |
| Canvas | ReactFlow (xyflow) | MIT, React-native, performant, active dev |
| State | Zustand | Minimal boilerplate, TypeScript-first |
| File Format | Custom YAML schema (serde_yaml) | Human-readable, git-diffable |
| Testing (Frontend) | Vitest + React Testing Library | Fast, Vite-compatible |
| Testing (Rust) | cargo test | Standard Rust testing |
| E2E Testing | Playwright | Cross-platform, reliable |
| CI/CD | Docker (local) + GitHub Actions | Free for public repos |
| Linting | Biome (TS), Clippy (Rust) | Fast, opinionated |
| Formatting | Biome (TS), rustfmt (Rust) | Consistent style |

## Architecture Decision Records (ADRs)

| ADR | Decision | Rationale | Key Tradeoff |
|-----|----------|-----------|-------------|
| **ADR-001** | Tauri v2 over Electron | ~10MB binary; Rust backend for security/perf; native OS webview | Smaller ecosystem than Electron |
| **ADR-002** | ReactFlow for diagramming | MIT license; React-native; excellent performance; active dev | Required custom work for DFD conventions |
| **ADR-003** | Custom YAML file format | Human-readable; git-diffable; familiar to developers | YAML indentation gotchas; mitigated by strict schema validation |
| **ADR-004** | Zustand for state | Minimal boilerplate; great TypeScript support; performant | Less middleware than Redux; not needed at this scale |
| **ADR-005** | BYOK AI (user-provided keys) | Zero cost to project; no rate limiting; user controls data | Requires user to have API key; AI is optional |
| **ADR-006** | Inline layout data | Positions stored inline on each element in the `.thf` file; single-file portability | Slightly larger diffs when repositioning; but eliminates sidecar file complexity |
| **ADR-007** | AES-256-GCM encrypted file storage for API keys | Cross-platform without OS-specific keychain quirks; secure at rest | Managed by app, not OS keychain |
| **ADR-008** | Tailwind + shadcn/ui | Lightweight, customizable, excellent dark mode, growing Tauri adoption | More manual composition than MUI |
| **ADR-009** | Additive schema growth keeps `version: "1.0"` | Additive optional fields break nothing, so bumping would make every already-shipped build refuse to open every new file; `validate_version` stays exact-match and fail-closed. Full argument in [`file-format.md`](file-format.md#schema-versioning-policy) | An older desktop build that opens and saves a newer document silently discards the sections it does not know |
| **ADR-010** | Per-document state lives in swapped store bundles, not copied checkpoints | Each open document owns real model/canvas/history store instances; activation repoints the store facades at that document's bundle. Nothing is copied on switch, so no field can be forgotten and leak across documents, and every future document field is per-document by construction. Full rationale in [`docs/plans/53-document-registry.md`](../plans/53-document-registry.md) | `activateDocument` has no production caller until the tab UI (`#54`) renders more than one document at a time |

## Document registry and per-document state scope

ThreatForge shows one document at a time today, but the state layer already hosts many
independent documents. `src/stores/document-registry.ts` (`useDocumentRegistry`) owns every open
document and holds the single active-document pointer — the only global document-selection state.

**Session and bundle.** Each open document is a `DocumentSession` (`src/types/document.ts`): a
stable `DocumentId`, a `createdAt` stamp, its own `DocumentStores` bundle, its `fileSettings`, and
an `activeChatSessionId` reference. A bundle (`src/stores/document-stores.ts`) is three real store
instances built by injected factories in dependency order — history, then model, then canvas — so
a document's canvas store can only ever write into its own model and history stores
(`createCanvasStore({ model, history })`). Module-level mutable values that used to be shared by
construction (history-debounce keys, the pre-drag and nudge gesture snapshots, and the
`comp-`/`flow-`/`boundary-` id counters) now live inside each factory closure and are therefore
per-document.

**Bundle swap, not copy.** Activating a document repoints the facades at that document's bundle; it
never copies state. `useModelStore`, `useCanvasStore`, and `useHistoryStore` (`model-store.ts`,
`canvas-store.ts`, `history-store.ts`) are facades over an active-bundle pointer
(`setActiveStores`/`useActiveStores`): the hook form subscribes through the pointer so a switch
re-renders and re-subscribes React consumers, while `getState`/`setState`/`subscribe` delegate to
the active bundle. Because nothing is copied, a field added to a factory-created store is
per-document automatically and cannot be forgotten on a later switch. That is the decisive reason
the design chose bundle-swap over a checkpoint/restore field list (ADR-010).

**Scope rule.** Document-scoped state must be exactly as the user left it when they return to the
document. Workspace-scoped state belongs to the single window, the mounted canvas, or the user.

| Scope | State |
|-------|-------|
| Document | `model`, `filePath`, `isDirty`, the four selection ids, `isAnalyzing`, `nodes`, `edges`, `viewport`, `pendingLayout`, history `past`/`future`, id counters, history-debounce state, pre-drag and nudge gesture snapshots, `fileSettings`, `activeChatSessionId` |
| Workspace | ReactFlow instance handles (`rfFitView`/`rfZoomIn`/`rfZoomOut`/`rfPanBy`) and in-flight pointer gesture state in `canvas-instance-store.ts`, clipboard contents, `ui-store` (panels, theme, `canvasLocked`, dialogs), `settings-store.settings`, chat provider and `hasApiKey`, onboarding, and update state |

Anything not listed as workspace is document-scoped. `fileSettings` is owned by the
`DocumentSession` record; the session-ownership PR (`#127`) removes the vestigial `fileSettings`
field still declared on `settings-store` once every reader uses the session record.

**Module graph (acyclic).**

```
model-store-factory.ts ─┐
canvas-store-factory.ts ─┼─> document-stores.ts ─> document-registry.ts
history-store-factory.ts┘        ^
                                 │ (facade only)
        model-store.ts ──────────┤
        canvas-store.ts ─────────┤
        history-store.ts ────────┘
```

No store module imports `document-registry.ts`. `document-stores.ts` seeds a scratch bundle at
module load, so a unit test importing only `@/stores/model-store` still gets a model store wired to
the same history store that `@/stores/history-store` resolves to.

**Document ids never enter `.thf`.** `createDocumentId()` (`src/lib/document-id.ts`) returns a
branded `doc-<uuid>` from `crypto.randomUUID`/`getRandomValues`, never `Math.random`, and never
derived from a path, title, or model content. Ids exist only at runtime and in workspace metadata.
The document model is stored and cloned as an opaque payload (`structuredClone` in the history
factory), so schema-unknown fields survive undo/redo and a document switch. `#53` adds no `.thf`
schema change, version bump, or migration.

**Isolation is proven, not asserted.** `src/stores/document-registry.test.ts` carries the ten-case
isolation suite (plan step 9); each case fails both for a leak and for the opposite defect of
wiping a document's state on switch. Case 10 lives in
`src/components/layout/status-bar.test.tsx` and proves the facade re-subscribes through React.

### Handoff seams

- **`#54` (tab UX):** `useDocumentStores(id)` / `getDocumentStores(id)` expose a document's own
  bundle so a tab can render its title and dirty indicator without activating it. When the active
  document closes, `closeDocument` falls back to the most-recently-created remaining document; that
  close-activation policy is deliberately provisional and belongs to `#54`.
- **`#55` (browser recovery and export):** operates on the same registry sessions; it introduces no
  new document-identity concept.
- **`#56` (IndexedDB persistence):** the `DocumentSession` is the persistence unit and holds no
  credentials. `#56` adds an additive
  `hydrateDocument({ id, model, filePath, pendingLayout, createdAt, activate })` registry action
  that rebuilds a session under a *persisted* `DocumentId`/`createdAt` — where `createDocument`
  always mints a fresh id and always activates. See
  [`docs/plans/56-indexeddb-persistence.md`](../plans/56-indexeddb-persistence.md).
- **`#63` (AI conversation persistence):** the registry owns only `activeChatSessionId`, a
  reference — never conversation content. While chat storage stays keyed by `filePath`, two unsaved
  documents share the `threatforge-chat-sessions:unsaved` bucket; `#63` rekeys conversation storage
  to `DocumentId`. The session-binding effect and its `ai-chat-tab` effect-override limitation are
  carried by the session-ownership PR (`#127`).

## Browser workspace persistence

Browser-only. On the desktop the filesystem stays the source of truth: `getWorkspaceStorage()`
resolves `NoopWorkspaceStorage`, `useWorkspaceRestore` returns early on `isTauri()`, and
`persistenceAvailable` stays false, so no IndexedDB code path is reachable and no local-persistence
indicator renders. See [`docs/plans/56-indexeddb-persistence.md`](../plans/56-indexeddb-persistence.md).

**Two projections, one authority.** The localStorage manifest under `threatforge-workspace` is a
fast-render projection — `{ schemaVersion, documents: [{ id, title, filePath, order, createdAt,
updatedAt }], activeDocumentId, preferences }` — restored synchronously by `workspace-store` so the
shell paints without touching IndexedDB. The IndexedDB database `threatforge-workspace` is
authoritative for content:

| Store | keyPath | Value | Index |
|-------|---------|-------|-------|
| `documents` | `id` | `{ id, currentRevisionId, updatedAt }` — pointer only, no body | — |
| `revisions` | `revisionId` (`${id}#${seq}`) | `{ revisionId, documentId, thf, seq, createdAt }` | `by_document` on `[documentId, seq]` |
| `meta` | `key` | schema markers and migration bookkeeping | — |

Bodies are the exact text of `serializeThreatModelYaml`, so every stored revision is itself a
portable `.thf` file. Retention is a bounded ring of `MAX_REVISIONS_PER_DOCUMENT` full snapshots,
never deltas. No `.thf` schema change is involved and a `DocumentId` never enters a `.thf`.

**Crash safety.** `writeDocumentBody` puts the new revision, flips `documents.currentRevisionId`,
and prunes the ring inside one `readwrite` transaction. IndexedDB commits that atomically, so a
reader can never see a pointer aimed at a missing or half-written revision. Schema changes run as
ordered migrations inside the single `versionchange` transaction; one that throws aborts the upgrade
and leaves the database at its prior version. The database is never deleted to clear an error.

**Restore without blocking first paint.** `useWorkspaceRestore` runs after mount: it reconciles the
manifest against `listDocuments()` (manifest entries with no record are dropped; records with no
manifest entry become `recoverableDocumentIds`), then reads **only** the active document's body and
calls `hydrateDocument`. Inactive documents stay manifest descriptors until `hydrateDocumentById`
loads one on demand.

**Autosave.** `useWorkspacePersistence` subscribes to the active document's own model and canvas
stores and writes on a `WORKSPACE_AUTOSAVE_DEBOUNCE_MS` debounce, flushing on `visibilitychange`
and `pagehide`. It captures geometry through `captureCanvasIntoModel` against that document's canvas
store, never clears `isDirty` (which tracks the on-disk file, not the local copy), and is a separate
concern from the file autosave in `use-autosave.ts`.

**Failures are visible, never destructive.** Quota, private mode, migration failure, and corruption
each map to a typed `WorkspaceStorageError` kind, a per-document persistence state or an
availability reason, and one coalesced status-bar indicator — one report per failure run, not one
per write. The in-memory document is always left editable and exportable.

**No credential ever reaches either store.** The layer writes only `.thf` text and the id/order/
title/preferences manifest, imports no keychain adapter, and uses a namespace disjoint from
`tf-api-key-`. `src/lib/persistence/no-key-leakage.test.ts` proves this by enumerating every stored
record after a real autosave cycle.

### Handoff seams

- **`#55` (recovery and export):** stored revisions are export-ready `.thf` text. The states to
  render are `DocumentPersistenceState.status` (`error` / `corrupt`), `errorKind`,
  `unavailableReason`, and `recoverableDocumentIds`. `#56` never deletes; `deleteDocument` exists
  for a user-confirmed `#55` action.
- **`#54` (tab UX):** render tabs from the manifest (`documents`, `order`, `activeDocumentId`) and
  call `hydrateDocumentById(id)` when the user activates an un-hydrated tab.
- **`#63` (AI conversation persistence):** chat content is not stored here. Reuse `DocumentId` as
  the key and the same versioned-migration discipline rather than adding a second database.

## Project Structure

```
threat-forge/
├── src/                        # React frontend
│   ├── components/             # React components (PascalCase)
│   │   ├── canvas/             # DFD canvas, nodes, edges
│   │   ├── layout/             # App layout, top menu, panels
│   │   ├── onboarding/         # Guides, overlays, tips
│   │   ├── palette/            # Component palette (left sidebar)
│   │   ├── panels/             # Properties, threats, settings, AI
│   │   └── ui/                 # shadcn/ui primitives
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Shared utilities
│   │   ├── adapters/           # File system adapters (Tauri, browser)
│   │   ├── themes/             # Theme presets and engine
│   │   └── ...                 # Component library, STRIDE engine, commands
│   ├── stores/                 # Zustand stores
│   ├── types/                  # TypeScript type definitions
│   └── App.tsx                 # App root
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── lib.rs              # Tauri commands + app setup
│   │   ├── main.rs             # Entry point
│   │   ├── commands/           # Tauri IPC command handlers
│   │   ├── models/             # Rust types (serde YAML schema)
│   │   ├── stride/             # STRIDE threat engine
│   │   ├── ai/                 # AI: key storage, streaming providers, system prompts
│   │   ├── file_io/            # File read/write operations
│   │   └── importers/          # Import from external formats (TM7, etc.)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── e2e/                        # Playwright E2E tests
├── docs/                       # Documentation
│   ├── knowledge/              # Reference docs (architecture, format, etc.)
│   └── plans/                  # Todo tracking and roadmap
└── public/                     # Static assets
```

## Infrastructure & DevOps

| Environment | Purpose | Infrastructure | Cost |
|-------------|---------|---------------|------|
| Local | Developer workstation | `npm run tauri dev` (hot reload) | $0 |
| CI | Automated builds + tests | GitHub Actions matrix (ubuntu, macos, windows) | $0 (public repo) |
| Release | Signed binaries | GitHub Releases | $0 |
| Website | Docs + browser app (threatforge.dev) | Cloudflare Workers Static Assets | $0 |

### CI Pipeline

```
Feature Branch → PR Created → GitHub Actions CI
  → Lint (Biome + Clippy)
  → Test (Vitest + cargo test)
  → Build (All 3 Platforms)
  → PR Review → Merge to main
    → Tagged Release? → Build Signed Binaries → GitHub Release → Auto-update
```

Triage for a red run — including the macOS runner infrastructure auto-rerun — is in
[docs/runbooks/diagnosing-ci-failures.md](../runbooks/diagnosing-ci-failures.md).

### Local CI

```bash
npm run ci:local         # Native lint + test + web build
npm run ci:docker        # Docker lint + test (clean environment)
npm run ci:docker:build  # Docker lint + test + Tauri build
```

## Security Architecture

| Layer | Approach |
|-------|---------|
| API Key Storage | AES-256-GCM encrypted file in app data directory |
| AI API Calls | Direct from user's machine with user's key; HTTPS only |
| File Integrity | Schema validation on read via strict serde deserialization |
| Auto-Update | Signed releases via Tauri updater with signature verification |
| Supply Chain | Dependabot + cargo-audit in CI; minimal dependencies |
| CSP | Strict Content Security Policy; no inline scripts, no remote code |
| Input Sanitization | Rust-side for file ops; React-side for UI; LLM output treated as untrusted |

See [SECURITY.md](../../SECURITY.md) for the full security policy and vulnerability reporting.
