# Diagnosing CI Failures

Guide for telling a GitHub-runner infrastructure fault from a real break, and for reading the
signals CI already publishes instead of digging through raw logs.

The point of this runbook is not to make red checks go away faster. It is to keep red meaning
something. See [When not to rerun](#when-not-to-rerun).

## What runs, and what blocks a merge

`.github/workflows/ci.yml` defines these jobs:

| Job | Runner | Depends on | What it proves |
|-----|--------|-----------|----------------|
| `Lockfile` | ubuntu | — | `package-lock.json` registry/integrity, Tauri JS/Rust version alignment |
| `Lint` | ubuntu | `Lockfile` | Biome, `tsc --noEmit`, `cargo fmt --check`, Clippy with `-D warnings` |
| `Test` | ubuntu | `Lockfile` | Vitest (`src/**` and `scripts/**/*.test.mjs`) and `cargo test` |
| `E2E Tests` | ubuntu | `Test` | Playwright against the web build |
| `Build (ubuntu-latest)` | ubuntu | `Lint`, `Test` | Tauri bundle, web build, Worker bundle check |
| `Build (macos-latest)` | macOS | `Lint`, `Test` | Tauri bundle |
| `Build (windows-latest)` | windows | `Lint`, `Test` | Tauri bundle |

`Dependency Review` comes from a separate workflow,
`.github/workflows/dependency-review.yml`.

The `main` ruleset requires these contexts: `Lint`, `Test`, `E2E Tests`,
`Build (macos-latest)`, `Build (ubuntu-latest)`, `Build (windows-latest)`, and
`Dependency Review`. `Lockfile` is not itself a required context, but `Lint` and `Test` declare
`needs: [lockfile]`, so a lockfile failure stops both required jobs from running at all.
`CI infra rerun` is not a required context and never blocks a merge.

`.github/workflows/ci.yml` sets `concurrency: ci-${{ github.ref }}` with
`cancel-in-progress: true`. A run marked
**cancelled** was superseded by a newer push on the same ref. That is not a failure and needs no
triage.

## Decision procedure

Work through this in order. Stop at the first step that explains the failure.

1. **Read which checks are red, not just that something is.** The matrix runs with
   `fail-fast: false`, so all three build legs report independently. One red leg out of three is
   a different problem from three red legs.

2. **If only `Build (macos-latest)` is red, and ubuntu and windows are green, and the diff
   cannot plausibly have caused it** — a Markdown-only change, a frontend-only change that
   compiles everywhere else — suspect the macOS runner. Confirm it against
   [Known macOS infrastructure faults](#known-macos-infrastructure-faults) rather than assuming
   it. The heuristic narrows where to look; the log signature is what decides.

3. **Check whether the run is on `attempt #2`.** The run page header shows the attempt. If it is,
   an automatic rerun already happened — go to
   [After an automatic rerun](#after-an-automatic-rerun).

4. **If the run failed and is on `attempt #1`, read the classifier's verdict.** It is published on
   the companion workflow's run page, not on the CI run or the pull request — see
   [Where the auto-rerun decision is published](#where-the-auto-rerun-decision-is-published).
   The verdict tells you whether the machinery saw a known infrastructure signature, and if not,
   which job it considered genuine.

5. **If `E2E Tests` is red — or it is green and you want to know whether it hid a retried pass —
   read the Playwright summary** on the CI run's own summary page. See
   [Reading the Playwright E2E summary](#reading-the-playwright-e2e-summary). A canvas timeout
   has a specific known cause — see
   [Canvas timeouts: the two races already closed](#canvas-timeouts-the-two-races-already-closed).

6. **Otherwise it is a real failure.** Reproduce it locally with the smallest matching check
   (`npx biome check .`, `npx tsc --noEmit`, `npx vitest --run`, `cargo clippy`,
   `npx playwright test`), or run `npm run ci:local` for the full native gate.

## Where the auto-rerun decision is published

This is the single most likely thing to waste your time, so it is stated plainly.

`.github/workflows/ci-infra-rerun.yml` is a **companion** workflow triggered by
`workflow_run` on completion of `CI`. Its decision is published in exactly two places, both on
its own run:

- the step summary of its `Classify macOS build failure` job, headed
  `## macOS infrastructure auto-rerun`, which names the original run URL, every failed job it
  inspected, the failing step, the classification, and any matched signature; and
- a `::notice::` annotation titled `CI infra rerun` carrying a one-line version of the same
  verdict.

It is **not** published on the CI run page, **not** on the pull request, and **not** as a check.
`workflow_run` runs execute in the base-repository context and are recorded against the default
branch, so nothing on the PR links to them. Every one of these runs is also titled identically
(`CI infra rerun`) in the Actions list, including the ones that are skipped because CI passed.

To find the decision for a specific red run:

```bash
gh run list --workflow=ci-infra-rerun.yml --limit 20
gh run view <run-id>   # the step summary names the original run URL
```

The **original run URL in the step summary is the only reliable correlation key.** Timestamps
get you close; the URL confirms it.

If the companion run shows as `skipped`, the classify job's guard rejected the event. The guard
requires all three of: the CI run concluded `failure`, it was on `run_attempt == 1`, and its
`path` was `.github/workflows/ci.yml`. A green CI run, or a run already on `attempt #2`, produces
a skipped companion run and no summary at all. That is expected, not a malfunction.

## Known macOS infrastructure faults

The allowlist lives in `scripts/ci-classify-infra-failure.mjs` (`INFRA_SIGNATURES`). Every
literal in it is verbatim text read off a real failed run of this repository, and each carries
the run and job id it came from in a comment above it.

| Fault | Text to look for in the log | Recorded from |
|-------|------------------------------|---------------|
| Cargo's global-cache housekeeping hitting a faulting runner volume | `Error code 1034: disk I/O error`, or the bare `disk I/O error`, under `warning: failed to save last-use data` | run `29839961163` attempt 1, job `88667317118` |
| Vite/rollup failing to read an untouched `node_modules` file | `EILSEQ: illegal byte sequence` — seen on `lucide-react/dist/esm/icons/axis-3d.js` under `[commonjs--resolver] Could not load` | same run and job |
| The same volume fault as a failed process spawn during post-job cleanup | `spawn EILSEQ` | same run and job |
| rustup failing to write a downloaded toolchain component to disk | `unable to sync download to disk: Input/output error`, under `error: component download failed for clippy-aarch64-apple-darwin` | run `29839964901`, job `88669598130` |

All four are the same underlying class: the GitHub-hosted macOS runner's filesystem
misbehaving. They surface at different steps — the first three inside the `Build Tauri app`
`run:` step and its cleanup, the last inside the `dtolnay/rust-toolchain` `uses:` step — which
is why the mechanism classifies by log outcome rather than by wrapping a step.

Two properties matter when you are reading a fresh failure:

**The rustup signature is scoped to its step.** The classifier only accepts
`unable to sync download to disk: Input/output error` when the failing step name contains
`dtolnay/rust-toolchain`. A toolchain step that fails any *other* way — a network error, a rate
limit, an action bug — carries no allowlisted signature and stays red. Issue #139's description
of that mode as "classified by failed-step identity" is not what shipped; the literal is
required.

**A log that proves the code broke is never rerun, even when a runner fault is also present.**
`GENUINE_FAILURE_MARKERS` (`error[E`, `error: could not compile`, `error: aborting due to`,
`test result: FAILED`, `error TS`) is checked *before* the signatures and vetoes all of them.
This exists because cargo emits `disk I/O error` from cache housekeeping as a **warning**, and
the cargo home is restored via `actions/cache` with `restore-keys` — so a corrupted cached
database can emit that warning on every macOS run until the entry is evicted. If you see the
warning on macOS runs that otherwise succeed, the cached cargo home is the suspect and a rerun
will not help; the cache key is `${{ runner.os }}-cargo-${{ hashFiles('src-tauri/Cargo.lock') }}`
with a `restore-keys` fallback, so it survives until it is evicted.

### A fault not on the list stays red. That is correct.

The allowlist is evidence-based on purpose. Anything the classifier is unsure about — a
non-macOS job, a macOS job with no matching literal, an unreadable or empty log, a malformed
entry — is reported as a genuine failure and left red for a human. A log that could not be
fetched stays empty, and empty classifies as genuine.

So a brand-new macOS runner fault **will** turn the build red and **will not** be rerun
automatically. That is the design working. Do not treat "the classifier missed it" as a bug;
treat it as an unclassified fault that needs
[a signature with evidence](#adding-a-new-infrastructure-signature) before it is trusted.

The classifier also requires **every** failed job in the run to classify as macOS
infrastructure. One genuine failure anywhere leaves the whole run red, untouched.

## Reading the Playwright E2E summary

The `E2E Tests` job runs `scripts/summarize-playwright.mjs` in a `Summarize E2E results` step
with `if: always()`, so the summary is written whether the suite passed, failed, or passed on
retry. It reads `test-results/results.json`, produced by the JSON reporter configured in
`playwright.config.ts`. It appears on the CI run's summary page under **Playwright E2E**.

The counts line reports `passed`, `failed`, `timed out`, `flaky`, `skipped`, and `other`.

- **flaky** means the test **failed at least once and then passed on retry**. CI runs with
  `retries: 2`. A flaky test **does not fail the run** — the job is green. The "Flaky (passed
  after retry)" table names each one with its location and retry count. This table is the only
  reason retried passes are visible at all; treat a row here as a defect report, not as noise.
- **failed** and **timed out** are split so an assertion failure is distinguishable from a hard
  timeout. Both appear in the "Failed" table with their location.
- **skipped** includes the visual regression specs — see
  [Visual specs are skipped on CI](#visual-specs-are-skipped-on-ci).
- **other** is a status the script does not recognise. It exists so counts stay additive if a
  Playwright upgrade widens the status union; a non-zero value means the script needs updating.
- A **run-level error** line (`N run-level errors before any test could report`) means the run
  died before any test executed — a `webServer` that never started, a spec that failed to
  import. Without this line such a run would summarize as "No tests were reported" on a red job.
  The error text itself is in the HTML report, not the summary.
- **"No usable JSON report at `test-results/results.json`"** means the run did not get far
  enough to write a report at all. Go to the job log.

Writing the Markdown summary is advisory: a failure there prints a `::warning::` rather than
turning the job red. The same script also writes a trusted `has-flaky=true|false` step output.
That output controls evidence retention, so its write fails closed: if GitHub cannot receive the
output, the summarize step fails and the upload step's independent `failure()` branch preserves
the diagnostic bundle.

### Artifacts for failed and flaky runs

The `playwright-report` artifact is uploaded when the job failed **or** the parsed report contains
any flaky test. The upload condition combines `failure()` with the summary step's `has-flaky`
output, so a missing or failed summary cannot suppress evidence from a red run. The artifact
contains both `playwright-report/` (the HTML report) and `test-results/` (traces, screenshots,
videos, and `results.json`) and is retained for **7 days**. `playwright.config.ts` sets
`trace: "on-first-retry"`, `screenshot: "only-on-failure"`, and `video: "retain-on-failure"`.

When the summary contains a flaky row, download `playwright-report` from that run and inspect the
retry trace before rerunning. If the row exists but the artifact does not, inspect the
`Summarize E2E results` and `Upload Playwright report` step logs first; that indicates the output
or upload contract failed. Local repetition is still useful after preserving the original
evidence:

```bash
npx playwright test e2e/<spec>.spec.ts --repeat-each=10 --workers=1
```

## Canvas timeouts: the two races already closed

If a spec times out waiting for a node to appear, check readiness gating and overlay
suppression **before** touching any timeout. Two independent races were found and fixed in
`e2e/fixtures.ts` (#136); a new timeout in this area is most likely a third instance of the same
shape.

**Race 1 — the lazy canvas mount.** `createModel` used to return as soon as
`component-palette` was visible. The palette lives in the sidebar, but the canvas is
lazy-loaded behind a `Suspense` boundary and mounts later — measured at 289–787ms later, with
`.react-flow__pane` absent in 12 of 12 probes at the instant the old helper returned. Every
subsequent add-element double-click therefore fired at a mid-mount surface, where
`getCanvasCenter` falls back to a fixed `{200, 200}` and still calls `addElement`.

**Race 2 — the onboarding overlay.** Seeding the What's New localStorage key makes
`isWhatsNewVisible()` return false, which *enables* the onboarding guides. `dfd-basics`
auto-starts 800ms after the first model is created and renders a full-viewport `guide-overlay`
that intercepts pointer events. The suite had been passing only by out-racing that timer, which
a saturated runner defeats.

**The pattern that fixed both: gate on a rendered readiness element, never on a sleep.**

- `waitForCanvasReady(page)` waits for `.react-flow__pane` to be visible. It is called at the
  end of `createModel` and again at the top of `addPaletteItem`, so a caller that skips
  `createModel` is still safe. It is idempotent.
- `suppressFirstRunOverlays` seeds `threatforge-onboarding` with every id in
  `AUTO_START_GUIDE_IDS` as dismissed, before the page loads. **A new guide with an auto-start
  trigger must be added to that list.** Do not instead change a product `showOnce` flag to make
  E2E pass — auto-start suppression happens in `src/hooks/use-onboarding-triggers.ts`, and
  `showOnce` governs only manual starts from the guide picker.
- One assertion in `addPaletteItem` carries a local 15s timeout to absorb residual React-commit
  latency on a saturated runner. It is deliberately scoped to that assertion. **Do not raise the
  global `expect` or per-test timeout in `playwright.config.ts`** — #111 forbids it, and a
  node that is never added still has to fail.

Hook-level tests cover guide auto-start timers, eligibility, and the `welcome` guide's StrictMode
replay. `e2e/onboarding-auto-start.spec.ts` (#141) covers real-browser auto-start: it imports the
plain `@playwright/test` `test` rather than this fixture, seeds only what each case's contract
calls for, and dismisses each guide through its rendered UI.

### A test that stays flaky gets quarantined, visibly

Per #68's standard: a test that remains flaky after a real fix attempt is **quarantined visibly
against a tracking issue**, never silently retried forever.

**Raising `retries` in `playwright.config.ts` is not an acceptable fix.** It converts a visible
flaky row into a silent pass and destroys the only signal that the defect exists. `retries: 2`
is a bounded safety net whose outcomes are surfaced — it is not a dial.

## Visual specs are skipped on CI

`e2e/canvas-visual.spec.ts` opens its `Canvas Visual Regression` describe block with
`test.skip(!!process.env.CI, ...)`. Only macOS baselines are committed, in
`e2e/canvas-visual.spec.ts-snapshots/`, and CI runs on ubuntu — font rendering and
anti-aliasing differ, so every comparison would fail.

What this means in practice:

- These specs give **no CI signal at all**. They show up only in the `skipped` count.
- They are a local-macOS safety net. Run them on macOS before merging canvas layout changes.
- Regenerating a baseline with `--update-snapshots` needs deliberate before/after review, and
  the reason for the change recorded. Two baselines were legitimately regenerated in #136
  because closing the mount race changed where second-and-later nodes land.

## After an automatic rerun

An automatic rerun is visible as `Attempt #2` on the original CI run. To confirm it was
legitimate:

1. Open the companion run's classify step summary
   ([how to find it](#where-the-auto-rerun-decision-is-published)).
2. Check that the failed job it inspected is `Build (macos-latest)` and the matched signature is
   one of those in [the table above](#known-macos-infrastructure-faults).
3. Check the original run's attempt-1 log for the failing step and satisfy yourself the diff
   could not have caused it.

The rerun is bounded to one attempt, and the bound is enforced twice. The classify job's `if:`
requires `run_attempt == 1`, which rejects the completion event of the rerun it triggered; and
the rerun job re-reads the attempt count from the API immediately before posting, so a
maintainer who reruns by hand in the interval does not get a second automatic rerun on top. No
retry loop is possible.

**A run still red after `attempt #2` means the fault persisted or was never infrastructure.**
Investigate it. Do not rerun a third time on the assumption that it will pass eventually.

### If you think the rerun was wrong

A misclassification is a real defect in the gate, not a nuisance. File an issue with:

- the original CI run URL and the failed job id,
- the verbatim log excerpt that the classifier matched, and
- why the failure was genuine.

Then remove or scope the offending signature in `scripts/ci-classify-infra-failure.mjs` and add
a discriminating test that pins the corrected behavior. Widening
`GENUINE_FAILURE_MARKERS` is the right move when the genuine failure had a recognisable marker
the veto list was missing.

## Adding a new infrastructure signature

Every signature makes the gate slightly more willing to rerun a real failure. The evidence
standard is therefore strict.

**Required:**

1. **Verbatim text from a real failed run of this repository.** Fetch it, do not retype it:

   ```bash
   gh api /repos/exit-zero-labs/threat-forge/actions/jobs/<job-id>/logs
   ```

2. **A citation in the source comment naming the run id and job id** (and the attempt, when the
   run has more than one), in the same form as the existing entries in `INFRA_SIGNATURES`.
3. **The most specific literal available**, placed ahead of any more generic form it implies, so
   the signature reported in the summary is the informative one.
4. **A `requiresFailingStep` scope** when the same text could plausibly appear in a log for an
   unrelated reason.
5. **Unit tests in `scripts/ci-classify-infra-failure.test.mjs`**: the verbatim excerpt with its
   timestamp prefixes and ANSI escapes intact, plus a near-miss that must *not* match. The
   existing near-miss fixture already pins that `disk IO error`, a bare `EILSEQ`, and
   `Error code 1035:` are rejected.

**Refused:**

- Signatures written from memory, from a GitHub status page, from another project's logs, or
  from a plausible guess about what a fault "would" print. You cannot know the true form of a
  literal you have not read, and a signature that does not match is dead code that implies
  coverage the gate does not have.
- Broad substrings — `error`, `failed`, `timeout`, `I/O`. These match genuine failures, and the
  `GENUINE_FAILURE_MARKERS` veto is a backstop, not a licence to be loose.
- A signature added to unblock a specific pull request. If a fault is real it will recur and
  produce its own evidence; if it does not recur, it did not need a signature.

Then run:

```bash
npx vitest --run scripts/ci-classify-infra-failure.test.mjs
npx biome check scripts/
```

The classifier's tests run in the `Test` job (Vitest's `include` covers `scripts/**/*.test.mjs`).
The end-to-end rerun behavior cannot be exercised by `npm run ci:local`; it is verified only on
live Actions.

## When not to rerun

**A gate that fails randomly trains reviewers to ignore failures.** Once "just rerun it" becomes
the reflex, a genuine red is indistinguishable from noise and gets clicked through. That
outcome — not the wasted minutes — is what all of the machinery in this runbook exists to
prevent. Every discretionary rerun spends a little of the gate's credibility.

Do not rerun when:

- **You cannot name the fault.** "It failed for no reason" means you have not found the reason.
  If it is infrastructure, it has a signature; add it with evidence. If it does not, it is not
  infrastructure.
- **The run is already on `attempt #2`.** The single-attempt bound is deliberate. A third attempt
  is a hunch, not evidence.
- **The failure is on ubuntu or windows.** Both observed infrastructure modes are macOS-specific
  and the classifier only ever considers `Build (macos-latest)`. A red ubuntu or windows leg has
  not been observed to be runner noise in this repository.
- **`E2E Tests` failed.** The E2E lane has retries and a visible flaky report already. A test
  that fails through two retries failed three times; rerunning the job is asking a fourth time.
- **The diff plausibly caused it.** Check the diff against the failing step before blaming the
  runner. The macOS heuristic requires an *unrelated* diff.

And never make a red check green by raising a timeout, adding a retry, deleting an assertion, or
skipping a test. Those are the same move as a reflexive rerun, made permanent.

When it is not infrastructure and not reproducible, escalate: open an issue with the run URL,
the job id, the failing step, and the log excerpt, and label it so the pattern is visible if it
recurs. See [Responding to Issues](responding-to-issues.md).

## Reference

| Thing | Where |
|-------|-------|
| CI workflow and job names | `.github/workflows/ci.yml` |
| Auto-rerun companion workflow | `.github/workflows/ci-infra-rerun.yml` |
| Signature allowlist and genuine-failure veto | `scripts/ci-classify-infra-failure.mjs` |
| Classifier tests and log fixtures | `scripts/ci-classify-infra-failure.test.mjs` |
| Playwright run summary | `scripts/summarize-playwright.mjs` |
| Playwright reporters, retries, artifacts | `playwright.config.ts` |
| E2E readiness gates and overlay suppression | `e2e/fixtures.ts` |
| The plan this all came from | `docs/plans/111-ci-reliability.md` (#111) |
