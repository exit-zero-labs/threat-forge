# Code Style

## TypeScript
- Strict mode. No `any` — use `unknown` and narrow with type guards.
- Named exports only. No default exports.
- `kebab-case.ts` for files. `PascalCase` for components. `camelCase` for functions/variables.
- Destructure imports: `import { invoke } from "@tauri-apps/api/core"` not `import * as api`.
- Use `type` imports for type-only imports: `import type { ThreatModel } from "../types"`.
- Prefer `interface` for object shapes, `type` for unions/intersections.
- No barrel files (`index.ts` re-exports). Import directly from source.
- Use `const` by default. Only `let` when reassignment is needed. Never `var`.

## Rust
- Follow Rust standard naming: `snake_case` for functions/variables, `PascalCase` for types, `SCREAMING_SNAKE` for constants.
- Use `thiserror` for custom error types. No string-based error handling.
- Derive `Serialize`, `Deserialize` on all types that cross the IPC boundary.
- Use `#[tauri::command]` for all IPC handlers. Return `Result<T, String>`.
- Keep Tauri command functions thin — delegate logic to separate modules.
- Prefer `.map()`, `.and_then()`, `.unwrap_or_default()` over match blocks for simple transformations.
- Use `clippy::pedantic` level linting. Fix all warnings.

## Shared
- No magic numbers or strings. Extract to named constants.
- Prefer early returns over deeply nested conditionals.
- Functions should do one thing. If a function name needs "and", split it.
