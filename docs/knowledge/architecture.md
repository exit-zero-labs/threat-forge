# ThreatForge — Architecture

## System architecture

The React frontend is shared by the browser and desktop builds. Runtime factories select
browser or Tauri adapters for file access, STRIDE analysis, AI chat, and key storage. The
desktop runtime adds the Rust backend and Tauri IPC shown below; the browser uses browser
adapters and the persistence path described in "Browser workspace persistence."

```
ThreatForge desktop runtime (Tauri v2)
├── Frontend (React 19 + TypeScript)
│   ├── UI Components (React + Tailwind CSS 4 + shadcn/ui)
│   ├── Diagramming Canvas (ReactFlow / xyflow)
│   ├── AI Chat Pane
│   ├── Threat Analysis View
│   └── State Management (Zustand)
│
├── Backend (Rust)
│   ├── File I/O (Read/Write YAML — serde + serde_yaml)
│   ├── Schema Validation (typed deserialization + explicit version checks)
│   ├── STRIDE Engine (threat rule engine)
│   ├── Importers (TM7 XML → ThreatModel conversion)
│   ├── Secure Key Storage (AES-256-GCM encrypted file)
│   └── Auto-Updater (Tauri plugin)
│
└── IPC: Tauri IPC between frontend and Rust commands
```

**External connections:**
- AI Chat Pane → External LLM API (OpenAI / Anthropic) via HTTPS with user's API key
- File I/O → Local filesystem (`.thf` files)
- Auto-Updater → GitHub Releases (desktop; can verify signed update metadata once signing is provisioned)

In the browser, AI requests also go directly to the configured provider. Browser keys use
local browser storage with an explicit UI warning; desktop keys use the encrypted Rust
storage path. Browser file operations use import/download adapters instead of Tauri IPC.

The AI chat path — the provider-neutral message and event model, the browser/desktop
transport split and why the desktop key stays in Rust, tool-schema generation, context
budgeting, the retry policy, the error taxonomy and redaction rule, and the bounded fenced
compatibility boundary — is documented in
[`ai-protocol.md`](ai-protocol.md).

## Technology stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop framework | Tauri v2 (Rust) | Smaller footprint than Electron; native webview; security sandbox |
| Frontend | React 19 + TypeScript 7.x | Largest contributor pool; strong typing |
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
| **ADR-001** | Tauri v2 over Electron | Smaller binary footprint; Rust backend for security/perf; native OS webview | Smaller ecosystem than Electron |
| **ADR-002** | ReactFlow for diagramming | MIT license; React-native; excellent performance; active dev | Required custom work for DFD conventions |
| **ADR-003** | Custom YAML file format | Human-readable; git-diffable; familiar to developers | YAML indentation gotchas; mitigated by typed validation and explicit version checks |
| **ADR-004** | Zustand for state | Minimal boilerplate; great TypeScript support; performant | Less middleware than Redux; not needed at this scale |
| **ADR-005** | BYOK AI (user-provided keys) | Zero cost to project; no rate limiting; user controls data | Requires user to have API key; AI is optional |
| **ADR-006** | Inline layout data | Positions stored inline on each element in the `.thf` file; single-file portability | Slightly larger diffs when repositioning; but eliminates sidecar file complexity |
| **ADR-007** | AES-256-GCM encrypted file storage for desktop API keys | Cross-platform app-managed encryption without OS-specific keychain integration | The encryption key is app-managed and co-located, so it does not protect against same-user local compromise |
| **ADR-008** | Tailwind + shadcn/ui | Lightweight, customizable, excellent dark mode, growing Tauri adoption | More manual composition than MUI |
| **ADR-009** | Additive schema growth keeps `version: "1.0"` | Additive optional fields break nothing, so bumping would make every already-shipped build refuse to open every new file; `validate_version` stays exact-match and fail-closed. Full argument in [`file-format.md`](file-format.md#schema-versioning-policy) | An older desktop build that opens and saves a newer document silently discards the sections it does not know |
| **ADR-010** | Per-document state lives in swapped store bundles, not copied checkpoints | Each open document owns real model/canvas/history store instances; activation repoints the store facades at that document's bundle. Nothing is copied on switch, so no field can be forgotten and leak across documents, and every future document field is per-document by construction. Full rationale in [`docs/plans/53-document-registry.md`](../plans/53-document-registry.md) | `activateDocument` has no production caller until the tab UI (`#54`) renders more than one document at a time |
| **ADR-011** | One undo entry per AI turn, not per accepted call or batch | A multi-iteration tool turn can apply many mutations; a per-call rule would evict more than half of the 20-entry history for a single turn. One lazily-pushed snapshot per turn means a single `Cmd+Z` reverts the whole turn. Full rationale in [`ai-tool-loop.md`](ai-tool-loop.md) and [`docs/plans/62-bounded-tool-loop.md`](../plans/62-bounded-tool-loop.md) | Call 3 of 5 cannot be undone individually; the turn is the atomic unit of undo |

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

### Document tab workspace

`#54` renders the registry as a tab strip (`src/components/layout/document-tab-strip.tsx` and
`document-tab.tsx`), mounted inside `<main>` above the canvas. Each tab reads its own document's
title and dirty state from that document's bundle (through the `stores` the strip passes), so a
dirty background document updates its own tab without being activated. New/Open/Import/template and
desktop file-association open each add a tab and activate it rather than replacing the current
document, so opening is no longer destructive and prompts nothing.

- **Close-activation (D1).** `closeDocument` activates the closed document's right neighbour in
  rendered order, or its left neighbour when it was rightmost, via the pure
  `nextActiveDocumentId(orderBeforeClose, closedId)` — derived entirely from `openDocumentIds`, with
  no separate activation stack.
- **Order and pinning (D5).** `openDocumentIds` is the single rendered order. `setDocumentPinned`
  sorts pinned documents into a leading block (`applyPinnedOrder`) and `reorderDocument` clamps a
  move into the document's own pinned/unpinned block (`moveDocumentInOrder`); the two blocks never
  interleave, and neither action changes the active document. Pinning is ordering plus identity, not
  close protection — pinned tabs stay closable. Tab order and pin state live in the session only and
  are **not persisted by `#54`**; a reload loses them until `#56` (or its follow-up) persists
  `order` and adds `pinned` to the manifest entry.
- **Overflow (D3).** Tabs shrink to a `7rem` floor (`8rem` when pinned) and then the strip scrolls
  horizontally (`overflow-x-auto`, `overscroll-x-contain`); focus and activation call
  `scrollIntoView`, honouring `reduceMotion`. Discoverability past ten documents is the command
  palette's `Switch to: <title>` / `Next Document` / `Previous Document` commands, not a dropdown.
- **Accessibility (D4).** The strip is the WAI-ARIA APG tabs pattern with **manual activation**: a
  `role="tablist"` (rendered only when at least one document is open) of `role="tab"` elements with a
  roving `tabindex`; `Arrow`/`Home`/`End` move focus only, `Enter`/`Space` activate the focused tab,
  and `Delete` closes it through the same dirty guard as the close button. Manual activation avoids a
  storage read and canvas re-sync for every tab an arrow passes over (the `#56` lazy-hydration seam).
  The close and pin controls are `tabindex="-1"` **siblings** of the `role="tab"` element — a `tab`
  role makes its children presentational, so a nested control would vanish from the accessibility
  tree — which keeps each tab a single tab stop. State lives in the accessible name (", unsaved
  changes" / ", pinned"), never colour alone. Focus after a close lands on the newly active tab, or
  the always-present new-document button when the last tab closes.
- **Tabpanel relationship.** The canvas wrapper inside `<main>` carries `id="document-panel"`,
  `role="tabpanel"`, and `aria-labelledby="tab-<activeDocumentId>"` only while a document is open;
  the role goes on the wrapper, not on `<main>`, so the `main` landmark survives, and it takes no
  `tabindex` because ReactFlow nodes are focusable.
- **Viewport on activation (step 7).** `activateDocument` only flushes the outgoing document's live
  viewport into its own canvas store; the incoming viewport is applied by the `DfdCanvas` effect once
  per activation, after `syncFromModel` populates the document's nodes. A document loaded from a
  file/layout or revisited restores its viewport, while a fresh new or imported document (which sits
  at the default viewport) fits to view. Deciding before the sync would act on the outgoing
  document's geometry — the defect that surfaced once creation stopped closing the previous document.
- **Close guards (D6).** `useCloseGuard` registers a browser `beforeunload` listener only while at
  least one document is dirty (preserving bfcache and the `#56` `pagehide` autosave flush) and, on
  desktop, an `onCloseRequested` handler that prevents the close first, lists every dirty document by
  title, and calls `getCurrentWindow().destroy()` only after confirmation — the single reason
  `core:window:allow-destroy` is granted on the `main` window.

### Handoff seams

- **`#54` (tab UX):** shipped. `useDocumentStores(id)` / `getDocumentStores(id)` expose a document's
  own bundle so a tab can render its title and dirty indicator without activating it. The
  close-activation policy is now right-neighbour-then-left (D1, `nextActiveDocumentId`), replacing
  the earlier provisional most-recently-created fallback; see "Document tab workspace" above.
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
manifest entry become `recoverableDocumentIds`), then reads **only** the active document's body (or
the first viable manifest entry when the pointer is missing) and calls `hydrateDocument`. Restore
uses the lightweight YAML parser because these are app-authored, potentially in-progress models,
but still applies ADR-009's exact schema-version gate so an older cached build cannot silently
rewrite a newer-format body. Inactive documents stay manifest descriptors until
`hydrateDocumentById` loads one on demand.

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

## Infrastructure and DevOps

| Environment | Purpose | Infrastructure | Status |
|-------------|---------|----------------|--------|
| Local | Developer workstation | `npm run tauri dev` or `npm run dev:web` | Current |
| CI | Automated builds + tests | GitHub Actions matrix (ubuntu, macos, windows) plus web checks | Current |
| Release | Desktop artifacts and updates | GitHub Releases + release workflow | Signing and updater verification remain tracked in [roadmap Phase 0](../plans/roadmap.md#phase-0--operational-foundation) |
| Website | Site + browser app (`threatforge.dev`) | Cloudflare Workers Static Assets | Current |

### CI pipeline

```
Feature Branch → PR Created → GitHub Actions CI
  → Lint (Biome + Clippy)
  → Test (Vitest + cargo test)
  → Build (web + desktop platform matrix)
  → PR Review → Merge to main
```

Release signing, notarization, and updater verification remain planned gates rather than
properties inferred from a green pull-request build. See the
[release-signing runbook](../runbooks/configuring-release-signing.md).

Triage for a red run — including the macOS runner infrastructure auto-rerun — is in
[docs/runbooks/diagnosing-ci-failures.md](../runbooks/diagnosing-ci-failures.md).

### Local CI

```bash
npm run ci:local         # Native lint + test + web build
npm run ci:docker        # Docker lint + test (clean environment)
npm run ci:docker:build  # Docker lint + test + Tauri build
```

## Security architecture

| Layer | Approach |
|-------|---------|
| API Key Storage | Desktop: AES-256-GCM encrypted file in app data directory. Browser: local storage with an explicit UI warning. |
| AI API Calls | Direct from user's machine with user's key; HTTPS only. Provider decoding, request validation, and error redaction are shared and typed — see [`ai-protocol.md`](ai-protocol.md) |
| File Integrity | Explicit version checks and typed deserialization; unknown fields remain tolerated for forward compatibility |
| Auto-Update | Tauri updater can verify signed update metadata once signing is provisioned; rollout and end-to-end verification remain roadmap gates |
| Supply Chain | Dependabot plus lockfile, dependency-review, and GitHub CodeQL default-setup checks |
| CSP | Strict Content Security Policy; no inline scripts, no remote code |
| Native File I/O | Rust commands handle reads and writes; export writes restrict extensions, while path confinement remains an active security review surface |
| Input Validation | React escapes rendered content by default; LLM output remains untrusted |
| AI Tool Authorization | Every model-requested mutation is validated, reviewed, and executed only under a single-use grant bound to one call id, tool, canonical input digest, and iteration; the bounded loop is cancellable and undoable. No self-authorization from model output, tool results, or document content — see [`ai-tool-loop.md`](ai-tool-loop.md) |

See [SECURITY.md](../../SECURITY.md) for the full security policy and vulnerability reporting.
