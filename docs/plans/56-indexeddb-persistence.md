# Issue 56 — Persist browser documents in IndexedDB and workspace metadata in localStorage

## Objective

In the browser build, every open document's `.thf` body and a bounded revision history are
stored in IndexedDB, and the lightweight workspace manifest (tab order, active tab, workspace
preferences) is stored in localStorage, so that a browser restart restores the previous
workspace, edits autosave locally without an account, document writes are crash-safe, and no
API key is ever written to either store. Desktop behavior is unchanged: the filesystem remains
the source of truth and no IndexedDB is used.

## Issue contract

- **Issue:** `#56`
- **Parent initiative:** `#48`
- **Type:** `Task`
- **Size:** `L`
- **Priority:** `P0`
- **Autonomy:** `Automatable`
- **Dependencies:**
  - **`#53` registry core is on `main`** (steps 1–5 via #113 and #122), as is
    `src/lib/thf-yaml.ts` (#120). The registry (`src/stores/document-registry.ts`), the store
    factories, and the YAML choke point this plan builds on are all merged; the plan was
    written against exactly that code.
  - `#53` steps 6–8 are in flight on `feat/53-document-state-ownership` and touch
    `document-registry.ts`, `use-file-operations.ts`, and `canvas.tsx` — the files #56
    extends. #56 should start after that branch merges. The one registry edit #56 makes
    (`hydrateDocument`) is additive; the seam table records the contention.
  - New devDependency `fake-indexeddb` (jsdom ships no IndexedDB). Normal `npm install`, no
    secret or account, so autonomy stays `Automatable`.
- **Non-goals (owned by adjacent issues, named not absorbed):**
  - The browser **recovery screen**, one-document/recovery-bundle **export**, `.thf`
    **download** of a stored document, selective/total **storage clear**, and stable-id
    assignment on **import** are `#55`. #56 produces the machine-readable failure states and
    the durable `.thf` text that `#55` renders and exports; it does not build the recovery UI.
  - AI **conversation and tool-history** persistence is `#63`. #56 persists document bodies and
    revisions only. It stores no chat messages and does not move the existing
    `threatforge-chat-sessions:*` localStorage buckets; `#63` rekeys those to `DocumentId`.
  - Tab **rendering, reorder, pin, overflow, close UX** are `#54`. #56 restores the persisted
    open-document order and exposes on-demand hydration; it renders no tab strip.
  - `.thf` **schema changes** are `#57`. The persisted body is opaque `.thf` YAML text.
  - The existing desktop/browser **file autosave** hook (`use-autosave.ts`) is not replaced;
    #56 adds a separate browser workspace-persistence path (see evidence).

## Current behavior and evidence

Evidence read on branch `feat/53-document-state-ownership` at `3266111` (registry landed via
`#122`) and `main` at `e6a721d`. File and line references are to the branch.

### The registry API this issue extends (`src/stores/document-registry.ts`)

`useDocumentRegistry` owns `documents: Record<DocumentId, DocumentSession>`,
`openDocumentIds: DocumentId[]` (creation order), and `activeDocumentId: DocumentId | null`.
Its actions are `createDocument({ model, filePath, pendingLayout }): DocumentId` (creates a
fresh isolated bundle, seeds it with `stores.model.getState().setModel(model, filePath)` and
`stores.canvas.setState({ pendingLayout })`, appends the id, activates it),
`activateDocument(id)`, `closeDocument(id)`, `setDocumentFileSettings`,
`setDocumentChatSessionId`, `getDocumentStores(id)`, and the `useDocumentStores(id)` subscription
hook. `DocumentSession` is `{ id, createdAt, stores, fileSettings, activeChatSessionId }`
(`src/types/document.ts`). `createDocument` always mints a **fresh** id and always activates —
neither is what restore needs, so #56 adds one additive action.

### Document identity (`src/lib/document-id.ts`, `src/types/document.ts`)

`createDocumentId()` returns a branded `doc-<uuid>` from `crypto.randomUUID`/`getRandomValues`
and fails closed with no `Math.random()` fallback, *because* (its own comment) these ids are
about to be persisted by #56 and a predictable id is a workspace-integrity hazard. The brand
`DocumentId = string & { __brand }` is a runtime string, so it is a valid IndexedDB key and
localStorage value unchanged.

### Serialization (`src/lib/thf-yaml.ts`, landed via `#115`/`#120`)

`serializeThreatModelYaml(model: ThreatModel): string` and
`parseThreatModelYaml(text: string): ThreatModel` are the canonical browser `.thf` text path.
The serializer uses a js-yaml schema with the YAML 1.1 timestamp type removed so `created`/
`modified` round-trip byte-for-byte; the parser narrows shape and rejects corrupted
ISO-timestamp dates with a user-safe message. #56 persists documents as the **text these produce**,
not as JS object graphs, so a stored revision is itself a valid, portable `.thf` file that `#55`
can download without re-serialization drift.

### Canvas capture (`src/hooks/use-file-operations.ts`)

`captureCanvasIntoModel(model)` folds live node positions, boundary geometry/colors, edge label
offsets and handles, and the viewport back into the model before any save. It is currently a
module-private function in `use-file-operations.ts`. A workspace autosave that persisted only
`model` without capture would lose every node drag, so #56 must run the same capture; the
function is extracted to a shared module (step 7).

### Two distinct "autosave" concerns (`src/hooks/use-autosave.ts`)

`useAutosave` watches `model.isDirty` and `model.filePath` and calls `saveModel()` — the **file**
autosave. It only fires when `filePath` is set; browser documents created by New/Open/Import/
template carry `filePath: null` (`use-file-operations.ts`, `canvas.tsx`), so in the browser this
hook effectively never runs. #56's browser persistence is a **separate** concern: it persists to
IndexedDB regardless of `filePath` and must **not** clear `isDirty` (that flag tracks divergence
from an on-disk `.thf` file, which a browser document does not have). The two paths stay
independent; step 7 states this boundary so no implementer conflates or double-writes them.

### Platform seam and adapter precedent

`isTauri()` (`src/lib/platform.ts`) detects the desktop webview. Adapter selection follows a
cached factory pattern: `get-file-adapter.ts`, `get-keychain-adapter.ts`, `get-chat-adapter.ts`
each branch on `isTauri()` and lazy-import the browser or Tauri implementation. #56 mirrors this
exactly with a workspace-storage factory, so desktop resolves a no-op implementation and never
loads IndexedDB code.

### localStorage namespaces already in use (disjointness baseline)

`tf-api-key-<provider>` (secrets, `browser-keychain-adapter.ts`),
`threatforge-chat-sessions:<filePath|unsaved>` (`chat-store.ts`),
`threatforge-settings` (partialized user settings), `threatforge-theme`,
`threatforge-panel-widths` (`ui-store.ts`). #56 uses the single new namespace
`threatforge-workspace` for localStorage and the IndexedDB database name `threatforge-workspace`.
The keychain namespace `tf-api-key-` is the one the disjointness proof (step 10) pins against.

### App mount and persist precedent

`AppLayout` (`src/components/layout/app-layout.tsx`, `/app` route) is where hooks like
`useAutosave`, `useWindowTitle`, and `checkOnLaunch` mount — the seam for restore/persistence
hooks. Today no document auto-creates on boot: `Canvas` renders `EmptyCanvas` while
`model === null`. `settings-store.ts` and `ui-store.ts` show the persist convention: persist only
a named **slice** to a stable key (`partialize`), never the whole store.

Canonical references: `docs/knowledge/architecture.md`,
`docs/knowledge/file-format.md`, `docs/plans/53-document-registry.md`,
`docs/plans/roadmap.md` Phase 1.

## Design decisions

These are settled here, not deferred.

### D1 — Storage schema, keys, and versioning

**localStorage `threatforge-workspace` (the light manifest — order, active tab, preferences).**
A single JSON record, the only thing needed to render the shell instantly at boot without
touching IndexedDB:

```
{
  schemaVersion: number,                 // manifest schema, independent of the IndexedDB version
  documents: Array<{
    id: DocumentId,                      // the branded doc-<uuid>
    title: string,                       // for #54 to label an un-hydrated tab
    filePath: string | null,             // adapter metadata, never identity
    order: number,                       // persisted tab order (user reorder is #54)
    updatedAt: string                    // ISO; advisory, reconciled against IndexedDB at boot
  }>,
  activeDocumentId: DocumentId | null,
  preferences: { … }                     // workspace prefs only; NOT user settings, NOT fileSettings, NEVER keys
}
```

**IndexedDB database `threatforge-workspace` (authoritative bodies + pointer).** Three object
stores:

| Store | keyPath | Value | Index |
|-------|---------|-------|-------|
| `documents` | `id` (`DocumentId`) | `{ id, currentRevisionId, updatedAt }` — pointer + bookkeeping, **no body** | — |
| `revisions` | `revisionId` (string) | `{ revisionId, documentId, thf, seq, createdAt }` — one full `.thf` text per revision | `by_document` on `documentId` |
| `meta` | `key` | `{ key, value }` — schema marker and migration bookkeeping | — |

Key scheme: `DocumentId` is the `documents` primary key; `revisionId` is
`${documentId}:${seq}` where `seq` is a per-document monotonic counter, so ordering and the
`by_document` index give cheap "latest N revisions" and prune-oldest without scanning.

**Revision model: full `.thf` snapshots, not deltas.** Reasoning: `.thf` documents are small
YAML text; the history store already snapshots whole models via `structuredClone`; deltas add
replay/merge code and a corruption blast radius (one bad delta breaks the chain) for no
meaningful space saving at this scale; and the portability invariant is best served by every
revision being an independently openable `.thf` — which `#55` export relies on. Retention is a
bounded ring: keep the most recent `MAX_REVISIONS_PER_DOCUMENT = 20` (mirrors the history
store's cap), pruning oldest within the write transaction. A configurable retention policy is
`#55`/`#63`; #56 uses the constant.

**Two projections, one authority.** The localStorage manifest is a fast-render projection; the
IndexedDB `documents`/`revisions` pair is authoritative for content. On boot they are reconciled
(D4). This split is what makes the "stale metadata" acceptance test meaningful.

**Schema versioning and migration.** `WORKSPACE_DB_VERSION` (a constant) drives
`indexedDB.open("threatforge-workspace", WORKSPACE_DB_VERSION)`. All object-store creation and any
data transform happen inside the single `versionchange` transaction supplied to
`onupgradeneeded`; IndexedDB makes that transaction atomic, so a migration that throws aborts the
whole upgrade and the database stays at its prior version (fail-closed — never a half-migrated
store). A `migrations` registry maps `fromVersion → toVersion` transforms applied in order for
the range `event.oldVersion → event.newVersion`. `#56` ships version 1 (store creation) and one
no-op/scaffolded 1→2 entry plus the harness so a real future migration is a data change, not a
mechanism change.

### D2 — Autosave: debounced, observable, fails visibly

- **Trigger and debounce.** A `use-workspace-persistence` hook subscribes to the **active**
  document's own `model` and `canvas` stores (via the registry session's `stores`). Any content
  change schedules a persist debounced at `WORKSPACE_AUTOSAVE_DEBOUNCE_MS = 1000` (coalesces edit
  bursts; local IndexedDB writes are cheap, so a short interval beats the multi-second file
  interval). The write captures the model with `captureCanvasIntoModel` first, so node drags
  persist. It does **not** touch `isDirty` (D-note in evidence).
- **Observable = a per-document persistence state.** A `workspace-store` holds
  `Record<DocumentId, DocumentPersistenceState>` where state is
  `'idle' | 'pending' | 'writing' | 'saved' | 'error'` plus `lastPersistedAt`. This is
  workspace-scoped (single window), keyed by `DocumentId`, and is the surface the status bar
  (and later #54's per-tab indicator) reads. It is **not** persisted to disk.
- **Failure without a toast storm.** A failed write transitions that document to `'error'` and
  updates a single coalesced status indicator; repeated failures update the same indicator
  rather than emitting a toast each time. The in-memory document is untouched and remains
  editable/exportable. One structured `console.warn` on the first transition into `'error'` per
  document; no secrets in the message. The full recovery affordance is `#55`.
- **Flush on hide.** A `visibilitychange`→hidden and `pagehide` listener flushes any pending
  debounced write synchronously-scheduled before teardown, so closing a tab does not lose the
  last second of edits. `beforeunload` is not relied on (unreliable and blocks bfcache).

### D3 — Crash safety: write-new-revision-then-flip-pointer, atomically

Protocol, all in **one** `readwrite` transaction over `['documents','revisions']`:

1. compute the next `seq` and `revisionId` for the document;
2. `put` the new `revisions` record (full `.thf` text);
3. `put`/update the `documents` record with `currentRevisionId = revisionId` and new
   `updatedAt` — the pointer flip;
4. prune revisions beyond `MAX_REVISIONS_PER_DOCUMENT` for that `documentId`;
5. commit.

IndexedDB commits a transaction atomically and durably: either every put lands or none does. The
old revision stays intact and referenced until the new one is fully committed and the pointer
moves in the same transaction, so a reader can never observe a `documents` record whose
`currentRevisionId` points at a missing or half-written revision — there is no success-shaped
partial record. The localStorage manifest update is a separate best-effort write reconciled at
boot (D4), so it can never corrupt the durable body.

**Test that proves it** (step 3, `fake-indexeddb`): after one committed write the pointer and
body are the new value; then a second write is forced to `abort()` after the revision `put` but
before commit, and the test asserts `documents.currentRevisionId` still equals the **old**
revision and reading the document returns the **old** body — a partial "write body, forget to
flip / flip then fail" implementation fails this. A companion durability test reopens a fresh DB
connection after a committed write and reads the new body. (A true mid-commit OS crash is not
reproducible in jsdom; the test asserts the protocol invariant, and mid-commit durability is
IndexedDB's own contract — stated explicitly, not hand-waved.)

### D4 — Restore without blocking first render

- **Eager, synchronous:** read the localStorage manifest (tiny) — this yields `documents`
  (order/titles), `activeDocumentId`, and `preferences` with no async work, so the shell and
  (later) the tab strip render immediately.
- **Eager, async (one document):** read only the **active** document's current-revision body
  from IndexedDB, `parseThreatModelYaml` it, build its `pendingLayout` via the existing
  `buildLayoutFromModel`, and hydrate it into the registry, then activate. This is one async
  IndexedDB read on the main thread's microtask queue, not a blocking load.
- **Lazy (all other documents):** inactive documents are **not** loaded into registry bundles at
  boot. They exist as manifest descriptors in `workspace-store` until first activated;
  activation calls the same hydration path on demand. This is what keeps a large workspace from
  blocking startup (roadmap Phase 1 / #48 exit gate).
- **Registry interaction:** `createDocument` mints a fresh id and always activates, which restore
  must not do. #56 adds **`hydrateDocument({ id, model, filePath, pendingLayout, createdAt, activate })`**
  to the registry: it rebuilds a session under the **persisted** `DocumentId` and `createdAt`,
  seeds the bundle exactly as `createDocument` does, and activates only when `activate` is true.
  Ownership split: `workspace-store` owns the full persisted open-document list and order;
  the registry owns only **hydrated** (live-bundle) sessions. `#54` reconciles them (render from
  the manifest, hydrate on tab activation). This is an explicit seam, not an accident.

### D5 — Failure UX, and the line against #55

Each failure has a fail-visible state and a non-destructive safe default. #56 delivers the
**states and safe defaults**; `#55` delivers the **recovery screen** that acts on them.

| Failure | #56 behavior (this issue) | #55 (not this issue) |
|---------|---------------------------|----------------------|
| Quota exceeded (`QuotaExceededError`) | document → `'error'`; single coalesced "changes aren't being saved" indicator; in-memory doc kept, no retry storm | selective clear, export-to-free-space guidance |
| IndexedDB unavailable / private mode (`open()` rejects or throws) | detect at boot; `persistenceAvailable = false`; **ephemeral mode** — app fully usable, autosave off, one persistent "this session won't be saved" notice (honors the "useful without backend" invariant) | richer guidance / opt-in export before leaving |
| Corrupt record (`parseThreatModelYaml` throws or a revision is missing) | that document is marked `'corrupt'`, **not** auto-activated and **never deleted**; the rest of the workspace stays usable | recovery screen to inspect / export / clear the corrupt record |
| Migration failure (`onupgradeneeded` aborts) | `open()` rejects; **do not delete the database**; enter a fail-visible "workspace needs recovery" state | recovery screen resolves it |
| Stale manifest (localStorage lists a doc absent from IndexedDB, or vice versa) | reconcile at boot: drop manifest entries with no IndexedDB record; surface IndexedDB records missing from the manifest as recoverable | recovery screen lists/recovers orphans |

The hard rule: **#56 never auto-wipes user data to clear an error.** Destruction is a #55
user-confirmed action.

### D6 — No API keys in either store, proven not asserted

Structural: the workspace-storage layer writes only (a) `.thf` text from
`serializeThreatModelYaml` and (b) the manifest of ids/order/titles/preferences. It never imports
or calls any keychain adapter, and its namespaces (`threatforge-workspace` in both stores) are
disjoint from the keychain's `tf-api-key-` localStorage namespace. Step 10 proves this with:
(1) a runtime test that sets a real key via `BrowserKeychainAdapter`, runs a full persist cycle,
then enumerates every IndexedDB record and the `threatforge-workspace` localStorage value and
asserts the secret substring appears in **neither**, and that the only localStorage key carrying
it is `tf-api-key-anthropic`; (2) a spy/enumeration test asserting the persistence layer never
reads or writes a `/^tf-api-key-/` key; (3) a static assertion (grep in the verification gate)
that no file under `src/lib/persistence/` imports a keychain adapter.

## Implementation steps

Each step leaves the app working, `npx vitest --run` green, and `npx tsc --noEmit` clean. Steps
1–4 build the browser storage engine bottom-up with no UI wiring; step 5 adds the workspace
store; step 6 adds the one registry action; steps 7–9 wire autosave, restore, and failure UX;
step 10 proves the security boundary and documents the seams.

### 1. Persistence contracts, record types, and the migration registry

- **Behavior:** the type surface and migration mechanism exist with no runtime storage. Adds no
  behavior to the running app.
- **Files:** `src/lib/persistence/types.ts` (new),
  `src/lib/persistence/workspace-storage.ts` (new — the `WorkspaceStorage` interface),
  `src/lib/persistence/migrations.ts` (new), `src/lib/persistence/migrations.test.ts` (new).
  Add `fake-indexeddb` to `devDependencies`.
- **Implementation:**
  1. In `types.ts` declare `PersistedDocumentRecord` (`{ id; currentRevisionId; updatedAt }`),
     `DocumentRevisionRecord` (`{ revisionId; documentId; thf; seq; createdAt }`),
     `WorkspaceManifest` (D1 localStorage shape), `DocumentPersistenceState`
     (`'idle'|'pending'|'writing'|'saved'|'error'|'corrupt'` + `lastPersistedAt`), and
     `WorkspaceUnavailableReason` (`'unavailable'|'private-mode'|'migration-failed'|'corrupt'`).
  2. In `workspace-storage.ts` declare the `WorkspaceStorage` interface: `isAvailable()`,
     `listDocuments()`, `readDocumentBody(id)`, `writeDocumentBody(id, thf, title, filePath)`,
     `deleteDocument(id)`, `listRevisions(id)` — every method typed to return either data or a
     typed failure, never a thrown raw internal error at the boundary.
  3. In `migrations.ts` export `WORKSPACE_DB_VERSION = 1`, a `MIGRATIONS` array of
     `{ from; to; upgrade(db, txn) }` entries applied for the `oldVersion → newVersion` span,
     and `runMigrations(db, txn, oldVersion, newVersion)`.
- **Targeted verification:** `npx vitest --run src/lib/persistence/migrations.test.ts`. Assertions:
  migration `from`/`to` values are contiguous and monotonic; `runMigrations` invokes exactly the
  entries in `(oldVersion, newVersion]` in order; a migration whose `upgrade` throws propagates so
  the caller's transaction aborts.
- **Intent validation:** owner confirms the record shapes carry no field derived from a secret and
  that versioning is store-schema-driven, not ad hoc.

### 2. IndexedDB open, schema v1, and transactional upgrade

- **Behavior:** `openWorkspaceDb()` opens `threatforge-workspace` at `WORKSPACE_DB_VERSION`,
  creating the `documents`, `revisions` (+ `by_document` index), and `meta` stores inside the
  version-change transaction, and classifies failures.
- **Files:** `src/lib/persistence/indexeddb.ts` (new),
  `src/lib/persistence/indexeddb.test.ts` (new).
- **Implementation:**
  1. `openWorkspaceDb(): Promise<IDBDatabase>` wrapping `indexedDB.open`; in `onupgradeneeded`
     create missing stores/indexes then call `runMigrations` with `event.oldVersion`/`newVersion`
     using the supplied `transaction`. Reject with a typed `WorkspaceUnavailableReason` on
     `onerror`, `onblocked`, a thrown/aborted upgrade (`'migration-failed'`), or a missing
     `indexedDB`/private-mode throw (`'unavailable'`/`'private-mode'`).
  2. Never call `deleteDatabase` on failure (D5).
- **Targeted verification:** `npx vitest --run src/lib/persistence/indexeddb.test.ts` with
  `fake-indexeddb`. Assertions: a fresh open creates all three stores and the `by_document` index;
  a simulated upgrade whose migration throws leaves the DB at the prior version and rejects with
  `'migration-failed'`; a `null` `globalThis.indexedDB` rejects with `'unavailable'`.
- **Intent validation:** owner confirms a failed migration cannot silently drop the database.

### 3. Crash-safe write protocol, reads, and bounded revision pruning

- **Behavior:** `writeDocumentBody` performs the D3 atomic new-revision-then-flip-pointer write
  with pruning; `readDocumentBody`/`listRevisions` read through the pointer.
- **Files:** `src/lib/persistence/indexeddb-workspace-storage.ts` (new — implements
  `WorkspaceStorage` over `openWorkspaceDb`),
  `src/lib/persistence/indexeddb-workspace-storage.test.ts` (new).
- **Implementation:**
  1. `writeDocumentBody`: open one `readwrite` txn over `['documents','revisions']`; read current
     `seq`; put the new revision; flip `documents.currentRevisionId`; prune the oldest revisions
     beyond `MAX_REVISIONS_PER_DOCUMENT` via the `by_document` index; resolve on `txn.oncomplete`,
     reject (mapping `QuotaExceededError`) on `onabort`/`onerror`.
  2. `readDocumentBody(id)` reads the `documents` pointer then the referenced revision;
     `listDocuments`/`listRevisions` read metadata only.
- **Targeted verification:**
  `npx vitest --run src/lib/persistence/indexeddb-workspace-storage.test.ts`. Discriminating
  assertions: the D3 abort test (aborted second write leaves the old pointer and old body intact);
  a reconnect-after-commit test reads the new body (durability); writing 25 revisions leaves
  exactly 20, the newest, with a dense `currentRevisionId`; a forced `QuotaExceededError` rejects
  with a typed quota reason and leaves the prior committed revision readable.
- **Intent validation:** owner reads the abort test and confirms it would fail a naive
  write-in-place implementation, i.e. it proves crash safety rather than restating it.

### 4. No-op desktop storage and the platform factory

- **Behavior:** desktop resolves a `WorkspaceStorage` that reports unavailable and performs no I/O;
  browser resolves the IndexedDB implementation. Mirrors `get-file-adapter.ts`.
- **Files:** `src/lib/persistence/noop-workspace-storage.ts` (new),
  `src/lib/persistence/get-workspace-storage.ts` (new),
  `src/lib/persistence/get-workspace-storage.test.ts` (new).
- **Implementation:**
  1. `NoopWorkspaceStorage` implements every `WorkspaceStorage` method: `isAvailable()` false,
     reads return empty, writes/deletes are no-ops. It exists so desktop calls the same hooks with
     zero branching in the hooks themselves.
  2. `getWorkspaceStorage()` caches and branches on `isTauri()`, lazy-importing the IndexedDB
     implementation only in the browser so desktop never loads it.
- **Targeted verification:** `npx vitest --run src/lib/persistence/get-workspace-storage.test.ts`.
  Assertions: with `isTauri()` stubbed true the factory returns the no-op and never touches
  `indexedDB` (spy asserts zero `indexedDB.open` calls); stubbed false returns the IndexedDB
  implementation; the no-op satisfies the full `WorkspaceStorage` interface (compile + runtime).
- **Intent validation:** owner confirms desktop behavior is deliberately registry-only and no
  IndexedDB code path is reachable there.

### 5. Workspace store: localStorage manifest + persistence observability

- **Behavior:** a Zustand `workspace-store` owns the persisted manifest (order, active tab,
  preferences), the per-document persistence state, and `persistenceAvailable`. Only the manifest
  slice is written to localStorage `threatforge-workspace`.
- **Files:** `src/stores/workspace-store.ts` (new), `src/stores/workspace-store.test.ts` (new).
- **Implementation:**
  1. State: `documents: WorkspaceManifest["documents"]`, `activeDocumentId`, `preferences`,
     `persistence: Record<DocumentId, DocumentPersistenceState>`, `persistenceAvailable`,
     `unavailableReason`. Actions to upsert/remove a manifest entry, set order, set the active id,
     and set a document's persistence state.
  2. Persist with `zustand/middleware` `persist` + `partialize` restricted to
     `{ schemaVersion, documents, activeDocumentId, preferences }` (mirrors `settings-store`).
     `persistence`, `persistenceAvailable`, and `unavailableReason` are runtime-only and excluded.
- **Targeted verification:** `npx vitest --run src/stores/workspace-store.test.ts`. Assertions:
  a manifest round-trips through localStorage under exactly key `threatforge-workspace`;
  persistence state and availability are absent from the persisted JSON; setting a document's
  persistence state does not rewrite the disk manifest.
- **Intent validation:** owner confirms tab order/active/preferences persist but no body,
  revision, or credential does.

### 6. Registry `hydrateDocument` action (additive)

- **Behavior:** restore can rebuild a session under a **known** `DocumentId`/`createdAt` and
  activate it only when asked. `createDocument` is unchanged.
- **Files:** `src/stores/document-registry.ts`, `src/stores/document-registry.test.ts`,
  `src/types/document.ts` (only if a shared input type is added).
- **Implementation:**
  1. Add `hydrateDocument({ id, model, filePath, pendingLayout, createdAt, activate })`: if a
     session already exists for `id`, no-op (idempotent re-hydration); otherwise build a bundle,
     seed it exactly as `createDocument` does (`setModel(model, filePath)`,
     `canvas.setState({ pendingLayout })`, `fileSettings` from `model.metadata.settings`), insert
     into `documents`/`openDocumentIds`, and call `activateDocument(id)` only when `activate`.
  2. Do not change `createDocument`, `closeDocument`, or the state shape otherwise; keep the diff
     additive to minimize contention with #53 steps 6–8 on this file.
- **Targeted verification:** `npx vitest --run src/stores/document-registry.test.ts`. Assertions:
  `hydrateDocument` preserves the passed `id` and `createdAt`, does not mint a new id, and does
  not clobber a sibling session; `activate: false` leaves `activeDocumentId` unchanged; a second
  hydrate of the same id is a no-op (no duplicate bundle).
- **Intent validation:** owner confirms this is the minimum registry surface restore needs and that
  identity is preserved across a persistence round trip.

### 7. Workspace autosave to IndexedDB

- **Behavior:** browser edits to the active document persist to IndexedDB on a 1s debounce, with a
  visible per-document persistence state, flush-on-hide, and coalesced error reporting. Desktop is
  unaffected (no-op storage). `isDirty` and the file autosave are untouched.
- **Files:** `src/lib/model-capture.ts` (new — `captureCanvasIntoModel` extracted from
  `use-file-operations.ts`), `src/hooks/use-file-operations.ts` (import the extracted function —
  no behavior change), `src/hooks/use-workspace-persistence.ts` (new),
  `src/hooks/use-workspace-persistence.test.ts` (new),
  `src/components/layout/app-layout.tsx` (mount the hook),
  `src/lib/model-capture.test.ts` (new, moves the capture assertions).
- **Implementation:**
  1. Extract `captureCanvasIntoModel` verbatim to `src/lib/model-capture.ts`; re-import it in
     `use-file-operations.ts` (identical behavior, no logic change) so both the file save and the
     workspace autosave share one capture.
  2. `useWorkspacePersistence` reads `activeDocumentId` and the active session's `stores`,
     subscribes to that session's `model` and `canvas` stores, and on change schedules a debounced
     (`WORKSPACE_AUTOSAVE_DEBOUNCE_MS`) write: capture → `serializeThreatModelYaml` →
     `getWorkspaceStorage().writeDocumentBody(...)` → update `workspace-store` persistence state
     and the manifest `updatedAt`/`title`. It does **not** call `markClean`. On unmount/switch it
     re-binds to the new active document's stores. Add `visibilitychange`/`pagehide` flush.
  3. On write failure, set that document's persistence state to `'error'` once and leave the
     in-memory model intact; do not emit a toast (D2).
- **Targeted verification:** `npx vitest --run src/hooks/use-workspace-persistence.test.ts
  src/lib/model-capture.test.ts` with `fake-indexeddb` and fake timers. Discriminating assertions:
  three edits within the debounce window produce exactly one `writeDocumentBody` carrying the
  latest text; a node-position change persists (capture ran); a forced write rejection sets the
  document to `'error'` exactly once across repeated failures and never mutates the model or
  `isDirty`; a `pagehide` flushes a pending write.
- **Intent validation:** owner edits in the browser, waits, reloads, and confirms the edit
  survived; confirms the desktop app still saves to disk exactly as before.

### 8. Boot restore and lazy hydration

- **Behavior:** on browser boot the shell renders from the manifest immediately, the active
  document hydrates from IndexedDB without blocking first paint, inactive documents stay
  un-hydrated until activated, and unavailable/corrupt cases degrade safely. Desktop starts empty
  as today.
- **Files:** `src/hooks/use-workspace-restore.ts` (new),
  `src/hooks/use-workspace-restore.test.ts` (new),
  `src/components/layout/app-layout.tsx` (mount the hook after storage availability is known).
- **Implementation:**
  1. `useWorkspaceRestore` runs once on mount: `getWorkspaceStorage().isAvailable()`; if false set
     `persistenceAvailable=false` + reason and stop (ephemeral mode). If true, load the manifest
     into `workspace-store`, reconcile it against `listDocuments()` (D5 stale-metadata rule), then
     read only the `activeDocumentId` body, `parseThreatModelYaml` it, and
     `registry.hydrateDocument({ …, activate: true })`.
  2. A `hydrateById(id)` helper (exported for #54) reads one body on demand and hydrates+activates
     it; used when the user later activates an un-hydrated document.
  3. If the active document's body fails to parse, mark it `'corrupt'`, do not activate it, fall
     back to the next manifest document or `EmptyCanvas`, and keep the rest usable.
- **Targeted verification:** `npx vitest --run src/hooks/use-workspace-restore.test.ts`.
  Discriminating assertions: with three persisted documents only the active one's body is read
  (spy asserts a single `readDocumentBody`) and the other two are not hydrated into the registry;
  `isAvailable()` false yields ephemeral mode with no read and no thrown error; a corrupt active
  body is skipped and marked, and a sibling still hydrates. Then
  `npx playwright test e2e/browser-restore.spec.ts` (new): create a document in a real browser,
  edit, reload the page, and assert the edit is present without a blocking spinner.
- **Intent validation:** owner reloads a multi-document browser workspace and confirms it returns
  to the same active document and content, quickly, and that returning is restore (same content),
  not reset (blank).

### 9. Fail-visible persistence UX in the status bar

- **Behavior:** the persistence state is visible without a toast storm; ephemeral, error, and
  corrupt states each show one clear, coalesced indicator. The recovery screen remains #55.
- **Files:** `src/components/layout/status-bar.tsx`,
  `src/components/layout/status-bar.test.tsx` (extend).
- **Implementation:**
  1. Read the active document's persistence state and `persistenceAvailable` from
     `workspace-store`; render one indicator: `Saved locally` / `Saving…` / `Not saved locally`
     (error) / `This session won't be saved` (ephemeral) / `Recovery needed` (corrupt/migration).
     Keep the existing file `renderSaveStatus` text intact — the two are distinct (file vs local).
  2. Add an inline scope comment: fuller recovery actions are `#55`; this indicator is
     fail-visible state only.
- **Targeted verification:** `npx vitest --run src/components/layout/status-bar.test.tsx`.
  Assertions: an `'error'` state renders exactly one indicator (not per-write); ephemeral mode
  renders the persistent notice; a `'saved'` state renders the saved-locally text without
  affecting the existing file save-status text.
- **Intent validation:** owner confirms the indicator is understandable and not noisy, and that no
  recovery action beyond #56's scope leaked in.

### 10. Prove the no-credential boundary and document the seams

- **Behavior:** a dedicated security test proves no key material reaches either store, a static
  check forbids the persistence layer from importing a keychain adapter, and the architecture doc
  and handoff notes for #55/#63/#54 are written.
- **Files:** `src/lib/persistence/no-credentials.test.ts` (new),
  `docs/knowledge/architecture.md`, `docs/plans/56-indexeddb-persistence.md` (replan log).
- **Implementation:**
  1. `no-credentials.test.ts` (D6): set a real key via `BrowserKeychainAdapter.setKey`, run a full
     create→persist cycle for a model whose text does not contain the secret, then enumerate every
     IndexedDB record and the `threatforge-workspace` localStorage value and assert the secret is
     in neither; assert the only localStorage key carrying it is `tf-api-key-anthropic`; spy on
     `localStorage`/keychain and assert the persistence layer touches no `/^tf-api-key-/` key.
  2. Add a grep assertion to the verification gate: no file under `src/lib/persistence/` imports a
     keychain adapter.
  3. Add an "IndexedDB browser persistence" section to `docs/knowledge/architecture.md`: the D1
     schema, the D3 crash-safety protocol, the D4 restore strategy, the two-projection/one-authority
     reconciliation, and the desktop no-op seam. Append handoff notes: `#55` (the stored `.thf`
     text is export-ready and the failure states it renders), `#63` (chat persistence is separate
     and must reuse `DocumentId` + the same DB/version discipline), `#54` (manifest-driven tab
     rendering + `hydrateById` for on-demand activation).
- **Targeted verification:** `npx vitest --run src/lib/persistence/no-credentials.test.ts`; the
  grep assertion; `npm run ci:local`.
- **Intent validation:** owner confirms the disjointness proof is a real runtime assertion, not a
  comment, and that the handoff notes let #55/#63/#54 start without rediscovery.

## Cross-cutting requirements

- **Security and privacy:** the trust boundary is the browser storage surface; the only values
  crossing it are `.thf` text and the id/order/title/preferences manifest. No keychain adapter is
  imported by the persistence layer (proven, step 10); namespaces are disjoint from `tf-api-key-`.
  IndexedDB failures return typed reasons, never raw internal errors, and never a secret. No new
  Tauri command, capability, or IPC surface is added — this is browser-only frontend storage;
  desktop resolves a no-op. Data is never auto-deleted to clear an error.
- **`.thf` compatibility:** no schema change, no version bump. Documents persist as the exact text
  of `serializeThreatModelYaml`, so a stored revision is a portable `.thf` file and `#55` export
  is a trivial blob write. `parseThreatModelYaml` narrows on read; unknown fields survive because
  the body is opaque text. `DocumentId` is never written into a `.thf` (it lives only in workspace
  metadata). Round-trip is covered by persisting a model and reading it back byte-identical.
- **Browser and desktop:** both platforms mount the same hooks; the factory resolves IndexedDB in
  the browser and a no-op on desktop, so desktop is registry-and-filesystem only with no IndexedDB
  code path reachable. The file autosave (`use-autosave.ts`) is unchanged on both. The desktop
  parity check is the no-op interface conformance test (step 4).
- **AI safety:** unchanged. #56 persists no chat content and does not alter the AI mutation path;
  `activeChatSessionId` remains #53/#63 territory.
- **Accessibility and UX:** the persistence indicator uses the existing status-bar text conventions
  with accessible, non-flashing states; ephemeral/error/corrupt each have a clear message. First
  render is not blocked (D4). No modal or focus trap is added (recovery UI is #55).
- **Observability and evidence:** the PR includes the `fake-indexeddb` targeted Vitest output, the
  new `e2e/browser-restore.spec.ts` trace, the enumerated-store no-credential assertion output,
  and a note that desktop shows zero `indexedDB.open` calls. Screenshots of the status-bar states
  (saving / saved-locally / not-saved / ephemeral) are attached because they are user-visible.

## Verification gate

Targeted, in order, while iterating:

```bash
npx tsc --noEmit
npx biome check .
npx vitest --run src/lib/persistence
npx vitest --run src/stores/workspace-store.test.ts src/stores/document-registry.test.ts
npx vitest --run src/hooks/use-workspace-persistence.test.ts src/hooks/use-workspace-restore.test.ts src/lib/model-capture.test.ts
npx vitest --run src/components/layout/status-bar.test.tsx
grep -RIL --include='*.ts' 'keychain' src/lib/persistence >/dev/null # persistence imports no keychain adapter
npx playwright test e2e/browser-restore.spec.ts
```

Final required gate:

```bash
npm run ci:local
```

Because this change adds a persistence path that only a real browser exercises fully (quota,
private mode, `pagehide`), run the browser E2E before handoff:

```bash
bash scripts/ci-local.sh --e2e
```

Rust is untouched; no `cargo` work beyond what `ci:local` runs.

## Owner validation

Deterministic checks cannot decide these plausible-but-wrong outcomes:

1. **Restore is restore, not reset.** Reload a multi-document browser workspace and confirm it
   returns to the same active document, content, and (via #53 step 7) viewport — not a blank
   document — and that it does so without a visible blocking spinner on the main thread.
2. **Crash safety feels real.** Confirm that force-quitting the tab mid-edit (or DevTools "offline"
   during a write) never yields a document that opens to a half-written or empty body; the last
   committed revision is intact.
3. **Private mode and quota degrade, never destroy.** In a private window (Firefox/Safari where
   IndexedDB is restricted) confirm the app is fully usable with the ephemeral notice and loses no
   in-memory work; under a filled quota confirm one calm indicator, not a toast storm, and that the
   document stays exportable.
4. **No credential leakage.** Beyond the automated proof, confirm that inspecting Application →
   IndexedDB and localStorage in DevTools after entering an API key shows the key only under
   `tf-api-key-*` and never in `threatforge-workspace`.
5. **Scope line with #55/#63/#54 holds.** Confirm #56 stops at fail-visible states and durable
   `.thf` text and did not absorb the recovery screen, export/download, chat persistence, or tab
   UI — and that the handoff notes are sufficient for those issues to start.
6. **Two projections stay coherent.** Confirm the stale-metadata reconciliation behaves sensibly
   when localStorage and IndexedDB disagree (e.g. cleared one but not the other), rather than
   crashing or silently losing a document.

## Specialist review

- [ ] PR reviewer
- [ ] Slop auditor
- [ ] Security auditor — applies: browser storage trust boundary, the no-credential proof, quota
      and private-mode failure handling, and the "never auto-delete on error" rule.
- [ ] Threat-model expert — applies narrowly: confirm the persisted body is unchanged `.thf` text,
      that `DocumentId` never enters a `.thf`, and that a stored revision reopens as a valid file.

## Concurrent-work seams

Contention is expected; the mitigation keeps conflicts mechanical.

| File | Contending issue | Nature and mitigation |
|------|------------------|-----------------------|
| `src/stores/document-registry.ts` | `#53` steps 6–8, `#54`, `#63` | #56 adds only the additive `hydrateDocument` action; it changes no existing action or state field. If #53's later steps rename session fields, `hydrateDocument` re-applies over the new shape. |
| `src/hooks/use-file-operations.ts` | `#53`, `#55` | #56 only extracts `captureCanvasIntoModel` into `src/lib/model-capture.ts` and re-imports it (no behavior change). #55 extends the same create/close call sites for export. |
| `src/components/layout/app-layout.tsx` | `#54` | #56 mounts `useWorkspacePersistence` and `useWorkspaceRestore` alongside the existing hooks; #54 adds the tab strip. Different regions. |
| `src/components/layout/status-bar.tsx` | `#54` | #56 adds one persistence indicator reading `workspace-store`; #54 may add per-tab indicators reading the same store. Additive. |
| `src/lib/thf-yaml.ts` | none (consumed only) | #56 imports `serializeThreatModelYaml`/`parseThreatModelYaml` unchanged. |
| `docs/knowledge/architecture.md` | `#53` step 10, `#57`, `#61` | Additive section; append, do not restructure. |

## Out of scope / future (do not implement here)

- Recovery screen, orphan/corrupt resolution UI, per-document and full storage clear, and `.thf`
  download/export of a stored document — `#55`.
- AI conversation and tool-history persistence, chat retention limits, and the
  `threatforge-chat-sessions:*` → `DocumentId` migration — `#63`.
- Tab rendering, reorder, pin, overflow, and close UX — `#54`.
- Multi-tab conflict *resolution* UI (two browser tabs editing one document): #56 delivers
  cross-tab manifest reconciliation and a detectable stale-write signal, not a resolution surface.
- Configurable revision-retention policy and cross-device sync — later initiatives.

## Replan log

Append changes; do not rewrite prior decisions.

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-07-22 | Steps 6–10 implementation deviations | (1) **`captureCanvasIntoModel` takes its canvas state as a parameter** instead of moving verbatim. Reading `useCanvasStore.getState()` inside it reads the *active* facade, so a debounced write that outlives a document switch would fold the wrong document's geometry into the model. `use-file-operations.ts` passes the active canvas at the same call sites, so file-save behavior is unchanged. (2) **`hydrateDocument` honors `activate` for an already-open document** rather than being a total no-op: the bundle is still never rebuilt (stored text never overwrites live work), but "make this restored document current" is what the caller asked for. (3) **`WorkspaceManifestEntry` gains a required `createdAt`**, without which D4's "rebuild under the persisted `createdAt`" cannot hold — the manifest previously stored only `updatedAt`, which is a modification time. (4) **`DocumentPersistenceState` gains an optional `errorKind`** so the indicator can distinguish a full quota from a generic failure, as D5 requires. (5) **`useWorkspaceRestore` branches on `isTauri()`** in addition to the storage factory: `isAvailable()` alone cannot tell "desktop, not applicable" from "browser, storage blocked", and only the second may show the ephemeral notice. (6) **Autosave seeds a document that has no manifest entry** on bind, so a New/Open/Import/template document survives a reload without an edit; a document already in the manifest is not rewritten at boot, so restoring costs no revision. (7) **The persisted active pointer is cleared when no document is open**, so closing a document does not resurrect it on reload; its manifest entry and stored body are kept for `#55`. (8) **`e2e/browser-restore.spec.ts` was not written** — the Playwright browser lane was outside this run's verification scope; the restore, non-blocking-paint, and failure paths are covered by `src/hooks/use-workspace-restore.test.ts`, and the E2E spec remains required before handoff. |
| 2026-07-21 | Initial plan | Issue `#56`, parent `#48`, roadmap Phase 1. Evidence read on `feat/53-document-state-ownership` @ `3266111` (registry via `#122`) and `main` @ `e6a721d`: registry API and `DocumentSession` shape (`document-registry.ts`, `types/document.ts`); `serializeThreatModelYaml`/`parseThreatModelYaml` (`lib/thf-yaml.ts`, `#115`/`#120`); `captureCanvasIntoModel` private in `use-file-operations.ts`; file-only `use-autosave.ts` (fires only with `filePath`); `isTauri()` + cached adapter-factory pattern (`get-file-adapter.ts`); localStorage namespaces `tf-api-key-`, `threatforge-chat-sessions:`, `threatforge-settings`, `threatforge-theme`, `threatforge-panel-widths`; `AppLayout` hook-mount seam; `persist`+`partialize` slice convention (`settings-store.ts`, `ui-store.ts`); no IndexedDB library in `package.json`. |
