---
applyTo: "src/**/*.{test,spec}.{ts,tsx},src-tauri/**/*.rs"
---

# Tests

Follow `AGENTS.md`; this file adds unit and integration test rules.

- Test observable behavior and contracts rather than implementation details.
- Add a discriminating regression test before fixing a reproducible bug.
- Do not prove only a mock, write tautologies, weaken assertions, or bless giant snapshots.
- Mock only external boundaries and keep clocks, randomness, stores, and filesystem state
  deterministic.
- Name tests for the expected behavior and meaningful condition.
- Preserve coverage through substantive assertions rather than exclusions or generated noise.
- Every `.thf` schema change needs round-trip, old-file, and reference-integrity coverage.
