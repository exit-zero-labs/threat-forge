# Testing Conventions

## General
- Write tests for all new functions and Tauri commands.
- Prefer running single test files for speed: `npx vitest run src/path/test.test.ts`.
- Use descriptive test names: `it("saves threat model to YAML with valid schema")`.
- Follow AAA pattern: Arrange, Act, Assert.
- Test behavior, not implementation details. Don't test private functions directly.

## Frontend (Vitest + React Testing Library)
- Test files live next to source: `component-name.test.tsx` beside `component-name.tsx`.
- Use `@testing-library/react` for component tests. Query by role/label, not class/id.
- Mock Tauri IPC calls with `vi.mock("@tauri-apps/api/core")`.
- Test Zustand stores in isolation by creating fresh store instances per test.

## Rust (cargo test)
- Unit tests in the same file as the module, inside `#[cfg(test)] mod tests`.
- Integration tests in `src-tauri/tests/`.
- Test YAML serialization round-trips: serialize -> deserialize -> assert equality.
- Test STRIDE engine rules with known inputs and expected threat outputs.
- Use `assert_eq!` with descriptive messages: `assert_eq!(result, expected, "STRIDE should flag tampering for data stores")`.

## E2E (Playwright)
- E2E tests for critical paths only: create model -> draw DFD -> generate threats -> save -> reopen.
- Keep E2E tests fast and stable. No flaky selectors.
- Run E2E in CI on all three platforms (macOS, Windows, Linux).

## What NOT to Test
- Don't test Tauri framework internals or ReactFlow internals.
- Don't test trivial getters/setters.
- Don't write tests for template/scaffold code that will be replaced.
