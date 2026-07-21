# Issue 111 — CI fails non-deterministically on macOS builds and canvas E2E

## Objective

Make the `CI` workflow's red/green signal trustworthy again by removing two independent
sources of non-deterministic failure, without weakening the gate:

1. `Build (macos-latest)` stops turning red on runner-filesystem/toolchain infrastructure
   faults on changes that cannot have caused them, via a retry that is scoped to identified
   infrastructure failure classes and visible in the run summary — never a blanket job-level
   retry.
2. The `Canvas Elements` Playwright tests (and every other spec that shares the same helper
   path) stop timing out at `e2e/fixtures.ts:29` under a saturated runner, by closing the
   real readiness race rather than only widening a timeout.

The measurable outcome: over repeated CI runs, macOS build red is caused by build breaks
only, and the shared canvas add-element helper is deterministic under load. A maintainer can
tell an infrastructure failure from a real one from a committed runbook instead of log
archaeology.

## Issue contract

- **Issue:** `#111`
- **Parent initiative:** `N/A` (milestone: M2 • General Release)
- **Type:** `Bug`
- **Size:** `M`
- **Priority:** `P1`
- **Autonomy:** `Automatable`
- **Dependencies:**
  - **`#68` (standard, not blocking).** Establishes "flaky tests are quarantined visibly,
    never silently retried forever." This plan applies that standard to the Playwright lane:
    retries stay bounded and their outcomes are surfaced to the run summary; a test that stays
    flaky after the fix is quarantined visibly against a tracking issue, not left silently
    retried.
  - **`#52` (convention, not blocking).** Requires third-party actions to be SHA-pinned and
    workflow permissions least-privilege. The macOS mechanism chosen here adds **no** new
    third-party action (it uses first-party `gh`/REST tooling), and its companion workflow
    holds a single extra scope (`actions: write`) isolated from the build jobs.
- **Non-goals:**
  - No global increase of the Playwright `expect` timeout or the per-test timeout in
    `playwright.config.ts`. The issue explicitly forbids raising the timeout globally; any
    timeout change is scoped to the one load-sensitive assertion.
  - No blanket job-level `continue-on-error`/retry on the build matrix. Two distinct macOS
    failure modes are already observed; a blanket retry would mask a genuine build break.
  - No attempt to eliminate the GitHub-hosted macOS runner's underlying filesystem faults
    (`EILSEQ`, `disk I/O error`) — those are the runner's, not the repo's. The scope is
    tolerating them safely and visibly.
  - No change to what the build compiles, to the pinned `dtolnay/rust-toolchain` SHA, or to
    the Tauri build steps themselves.
  - No rewrite of the ReactFlow add-element product behavior. Double-click-to-add stays; only
    test readiness/synchronization is hardened. Any production change is an inert `data-testid`
    at most.

## Current behavior and evidence

### Failure class 1 — macOS `Build` fails on runner infrastructure, two distinct modes

`ci.yml` runs `build` as a matrix over `[ubuntu-latest, macos-latest, windows-latest]` with
`fail-fast: false` (`.github/workflows/ci.yml:176-185`). Two macOS-only failures were captured
in one session, at two unrelated steps:

| PR | Diff | Failing step | Signature |
|----|------|--------------|-----------|
| #101 | one Markdown file under `docs/plans/` | `Build Tauri app` (`run:` step, `.github/workflows/ci.yml:222-225`) | `EILSEQ: illegal byte sequence, read` on `node_modules/lucide-react/.../axis-3d.js`; same job logged `disk I/O error` / `Error code 1034: disk I/O error` from the cargo cache and `spawn EILSEQ` during post-job cleanup |
| #102 | one TS file + its test | `dtolnay/rust-toolchain@2c7215f...` (`uses:` step, `.github/workflows/ci.yml:196-198`) | the action failed to complete before any project code compiled |

Both diffs are causally unrelated to the step that failed, and both ubuntu and windows legs of
the same runs were green. The signatures point squarely at the GitHub-hosted macOS runner's
filesystem/networking, not the repository.

The structural constraint that shapes the fix: the two failing steps are **different kinds of
step**. `Build Tauri app` is a `run:` step (shell-wrappable). `dtolnay/rust-toolchain` is a
`uses:` action step (not shell-wrappable, and SHA-pinned per `#52`). Any mechanism that only
wraps `run:` steps cannot cover the toolchain failure mode without replacing the pinned action
with a hand-rolled `rustup` command — a larger, provenance-weakening change this plan rejects.

### Failure class 2 — the shared canvas add-element helper races the lazy canvas mount

The two reported flaky tests both time out at `e2e/fixtures.ts:29`:

```ts
await expect(page.locator("[data-testid^='node-']")).toHaveCount(nodesBefore + 1);
```

Reproduction from the issue: full suite → 2 failed / 44 passed; that spec alone → 5 passed;
full suite re-run → 46 passed twice. Load-sensitive, not wrong.

The assertion at `:29` is already a correct web-first, auto-retrying assertion; its only lever
is the timeout. So the flake is not in the assertion — it is in whether the double-click ever
produces a node. The mount path shows a real race:

- The canvas is **lazy-loaded**: `LazyDfdCanvas = lazy(() => import("./dfd-canvas"))` inside a
  `Suspense` whose fallback is the text "Loading canvas..." (`src/components/canvas/canvas.tsx:23,34-42`).
- `createModel()` returns as soon as `component-palette` is **visible**
  (`e2e/fixtures.ts:17-20`). The palette lives in the sidebar and paints before the lazy
  `DfdCanvas` chunk mounts. Nothing in the helper waits for the ReactFlow surface.
- `addPaletteItem()` then immediately double-clicks a palette item. The handler
  (`src/components/palette/component-palette.tsx:199-206` and `:255-260`) calls
  `getCanvasCenter(screenToFlowPosition)`, which falls back to `{200,200}` when `.react-flow`
  is not yet in the DOM (`component-palette.tsx:164-165`) and still calls `addElement`. The
  rendered `node-{id}` DOM element only exists once ReactFlow has mounted and rendered from the
  store (`src/components/canvas/nodes/dfd-element-node.tsx:215,258`).

Under a saturated runner the gap between "palette visible" and "ReactFlow mounted and
interactive" widens, exposing the add action to a surface that is mid-mount. The observable
result is a hard timeout on `toHaveCount` (the node was never added, or its commit is delayed
behind the lazy chunk load plus `fitView`/sync churn). A longer timeout alone does not close
this — if the double-click never lands, the count never reaches `nodesBefore + 1`.

This is a **shared-helper** defect, not a canvas-elements quirk: `keyboard-shortcuts.spec.ts`
and `dirty-state.spec.ts` call `addPaletteItem` immediately after `createModel` too
(`e2e/keyboard-shortcuts.spec.ts:9-10`, `e2e/dirty-state.spec.ts:6-8`). The two
`canvas-elements` tests were simply the ones scheduled during peak saturation this session
(`workers: 1` runs specs serially; `playwright.config.ts:9`). Fixing `fixtures.ts` therefore
protects every caller, and the fix belongs in the helper, not the spec.

Other specs already treat the `.react-flow__*` namespace as the canvas-ready signal:
`canvas-visual.spec.ts:11` waits for `.react-flow__node-trustBoundary`, and
`screenshot-templates.spec.ts:59` waits for `.react-flow__node`. `.react-flow__pane` (xyflow's
interactive pane, rendered as soon as ReactFlow initializes, before any node exists) is the
correct readiness anchor for a helper that runs *before* the first node is added.
`@xyflow/react` is pinned at `^12.10.1` (`package.json:33`).

### Existing retry posture and the visibility gap

`playwright.config.ts` already sets `retries: process.env.CI ? 2 : 0` and `workers: 1` in CI.
So retries are already on, but a test that passes only on retry ("flaky") is invisible in the
GitHub run summary today — the e2e job runs `npx playwright test` and uploads the HTML report
only on failure (`.github/workflows/ci.yml:160-174`). Per `#68`, retried passes must be
visible, not silent. This plan surfaces flaky/retry counts to `$GITHUB_STEP_SUMMARY`.

### Design decision — the macOS retry mechanism

The acceptance criterion is exact: retry **only** an identified infrastructure failure class,
**visibly**, and **never** a blanket job-level retry. Three mechanisms were weighed against the
actual `ci.yml` shape (a matrix build whose two observed failures span a `run:` step and a
SHA-pinned `uses:` action).

**Rejected — step-level shell retry with a failure-class grep.** Wrapping the `Build Tauri app`
`run:` step in a retry loop that only retries when stderr matches `EILSEQ`/`disk I/O error` is
clean for failure mode #101. But it **cannot** wrap the `dtolnay/rust-toolchain` `uses:` step
(mode #102). Covering that would mean discarding the pinned action for a hand-rolled `rustup`
command inside a retry loop — abandoning the SHA-pin provenance `#52` requires, on the one step
whose flake is a network/action fault. It also has to be duplicated on the `release.yml` build
matrix later. Partial coverage of a two-mode problem is exactly the trap the issue warns about.

**Rejected — a third-party retry action (e.g. `nick-fields/retry`), SHA-pinned.** Same `uses:`
vs `run:` limitation (it retries `command:` shell, not `uses:` steps), plus it adds a new
third-party dependency to pin and audit for a capability first-party tooling already provides.

**Chosen — a log-classified, single auto-rerun companion workflow.** A new workflow triggered
on `workflow_run` completion of `CI` inspects the failed run's job logs, and re-runs the failed
jobs **only if** every failed job is a macOS `Build` job whose failure matches a known
infrastructure signature. This is the only option that covers **both** failure modes uniformly
(it classifies by outcome, regardless of whether the fault was in a `run:` step or a `uses:`
action), adds **no** third-party action, and is inherently visible (GitHub records the rerun as
"Attempt #2" on the original run, and the companion workflow writes the matched signature and
run URL to its own step summary). Its non-masking guarantees are structural, not aspirational:

- It reruns only when **all** failed jobs are macOS-infra-classified; any failed job that is
  non-macOS, or macOS without a signature match, leaves the run red untouched.
- It reruns **at most once** (guarded on `run_attempt == 1`); a persistent problem stays red
  after attempt #2. No infinite retry loop.
- A genuine, deterministic build break does not emit the infra signatures, so it is never
  rerun. The only residual masking window — a real macOS failure whose log coincidentally
  contains an infra string *and* which is itself flaky — is bounded to a single rerun and is
  narrowed further by matching specific literal signatures, not substrings like "error".

The classification logic (the risky part) is extracted into a first-party Node script
(`scripts/ci-classify-infra-failure.mjs`) so it is unit-testable in `ci:local` against log
fixtures taken from this issue, even though the end-to-end rerun can only be validated on live
GitHub Actions. The `workflow_run` trigger runs in the base-repo context, so it safely covers
fork PRs without executing untrusted PR code — it only reads logs and matches fixed strings.

## Implementation steps

Each step is independently executable at XS/S size. Steps 1–2 (E2E) and Steps 3–4 (macOS) are
independent and can land in either order; Step 5 (runbook) documents both.

### 1. Close the canvas readiness race in the shared helper (the real E2E fix)

- **Behavior:** `createModel` does not return until the ReactFlow canvas surface is mounted and
  interactive, so no subsequent `addPaletteItem` can double-click a mid-mount surface. This is a
  state-based wait on a rendered element, not a sleep — compliant with `e2e.instructions`.
- **Files:** `e2e/fixtures.ts`.
- **Implementation:**
  - Add a small exported helper `waitForCanvasReady(page)` that awaits
    `page.locator(".react-flow__pane").waitFor({ state: "visible" })`. `.react-flow__pane` is
    rendered by `@xyflow/react` (^12.10.1) as soon as ReactFlow initializes and before any node
    exists, which is exactly the pre-first-add readiness signal `createModel` needs. The repo
    already depends on the `.react-flow__*` namespace in `canvas-visual.spec.ts` and
    `screenshot-templates.spec.ts`.
  - Call `waitForCanvasReady(page)` at the end of `createModel` (after the existing
    `component-palette` visibility wait).
  - Call `waitForCanvasReady(page)` at the top of `addPaletteItem` as defense-in-depth, so any
    future caller that reaches it without going through `createModel` is still safe. Keep it
    idempotent (a no-op cost when the pane is already visible).
  - Implementer confirmation at implementation time: run the app and inspect the rendered DOM to
    verify `.react-flow__pane` is present pre-node under the pinned xyflow version. If it is not
    a stable anchor, the sanctioned fallback is to add `data-testid="dfd-canvas"` to the
    `DfdCanvas` root `<div className="h-full w-full">` (`src/components/canvas/dfd-canvas.tsx:440`)
    — an inert one-line production change — and gate on `getByTestId("dfd-canvas")`. Record which
    anchor was used in the PR.
- **Targeted verification:**
  `npx playwright test canvas-elements --repeat-each=10 --workers=1` is green (the first-add
  path is exercised 50 times). Discriminating check: temporarily revert only the
  `waitForCanvasReady` call in `createModel` and run the full suite
  (`npx playwright test --workers=1`) a few times to reproduce the timeout at `fixtures.ts:29`,
  then restore it and confirm green — proving the gate, not the timeout, closes the race.
- **Intent validation:** owner confirms the wait targets a real rendered readiness element (not
  an arbitrary delay) and that `createModel`'s contract now genuinely means "canvas is
  interactive," benefiting every spec that uses the helper.

### 2. Scope the load-tolerant timeout to the one load-sensitive assertion (the issue's floor)

- **Behavior:** the single `toHaveCount(nodesBefore + 1)` assertion tolerates residual
  React-commit latency under a saturated runner, with the intent documented inline. The global
  `expect` timeout is unchanged.
- **Files:** `e2e/fixtures.ts`.
- **Implementation:**
  - Change `e2e/fixtures.ts:29` to
    `await expect(page.locator("[data-testid^='node-']")).toHaveCount(nodesBefore + 1, { timeout: 15000 });`
    (3× the 5s default). Add a comment tying it to `#111`: the readiness gate (Step 1) removes
    the mount race; this bounded per-assertion timeout only absorbs residual commit latency when
    the runner is CPU-saturated, and is deliberately local rather than a global bump per the
    issue's constraint.
  - Do **not** touch `playwright.config.ts` timeouts.
- **Targeted verification:** `npx biome check e2e/fixtures.ts` passes;
  `npx playwright test canvas-elements` green. Discriminating: `grep` confirms the `timeout`
  option appears only on this assertion and no global timeout was added in `playwright.config.ts`.
- **Intent validation:** owner confirms the timeout is a residual-latency cushion layered on top
  of the real fix (Step 1), not a substitute for it, and that a never-added node still fails
  (within 15s) rather than being hidden.

### 3. Surface Playwright retry/flaky outcomes in the CI run summary

- **Behavior:** the e2e job reports pass/fail/flaky and retry counts to the GitHub run summary
  on every run, so a test that only passes on retry is visible per `#68`, never silent.
- **Files:** `playwright.config.ts`, `.github/workflows/ci.yml`, new
  `scripts/summarize-playwright.mjs`.
- **Implementation:**
  - Add a `["json", { outputFile: "playwright-report/results.json" }]` reporter alongside the
    existing `html` and `list` reporters in `playwright.config.ts` (do not remove existing
    reporters).
  - Add `scripts/summarize-playwright.mjs`: read `playwright-report/results.json`, compute
    expected/unexpected/flaky counts and the list of flaky test titles with their retry counts,
    and append a short Markdown table to the file named by `process.env.GITHUB_STEP_SUMMARY`
    (no-op locally when that env is unset). Exit 0 always — it is advisory, not a gate.
  - In `ci.yml`, add a step after "Run E2E tests" with `if: always()` that runs
    `node scripts/summarize-playwright.mjs`, so the summary is written whether the suite passed,
    failed, or passed-on-retry.
  - Keep `retries: 2` unchanged: retries remain a bounded safety net, now made visible rather
    than removed.
- **Targeted verification:** locally, force a flaky result (e.g. run a throwaway spec that fails
  once then passes) with `CI=1 npx playwright test <spec>` and confirm
  `node scripts/summarize-playwright.mjs` prints the flaky row; `npx biome check` passes on the
  new script. `actionlint .github/workflows/ci.yml` passes (or `npx --yes @rhysd/actionlint` if
  not installed).
- **Intent validation:** owner confirms a retried pass now appears in the run summary as flaky,
  establishing the visible-quarantine posture required by `#68` for the Playwright lane.

### 4. Add the log-classified macOS infrastructure auto-rerun

- **Behavior:** when a `CI` run fails and **every** failed job is a macOS `Build` job whose logs
  match a known infrastructure signature, the failed jobs are re-run exactly once; the match and
  run URL are written to the companion workflow's step summary. Any other failure is left red.
- **Files:** new `scripts/ci-classify-infra-failure.mjs`, new
  `scripts/ci-classify-infra-failure.test.mjs` (or `.test.ts` under the existing vitest setup),
  new `.github/workflows/ci-infra-rerun.yml`.
- **Implementation:**
  - `scripts/ci-classify-infra-failure.mjs`: export a pure function
    `classifyFailure({ jobName, stepName, logText })` returning
    `{ rerun: boolean, signature: string | null }`. It returns `rerun: true` with the matched
    signature only when `jobName` is a macOS build job (matches `Build (macos-latest)`) **and**
    either (a) `logText` contains one of the literal signatures
    `["EILSEQ: illegal byte sequence", "spawn EILSEQ", "disk I/O error", "Error code 1034: disk I/O error"]`,
    or (b) the failing `stepName` is the `dtolnay/rust-toolchain` action step (mode #102, which
    has no distinctive stderr — classify by failed-step identity, not substring). Add a
    top-level `classifyRun(failedJobs)` that returns `rerun: true` only when the array is
    non-empty and **all** entries classify as rerun-eligible.
  - `scripts/ci-classify-infra-failure.test.mjs`: unit tests using log excerpts from this issue
    (the `EILSEQ`/`disk I/O error` block; the `Run dtolnay/rust-toolchain@...` failure). Assert:
    a docs-only-style `EILSEQ` macOS failure → rerun; a rust-toolchain macOS step failure →
    rerun; a real compile error on macOS with no signature → **no** rerun; an ubuntu/windows
    failure with an `EILSEQ`-looking string → **no** rerun; a mixed set (one macOS infra + one
    real windows break) → **no** rerun. These are the discriminating cases that prove it does not
    mask real breaks.
  - `.github/workflows/ci-infra-rerun.yml`:
    - `on: workflow_run: { workflows: ["CI"], types: [completed] }`.
    - `permissions: { actions: write, contents: read }` — least privilege; `actions: write` is
      required only to call rerun and is isolated to this workflow.
    - A single job guarded by
      `if: github.event.workflow_run.conclusion == 'failure' && github.event.workflow_run.run_attempt == 1`.
    - Steps use `gh` with `GH_TOKEN: ${{ github.token }}`: list failed jobs
      (`gh api /repos/${{ github.repository }}/actions/runs/${{ github.event.workflow_run.id }}/jobs`),
      fetch each failed job's log (`gh run view --job <id> --log` or the job-logs API), pass job
      name + failed step + log text to `node scripts/ci-classify-infra-failure.mjs`, and, only
      when `classifyRun` returns `rerun: true`, call
      `gh api -X POST /repos/${{ github.repository }}/actions/runs/${{ github.event.workflow_run.id }}/rerun-failed-jobs`.
    - Always write to `$GITHUB_STEP_SUMMARY`: on rerun, the matched signature(s), the job
      name(s), the original run URL, and "auto-rerun attempt #2 triggered"; on no-match, "no
      infrastructure signature matched; failure left for human review." Emit a `::notice::`
      annotation mirroring the summary. Do not fail this workflow on a no-match (exit 0).
    - Add **no** third-party actions. If `actions/checkout` is needed to access the scripts,
      pin it by SHA to the same version already used in `ci.yml`
      (`actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`).
  - Do not modify the `build` job in `ci.yml`; the mechanism is entirely out-of-band.
- **Targeted verification:** `node --test scripts/ci-classify-infra-failure.test.mjs` (or
  `npx vitest run scripts/ci-classify-infra-failure.test.*`) passes, including the
  does-not-mask-real-breaks cases; `npx biome check scripts/`;
  `actionlint .github/workflows/ci-infra-rerun.yml` passes. End-to-end rerun behavior is
  **owner-validated on live Actions** (see Owner validation) — it cannot be exercised by
  `ci:local`.
- **Intent validation:** owner confirms (a) the classifier's allowlist matches the two observed
  signatures and nothing broader, (b) the `run_attempt == 1` guard and all-failed-jobs-must-match
  rule make masking a real break structurally hard, and (c) the extra `actions: write` scope is
  acceptable and isolated.

### 5. Write the CI-failure triage runbook

- **Behavior:** a committed runbook lets the next maintainer distinguish an infrastructure
  failure from a real one and understand the auto-rerun and E2E-flake behavior without
  re-deriving it from logs.
- **Files:** new `docs/runbooks/diagnosing-ci-failures.md`; a one-line cross-link added to
  `docs/runbooks/responding-to-issues.md`.
- **Implementation:** document, in the existing runbook style (see
  `docs/runbooks/responding-to-issues.md`):
  - The two macOS infrastructure signatures (mode #101 `EILSEQ`/`disk I/O error` in `npm run
    build`/cargo cache; mode #102 `dtolnay/rust-toolchain` action failure), with the heuristic:
    macOS-only + unrelated diff + ubuntu/windows green = infrastructure.
  - How the auto-rerun behaves: it reruns failed macOS build jobs once when a signature matches;
    "Attempt #2" on the run and the `ci-infra-rerun` step summary are the evidence; a still-red
    run after attempt #2 means the fault persists or is real — investigate, do not blindly rerun.
  - The Playwright flake: the readiness race it came from, that `createModel`/`addPaletteItem`
    now gate on canvas readiness, that a flaky (retried-pass) test is surfaced in the e2e job's
    run summary, and that a test which stays flaky must be quarantined visibly against a tracking
    issue (per `#68`) — never handled by raising `retries`.
  - When to escalate vs. rerun, and where to find artifacts (Playwright HTML report,
    `results.json` summary, the classifier's step summary).
- **Targeted verification:** `npx biome check` (Markdown is not linted, but keep the tree clean);
  a reviewer confirms the runbook names both signatures, the rerun's single-attempt bound, and
  the visible-quarantine rule. Confirm the cross-link resolves.
- **Intent validation:** owner reads the runbook cold and confirms they could triage a fresh
  macOS red and a fresh canvas flake from it alone.

## Cross-cutting requirements

- **Security and privacy:** the auto-rerun companion workflow holds `actions: write` — least
  privilege, isolated to that workflow, required only to call `rerun-failed-jobs`. It runs in the
  base-repo `workflow_run` context and executes **no** untrusted PR code: it only reads job logs
  and matches fixed-string signatures, so it is safe for fork PRs. No new third-party action is
  introduced (satisfies `#52`'s SHA-pin/supply-chain posture without expanding the surface); any
  first-party action reused is SHA-pinned to the version already in `ci.yml`. Log text is
  inspected for known infrastructure strings only and is not echoed to any external sink beyond
  the step summary. `security-auditor` lane applies (workflow permissions and CI supply chain).
- **`.thf` compatibility:** none. No schema, serializer, or file-format surface is touched.
  `threat-model-expert` lane does not apply.
- **Browser and desktop:** the canvas fix is test-only (a readiness wait and a scoped timeout in
  `e2e/fixtures.ts`); if the fallback anchor is used it is an inert `data-testid` on the canvas
  root that changes no runtime behavior on either platform.
- **AI safety:** not applicable; no AI path is touched.
- **Accessibility and UX:** no user-facing UI change. The optional `data-testid` is non-visual
  and non-interactive.
- **Observability and evidence:** this change is largely *about* observability — flaky/retry
  counts are surfaced to `$GITHUB_STEP_SUMMARY`, auto-reruns are recorded as run attempt #2 plus
  a classifier step summary and a `::notice::` annotation, and the runbook captures the triage
  procedure. Playwright already retains trace/screenshot/video on retry (`playwright.config.ts:12-15`)
  and uploads the report on failure (`ci.yml:166-174`).

## Verification gate

Targeted checks while iterating:

```bash
# E2E readiness fix (Steps 1–2)
npx playwright test canvas-elements --repeat-each=10 --workers=1
npx biome check e2e/fixtures.ts

# Run-summary + macOS classifier (Steps 3–4)
node scripts/summarize-playwright.mjs           # no-op without GITHUB_STEP_SUMMARY
npx vitest run scripts/ci-classify-infra-failure.test.*   # or: node --test scripts/ci-classify-infra-failure.test.mjs
npx biome check scripts/
npx --yes @rhysd/actionlint                      # lint both workflows
```

Final required gate before handoff:

```bash
npm run ci:local
```

E2E is required for this change; run the full Playwright suite (`npx playwright test`) as part
of preflight. The auto-rerun workflow's end-to-end behavior is **not** exercisable by
`ci:local` and is deferred to owner validation on live Actions. No Docker, Tauri build, or
release checks are required.

## Owner validation

Green CI does not complete these:

- **macOS auto-rerun, live.** Confirm on real GitHub Actions that (a) an actual macOS
  infrastructure flake (or an injected signature in a throwaway branch) triggers exactly one
  rerun, visible as "Attempt #2" plus the `ci-infra-rerun` step summary naming the matched
  signature; (b) a genuine macOS build break is **not** rerun (left red); and (c) the rerun does
  not loop past attempt #2. This is the riskiest behavior and cannot be verified locally.
- **No masking.** Confirm the classifier's does-not-rerun cases (real macOS break; non-macOS
  failure carrying an `EILSEQ`-like string; mixed real+infra failure) hold in the unit tests and
  match the reviewer's reading of the allowlist.
- **Canvas determinism under load.** Judge whether the readiness gate plus scoped timeout
  actually stabilizes the suite under a saturated runner over several real CI runs — the
  `--repeat-each` check is evidence, not proof, of stability on GitHub's runners.
- **Visible quarantine posture.** Confirm a retried-pass now shows as flaky in the e2e run
  summary, and agree that a test which stays flaky after this fix will be quarantined against a
  tracking issue rather than absorbed by raising `retries`.
- **Runbook usefulness.** Read `docs/runbooks/diagnosing-ci-failures.md` cold and confirm it is
  sufficient to triage a fresh macOS red and a fresh canvas flake.

## Specialist review

- [ ] PR reviewer
- [ ] Slop auditor
- [ ] Security auditor, when boundary/security lanes apply — **applies** (new workflow with
      `actions: write`, `workflow_run`/fork-PR trust boundary, CI supply chain).
- [ ] Threat-model expert, when schema/STRIDE/threat lanes apply — **does not apply** (no `.thf`,
      STRIDE, or threat-generation surface is touched).

## Replan log

Append changes; do not rewrite prior decisions.

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-07-21 | Steps 3–5 split out into `#138` (flaky visibility), `#139` (macOS auto-rerun), `#140` (runbook); steps 1–2 ship alone in `#136` | Step 4 adds a workflow holding `actions: write` whose end-to-end behavior can only be validated on live Actions. Bundling it would hold the E2E unblock — which `#93` is gated on — behind an owner-validation cycle. Each follow-up carries this plan's detail, including the rejected alternatives and the discriminating no-rerun cases. |
| 2026-07-21 | A **second** readiness race was found during implementation and is fixed in `#136` | The plan diagnosed only the canvas mount race. `e2e/fixtures.ts` seeds `threatforge-last-seen-version` to suppress the What's New overlay, but `use-onboarding-triggers.ts:40` reads that same key as proof no modal is up and therefore *enables* the `welcome` guide; `dfd-basics` then auto-starts on an 800ms timer. Both render a full-viewport `guide-overlay` that intercepts pointer events. The suite was passing only by out-racing that timer, which a saturated runner defeats — so this is plausibly a real contributor to the CI flake. Closing the canvas race (which legitimately spends ~300ms) exposed it. |
| 2026-07-21 | Canvas race quantified rather than inferred; `.react-flow__pane` confirmed as the anchor, fallback not needed | A throwaway probe measured pane count `0` in 12 of 12 runs at the instant the old `createModel` returned, with a 289–787ms gap. The plan's sanctioned `data-testid="dfd-canvas"` fallback was therefore unnecessary. |
| 2026-07-21 | Two macOS visual baselines regenerated | They had captured the racy placement: with a ready canvas, `getCanvasCenter` returns a true projection instead of its `{200,200}` fallback, so second-and-later nodes land differently. New output is byte-identical across three runs; three of five baselines are unchanged. These specs are skipped on CI (`canvas-visual.spec.ts:45`), so this is local signal only. |
| 2026-07-21 | Auto-start suppression is a real coverage gap, not covered by unit tests | Preflight review corrected an earlier claim that `guide-overlay.test.tsx` retains the coverage. It tests only the presentational component, and `use-onboarding-triggers.test.ts` calls `startGuide` directly rather than rendering the hook, so the 500ms/800ms timers and `isWhatsNewVisible()` are untested in both lanes. Recorded as a gap in `e2e/fixtures.ts` rather than claimed as covered. |
| 2026-07-21 | Initial plan | Issue #111 body and comment; `.github/workflows/ci.yml` (matrix build, SHA-pinned `uses:` steps, e2e job); `e2e/fixtures.ts` (`createModel`/`addPaletteItem`), `e2e/canvas-elements.spec.ts`, `keyboard-shortcuts.spec.ts`, `dirty-state.spec.ts`, `canvas-visual.spec.ts`, `screenshot-templates.spec.ts`; `src/components/canvas/canvas.tsx` (lazy `DfdCanvas`/`Suspense`), `dfd-canvas.tsx`, `component-palette.tsx` (`getCanvasCenter` fallback), `dfd-element-node.tsx` (`node-{id}` testid); `playwright.config.ts` (retries/workers/reporters); `package.json` (`@xyflow/react ^12.10.1`); standards from `#68` (visible quarantine) and `#52` (SHA-pin, least privilege); `docs/runbooks/` style and `docs/plans/0000-template.md` |
