# Threat Forge - TODO List

Shared execution plan for humans and LLM agents. Update this file before, during, and after every work session.

---

## 2026-03-01 — WS1: YAML Format Consolidation

Consolidate layout data from separate `.threatforge/layouts/*.json` sidecar files into inline fields within `.threatforge.yaml`. Adds position/size/color/viewport fields directly on each entity.

### Plan
- [x] Step 1: Rust model changes (`threat_model.rs`)
  - [x] Add `Position` and `Size` structs
  - [x] Remove `deny_unknown_fields` from all 8 structs
  - [x] Add optional position/size/color fields to Element, TrustBoundary, DataFlow, Diagram
  - [x] Change `Diagram.layout_file` from `String` to `Option<String>`
  - [x] Add `viewport: Option<Viewport>` to Diagram
  - [x] Update `ThreatModel::new()` constructor
  - [x] Validate: `cargo test` + `cargo clippy`
- [x] Step 2: Rust test updates (`threat_model.rs` tests)
  - [x] Remove `test_rejects_unknown_fields`
  - [x] Add `test_inline_position_round_trip`
  - [x] Add `test_old_yaml_without_positions_parses`
  - [x] Add `test_unknown_fields_are_tolerated`
  - [x] Verify `test_sample_yaml_deserialization` still passes
  - [x] Validate: `cargo test`
- [x] Step 3: Rust migration logic (`reader.rs`)
  - [x] Add `merge_layout_into_model()` function
  - [x] Add `test_merge_layout_into_model` test
  - [x] Add `test_merge_layout_skips_when_no_layout_file` test
  - [x] Validate: `cargo test` + `cargo clippy`
- [x] Step 4: Rust command update (`file_commands.rs`)
  - [x] Call migration in `open_threat_model`
  - [x] Validate: `cargo test`
- [x] Step 5: TypeScript type updates (`threat-model.ts`)
  - [x] Add `Position` and `Size` interfaces
  - [x] Add optional fields to Element, TrustBoundary, DataFlow, Diagram
- [x] Step 6: Canvas store updates (`canvas-store.ts`)
  - [x] Update `boundaryToNode` to read colors from model
  - [x] Update `boundaryToNode` to read size from model
  - [x] Update `flowToEdge` to read `label_offset`
- [x] Step 7: File operations rewrite (`use-file-operations.ts`)
  - [x] Add `captureCanvasIntoModel()`
  - [x] Add `buildLayoutFromModel()`
  - [x] Update `saveModel`/`saveModelAs` to use `captureCanvasIntoModel`
  - [x] Update `openModel` to use `buildLayoutFromModel` with sidecar fallback
- [x] Step 8: Browser adapter update
  - [x] Update `createNewModel` diagram shape (remove `layout_file`)
- [x] Step 9: Test updates
  - [x] Update `model-store.test.ts` mock diagram (remove `layout_file`)
  - [x] Add canvas-store test: inline position restoration
  - [x] Add canvas-store test: boundary colors from model
  - [x] Add canvas-store test: label offset from data flow
- [x] Step 10: Update `.claude/rules/yaml-format.md`
- [x] Final validation: `npm run ci:local` — ALL PASSED

### Notes
- All new fields are `Option<T>` with `serde(default, skip_serializing_if)` for backward compat
- Migration reads old sidecar JSON and merges into model in memory on open
- Layout IPC commands (`open_layout`/`save_layout`) stay registered but become unused
- Also fixed struct constructors in `ai/prompt.rs` and `stride/mod.rs` for new fields
- 37 Rust tests, 95 frontend tests — all passing
