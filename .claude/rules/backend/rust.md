---
paths:
  - "src-tauri/**/*.rs"
---

# Rust / Tauri Backend Rules

## Project Structure
- Tauri commands in `src-tauri/src/commands/` — one module per domain.
- Data models (serde types) in `src-tauri/src/models/`.
- STRIDE engine logic in `src-tauri/src/stride/`.
- File I/O operations in `src-tauri/src/file_io/`.
- Register all commands in `lib.rs` via `.invoke_handler(tauri::generate_handler![...])`.

## Tauri Commands
- Every command returns `Result<T, String>` where `T` is serializable.
- Use `#[tauri::command]` attribute. Keep handlers thin — delegate to domain functions.
- Convert internal errors to user-friendly strings at the command boundary: `.map_err(|e| e.to_string())`.
- Commands that access the filesystem should use Tauri's path resolver, not hardcoded paths.

## Serialization
- Use `serde` + `serde_yaml` for YAML. `serde_json` for layout files and IPC.
- Derive `Serialize`, `Deserialize`, `Clone`, `Debug` on all model types.
- Use `#[serde(rename_all = "snake_case")]` for YAML field names.
- Use `#[serde(deny_unknown_fields)]` on top-level types to catch schema mismatches.

## Error Handling
- Define custom error types with `thiserror`. No `.unwrap()` in production code.
- Use `anyhow` for application-level errors that don't need typed variants.
- `unwrap()` is acceptable only in tests and `build.rs`.

## YAML Schema
- The schema is versioned. Always check `version` field on load.
- Validate schema integrity after deserialization (cross-reference element IDs, check flow references).
- Preserve unknown YAML fields in memory to avoid data loss on round-trip (future-proofing).

## Performance
- File I/O operations should be async where Tauri supports it.
- STRIDE engine should process incrementally — re-analyze only changed elements, not the full model.
- Target cold start < 2 seconds, file save < 500ms, STRIDE analysis < 1 second for 100 elements.
