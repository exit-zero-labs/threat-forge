# Threat Forge - TODO List

Shared execution plan for humans and LLM agents. Update this file before, during, and after every work session.

---

## 2026-03-07 — Import TM7 and Other File Formats

### Plan
- [x] 1. Rust: TM7 XML parser module (`src-tauri/src/importers/`)
  - [x] Add `quick-xml` crate to `Cargo.toml`
  - [x] Create `src-tauri/src/importers/mod.rs`
  - [x] Create `src-tauri/src/importers/tm7.rs` — parse TM7 XML → `ThreatModel`
  - [x] Unit tests for TM7 parsing (6 tests: minimal TM7, empty TM7, unique IDs, STRIDE categories, severity, mitigation status)
- [x] 2. Rust: Tauri command for import
  - [x] Create `src-tauri/src/commands/import_commands.rs` with `import_threat_model` command
  - [x] Register command in `lib.rs`
- [x] 3. Frontend: Import flow
  - [x] Add `importModel` to `useFileOperations` hook
  - [x] Add "Import…" menu item to native menu (`menu.rs`)
  - [x] Handle `file-import` menu event in `useNativeMenu`
  - [x] Add import command to command palette (`command-registry.ts`)
  - [x] Update `FileAdapter` with `importThreatModel` method
  - [x] Implement in `TauriFileAdapter` with open dialog for `.tm7` files
  - [x] Browser adapter stub (shows "desktop only" alert)
- [x] 4. Validation (initial)
  - [x] `cargo clippy` — clean
  - [x] `npx biome check --write .` — clean
  - [x] `cargo test` — 69 tests pass (10 new)
  - [x] `npx vitest --run` — 417 tests pass (1 new)
  - [x] `cargo fmt` — clean
- [x] 5. Deep audit & fixes
  - [x] Fix `parse_stencil_properties` stale `current_display_name` bug — clear after consuming Value
  - [x] Fix `NeedsInvestigation` mapped to `InProgress` → should be `NotStarted`
  - [x] Fix dead code in `TauriFileAdapter.openThreatModel` — redundant ternary
  - [x] Add test: malformed XML returns error
  - [x] Add test: `NeedsInvestigation` maps to `NotStarted`
  - [x] Add test: unknown STRIDE TypeId prefix falls back to Tampering
  - [x] Add test: self-loop flow (from == to) imported correctly
  - [x] Update README.md — add "Import from Microsoft TMT" to Features, fix Contributing
  - [x] Update CONTRIBUTING.md — TM7 import done, only Threat Dragon remains
  - [x] Update overview.md — add import to status list, update test counts
  - [x] Update product-design.md — move TM7 import to Must-Have table
  - [x] Final validation: clippy clean, biome clean, 73 Rust tests, 417 frontend tests
  - [ ] Manual test with a real TM7 file

### Notes
- TM7 is Microsoft's XML-based format with .NET serialization artifacts
- Architecture is extensible — `importers/` module can support future formats (Threat Dragon JSON, OTMF, etc.)
- Import produces a ThreatModel that the user must "Save As" to create a .thf file
- Deep audit found and fixed: stale state bug in property parser, incorrect mitigation mapping, dead code, missing tests, outdated docs

---

## 2026-03-03 — AI Chat Pane Improvements

### Plan
- [x] 1. Model Selector
  - [x] Create `src/lib/ai-models.ts` with model definitions and helpers
  - [x] Add `aiModelAnthropic` and `aiModelOpenai` to `UserSettings` and defaults
  - [x] Add model selector dropdown to `ai-settings-content.tsx`
  - [x] Add `modelId` param to `ChatAdapter.sendMessage()`
  - [x] Pass `modelId` through `BrowserChatAdapter`
  - [x] Pass `modelId` through `TauriChatAdapter`
  - [x] Add `model_id` param to Rust `send_chat_message` command
  - [x] Remove hardcoded model constants in Rust `providers.rs`, accept `model_id`
  - [x] Read model ID from settings store in `chat-store.ts` `sendMessage`
- [x] 2. Stop Generating
  - [x] Add `AbortController` to `chat-store.ts`, pass signal to adapter
  - [x] Add `stopGenerating()` action to chat store
  - [x] Add `signal` param to `ChatAdapter` interface
  - [x] Pass `signal` to `fetch()` in `BrowserChatAdapter`
  - [x] Handle abort in `TauriChatAdapter` via `cancel_chat_stream` command
  - [x] Add `cancel_chat_stream` Rust command with `Arc<AtomicBool>`
  - [x] Check cancel flag in Rust streaming loops
  - [x] Register cancel command in `lib.rs`
  - [x] Add stop button + Escape key in `ai-chat-tab.tsx`
- [x] 3. Chat Sessions
  - [x] Create `src/types/chat-session.ts` with session types
  - [x] Rewrite `chat-store.ts` with session management
  - [x] Add `SessionBar` component to `ai-chat-tab.tsx`
  - [x] Wire up session loading on file path changes
- [x] 4. Markdown Rendering
  - [x] Install `react-markdown` and `remark-gfm`
  - [x] Create `src/components/panels/markdown-content.tsx`
  - [x] Replace plain text with `MarkdownContent` in `AssistantContent`
- [x] 5. System Prompt Improvements
  - [x] Add element positioning guidance to TS and Rust prompts
  - [x] Enhance STRIDE expertise in prompts
  - [x] Add markdown formatting instructions
  - [x] Include position data in model context
  - [x] Add `position` to `AddElementPayload` and `AddTrustBoundaryPayload`
  - [x] Pass position through in `ai-action-executor.ts`
- [x] Validation
  - [x] `npx biome check --write .`
  - [x] `cargo clippy --manifest-path src-tauri/Cargo.toml`
  - [x] `npx vitest --run` — 416 tests pass
  - [x] `cargo test --manifest-path src-tauri/Cargo.toml` — 59 tests pass
- [x] Deep verification & documentation update
  - [x] Full code review (imports, references, dead code)
  - [x] Fix `cancel_chat_stream` to return `Result<(), String>` per project convention
  - [x] Fix `import type` for `MAX_MESSAGES_PER_SESSION`/`MAX_SESSIONS_PER_FILE` — use runtime values, not `satisfies typeof`
  - [x] Wire up `migrateSessionKey` in `AiChatTab` useEffect to prevent session data loss on Save As
  - [x] Add XSS safety comment to `MarkdownContent` (rehype-raw intentionally omitted)
  - [x] Update `docs/knowledge/architecture.md` — AI module description
  - [x] Update `docs/knowledge/product-design.md` — AI feature table
  - [x] Update `docs/knowledge/overview.md` — AI features + test counts
  - [x] Update `docs/knowledge/market-analysis.md` — AI features comparison
  - [x] Update `docs/runbooks/releasing-a-version.md` — AI smoke test checklist
  - [x] Update `CLAUDE.md` — AI module description in project structure
  - [x] Final validation pass: Biome clean, Clippy clean, 416 TS tests, 59 Rust tests
