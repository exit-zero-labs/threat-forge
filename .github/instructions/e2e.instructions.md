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
- Console errors, unhandled rejections, and failed network requests fail the test by default
  (`e2e/support/base.ts`); extend the allowlist narrowly with
  `test.use({ allowedBrowserEvents: [{ channel, pattern }] })` rather than disabling the check or
  allowing matching text on unrelated channels.
- Reuse the shared helpers in `e2e/support/interactions.ts` and the versioned fixtures in
  `e2e/support/workspace-fixtures.ts` instead of duplicating a create/open/switch/drag/connect
  pattern already covered there; add a new one there, not inline in a spec.
