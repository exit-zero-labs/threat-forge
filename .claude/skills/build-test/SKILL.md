---
name: build-test
description: Run ThreatForge targeted checks and the canonical local verification gate
disable-model-invocation: true
---

# Build and test

Use the smallest relevant command while iterating. Before PR handoff run:

```bash
npm run ci:local
```

Add as required:

```bash
npm run test:e2e
npm run build:web
npm run ci:docker
npm run ci:docker:build
```

Run `cargo clippy` after Rust changes and `npx biome check --write .` after TypeScript or
JavaScript changes. Stop at the first failure, diagnose the root cause, fix it, and resume the
same gate rather than skipping the check.

Report the command, scope, result, and any pre-existing warning separately.
