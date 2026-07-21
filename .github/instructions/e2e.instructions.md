---
applyTo: "e2e/**,playwright.config.*"
---

# End-to-end tests

Follow `AGENTS.md`; this file adds Playwright rules.

- Exercise user-visible workflows and real persistence, adapter, or IPC boundaries.
- Use stable semantic selectors; do not use arbitrary sleeps or timing-dependent assertions.
- Isolate files, storage, tabs, accounts, and browser state between tests.
- Preserve trace, screenshot, video, and console artifacts on failure.
- Make platform-specific expectations explicit and keep shared behavior cross-platform.
- Do not mock or bypass the behavior the test claims to prove.
