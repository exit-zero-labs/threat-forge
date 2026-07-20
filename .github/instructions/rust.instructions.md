---
applyTo: "src-tauri/**/*.rs"
---

# Rust

Follow `AGENTS.md`; this file adds Rust-specific rules.

- Use typed domain errors internally and map them to safe `Result<T, String>` values only at the
  Tauri command boundary.
- Do not use `unwrap`, `expect`, or `unsafe` in production paths without a documented invariant
  and proof that the failure mode is impossible.
- Preserve serde and schema-version compatibility; new `.thf` fields remain optional.
- Separate asynchronous orchestration from blocking filesystem, crypto, and CPU-heavy work.
- Keep tests deterministic and colocate unit tests with their modules.
- Run rustfmt, Clippy with warnings denied, and targeted Cargo tests after Rust changes.
