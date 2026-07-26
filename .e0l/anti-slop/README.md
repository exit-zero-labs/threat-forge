<!-- @format -->

# anti-slop

The deterministic copy detector shared across Exit Zero Labs repos. Dependency-free TypeScript, runnable with Bun without an install step.

| File | Purpose |
| --- | --- |
| `core.ts` | The engine: phrase list, patterns, scoring, `detectSlop` / `isSlopClean` |
| `core.test.ts` | Behaviour, false-positive guards, and a determinism check |
| `scan.ts` | CLI over a list of files, with the exemption allowlist |

```bash
bun Tooling/anti-slop/scan.ts docs/**/*.md   # scan
bun test Tooling/anti-slop/core.test.ts      # test
```

The doctrine this enforces is `docs/first-principles/anti-slop/`; how to extend it per repo is in that directory's `detector.md`.

Domain vocabulary does not belong in `core.ts`. Pass it through `SlopOptions` from the consuming repo.
