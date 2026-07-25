---
applyTo: "e2e/**,playwright.config.*"
---

# End-to-end tests

Follow `AGENTS.md`; this file adds Playwright rules.

- Exercise user-visible workflows and real persistence, adapter, or IPC boundaries.
- Use stable semantic selectors; do not use arbitrary sleeps or timing-dependent assertions.
- Isolate files, storage, tabs, accounts, and browser state between tests.
- Preserve trace, screenshot, video, console, accessibility, and DOM-snapshot artifacts on failure
  (a bounded console transcript and a privacy-reduced accessibility projection are attached
  automatically by `e2e/support/base.ts` on any non-passing **page-backed** attempt; browser-free
  support tests have no page fixture and use manifest project-default context instead. Do not
  hand-roll a second console listener or axe call to get the same evidence).
- Make platform-specific expectations explicit and keep shared behavior cross-platform.
- Do not mock or bypass the behavior the test claims to prove.
- No fixture or helper may ever seed a real provider API key, credential, or production secret
  into the browser context under test — only fixed, obviously-fake placeholders (e.g. the existing
  `sk-ant-e2e-not-a-real-key` convention). This matters more as more browser context becomes
  observable through retained CI evidence (console transcripts, accessibility projections, DOM
  snapshots).
- Console errors, unhandled rejections, and failed network requests fail the test by default
  (`e2e/support/base.ts`); extend the allowlist narrowly with
  `test.use({ allowedBrowserEvents: [{ channel, pattern }] })` rather than disabling the check or
  allowing matching text on unrelated channels.
- Reuse the shared helpers in `e2e/support/interactions.ts` and the versioned fixtures in
  `e2e/support/workspace-fixtures.ts` instead of duplicating a create/open/switch/drag/connect
  pattern already covered there; add a new one there, not inline in a spec.
- Reuse `e2e/support/accessibility.ts`'s `scanAccessibility`/`assertNoSeriousAccessibilityViolations`
  for any accessibility assertion instead of constructing a new `AxeBuilder` inline; add exceptions
  only as exact `{ ruleId, target }` node entries in `KNOWN_ACCESSIBILITY_EXCEPTIONS`, tied to a
  tracking issue — never allowlist a whole rule ID.
