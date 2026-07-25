# Running agent E2E scenarios

A local coding agent (or a contributor) can launch ThreatForge in its **browser** app mode against
a deterministic, named scenario, watch it run, and inspect the same evidence CI produces — with no
new fixture, helper, or artifact format beyond what issues `#65` and `#66` already built. This
runbook is that workflow's contract. It does not cover desktop/Tauri E2E: native dialogs, file
associations, installer signing, notarization, and the updater remain issue `#68`'s separate,
not-yet-built scope, and nothing here claims to exercise them.

## Scope: browser mode only

Every scenario below runs through `playwright.config.ts`'s existing `webServer` (`npm run dev:web`
on port 3000) against the `chromium` project — the identical browser app mode
`.github/workflows/ci.yml`'s `E2E Tests` job uses. This never launches the desktop shell
(`npm run tauri dev` / `npm run tauri build`); there is no fixture, helper, or artifact contract
for desktop E2E today.

## The one command

```bash
npm run test:e2e:agent -- --list                 # print the scenario catalog
npm run test:e2e:agent -- <scenario>              # headed local run (default)
npm run test:e2e:agent -- <scenario> --headless   # CI-shaped headless run
```

This runs `scripts/run-agent-scenario.mjs`, which:

1. Resolves `<scenario>` against the fixed catalog below and refuses to start (prints the catalog
   and exits non-zero) on an unknown or missing name — a scenario is never guessed from a loose
   match.
2. Invokes the repository-pinned `node_modules/@playwright/test/cli.js` directly with
   `test <the scenario's spec file(s)> [--grep <exact-title pattern>] [--headed]` — no `npx`
   network fallback. It uses the same fixtures/helpers, `playwright.config.ts`, and `chromium`
   project as CI; `--headed` is the only local-only addition and is omitted with `--headless`.
3. Always runs `node scripts/build-artifact-manifest.mjs` afterward — the identical command
   `.github/workflows/ci.yml`'s "Build E2E artifact manifest" step runs with `if: always()` — so a
   local run leaves the same `test-results/results.json`, `test-results/artifact-manifest.json`,
   and `playwright-report/` layout CI does, whether the scenario passed or failed.

`npx playwright test e2e/<file>.spec.ts`, `npx playwright test --headed`, and
`bash scripts/ci-local.sh --e2e` continue to work exactly as before; this command is a documented,
narrowed convenience over the same underlying invocation; it is not a new test runner.

Each scenario run clears the prior `test-results/` and `playwright-report/` directories before
launching so stale evidence can never masquerade as the current result. Copy any evidence you need
to retain before starting another scenario.

## Scenario catalog

Each scenario name below is exactly the identifier `scripts/run-agent-scenario.mjs`'s exported
`SCENARIOS` map uses; running `npm run test:e2e:agent -- --list` prints the same names and their
spec files directly from that source, so this table can never silently drift out of sync with what
the command actually runs without both being caught by
`scripts/run-agent-scenario.test.mjs`.

| Scenario | Outcome prompt (what to try) | Spec file(s) |
|---|---|---|
| `document-creation` | Create a new, empty document from the empty-state button, and again from the toolbar button; confirm the canvas, palette, and right panel are all usable afterward. | `e2e/new-model.spec.ts` |
| `multi-tab-restore` | Open several documents, edit one, reload the page, and confirm every tab returns in its persisted order with the correct tab active and content intact — not reset. | `e2e/browser-restore.spec.ts` |
| `import-export` | Open a large committed `.thf` file and a deliberately malformed one through the real Open-file dialog, then create a document, add and connect elements, rename one, confirm `.thf` and HTML downloads are emitted, and reload to confirm browser workspace autosave restores the model. This does not reopen the downloaded `.thf`. | `e2e/workspace-fixtures.spec.ts` (`seedLargeWorkspace`, `seedMalformedWorkspace`, and the combined interaction-helpers test only) |
| `threat-analysis` | Run STRIDE analysis against a modeled document and copy one generated threat as YAML. | `e2e/stride-analysis.spec.ts` |
| `native-ai-tools` | Ask the AI panel to add an element, then approve, deny, stop, and undo a proposed tool call — against a canned, scripted SSE fixture. No API key and no network call ever leaves the machine (`seedAnthropicApiKey` plus a routed fake response; see "No real providers, secrets, or production data" below). | `e2e/ai-tool-loop.spec.ts` |
| `release-smoke` | The browser-available subset of `docs/runbooks/releasing-a-version.md`'s smoke checklist: create a document, save a `.thf` download, run STRIDE analysis, and confirm the AI panel's no-key state and settings entry point. HTML export belongs to `import-export`; desktop-only installer/signing/native-dialog/file-association/updater steps remain issue `#68`'s scope and are **not** exercised or claimed here. | `e2e/new-model.spec.ts`, `e2e/save-reopen.spec.ts`, `e2e/stride-analysis.spec.ts`, `e2e/ai-chat.spec.ts` |
| `visual-evidence` | Capture the pre-model empty state and all six templates as successful, path-backed screenshot attachments for manual review. This produces evidence only; it does not assert or certify visual quality. | `e2e/screenshot-templates.spec.ts` |

## Starting, selecting, and navigating

1. `npm install` once, then `npx playwright install --with-deps chromium` once (matches CI's
   "Install Playwright browsers" step).
2. Run `npm run test:e2e:agent -- --list` to see every scenario name, its outcome prompt, and its
   spec file(s) without opening this file.
3. Run `npm run test:e2e:agent -- <scenario>` to watch a real Chromium window perform that
   scenario. Shared create/open/switch/drag/connect/edit/save/export/restore setup uses
   `e2e/support/interactions.ts` and `workspace-fixtures.ts` where those contracts exist; individual
   specs also exercise their own user-facing controls directly with semantic Playwright locators.
   Read the scenario's spec file and retained `test.step` hierarchy to see exactly what ran — do not
   assume every low-level action is wrapped by a shared helper.
4. To explore beyond a scripted scenario's fixed steps — e.g. to try an interaction no existing
   spec performs yet — use `npm run test:e2e:ui` (`playwright test --ui`), which opens Playwright's
   interactive UI mode against the same fixtures/config for step-by-step, pausable execution and
   locator picking; or run `npm run dev:web` and open `http://localhost:3000/app` directly for
   fully manual browser exploration. Both stay inside browser mode and remain subject to the "No
   real providers, secrets, or production data" rules below even outside an automated spec.

## Capturing and locating evidence

Every attempt's evidence lands under `test-results/<sanitized-test-name>-chromium/` and the
top-level `test-results/` files below; nothing here is scenario-specific machinery — it is exactly
what `playwright.config.ts` and `e2e/support/base.ts` (issues `#65`/`#66`) already produce for any
`npx playwright test` run:

| Evidence | Where | Present when |
|---|---|---|
| Screenshot | `screenshot` attachment | On a failing attempt (`screenshot: "only-on-failure"`), or on a successful `visual-evidence` scenario that explicitly attaches template images |
| Trace | `trace` attachment (`trace.zip`) | Any unexpected failed attempt (`trace: "retain-on-failure"`); omitted for an expected (`test.fail()`) policy-proof attempt |
| Video | `video` attachment | Same condition as trace (`video: "retain-on-failure"`) |
| DOM snapshot | `error-context` attachment | Alongside a failure screenshot |
| Console transcript | `console-log` attachment (bounded to ≤300 entries/≤20,000 characters) | Any page-backed attempt that did not pass, whose actual status differs from its expected status, or that is about to fail the browser-event policy |
| Accessibility projection | `accessibility` attachment (bounded, privacy-reduced) | Same condition as the console transcript |
| Runtime viewport | `artifact-context` attachment | Every page-backed attempt, unconditionally |
| Diagnostic capture failure | `diagnostic-capture-error` attachment | Only if capturing one of the above itself failed |
| HTML report | `playwright-report/index.html` | Every run; open with `npx playwright show-report` |
| Machine-readable report | `test-results/results.json` | Every run (the JSON reporter) |
| Artifact manifest | `test-results/artifact-manifest.json` | Every run of `npm run test:e2e:agent`, since it always calls `node scripts/build-artifact-manifest.mjs` afterward — one entry per attempt, every step/attachment classified, paths normalized relative to the repo root |

Do not guess attachment names or classifications — `e2e/support/README.md`'s "Conventions for
future issues" section is the exact, single source of the `test.step`/attachment classification
tables `scripts/build-artifact-manifest.mjs` implements; this runbook does not restate them.

To inspect a specific attempt: open `npx playwright show-report` and click through to the failing
test, or read `test-results/artifact-manifest.json` directly for the exact attachment path before
opening the HTML report at all. To step through a trace: `npx playwright show-trace
test-results/<attempt-folder>/trace.zip`. To read the browser's own console output for an attempt,
open its `console-log` attachment — do not re-run with a hand-rolled `page.on("console", ...)`
listener; `e2e/support/base.ts` already attaches one.

### Capturing an unasserted visual defect

If a scenario passes but you observe a visual defect that its assertions do not cover:

1. For the empty/template states, run
   `npm run test:e2e:agent -- visual-evidence`; it creates seven successful path-backed screenshot
   attachments and rebuilds the normal manifest.
2. For any other state, create a short-lived `e2e/_local-evidence.spec.ts` using the shared fixture,
   reproduce only the observed state, then capture through the existing artifact layout:

   ```ts
   import { test } from "./fixtures";

   test("local visual evidence", async ({ page }, testInfo) => {
     // Reproduce the user-visible state with committed fixtures/helpers and fake data only.
     const screenshotPath = testInfo.outputPath("manual-repro.png");
     await page.screenshot({ path: screenshotPath });
     await testInfo.attach("manual-repro", { path: screenshotPath, contentType: "image/png" });
   });
   ```

   Run the pinned local CLI with one worker, then build the manifest:

   ```bash
   node node_modules/@playwright/test/cli.js test e2e/_local-evidence.spec.ts --headed --workers=1
   node scripts/build-artifact-manifest.mjs
   node -e "require('node:fs').rmSync('e2e/_local-evidence.spec.ts')"
   ```

   Confirm the temporary spec is deleted before handoff. Never use real user data or credentials.

## Reporting a defect

For either an automated failure or a manual visual reproduction, follow the repository bug-template
shape and report exactly what was observed, not an inferred cause:

- Scenario name, exact command (headed/headless), commit (`git rev-parse HEAD`), operating system,
  and Chromium/Playwright version.
- Minimal user-visible reproduction steps plus **expected** and **observed** behavior.
- For an automated failure: full test title/location (`file.spec.ts:line`) from the terminal or
  `results.json`, and exact console/error text.
- For a manual reproduction: the temporary evidence spec's title and the manual actions performed.
- Preserved attachment paths (screenshot, trace, console-log, accessibility, DOM snapshot) copied
  from `artifact-manifest.json`, not guessed. Copy the evidence before another scenario clears it.

Do not describe a defect in terms of an implementation selector (a CSS class, a `data-testid`, an
internal function name) the agent has not actually observed failing; describe the user-visible
outcome instead (e.g. "the tenth tab is not marked selected after reload" rather than "the
`aria-selected` attribute logic is wrong"). File the defect as a linked GitHub issue per `AGENTS.md`
— this runbook does not authorize creating or updating issues itself.

## No real providers, secrets, or production data

- Never seed a real provider API key, credential, or production secret into any scenario run.
  `native-ai-tools` and any AI-touching manual exploration use only the fixed, obviously-fake
  `seedAnthropicApiKey` placeholder (`sk-ant-e2e-not-a-real-key`) paired with a routed, canned SSE
  response (`e2e/ai-tool-loop.spec.ts`) — no request ever reaches a real provider, and this
  workflow never does either.
- Never open a real user's `.thf` file or other production data through any scenario or manual
  exploration session; use only the committed fixtures under `e2e/fixtures/` and
  `tests/fixtures/thf/`.
- Never skip, weaken, or silently reinterpret a failing check to make a scenario "pass" — a
  failing scenario is a real defect signal, not noise to route around.
- A scenario passing is evidence that its own written assertions held, nothing more. It does not,
  by itself, establish visual quality (hierarchy, alignment, overlap, or clipping) — see
  `docs/quality/e2e-visual-accessibility-rubric.md` for exactly which rubric items are automated
  today and which remain owner-validated from retained screenshots/video. Do not report a scenario
  as visually correct solely because it passed.

## Local/CI parity

| | Local (`npm run test:e2e:agent`) | CI (`.github/workflows/ci.yml`, `e2e` job) |
|---|---|---|
| Fixtures/helpers | `e2e/support/workspace-fixtures.ts`, `e2e/support/interactions.ts` | Identical |
| Browser/project | `chromium` against `npm run dev:web` (`playwright.config.ts`) | Identical |
| Command shape | pinned local Playwright CLI: `test <files> --grep <pattern> --workers=1 [--headed]` | `npx playwright test` using the same pinned package (whole suite, headless, one worker) |
| Retries / focused-test guard | 0 retries; `forbidOnly` off | 2 retries; `forbidOnly` on |
| Web server lifecycle | Reuses an already-running local server when available | Starts a fresh server (`reuseExistingServer: false`) |
| Artifact manifest | `node scripts/build-artifact-manifest.mjs`, always run | Same command, `if: always()` |
| Report/report paths | `test-results/results.json`, `test-results/artifact-manifest.json`, `playwright-report/` | Identical |

Intentional differences are scope, headedness, retries/`forbidOnly`, and whether an existing dev
server may be reused. Workers, fixtures, project, browser app, artifact layout, and manifest command
remain identical.
