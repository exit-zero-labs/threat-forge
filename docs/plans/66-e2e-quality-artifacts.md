# Issue 66 — Standardize screenshot, trace, accessibility, and quality artifacts

## Objective

Every non-passing E2E attempt retains a consistent diagnostic set: screenshot, trace, video,
bounded console transcript, bounded accessibility evidence, and DOM snapshot. Every uploaded CI
bundle — and every local evidence set after the documented manifest command — contains one
machine-readable manifest (`test-results/artifact-manifest.json`) linking attachments to scenario,
step, platform, viewport, and commit without file-name guessing. A documented, measurable rubric
distinguishes what automated checks prove (contrast, actionable accessibility violations,
no-overflow responsiveness) from what still needs a human/agent's eyes (hierarchy, alignment,
overlap, clipping), and stable macOS-only visual baselines have an explicit
ownership/update/review process. No fixture, helper, or attachment exposes a real secret or
document content beyond what the product already renders.

## Issue contract

- **Issue:** `#66`
- **Parent initiative:** `#45` (Phase 4 — Agent-Driven E2E and Visual Quality, XL epic; this issue
  implements the "Capture screenshots, traces, videos, console errors, accessibility results, and
  DOM snapshots. Generate a single artifact manifest..." and "Visual Review" line items only — see
  `docs/plans/roadmap.md`'s Phase 4 section)
- **Type:** `Task`
- **Size:** `M`
- **Priority:** `P0`
- **Autonomy:** `Automatable`
- **Dependencies:** `#65` (Done — merged; built `e2e/support/{base,interactions,workspace-fixtures}.ts`
  and the `test.step` naming seam this plan keys off, see D-references below), `#183` (Done —
  merged; the flaky-but-green artifact-retention fix already lives in `.github/workflows/ci.yml`,
  reused unchanged by this plan)
- **Non-goals:**
  - `#67`'s documented agent-workflow prose and one-command launch experience (this plan leaves a
    stable seam only — see Concurrent-work seams).
  - Fixing the 3 pre-existing accessibility defect families this plan's own probing discovers
    (D5) — three narrowly scoped follow-up issues, filed and triaged in step 4, own the fixes.
  - A macOS CI runner for E2E or visual regression (D8) — baselines stay a local-macOS safety net,
    unchanged from `#65`/`#111`'s existing convention.
  - General geometry-based overlap/clipping/alignment detection (D10) — rubric items in that
    category stay owner-validated from retained screenshots, not a new speculative utility.
  - Any `.thf` schema change, desktop/Tauri E2E work (`#68`), new Playwright browser projects, or
    worker-parallelism changes.
  - An LLM-as-judge implementation of `docs/quality/ai-output-quality.md`'s existing "Visual and
    accessibility quality" review lens — that lens scores AI-*generated* visual/design assistance
    output and is explicitly future/Phase-4-adjacent work per that doc's own closing line; this
    plan produces evidence a future such judge could consume, but does not build the judge.

## Current behavior and evidence

Re-derived directly from source at `main` `f2ba12d` (post `#65`/`#183`/`#213`/`#215`, all merged);
none of the following is copied from stale issue-comment prose.

### Reporter, trace, screenshot, video configuration (`playwright.config.ts`)

```
reporter: [["html", {open: "never"}], ["list"], ["json", {outputFile: "test-results/results.json"}]]
use: { trace: "on-first-retry", screenshot: "only-on-failure", video: "retain-on-failure" }
retries: process.env.CI ? 2 : 0
```

**Verified bug, empirically reproduced (deleted probe, `e2e/_tmp-probe.spec.ts`):** a first-attempt
failure with `retries: 0` (every local run, and any CI run whose first attempt passes-after-retry is
irrelevant here since this is about the *first* attempt) produces a screenshot and a video but
**no trace** — `on-first-retry` only records a trace during a retry attempt, so a single-attempt
failure has nothing to open in `npx playwright show-trace`. `screenshot: "only-on-failure"` and
`video: "retain-on-failure"` do not have this gap; only `trace` does. This is the first concrete
fix this plan makes (step 1).

### The DOM snapshot acceptance criterion is already met, for free

Confirmed by reading `node_modules/playwright/lib/index.js` (`didFinishTest`, ~line 668): whenever
`testInfo.errors.length > 0`, Playwright itself writes `error-context.md` — an ARIA/page-snapshot
markdown captured before teardown — and attaches it as `{ name: "error-context", contentType:
"text/markdown" }`. This fires on any assertion failure, timeout, or (confirmed by tracing the
call order) a fixture's own post-`use()` failure throw, since that throw is recorded as a
`testInfo` error before this hook runs. **No new code is needed for DOM-snapshot capture** — this
plan only needs to document it exists and is discoverable via the manifest.

### JSON report shape available to a manifest generator

`node_modules/playwright/types/testReporter.d.ts` (Playwright 1.61.1, installed version) gives:

- `JSONReportTest`: `expectedStatus`, `status` (`skipped|expected|unexpected|flaky`), `projectName`,
  `results: JSONReportTestResult[]`.
- `JSONReportTestResult`: `status`, `duration`, `retry`, `startTime`, `steps?:
  JSONReportTestStep[]`, `attachments: { name, path?, body?, contentType }[]`.
- `JSONReportTestStep`: `title`, `duration`, `error`, `steps?` (recursive).

There is **no platform, viewport, or commit field** anywhere in this shape — a manifest script must
compute these itself (D6). `scripts/summarize-playwright.mjs` already parses this exact report for
a different purpose (CI run-summary Markdown + the `has-flaky` gate) and establishes the pattern
this plan's new script mirrors: pure exported functions, `isRecord`/`toArray`/`toText` guards, a
guarded `main()`, and fail-open behavior on a missing/malformed report (never turns the job red by
itself). `scripts/summarize-playwright.test.mjs` establishes the matching vitest convention
(`@vitest-environment node` pragma, synthetic report fixtures, `spawnSync` CLI-invocation tests).

### Attachment name/contentType conventions, confirmed by source (`node_modules/playwright/lib/`)

| Producer | `name` | `contentType` |
|---|---|---|
| Trace (`worker/workerProcessEntry.js:706`) | `"trace"` | `application/zip` |
| Video (`index.js:403`) | `"video"` | `video/webm` |
| Screenshot (`SnapshotRecorder`, `index.js:606`) | `"screenshot"` (+ suffix if multiple) | `image/png` |
| DOM snapshot (`index.js:678`) | `"error-context"` | `text/markdown` |
| `toHaveScreenshot()` diff triad (`matchers/expect.js:12059-12097`) | `<baseline-name>-expected` / `-actual` / `-diff` | image mime (matches baseline) |
| #66 runtime context | `"artifact-context"` | `application/json` |
| #66 console transcript | `"console-log"` | `text/plain` |
| #66 accessibility projection | `"accessibility"` | `application/json` |
| #66 diagnostic capture error | `"diagnostic-capture-error"` | `text/plain` |

This table is the exact classifier this plan's manifest script uses (D6) — no name pattern here is
guessed.

### `#65`'s naming seam (`docs/plans/65-browser-workspace-fixtures.md`, D7)

Every fixture-seeding function wraps its body in `` test.step(`seed:<name>@v${WORKSPACE_FIXTURE_VERSION}`, ...) ``
and every `interactions.ts` helper wraps its own body in `` test.step(`<verb>: <summary>`, ...) ``.
`e2e/support/README.md`'s "Conventions for future issues" section states this explicitly as the
seam `#66` should key off, and that `#65` builds no manifest itself. This plan's manifest classifies
each `JSONReportTestStep.title` as `fixture` (prefix `seed:`) or `interaction` (everything else),
purely by string prefix — no new step metadata field is needed in `#65`'s code.

### `e2e/support/base.ts` — exact current failure-policy fixture (full file read)

`failureAwareTest`'s `page` fixture: attaches `console`/`pageerror`/`requestfailed` listeners,
calls `await use(page)`, removes listeners, then `if (violations.length > 0) throw new
Error(formatViolations(violations))`. Two facts drive this plan's console-log/accessibility
teardown design (D3/D4):

1. **Only `console.error`/`console.warning` are observed today** — `log`/`info`/`debug` messages
   are invisible to this fixture entirely. A full chronological console transcript needs a new,
   separate listener.
2. **`testInfo.status` reflects the test *body's* outcome, not this fixture's own about-to-be-thrown
   violation.** Playwright sets `testInfo.status` when the test function itself returns/throws,
   before any fixture teardown runs; this fixture's own violations check runs *after* that, inside
   its own teardown. Reading `testInfo.status !== "passed"` at the point just before the violations
   check therefore correctly reflects a normal assertion failure, but is still `"passed"` for a
   test whose *only* problem is a console violation this fixture is about to throw for. The correct
   capture condition is `testInfo.status !== "passed" || violations.length > 0` (D3) — an OR, not
   a single status read. `testInfo.status !== testInfo.expectedStatus` (a documented Playwright
   idiom for other purposes) is the wrong condition here for the same reason plus one more: it does
   not yet reflect this fixture's pending throw either, and conflates "unexpected" with "any kind of
   failure" when `test.fail()`-marked expected-failure tests are involved.

### Expected-failure tests already get diagnostics without spamming green runs — confirmed, not assumed

`e2e/workspace-fixtures.spec.ts` (from `#65`) contains `test.fail()`-marked proof tests for the
failure policy. These already receive a screenshot/video/trace today under Playwright's built-in
`only-on-failure`/`retain-on-failure` semantics (the *attempt* fails even though the *test* is
marked as an expected failure and the job stays green) — and this has never caused CI-upload spam,
because **the upload decision is a separate, job-level gate** (`if: failure() ||
steps.summarize.outputs['has-flaky'] == 'true'`, added by `#183`) that reads the *outer* test
status (`expected`/`unexpected`/`flaky`/`skipped`), not per-attempt attachment presence. A
`test.fail()` test's outer status is `expected`, so it never trips `failure()` and never sets
`has-flaky`. This structurally resolves the task's "preserve expected-failure tests without
causing every green run to upload diagnostics" requirement already — this plan's new
console-log/accessibility attachments just need to not disturb it, by using the exact same
per-attempt "not passed" condition screenshot/video already use (not a new, different condition).

### Accessibility: no existing mechanism, dependency chosen and verified

No `axe-core`/accessibility-testing package exists in `package.json`/`package-lock.json` today.
`@axe-core/playwright`'s real published `package.json`/`README.md` (fetched via GitHub raw, since
this sandbox cannot reach `registry.npmjs.org` but can reach `raw.githubusercontent.com` — see
Cross-cutting/security below) confirms: current version `4.12.1`, license **MPL-2.0** (not in
`.github/workflows/dependency-review.yml`'s license deny-list: AGPL/GPL/LGPL/EUPL variants only),
peer dependency `playwright-core >= 1.0.0` (satisfied by installed `1.61.1`), API surface `import {
AxeBuilder } from "@axe-core/playwright"`, `new AxeBuilder({ page }).withTags([...]).analyze()`,
`.include()`/`.exclude()`/`.withRules()`/`.disableRules()`/`.setLegacyMode()`. It is a devDependency
only — never imported from `src/`.

### Pre-existing real accessibility violations, found by empirical probing (deleted probe,
`e2e/_tmp-axe-probe.spec.ts`, real `axe.min.js` v4.10.2 from jsdelivr against the real dev server)

Three real, currently-shipping violations, at exactly these locations:

1. **`color-contrast` (serious)** — 4 nodes on the pre-model welcome/empty-canvas screen, using
   Tailwind `text-muted-foreground/60` and `/40` opacity utility classes for de-emphasized caption
   text. A deliberate low-emphasis design choice that happens to fail strict WCAG AA contrast by
   construction — a color-system change, not something this artifact-standardization issue should
   silently alter.
2. **`scrollable-region-focusable` (serious)** — the component palette's scrollable list `div`, in
   every document state. A likely easy, narrowly-scoped fix (`tabIndex={0}` + an `aria-label` on the
   scroll container) that is nonetheless a UI change outside this issue's scope.
3. **`aria-required-children` (critical)** — the document tab strip's `role="tablist"` container.
   Root-caused by direct source inspection (`src/components/layout/document-tab-strip.tsx:391` and
   `document-tab.tsx:118`): each tab is a plain, role-less wrapper `<div data-testid="document-tab-
   ...">` that is the **direct DOM child** of the `role="tablist"` element, and the actual
   `role="tab"` element is a **grandchild**, a sibling of the close/pin buttons *inside* that
   wrapper. `document-tab.tsx`'s own doc comment (and `docs/knowledge/architecture.md`'s D4 section)
   explains this structure is deliberate: a `tab` role makes its children presentational, so the
   close/pin buttons must be siblings, not descendants, of the `role="tab"` element, to keep them
   individually reachable. This is a real, considered accessibility design already; whether the
   *wrapping* div additionally trips `aria-required-children` as a genuine WCAG failure or as an
   axe-core limitation with this specific manual-activation APG pattern is exactly the kind of
   question this plan is not equipped to resolve without a maintainer/axe-core-issue-tracker-level
   investigation — so it is allowlisted with this evidence attached, not silently fixed or ignored.

These three violation families drive D5's exact rule/target exception design and step 4's
follow-up-issue instructions. No other state was found to introduce new violations in probing
(empty canvas, model-created empty canvas, realistic e-commerce template all scanned).

### `e2e/screenshot-templates.spec.ts` — wastes CI cycles today

Full file read: it writes raw `page.screenshot({ path: "screenshots/..." })` for the empty state
and all 6 templates, with **no `test.skip(!!process.env.CI, ...)` guard** (unlike
`canvas-visual.spec.ts`, which has one). `screenshots/` is gitignored
(`.gitignore:25`) and never referenced by any upload step — so CI spends real time producing 7
PNGs to a directory nothing ever reads. This plan migrates it to `testInfo.attach()`-based capture
(so the same files land in the manifest/HTML report and get uploaded on failure like everything
else) and adds the missing CI skip guard, matching `canvas-visual.spec.ts`'s existing convention.

### `e2e/canvas-visual.spec.ts` — baseline ownership, today

`test.skip(!!process.env.CI, ...)`; 5 committed baselines named `<test>-chromium-darwin.png` under
`e2e/canvas-visual.spec.ts-snapshots/`; `maxDiffPixelRatio: 0.01`. `docs/runbooks/diagnosing-ci-
failures.md`'s "Visual specs are skipped on CI" section already documents this is a macOS-only
local safety net and that two baselines were legitimately regenerated in `#136` "because closing
the mount race changed where second-and-later nodes land" — i.e., there is already an informal
precedent for "regenerate + review the diff, record why," but no *written* process. This plan
writes that process down (D8) without changing the skip/baseline mechanism itself.

### CI workflow — exact current `E2E Tests` job (`.github/workflows/ci.yml:149-184`)

```
npm ci → npx playwright install --with-deps chromium → npx playwright test
  → node scripts/summarize-playwright.mjs (id: summarize, if: always())
  → upload-artifact (if: failure() || steps.summarize.outputs['has-flaky'] == 'true',
                      path: playwright-report/ and test-results/, retention-days: 7)
```

`permissions: contents: read` (workflow-level, confirmed, unchanged elsewhere in the file). This
plan inserts exactly one new step between `summarize` and `upload-artifact` (D7); the upload's
`path`/`if`/`retention-days`/permissions are all unchanged, since `test-results/` is already
uploaded wholesale and the new manifest file lives inside it.

### Existing gate coverage — no new wiring needed

`biome.json`'s `files.includes` already covers `scripts/*.mjs` and `e2e/**/*.{ts,tsx,js,mjs}`.
`vitest.config.ts`'s `test.include` already covers `scripts/**/*.test.mjs`. `tsconfig.e2e.json`'s
`include` already covers `e2e/**/*.{ts,tsx,js,mjs}` and `playwright.config.ts`. `scripts/*.mjs` is
**not** covered by any `tsc` project (confirmed: root `tsconfig.json`'s `include` is only `"src"`)
— `summarize-playwright.mjs` is Biome-linted and vitest-tested but not `tsc`-checked, and the new
manifest script follows the identical, already-established pattern. No `tsconfig`/`biome.json`
edits are needed anywhere in this plan.

### Security baseline already holds

`e2e/fixtures.ts`'s `seedAnthropicApiKey` (used by AI-harness specs) seeds a fixed placeholder
`"sk-ant-e2e-not-a-real-key"`, confirmed by source read — no fixture seeds a real provider key, and
no spec makes a real network call to an AI provider. This plan's new console-log/accessibility/DOM
capture surfaces *more* of what happens in the browser context, so this invariant needs to be
stated explicitly, permanently, in `e2e.instructions.md` rather than left implicit (D12).

## Design decisions

### D1 — Trace mode is a bug fix, not a new capability

Change `playwright.config.ts`'s `use.trace` from `"on-first-retry"` to `"retain-on-failure"`.
Per Playwright's documented semantics this records a trace for every attempt and keeps it only if
that attempt did not pass — the same shape `screenshot: "only-on-failure"` and `video:
"retain-on-failure"` already use, and empirically confirmed (deleted probe) to close the exact gap
found above. This is a one-line change with no other config field touched.

### D2 — DOM snapshot needs no new code

Already covered (see evidence above). This plan's only obligation here is documentation: name
`error-context.md`/`"error-context"` explicitly in the manifest's classifier table and in
`e2e.instructions.md`/`support/README.md`, so a reader does not go looking for a DOM-snapshot
feature that does not need to exist.

### D3 — Console-log capture: what, where, bounded how

Extend `e2e/support/base.ts`'s existing `page` fixture (not a new fixture — the existing one
already owns all page-level listener wiring) to also capture **every** console message (`log`,
`info`, `debug`, `warning`, `error` — the existing violation-policy listener stays separate and
unchanged) as `{ type, text, location }`. Collection is bounded as messages arrive: truncate each
message/location to the remaining character budget, retain only the newest **300 entries /
20,000 characters**, evict oldest entries while either bound is exceeded, and increment a
`droppedEntries` counter. A single huge message therefore cannot allocate an unbounded transcript,
and the rendered first line states `… N earlier entries truncated` when anything was dropped.
At teardown time, after `await use(page)` returns and listeners are removed, but **before** the
existing `if (violations.length > 0) throw ...` line:

1. Write bounded JSON `{ schemaVersion: 1, viewport: page.viewportSize() }` to
   `testInfo.outputPath("artifact-context.json")`, then attach that file by **path** as
   `"artifact-context"`. This tiny attachment is the authoritative per-attempt viewport source,
   including tests that call `page.setViewportSize`; failure to write/attach it is a real
   manifest-contract failure and may fail the test.
2. Compute `shouldCapture = testInfo.status !== "passed" || violations.length > 0` (the condition
   derived above — not `testInfo.expectedStatus`, not a check placed after the throw, since code
   after a thrown line never runs).
3. If `shouldCapture`, write the already-bounded transcript to
   `testInfo.outputPath("console-log.txt")` and attach it by path as `"console-log"`
   (`text/plain`); rendered lines are `[<type>] <text> (<url>:<line>:<column>)`, with query/fragment
   removed from the location URL before capture.
4. If `shouldCapture`, also run the best-effort accessibility scan (D4, tier 1), write its bounded,
   privacy-reduced JSON projection to `testInfo.outputPath("accessibility.json")`, and attach it by
   path — never attach axe's full result object.
5. Diagnostic capture must not mask the real test failure, but it must not fail silently either.
   Catch console/accessibility capture failures into a bounded `diagnosticErrors` list of
   `{ stage, message }` (message capped at 2,000 characters, no stack), write it to
   `testInfo.outputPath("diagnostic-capture-error.txt")`, and attach it by path as
   `"diagnostic-capture-error"` (`text/plain`) before the existing violation throw. A scan timeout
   records `"accessibility scan timed out after 5000ms"`. Only failure of this final write/
   attachment itself may fall back to the fixed message
   `console.error("Failed to attach E2E diagnostic capture errors")`, because no further attachment
   path exists; do not print the raw secondary error, and keep the original test outcome
   authoritative.

### D4 — Accessibility: dependency, two-tier design, and the correct capture condition

**Dependency:** add `@axe-core/playwright` (`^4.12.1`) as a devDependency (package.json's
alphabetical `devDependencies` block — sorts before `@biomejs/biome`). Never imported from `src/`.
Type safety: avoid guessing an internal exported type path; derive the result type as `type
AxeAnalyzeResult = Awaited<ReturnType<AxeBuilder["analyze"]>>` from the imported class itself.
After installation, rerun the three-state baseline with the installed 4.12.1 package before
committing exceptions; the planning probe used axe-core 4.10.2. If 4.12.1 reports a different
pre-existing set, record the exact installed-version evidence and create the corresponding
tracking issue(s) rather than silently broadening or weakening the gate.

**New module `e2e/support/accessibility.ts`**, exporting:

- `scanAccessibility(page: Page, opts?: { tags?: string[] }): Promise<AxeAnalyzeResult>` — thin
  wrapper: `new AxeBuilder({ page }).withTags(opts?.tags ?? ["wcag2a", "wcag2aa"]).analyze()`.
- `formatAccessibilityViolations(result: AxeAnalyzeResult): string` — mirrors `base.ts`'s
  `formatViolations` style: one line per violation naming rule id, impact, target selector(s), and
  `helpUrl`, so a failure or attachment is actionable without opening a second tool.
- `AccessibilityException = { ruleId: string; target: string; issue: number }` and
  `KNOWN_ACCESSIBILITY_EXCEPTIONS: readonly AccessibilityException[]` — one entry per confirmed
  pre-existing **node target**, using the exact normalized axe target selector
  (`node.target.join(" > ")`) from the installed 4.12.1 scan plus its tracking issue number.
  Rule-ID-only exceptions are forbidden: a new `color-contrast` node elsewhere must fail even
  while the known caption targets remain excepted.
- `assertNoSeriousAccessibilityViolations(page: Page, opts?: { tags?: string[]; allow?:
  readonly AccessibilityException[] }): Promise<void>` — wrapped in its own
  `test.step("assertNoSeriousAccessibility
  Violations: audit <current page>", ...)` for manifest/trace visibility (matching `interactions.ts`'s
  convention); calls `scanAccessibility`, filters to `impact === "serious" || impact === "critical"`,
  removes only nodes matching both exception `ruleId` and exact normalized `target`, preserves a
  violation when any unexcepted node remains, and throws
  `new Error(formatAccessibilityViolations(remaining))` if any remain. This is the actionable,
  opt-in, explicit assertion new specs (step 4) call directly.
- `projectAccessibilityEvidence(result)` — privacy-reduced attachment payload containing only
  engine version, URL with query/fragment stripped, timestamp, and at most 50 serious/critical
  violations with at most 20 nodes each. Each node carries only normalized target selectors,
  impact, help URL, and bounded failure summary; omit raw `html`, passes, incomplete, and
  inapplicable arrays. Include `truncatedViolations`/`truncatedNodes` counters. Serialize only this
  bounded projection for tier-1 attachments.

**Universal (tier 1) vs. explicit (tier 2):** the `base.ts` teardown addition (D3, step 3) is
tier 1 — best-effort, never blocking, attaches evidence whenever `shouldCapture` is true, on *every*
spec built on `failureAwareTest` for free. `assertNoSeriousAccessibilityViolations` is tier 2 —
explicit, opt-in, actionable-failure, called only from the new `e2e/accessibility-audit.spec.ts`
(step 4). Tier 1 never throws; tier 2 is the only thing that can fail a test on an accessibility
regression, and only against the documented, narrow allowlist.

**Bounded scan time:** wrap tier 1's best-effort scan in a defensive `Promise.race` against a
5000ms timeout (this repo's established "generous but bounded" local-timeout convention — matches
`addPaletteItem`'s and `waitForLocalSave`'s existing 15000ms pattern, chosen shorter here because
this runs in *every* failing attempt's teardown and must not meaningfully lengthen it). A timeout
does not cancel axe, so attach a rejection handler to the original scan promise before racing it;
this consumes a later page-close rejection and prevents an unhandled promise. Record the timeout
through `diagnostic-capture-error` as specified in D3 rather than silently degrading.

### D5 — Pre-existing violations: allowlist now, fix later, via a real tracked issue

Ship the accessibility gate (tier 2) **active from day one**, scoped past only the exact known
rule/target pairs above, rather than either leaving it fully disabled (which would ship no regression protection)
or leaving it on unscoped (which would make `e2e/accessibility-audit.spec.ts` red on day one for
pre-existing, already-known issues unrelated to this change). Step 4 requires the implementer to
file **three separately triaged GitHub issues**, because contrast tokens, palette focusability, and
the tablist/APG structure are independent fixes with different ownership and validation. Each issue
records its rule's exact installed-version targets, locations, source lines, and intended proof;
the tablist issue preserves the open question about genuine failure versus axe-core pattern
limitation. Record each issue number on only its matching exception entries. This plan cannot create
those issues itself (no GitHub-state mutation in a planning pass); filing and triaging them is a
required first implementation action, not an optional follow-up.

### D6 — Artifact manifest: schema, generator, and fail-open behavior

New script `scripts/build-artifact-manifest.mjs` (+ `scripts/build-artifact-manifest.test.mjs`,
`@vitest-environment node` pragma), mirroring `summarize-playwright.mjs`'s exact conventions:

**Reads:** `test-results/results.json` (already produced; same default path convention, overridable
by a CLI arg exactly like `summarize-playwright.mjs`'s `[report-path]`).

**Computes, once per run:**
- `commit`: `process.env.GITHUB_SHA` if set, else `git rev-parse HEAD` (`execFileSync`, trimmed);
  `dirty`: boolean from `git status --porcelain` being non-empty (local-run signal only —
  irrelevant/always-false in CI, kept for local-run honesty).
- `platform`: `os.platform()` (`"darwin" | "linux" | "win32"`, matching the existing baseline
  filename suffix convention `-chromium-darwin.png`).
- `defaultViewport`: `{ width: 1280, height: 720 }` for the sole current `chromium` project,
  confirmed from installed `devices["Desktop Chrome"]`. This is only a fallback for skipped/
  setup-failed attempts whose page fixture never attached runtime context.

**Walks** `suites[].specs[].tests[].results[]` (recursing through `suites[].suites[]` exactly like
`summarize-playwright.mjs`'s `collectOutcomes`) and for each test result, emits one manifest entry:

```
{
  scenario: "<describe-trail> > <spec title>",   // same join `summarize-playwright.mjs` uses
  location: "<file>:<line>",
  project: "<projectName>",
  status: "<expected|unexpected|flaky|skipped>",   // outer JSONReportTest.status
  attempt: { retry, status, durationMs, startTime },
  steps: [ { title, kind: "fixture"|"interaction"|"other", durationMs, failed: boolean } ],
    // flattened recursively in document order; `seed:` → fixture; only the canonical prefixes
    // `createDocument:`, `openDocument:`, `switchToTab:`, `clickElementByName:`,
    // `dragElementBy:`, `connectElements:`, `editElementName:`, `saveDocument:`,
    // `exportHtmlReport:`, `restoreWorkspace:`, `waitForLocalSave:`, `openDocuments:` → interaction;
    // Playwright hooks/actions/assertions and unknown user steps → other
  attachments: [ { name, kind, contentType, path, inline, byteLength } ],
    // kind classified by the exact name/contentType table in "Current behavior and evidence"
    // above: trace | video | screenshot | visual-baseline-diff | dom-snapshot | context |
    // console-log | accessibility | diagnostic-capture-error | other
  platform, viewport, viewportSource, artifactErrors, commit, dirty
}
```

`assertNoSeriousAccessibilityViolations: ...` is intentionally `other`: it is an assertion step,
not a user interaction, despite being authored by #66.

For each result, read/validate its `artifact-context` attachment and use that runtime viewport with
`viewportSource: "runtime-attachment"`. If context is absent, use the known current chromium
default with `viewportSource: "project-default"`; for any future unknown project emit
`viewport: null`, `viewportSource: "unavailable"` rather than inventing a size. The responsive
900×700 test must therefore manifest 900×700, not the project default. A present but malformed
or unreadable artifact-context records `viewport: null`, `viewportSource: "unavailable"`, and a
bounded entry-level `artifactErrors: [{ name: "artifact-context", reason }]`; it does not silently
use the project default and does not make the advisory manifest step red. Pure transform/
programming defects still throw. Tests cover absent, missing-file, permission/read failure,
malformed JSON, and valid dynamic context separately.
The transform accepts an injected `readAttachmentText(safeRelativePath)` callback; production
`main()` supplies a repository-rooted reader only after path normalization proves the file stays
inside the repository. Tests inject an in-memory reader and cover `../` traversal, POSIX absolute,
and Windows absolute paths. The script never reads a report-supplied external path.

Attachment paths are normalized to forward-slash, repository-relative paths. Never emit an
absolute runner/worktree path. If a reporter attachment has no path, preserve `path: null`; if a
path resolves outside the repository, emit only `{ path: null, externalPathOmitted: true }`. Tests
cover POSIX and Windows-style absolute inputs so a manifest stays portable and cannot leak host
directory names. For third-party/body-only attachments, set `inline: true` and compute
`byteLength` from the report's base64 body so readers know the evidence lives inside
`results.json`; #66's own context/console/accessibility/error/screenshot attachments are all
path-backed (`inline: false`).

Output: `test-results/artifact-manifest.json` with top-level
`{ schemaVersion: 1, generatedAt, commit, dirty, platform, defaultViewport, entries }`, so
consumers can reject unsupported future shapes and need not inspect each entry for constant fields.
Schema changes bump `schemaVersion`; additive entry fields do not.

**Fail-open, matching `summarize-playwright.mjs`'s exact philosophy:** if `results.json` is
missing/unparseable, write a valid v1 manifest with `entries: []` plus `{ error: "<reason>" }` and
**exit 0** — report-input absence/corruption is advisory because the Playwright step is the real
run verdict. Guard only report reading/parsing; a fault in the script's own transform is an
implementation defect and intentionally fails the manifest step. Report-listed attachment
read/parse failures are data-quality outcomes, not transform bugs, and are represented per entry
through `artifactErrors` as specified above.

**Not wired into `scripts/ci-local.sh`**, matching the existing precedent: `summarize-playwright.mjs`
is invoked directly by `.github/workflows/ci.yml`, not by `ci-local.sh`, because it is CI-run-summary
tooling. The new manifest script is the same kind of CI-only advisory tooling and follows suit — a
local contributor gets the manifest by running `node scripts/build-artifact-manifest.mjs` manually
after `npx playwright test`, documented in `support/README.md`.

### D7 — CI wiring: one new step, nothing else changes

Insert, between the existing `Summarize E2E results` step and `Upload Playwright report`:

```yaml
      - name: Build E2E artifact manifest
        if: always()
        run: node scripts/build-artifact-manifest.mjs
```

No change to the upload step's `path` (already includes `test-results/`, where the manifest lives),
`if` condition, `retention-days: 7`, or the job/workflow `permissions: contents: read`. No new
secrets, tokens, or external service calls.

### D8 — Screenshot baseline platform ownership, update, and review process

Written down (no mechanism change): the contributor/agent authoring a canvas-layout-affecting
change **owns** regenerating baselines on macOS locally before requesting review — CI never runs
these (Linux, `test.skip`). Update command (already documented, restated for completeness):
`npx playwright test e2e/canvas-visual.spec.ts --update-snapshots`, run on macOS. **Review**: a PR
that changes any file under `e2e/canvas-visual.spec.ts-snapshots/` must have its before/after PNGs
reviewed as images, not just accepted on green CI (CI cannot see these files change meaning at all,
since it never runs the spec) — GitHub's own pull-request "Files changed" view natively renders a
side-by-side/diff view for binary PNG changes, which is the primary, no-extra-tooling review
mechanism; a reviewer without macOS access can use this instead of checking out the branch. Record
the reason for a baseline change in the PR description, mirroring the existing `#136` precedent
noted in the runbook.

### D9 — `screenshot-templates.spec.ts` migration

Replace every hardcoded `page.screenshot({ path: "screenshots/..." })` call with a per-test
`const screenshotPath = testInfo.outputPath("<name>.png")`, capture to that path, then
`testInfo.attach("<name>", { path: screenshotPath, contentType: "image/png" })`, and add
`test.describe.configure` / a top-level `test.skip(!!process.env.CI, "template
screenshots are a manual visual-validation aid, not a CI-gated check")` guard consistent with
`canvas-visual.spec.ts`'s existing convention — closing the "wastes CI cycles" gap found above.
Attachment names: `"empty-state"` and `` `template-${templateId}` ``, so the manifest's
`screenshot` classification picks them up identically to any other screenshot attachment (no new
classifier rule needed — these are ordinary path-backed attachments with `contentType: "image/png"`,
matching the same table row as a plain failure screenshot). This spec continues to exist purely as a
local, manual visual-validation aid (its own header comment already says as much) — this plan does
not turn it into an assertion-bearing test, only fixes where its output goes and stops it running on
CI for nothing.

### D10 — Quality rubric: automated vs. owner-validated, honestly split

New doc `docs/quality/e2e-visual-accessibility-rubric.md` (placed alongside the two existing
sibling doctrine docs in `docs/quality/` — `agentic-slop.md`, `ai-output-quality.md` — following
that directory's existing convention rather than inventing a new location). Maps
`docs/plans/roadmap.md`'s Phase 4 "Visual Review" line item ("hierarchy, clipping, overlap,
contrast, alignment, and responsive states") to one of two honest categories per item, never
claiming automated pass/fail constitutes human visual validation:

| Rubric item | Category | Mechanism |
|---|---|---|
| Contrast | Automated | `assertNoSeriousAccessibilityViolations` (axe `color-contrast` rule, once the D5 allowlist is retired for a given surface) |
| Empty states | Automated | Existing `empty-states`-family specs + `e2e/accessibility-audit.spec.ts`'s empty-canvas case |
| Errors | Automated | `e2e/accessibility-audit.spec.ts`'s ephemeral-storage case (`seedEphemeralWorkspace`) exercises the visible “This session won't be saved” degraded/error state; malformed-file alerts are native transient dialogs and cannot be axe-scanned after dismissal |
| Responsive behavior | Partially automated | A new, narrow visibility/no-overflow check (not a full axe scan — see step 4) proves no element is clipped/hidden at a smaller viewport; it does not prove the layout still *looks* good |
| Hierarchy | Owner-validated | Evidenced by retained/attached screenshots; no automated heuristic |
| Alignment | Owner-validated | Same |
| Overlap | Owner-validated | Same — explicitly **not** given a new geometry-diffing utility (would be speculative, unproven, and out of proportion to this issue's scope) |
| Clipping | Owner-validated | Same |

This rubric doc cross-references `docs/quality/ai-output-quality.md`'s existing "Visual and
accessibility quality" review lens (`hierarchy, clipping, overlap, contrast, focus, and labels`)
once, to avoid duplicating that table: that lens scores **AI-generated** visual/design-assistance
*output* via a future LLM-judge (explicitly out of scope here, per Non-goals), whereas this rubric
scores **the product's own rendered UI** via retained E2E evidence — a future judge could consume
this rubric's automated checks and retained screenshots as *input* evidence, but building that
judge is not this issue.

### D11 — Retention, size, and time bounds (settled, not left open)

- **CI artifact retention:** unchanged at 7 days (`retention-days: 7`); no evidence in this plan's
  research that current bundle size is a problem, so no reduction is made (avoiding premature
  optimization). Flagged as a candidate follow-up only if evidence later shows otherwise.
- **Console-log attachment:** capped at 300 entries / 20,000 characters (D3).
- **Runtime context attachment:** fixed v1 object containing only width/height (D3).
- **Accessibility scan:** capped at 5000ms via `Promise.race` (D4).
- **Accessibility attachment:** privacy-reduced to serious/critical violations only, at most
  50 violations × 20 nodes with bounded selectors/failure summaries; raw HTML and axe pass/
  incomplete/inapplicable arrays are never attached (D4).
- **Manifest file size:** proportional to suite size (currently ~100 tests, each entry a few
  hundred bytes) and contains metadata/portable relative paths only, never attachment bodies or
  absolute host paths. Pure-transform tests enforce schema and path normalization.
- **No new upload path, secret, or artifact retention rule beyond what already exists.**

### D12 — Security/privacy invariant, made explicit and permanent

State directly in `e2e.instructions.md` (additive bullet, not a new file): *no fixture or helper
may ever seed a real provider API key, credential, or production secret into the browser context
under test — only fixed, obviously-fake placeholders (e.g. the existing `sk-ant-e2e-not-a-real-key`
convention).* This was already true in practice (confirmed above); it must be written down now
because this plan makes *more* of the browser context observable (bounded console transcript,
bounded accessibility evidence, DOM snapshot) — an invariant that was previously "true by absence of any
fixture doing otherwise" becomes "true by explicit, checked rule" once more of that context is
captured and uploaded as CI evidence for every non-passing run.

## Implementation steps

Each step is independently executable and no larger than XS/S.

### 1. Fix the trace-capture gap and update the runbook

- **Behavior:** every non-passing attempt (local or CI, first attempt or retry) now has a trace
  available, closing the gap in D1.
- **Files:** `playwright.config.ts` (one field); `docs/runbooks/diagnosing-ci-failures.md` (the
  line at `:196` that states `trace: "on-first-retry"`).
- **Implementation:** change `trace: "on-first-retry"` to `trace: "retain-on-failure"` in
  `playwright.config.ts`'s `use` block; update the runbook's matching sentence to say
  `retain-on-failure` and add one sentence noting a trace is now available for any non-passing
  attempt, not only a retried one.
- **Targeted verification:** re-run the exact deleted-probe pattern (a throwaway, `test.fail()`-free,
  deliberately-failing spec with `retries: 0`) and confirm `test-results/` now contains a `trace.zip`
  for that attempt; delete the throwaway spec afterward. Then `npx playwright test` (full suite,
  must otherwise pass unchanged).
- **Intent validation:** owner opens the newly-produced trace once via `npx playwright show-trace`
  and confirms it renders a real, inspectable timeline (not an empty/corrupt archive).

### 2. Add `@axe-core/playwright` and `e2e/support/accessibility.ts`

- **Behavior:** implements D4's scan, exact-target exception, bounded evidence, formatting, and
  assertion contracts.
- **Files:** `package.json`/`package-lock.json` (new devDependency); `e2e/support/accessibility.ts`
  (new).
- **Implementation:**
  1. `npm install --save-dev @axe-core/playwright` (pins `^4.12.1`; if this unexpectedly fails to
     resolve in the real CI/dev environment — unlike this sandbox, which has no registry access at
     all — that is a genuine blocker to report, not something to route around).
  2. Implement the exports exactly to D4's contract; import `AxeBuilder` as a value (not
     `import type`, since it is constructed) and derive `AxeAnalyzeResult` via `Awaited<ReturnType<
     AxeBuilder["analyze"]>>`.
  3. Rerun the baseline with installed 4.12.1 and implement exact rule/target
     `KNOWN_ACCESSIBILITY_EXCEPTIONS`, the bounded `projectAccessibilityEvidence`, and one
     placeholder issue field per independent violation family; step 4 replaces placeholders with
     three real issue numbers before handoff.
- **Targeted verification:** `npx tsc --noEmit -p tsconfig.e2e.json`; `npx biome check
  e2e/support/accessibility.ts`; focused tests for exact-target filtering, same-rule/new-target
  rejection, projection bounds/privacy, and formatted output; `npm run check:lockfile` (confirms
  the new lockfile entry resolves to `registry.npmjs.org` with integrity).
- **Intent validation:** owner confirms `formatAccessibilityViolations`'s output actually names rule
  id/impact/selector/help URL for a real violation (run `scanAccessibility` once against the
  pre-model welcome screen locally and eyeball the formatted string) — not just that the function
  type-checks.

### 3. Extend `e2e/support/base.ts`: console transcript and best-effort diagnostics

- **Behavior:** every spec built on `failureAwareTest` gets a tiny runtime viewport context
  attachment; any non-passing attempt additionally gets console/accessibility diagnostics, without
  changing the existing violation-policy behavior or error message.
- **Files:** `e2e/support/base.ts` (modified).
- **Implementation:**
  1. Import `writeFile` from `node:fs/promises`; add a second `console` listener (alongside, not
     replacing, the existing violation-policy one)
     that feeds `{ type: msg.type(), text: msg.text(), location: msg.location() }` through D3's
     bounded-at-collection accumulator.
  2. Accept `testInfo` as the fixture function's **third positional parameter**:
     `page: async ({ page, allowedBrowserEvents }, use, testInfo) => { ... }` — it is not a
     destructurable fixture dependency. After `await use(page)` and listener removal, write/attach
     D3's validated `"artifact-context"` from `page.viewportSize()`, then compute
     `shouldCapture = testInfo.status !== "passed" || violations.length > 0`.
  3. If `shouldCapture`: attach the rendered, bounded console transcript (D3) as `"console-log"`;
     run the tier-1 best-effort `scanAccessibility(page)` inside a `try/catch` bounded by the
     5000ms `Promise.race` (D4) and attach `projectAccessibilityEvidence(result)` as
     `"accessibility"` with `contentType: "application/json"` if it succeeds.
  4. Record transcript/scan/timeout errors in a bounded `"diagnostic-capture-error"` attachment
     rather than swallowing them. Both blocks execute **before** the existing
     `if (violations.length > 0) throw ...` line.
- **Targeted verification:** `npx playwright test` (full suite) must otherwise pass unchanged — this
  is the discriminating check that the addition is inert on green attempts (only the bounded
  artifact-context should appear on a passing test's report entry). Then re-run the deliberately-failing throwaway
  spec from step 1 and confirm it now carries `console-log` and (when the scan succeeds)
  `accessibility` attachments alongside the existing screenshot/video/trace/error-context. Force
  one scan failure and verify `diagnostic-capture-error` appears without replacing the original
  test failure. In the probe, emit 301 messages plus one oversized message/location URL containing
  query/fragment data; inspect the attachment to prove the dropped-entry marker, 300/20,000 bounds,
  and URL redaction rather than merely asserting an attachment exists.
- **Intent validation:** owner inspects one real failing attempt's HTML report entry and confirms
  the console-log attachment is legible plain text (not JSON-escaped noise) and the accessibility
  JSON, when present, is the real axe result shape (not an empty/error placeholder) for a page that
  genuinely has known violations.

### 4. New spec: `e2e/accessibility-audit.spec.ts`, and file the follow-up issues

- **Behavior:** explicit, tier-2 accessibility coverage across the states the rubric (D10) commits
  to automating; the accessibility gate is live and actionable from this point on.
- **Files:** `e2e/accessibility-audit.spec.ts` (new).
- **Implementation:**
  1. Import `test`/`expect` from `./fixtures` (which extends `failureAwareTest` and suppresses
     unrelated first-run overlays), so every result gets artifact-context and diagnostics. Reuse
     `e2e/support/workspace-fixtures.ts`'s existing seed functions — do not hand-roll new
     setup. Cover, each as its own test: (a) pre-model welcome screen (`page.goto` only, no seed —
     matches the exact state the `color-contrast`/`scrollable-region-focusable` probe found), (b)
     empty seeded document (`seedEmptyWorkspace`), (c) realistic template
     (`seedRealisticWorkspace`), and
     (d) the visible degraded-storage state from `seedEphemeralWorkspace` (“This session won't be
     saved”), each calling `assertNoSeriousAccessibilityViolations(page)` with the default
     `KNOWN_ACCESSIBILITY_EXCEPTIONS` allowlist. Do not use `seedMalformedWorkspace`: its error is a
     native transient dialog that is dismissed before axe can inspect a page state.
  2. Add one more test asserting the **responsive** rubric item (D10): resize the viewport to a
     smaller, still-supported **900×700** size (the existing minimum-width browser test and Tauri
     window config already establish that contract) and assert the key interactive surfaces
     (palette, canvas, tab strip) remain visible with no `scrollWidth > clientWidth` overflow on the
     document body — a lightweight visibility/no-overflow check, explicitly **not** a full axe scan
     (D10 — responsive is "partially automated").
  3. **Required, non-code action as part of this step:** file and triage the three independent
     GitHub issues from D5 (contrast tokens, palette scroll-region focusability, tablist structure),
     then update only the matching `KNOWN_ACCESSIBILITY_EXCEPTIONS` entries with each issue number.
- **Targeted verification:** `npx playwright test e2e/accessibility-audit.spec.ts` — every test must
  pass (proving the exact known rule/target nodes are excepted and no *new* node/regression exists
  in the states covered); then, as a discriminating check, temporarily remove one exact target
  exception and re-run to confirm that specific node fails with a legible rule/selector message —
  then restore it. Add a synthetic same-rule/different-target unit case so rule-ID-only filtering
  cannot regress.
- **Intent validation:** owner confirms all three follow-up issues were actually filed/triaged (not
just described in comments) and each body accurately reflects its own evidence; the tablist issue
must preserve the open axe-core-pattern question rather than asserting an unsupported conclusion.

### 5. Migrate `e2e/screenshot-templates.spec.ts`

- **Behavior:** implements D9 — attachment-based capture, CI-skipped, no more wasted CI cycles or
  gitignored dead output.
- **Files:** `e2e/screenshot-templates.spec.ts` (modified).
- **Implementation:** per D9 exactly — capture every screenshot to
  `testInfo.outputPath("<name>.png")` and attach it with `{ path, contentType: "image/png" }`; add
  the `test.skip(!!process.env.CI, ...)` guard; keep every existing wait/selector/template-list
  unchanged (no behavior change to what is captured or when, only where it goes).
- **Targeted verification:** locally (not CI, since it is now skipped there), `npx playwright test
  e2e/screenshot-templates.spec.ts` and confirm the HTML report shows 7 image attachments named
  `empty-state`/`template-<id>`; confirm `screenshots/` is no longer written to at all.
- **Intent validation:** owner opens one attached image from the HTML report and confirms it is a
  real, non-corrupt screenshot of the expected template state.

### 6. Document `e2e/canvas-visual.spec.ts`'s baseline process

- **Behavior:** implements D8 — no code change, only a header-comment addition documenting
  ownership/update/review.
- **Files:** `e2e/canvas-visual.spec.ts` (comment-only change).
- **Implementation:** extend the file's existing top-of-`describe` doc comment with the
  ownership/update/GitHub-image-diff-review sentences from D8, referencing this plan/issue.
- **Targeted verification:** `npx biome check e2e/canvas-visual.spec.ts` (comment-only, must still
  pass format check).
- **Intent validation:** owner confirms the added text matches actual current practice (macOS-only,
  `--update-snapshots`, PR-description reason) rather than describing an aspirational process that
  does not exist yet.

### 7. New script: `scripts/build-artifact-manifest.mjs` + tests

- **Behavior:** implements D6 in full.
- **Files:** `scripts/build-artifact-manifest.mjs` (new), `scripts/build-artifact-manifest.test.mjs`
  (new).
- **Implementation:** structure exactly as D6/`summarize-playwright.mjs` describe — deterministic
  exported transforms (`buildManifest(report, context, readAttachmentText)` where `context`
  carries `{ commit, dirty, platform, defaultViewport }` and tests inject an in-memory reader), a thin
  `main()` that gathers `context` from `os`/`process.env`/`git`, reads/parses `results.json` (fail-
  open per D6), supplies a containment-checked repository-rooted attachment reader, calls
  `buildManifest`, and writes `test-results/artifact-manifest.json`.
  `scripts/build-artifact-manifest.test.mjs` mirrors `summarize-playwright.test.mjs`'s exact
  conventions (`@vitest-environment node`, synthetic `JSONReport`-shaped fixtures, `spawnSync`
  CLI-invocation tests for the fail-open path on a missing/malformed report file).
  Define/test the exact interaction-prefix allowlist from D6; all Playwright-generated hooks,
  actions, assertions, and unknown user steps classify as `other`. Normalize attachment paths to
  portable repository-relative POSIX paths, omit external/absolute host paths, distinguish
  path-backed from base64-inline bodies, and parse the path-backed artifact-context viewport as D6
  specifies.
- **Targeted verification:** `npx vitest --run scripts/build-artifact-manifest.test.mjs`;
  `npx biome check scripts/build-artifact-manifest.mjs scripts/build-artifact-manifest.test.mjs`;
  then, against a real `test-results/results.json` produced by `npx playwright test
  e2e/workspace-fixtures.spec.ts`, run `node scripts/build-artifact-manifest.mjs` and confirm the
  output manifest's `steps[].kind` correctly classifies at least one `seed:*` step as `fixture` and
  at least one interaction step as `interaction`, and that `attachments[].kind` correctly classifies
  a real screenshot/trace/video from that run. Run the responsive audit too and confirm its entry
  reports runtime viewport 900×700 while ordinary entries report 1280×720.
- **Intent validation:** owner opens the generated manifest for one real failing test (reuse the
  step-1 throwaway probe once more, or a temporary one) and confirms they can locate every
  attachment for that scenario without opening the HTML report first — the manifest alone is
  sufficient to know what evidence exists and where.

### 8. Wire the manifest step into CI

- **Behavior:** implements D7 — the manifest is produced on every CI run, uploaded as part of the
  existing `test-results/` bundle whenever that bundle is uploaded.
- **Files:** `.github/workflows/ci.yml` (one new step).
- **Implementation:** insert the exact step from D7 between `Summarize E2E results` and `Upload
  Playwright report`; no other line in the job changes.
- **Targeted verification:** cannot be fully verified without a real CI run (this is workflow YAML,
  not locally executable in full) — validate with `node scripts/build-artifact-manifest.mjs` run
  manually in the same shell shape CI would use (from repo root, after a real `npx playwright test`
  run) to confirm the exact command in the new step succeeds; a final CI run on the PR is the actual
  gate.
- **Intent validation:** owner inspects one real CI run's uploaded `playwright-report` artifact
  (only produced on failure/flaky per the unchanged `#183` condition) and confirms
  `artifact-manifest.json` is present inside it.

### 9. Author `docs/quality/e2e-visual-accessibility-rubric.md`

- **Behavior:** implements D10 in full — the committed rubric document.
- **Files:** `docs/quality/e2e-visual-accessibility-rubric.md` (new).
- **Implementation:** write the doc with the exact table from D10, the explicit "does not claim
  automated pass/fail is human visual validation" framing (mirroring `AGENTS.md`'s verification-vs-
  validation distinction and `docs/quality/ai-output-quality.md`'s existing doctrine style), and the
  one-paragraph cross-reference to `ai-output-quality.md`'s "Visual and accessibility quality" lens
  (D10's last paragraph) so the two docs do not silently duplicate overlapping vocabulary.
- **Targeted verification:** `npx biome check docs/` is not applicable (Markdown is not Biome-linted
  per `biome.json`'s `includes`) — verify instead by grep: `grep -n "hierarchy\|clipping\|overlap\|
  contrast\|alignment\|responsive\|empty\|error" docs/quality/e2e-visual-accessibility-rubric.md`
  must show all 8 roadmap rubric items present.
- **Intent validation:** owner confirms the doc reads as an honest contract (an automated-vs-owner
  split a reviewer can actually apply), not aspirational or padded prose — the specific slop-
  auditor concern this plan's own Specialist review calls out below.

### 10. Additive documentation updates: `e2e.instructions.md`, `support/README.md`, the runbook

- **Behavior:** every new module/attachment/manifest/invariant introduced above is discoverable from
  the existing documentation surfaces, additively.
- **Files:** `.github/instructions/e2e.instructions.md`, `e2e/support/README.md`,
  `docs/runbooks/diagnosing-ci-failures.md` (all modified, all additive — no existing bullet/
  sentence removed or restructured).
- **Implementation:**
  1. `e2e.instructions.md`: add bullets for (a) the D12 no-real-secrets invariant, (b) reusing
     `e2e/support/accessibility.ts`'s helpers instead of hand-rolling a new axe call, (c) preserving
     console-log/accessibility/DOM-snapshot artifacts on failure (extending the existing "Preserve
     trace, screenshot, video, and console artifacts on failure" bullet's wording rather than adding
     a near-duplicate).
  2. `support/README.md`: add `accessibility.ts` to the "Modules" list (same style as the existing
     entries) and extend "Conventions for future issues" with the manifest's step/attachment
     classification rules (the exact tables from D6/"Current behavior and evidence" above), so a
     future contributor does not need to open this plan to know the naming contract.
  3. `docs/runbooks/diagnosing-ci-failures.md`: extend the existing "Artifacts for failed and flaky
     runs" section with a short paragraph naming the new `console-log`/`accessibility` attachments
     and `test-results/artifact-manifest.json`, and extend "Visual specs are skipped on CI" with the
     D8 review-process paragraph.
- **Targeted verification:** manual read-through diff for accuracy (documentation has no automated
  correctness check beyond Biome/markdown-lint, neither of which validates factual accuracy); confirm
  no existing sentence in any of the three files was deleted or contradicted (`git diff` review,
  additive-only).
- **Intent validation:** owner confirms a contributor who has never read this plan could, from these
  three files alone, find the new accessibility helper, understand the manifest's classification
  rules, and correctly diagnose a real CI failure using the updated runbook.

## Cross-cutting requirements

- **Security and privacy:** this issue deliberately widens the **test observability boundary** from
  browser context into retained CI artifacts. `@axe-core/playwright` remains devDependency-only and
  unreachable from production bundles, but D12's no-real-secrets invariant, query-stripped console
  locations, privacy-reduced axe projection, portable path normalization, and deterministic size/
  time bounds are required because more test-context data is uploaded than before. Fixtures remain
  synthetic and attachments contain no secret/header/body capture. Supply chain:
  `@axe-core/playwright` is MPL-2.0 (not present in the workflow's deny-list), devDependency-only,
  and the generic registry/integrity checker covers it without special-casing.
- **`.thf` compatibility:** not applicable — no schema, migration, or file-format change anywhere in
  this plan.
- **Browser and desktop:** browser-only (E2E is Chromium/Linux-CI + macOS-local-baseline, matching
  existing convention); no desktop/Tauri surface touched (`#68` remains the owner of any desktop E2E
  work).
- **AI safety:** not applicable — no AI-tool-loop, model-proposed-action, or approval/undo surface
  touched by this plan.
- **Accessibility and UX:** this issue *is* the accessibility/UX evidence-and-gate improvement.
  D4/D5 ship a real, active, narrowly-scoped gate against 3 honestly-documented pre-existing
  exceptions rather than either a fake always-green gate or an immediately-red one. The rubric
  (D10) is the accessibility/UX-quality contract itself.
- **Observability and evidence:** this issue standardizes exactly this — see D6/D7/D8/D9/D10 in
  full; the manifest is the single navigable index this whole issue exists to produce.

## Verification gate

Targeted, in order, while iterating (also listed per-step above):

```bash
npx tsc --noEmit -p tsconfig.e2e.json
npx biome check .
npx vitest --run scripts/build-artifact-manifest.test.mjs scripts/summarize-playwright.test.mjs
npx playwright test e2e/accessibility-audit.spec.ts
npx playwright test e2e/screenshot-templates.spec.ts
npx playwright test
node scripts/build-artifact-manifest.mjs
npm run check:lockfile
```

Final required gate:

```bash
npm run ci:local
```

Because this issue is entirely E2E-scoped, also run the real browser suite before handoff:

```bash
bash scripts/ci-local.sh --e2e
```

`canvas-visual.spec.ts` baselines must additionally be exercised once on macOS
(`npx playwright test e2e/canvas-visual.spec.ts`) before handoff, since CI never runs them (D8).
Rust is untouched; no `cargo` work beyond what `ci:local` runs.

## Owner validation

Deterministic checks cannot decide these plausible-but-wrong outcomes:

1. **The accessibility allowlist is honestly scoped, not a rubber stamp.** Confirm every exact
   installed-4.12.1 rule/target pair in `KNOWN_ACCESSIBILITY_EXCEPTIONS` matches evidence (no
   rule-wide exception or extra target was quietly added), and that all three tracking issues were
   actually filed/triaged with accurate content — not merely described in code comments.
2. **The retained artifacts actually help a human or agent diagnose a real failure**, not just that
   they exist. Reuse the short-lived deliberately-failing probe (never a committed production
   break), run the real suite, and confirm a reader — using only `artifact-manifest.json` and the
   attachments it points to, without opening the HTML report as a fallback — can identify what
   failed and why.
3. **The rubric's automated/owner-validated split (D10) is honest**, not a way to claim more
   automated coverage than actually exists. Spot-check one "owner-validated" item (e.g., overlap) by
   confirming no code anywhere in this plan silently attempts to auto-detect it.
4. **The console-log and accessibility attachments do not themselves become noise.** Open one real
   failing attempt's HTML report and confirm the new attachments are legible and add signal, rather
   than duplicating what the trace already shows more clearly.
5. **Expected-failure (`test.fail()`) tests still behave exactly as before** — confirm a green CI run
   containing only expected failures does not upload the diagnostic bundle (the `#183` gate must
   remain undisturbed), by inspecting one such real run's job summary/upload-step skip.
6. **The `aria-required-children` open question is recorded honestly** in the follow-up issue — not
   quietly asserted as either "definitely a real bug" or "definitely a false positive" without the
   supporting source-level evidence this plan gathered.
7. **Local/headed/CI parity actually holds** — run `npm run test:e2e:headed -- e2e/accessibility-
   audit.spec.ts` once and confirm the same pass/allowlist behavior as the headless/CI run.

## Specialist review

- [ ] PR reviewer
- [ ] Slop auditor — applies directly: confirm the rubric doc (step 9) does not overstate what
      automated checks prove; confirm no attachment/manifest field claims data it does not actually
      have (e.g., the hardcoded viewport is documented as project-count-dependent, not silently
      presented as universally correct); confirm the D9 migration did not weaken any existing
      screenshot-templates assertion (it has none today — confirm none was added under a false
      "now tested" pretense either).
- [ ] Security auditor — narrow applicability: confirm `@axe-core/playwright` is genuinely
      devDependency-only with no `src/` import path; confirm the new console-log/accessibility/DOM
      attachments never carry a real secret (D12) and stay size-bounded (D11); confirm the new CI
      step introduces no new permission, secret, or external network call beyond `npm ci`'s existing
      registry access.
- [ ] Threat-model expert — not applicable (no `.thf` schema, STRIDE, or threat-model-domain change
      anywhere in this plan).

## Concurrent-work seams

| File | Contending issue | Nature and mitigation |
|------|-------------------|------------------------|
| `.github/instructions/e2e.instructions.md` | `#67` (may also want to add bullets) | This plan's edits (step 10) are additive-only; `#67` should append its own bullets rather than restructure this file, per `#65`'s D7/README precedent. |
| `e2e/support/README.md` | `#67` (may add a "workflow" section) | This plan adds `accessibility.ts` to "Modules" and extends "Conventions for future issues" (step 10); `#67` owns a distinct workflow/one-command section, not a rewrite of this plan's additions. |
| `playwright.config.ts` | `#67` (documented to likely not touch this file, per `#65`'s own seam note) | This plan changes only `use.trace` (step 1); no reporter/project changes are made, leaving room for any future addition without conflict. |
| `e2e/support/workspace-fixtures.ts`, `e2e/support/interactions.ts` | `#67` (references these, does not modify per `#65`'s D7) | Unmodified by this plan; `e2e/accessibility-audit.spec.ts` (step 4) only *consumes* existing exports. |
| `e2e/support/base.ts` | none known | Sole owner of this plan's step 3; no other open issue is known to touch this file's fixture body concurrently. |

`#67`'s stable seam: this plan keeps every `workspace-fixtures.ts`/`interactions.ts` export, the
`test.step` naming convention, and `npx playwright test <file>` / `bash scripts/ci-local.sh --e2e`
/ `npm run test:e2e:headed` command surfaces completely unchanged — `#67`'s documented one-command
workflow can be written against exactly what exists after this plan lands, with no rework implied.

## Out of scope / future (do not implement here)

- `#67`'s documented agent-workflow prose and one-command launch experience.
- Fixing the 3 pre-existing accessibility violation families found by this plan's own probing —
  three narrowly-scoped follow-up issues (filed and triaged as a required action of step 4), not
  this plan.
- A macOS CI runner for E2E/visual regression — baselines remain a local-macOS safety net.
- General geometry-based overlap/clipping/alignment auto-detection.
- An LLM-as-judge implementation of `docs/quality/ai-output-quality.md`'s existing "Visual and
  accessibility quality" review lens.
- Any `.thf` schema change, desktop/Tauri E2E work (`#68`), new Playwright browser/device projects,
  or worker-parallelism changes.
- Reducing CI artifact retention below 7 days, or any per-artifact-kind retention differentiation —
  no evidence gathered here shows current bundle size is a problem.

## Replan log

Append changes; do not rewrite prior decisions.

| Date | Change | Evidence and reason |
|------|--------|----------------------|
| 2026-07-25 (initial plan) | Initial plan | Issue `#66`, parent `#45`, dependencies `#65`/`#183` (both Done/merged), dependent `#67` read via `gh issue view --comments`; Project 2 metadata (`Backlog`/`P0`/`M`) confirmed via `gh api graphql`. Current `main` re-derived directly at `f2ba12d` from source — full reads of `playwright.config.ts`, `.github/workflows/ci.yml`, `e2e/support/{base,interactions,workspace-fixtures}.ts`, `e2e/support/README.md`, `e2e/canvas-visual.spec.ts`, `e2e/screenshot-templates.spec.ts`, `e2e/fixtures.ts`, `.github/instructions/e2e.instructions.md`, `docs/runbooks/diagnosing-ci-failures.md`, `scripts/summarize-playwright.mjs`/`.test.mjs`, `scripts/ci-local.sh`, `package.json`, `biome.json`, `vitest.config.ts`, `tsconfig.e2e.json`/`tsconfig.json`, `.gitignore`, `docs/plans/65-browser-workspace-fixtures.md` and `docs/plans/roadmap.md`'s Phase 4 section, `docs/knowledge/architecture.md`'s tab-strip D4 section and the tab-strip's actual source (`document-tab-strip.tsx`, `document-tab.tsx`) — not copied from stale issue-comment prose. Every risk-bearing design choice was independently re-verified rather than assumed: the trace-mode gap was reproduced with a deleted throwaway probe spec against the real dev server (`retries: 0` first-attempt failure → screenshot+video but no trace); the DOM-snapshot acceptance criterion was confirmed already met by reading `node_modules/playwright/lib/index.js`'s `didFinishTest`; the JSON report's attachment-name/contentType conventions (trace/video/screenshot/error-context/baseline-diff-triad) were confirmed by grepping the installed Playwright 1.61.1 source rather than guessed; `@axe-core/playwright`'s real version/license/API were fetched from GitHub raw (this sandbox has no `registry.npmjs.org` access but does reach `raw.githubusercontent.com`/`cdn.jsdelivr.net`); 3 real, currently-shipping accessibility violations (`color-contrast`, `scrollable-region-focusable`, `aria-required-children`) were found by running real `axe-core` v4.10.2 (via CDN) against the real app in three states through a deleted throwaway probe spec, and the `aria-required-children` finding was further root-caused to an exact DOM structure in `document-tab-strip.tsx`/`document-tab.tsx`, cross-referenced against `docs/knowledge/architecture.md`'s existing, deliberate D4 tab-accessibility design rationale, rather than assumed to be either a definite bug or a definite false positive. The subtlety in `base.ts`'s correct capture-condition timing (`testInfo.status` is read before this fixture's own pending violation-throw, so `!== "passed" || violations.length > 0` is required, not a single status read or `expectedStatus` comparison) was derived from a full read of the fixture's control flow, not assumed. All temporary probe files (`e2e/_tmp-probe.spec.ts`, `e2e/_tmp-axe-probe.spec.ts`, downloaded `axe.min.js`, generated `test-results/`/`playwright-report/`) were deleted after use; no repository file was left modified by this planning pass other than this plan document itself. |
| 2026-07-25 (pre-commit review) | Bounded diagnostics and made accessibility exceptions exact | Review rejected four success-shaped assumptions before implementation: console messages are now bounded while collected (including single-message size), accessibility attachments are privacy-reduced/bounded and capture failures emit a named diagnostic instead of disappearing, and timed-out axe promises consume later rejection. Accessibility exceptions match exact installed-version rule/target nodes rather than whole rule IDs, so new same-rule regressions still fail; the three independent violation families require three separately triaged issues. The installed 4.12.1 baseline must be rerun because planning evidence used 4.10.2. Manifest steps use an explicit interaction-prefix allowlist and portable relative paths only. The automated error-state audit now uses the visible ephemeral-storage state rather than a dismissed native alert, and responsive coverage uses the existing 900×700 supported contract rather than leaving a viewport choice to the implementer. |
| 2026-07-25 (independent plan review) | Corrected Playwright fixture and attachment mechanics | Source-level review against installed Playwright 1.61.1 corrected two executable instructions: `testInfo` is the page fixture function's third positional parameter, not a destructurable dependency; and body attachments are pathless base64 in the JSON report. All #66-owned evidence now writes to `testInfo.outputPath(...)` and attaches by path, including template screenshots, so the manifest can locate files directly. Every attempt gets a path-backed artifact-context carrying its actual runtime viewport; the manifest parses it, reports 900×700 for the responsive case, and uses a labeled project-default fallback only when setup never produced context. Generic third-party body attachments remain explicit as inline/base64 metadata. |
| 2026-07-25 (plan convergence) | Defined attachment-read degradation without hiding script defects | A report-listed but unreadable/malformed artifact-context now yields per-entry `artifactErrors` plus unavailable viewport, never a fabricated project default and never a red advisory step; only the script's own transform defects fail CI. The accessibility spec explicitly imports the shared fixture test so artifact-context and deterministic overlay suppression apply. The accessibility assertion step remains manifest kind `other` by design, not a user interaction. |
