# Issue 93 — Complete the Vite 8, TypeScript 7, and plugin-react 6 toolchain upgrades

## Objective

Land Vite 8, `@vitejs/plugin-react` 6, and TypeScript 7 together with the pending
npm-minor-and-patch group so that `npm ci` resolves cleanly, `npm run ci:local` passes with no
new type or lint suppressions, the web and Tauri-webview builds still load, and the four
superseded Dependabot PRs (#85, #88, #89, #119) close. No `.thf` serialization behavior changes
in this issue.

## Issue contract

- **Issue:** `#93`
- **Parent initiative:** `N/A`
- **Type:** `Task`
- **Size:** `M`
- **Priority:** `P2`
- **Autonomy:** `Automatable`
- **Dependencies:** Sequencing coordination with `#94` (js-yaml 5, touches `package-lock.json`
  and `src/lib/thf-yaml.ts`). Supersedes Dependabot PRs `#85`, `#88`, `#89`, `#119` (and the
  already-closed `#83`).
- **Non-goals:**
  - Bumping `js-yaml` 4 → 5 or any `.thf` emitter change — that is `#94` (blocks `#90`).
  - Normalizing the Rust `serde_yaml` and browser `js-yaml` emitters to byte-identical output.
  - Fixing the pre-existing `vite.config.ts` `TS2591` "Cannot find name 'node:fs'" diagnostic
    that only appears under `tsc -b` (missing `@types/node`); it is not in the CI gate.
  - Adding `@types/node` or otherwise re-typing the Node config surface.

## Current behavior and evidence

Pinned toolchain in `package.json`: `vite` `^6.0.3` (resolved 6.4.3), `@vitejs/plugin-react`
`^4.3.4` (resolved 4.7.0), `typescript` `~5.6.2` (resolved 5.6.3), `@biomejs/biome` `^2.4.4`,
`react`/`react-dom` `^19.2.4`, `wrangler` pinned `4.107.1`.

CI (`.github/workflows/ci.yml`) installs with `npm ci` and gates on `npx biome check .`,
`npx tsc --noEmit`, `npx vitest --run`, the Playwright E2E job, and a three-OS Tauri
`npx tauri build` plus `npm run build:web`. `.node-version` is `22`, which `setup-node`
resolves to the latest 22.x.

Each Dependabot PR was inspected for its real failure mode:

- **#85 (`vite` 8.1.5 alone) — install-time `ERESOLVE`.** Job log:
  `peer vite@"^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0" from @vitejs/plugin-react@4.7.0` conflicts
  with `Found: vite@8.1.5`. The `Lint` and `Test` jobs fail at `npm ci`, never reaching a
  check.
- **#88 (`@vitejs/plugin-react` 6.0.3 alone) — the mirror-image `ERESOLVE`.** Job log:
  `peer vite@"^8.0.0" from @vitejs/plugin-react@6.0.3` conflicts with `Found: vite@6.4.3`.
- **Conclusion (coupling):** neither Vite 8 nor plugin-react 6 can install in the presence of
  the other's old major, in *either* order. There is no working intermediate lockfile. They are
  version-coupled and must move in one commit. `@tailwindcss/vite@4.3.3` already peers
  `vite ^5.2.0 || ^6 || ^7 || ^8`, and `vitest@4` carries `vite` transitively, so Tailwind and
  Vitest do not block Vite 8.
- **#89 (`typescript` 7.0.2 alone) — one config error, no source errors.** Only the `Lint` job
  fails; `Test` and `E2E` pass. The single failure is
  `tsconfig.json(18,3): error TS5102: Option 'baseUrl' has been removed. Please remove it from
  your configuration.` `tsc` aborts on that config error before type-checking any source, so the
  "new type errors across the codebase" risk in the issue body was previously unverified.
- **#119 (npm-minor-and-patch group: `react`/`react-dom` 19.2.8, `@biomejs/biome` 2.5.5,
  `wrangler` 4.112.0) — Biome config deprecation.** `Lint` fails only at `npx biome check .`:
  `biome.json:2:13` schema is pinned to `2.4.4` and `biome.json:18` uses the deprecated
  `recommended` field ("Use `preset` instead"). `biome migrate` is the prescribed fix. React,
  react-dom, and wrangler bumps are otherwise benign. `#83` (the earlier 2-update group) is
  already CLOSED, superseded by `#119`.

**TypeScript 7 breakage inventory (measured, not deferred).** Using a scratch install of
`vite@8.1.5 @vitejs/plugin-react@6.0.3 typescript@7.0.2` (then fully restored; see the note at
the end of this section), the complete breakage is:

1. `tsconfig.json` `"baseUrl": "."` → `TS5102` (removed option). Removing the single line while
   keeping `"paths": { "@/*": ["./src/*"] }` makes `npx tsc --noEmit` (the CI gate, which
   `include`s only `src`) exit `0`. `paths` no longer requires `baseUrl`, and every `@/…`
   source import still resolves.
2. **No source-level type errors.** With `baseUrl` removed, `npx tsc --noEmit` on the `src`
   project is clean under TS 7 + Vite 8 + plugin-react 6. The feared cross-codebase type-error
   surface does not materialize here.

So the TS 7 change is effectively a one-line `tsconfig.json` edit. TypeScript 7 is the native
(Go) compiler rewrite; `tsc --noEmit` and `tsc -b` both ran and emitted in the scratch install,
but behavioral parity of the native compiler is an owner-validation item, not a verification one.

**Vite 8 / plugin-react 6 config surface.** `vite.config.ts` calls `react()` with no options.
plugin-react 6's only breaking change is removing bundled Babel (Vite 8 handles React Refresh via
Oxc); Babel features are opt-in via `@rolldown/plugin-babel`, which this repo does not use.
Therefore `react()` needs **no** change. The Tauri dev/build wiring in
`src-tauri/tauri.conf.json` (`beforeDevCommand: npm run dev`, `devUrl: http://localhost:1420`,
`frontendDist: ../dist`) targets stable Vite behavior (fixed `server.port` 1420, `strictPort`,
`hmr`) whose config API is unchanged in Vite 8. The browser-vs-Tauri split
(`build.rollupOptions.external` for `@tauri-apps/*` when not a Tauri build) uses the stable
Rollup options API. Expectation: `vite.config.ts` requires no edits; confirm by build, and only
touch it if a build fails.

`.thf` handling is untouched: `js-yaml` stays at 4 in this issue. `src/lib/thf-yaml.ts` (the
browser YAML reader/writer) and its `declare module "js-yaml"` augmentation are unchanged;
`#94` owns that file and the `js-yaml` 5 bump.

> Investigation note for the parent: this plan required a scratch `npm install` of the three
> target packages to measure the TS 7 inventory. `package.json`, `package-lock.json`, and
> `tsconfig.json` were backed up, the install was performed, and all three were restored from
> backup followed by `npm ci`; stray `tsc -b` artifacts (`vite.config.js`, `vite.config.d.ts`,
> `*.tsbuildinfo`) were deleted. Final `git status` shows only a pre-existing ` M wrangler.jsonc`
> modification that existed before this investigation and was never touched. Please re-verify
> tree state, since other agents share this checkout.

## Implementation steps

Land all steps in **one atomic PR**. Rationale: Steps 1–3 are inseparable (proven ERESOLVE in
both directions); Step 4 is folded in so `#119` closes as superseded and to avoid a second
lockfile-churning PR that would immediately conflict with this one and with `#94`. Keep the
commits within the PR ordered as below so each surface is independently reviewable.

### 1. Bump the coupled toolchain trio and regenerate the lockfile

- **Behavior:** `npm ci` resolves with no `ERESOLVE`; `vite` 8.1.5, `@vitejs/plugin-react`
  6.0.3, and `typescript` 7.0.2 install together.
- **Files:** `package.json` (`devDependencies`), `package-lock.json`.
- **Implementation:** Set `vite` to `^8.1.5`, `@vitejs/plugin-react` to `^6.0.3`, `typescript`
  to `~7.0.2`. Run `npm install` to regenerate `package-lock.json`, then delete `node_modules`
  and run `npm ci` to prove the locked graph installs from clean. Do not use `--force` or
  `--legacy-peer-deps`. Confirm `@tailwindcss/vite` and `vitest` dedupe onto `vite@8`.
- **Targeted verification:** `rm -rf node_modules && npm ci` exits `0`; `npm run check:lockfile`
  passes (registry provenance and integrity); `npm ls vite @vitejs/plugin-react typescript`
  shows the intended versions deduped.
- **Intent validation:** No peer-dependency override, resolution, or `overrides` block was
  introduced to force resolution; the graph resolves honestly.

### 2. Remove the removed `baseUrl` option from tsconfig

- **Behavior:** `npx tsc --noEmit` exits `0` under TS 7 with the `@/*` alias intact.
- **Files:** `tsconfig.json`.
- **Implementation:** Delete the `"baseUrl": "."` line. Keep `"paths": { "@/*": ["./src/*"] }`
  unchanged. Do not relax `strict`, `noUnusedLocals`, `noUnusedParameters`, or
  `noFallthroughCasesInSwitch`. Do not add `any`, `@ts-expect-error`, double casts, or
  non-null assertions — none are needed (inventory shows zero source errors).
- **Targeted verification:** `npx tsc --noEmit` exits `0`; grep the diff to confirm no new
  `any`/`@ts-expect-error`/`as ... as`/`!` suppressions and no loosened `compilerOptions`.
- **Intent validation:** A representative `@/…` import (e.g. `@/types/threat-model` in
  `src/lib/thf-yaml.ts`) still type-resolves, confirming alias resolution survives `baseUrl`
  removal rather than silently degrading.

### 3. Verify the Vite 8 / plugin-react 6 config surface (edit only if a build fails)

- **Behavior:** Both the browser build and the Tauri build produce loadable output with the
  existing `vite.config.ts`.
- **Files:** `vite.config.ts` (expected unchanged); `src-tauri/tauri.conf.json` (expected
  unchanged).
- **Implementation:** Confirm `react()` is called with no Babel options (it is), so plugin-react
  6's Babel removal needs no migration. Confirm `server.port`/`strictPort`/`hmr`, `define`,
  `resolve.alias`, and `build.rollupOptions.external` still behave under Vite 8. Run the browser
  build and the Worker dry-run. Only if a build fails, make the minimal config change the failure
  names and record it here.
- **Targeted verification:** `npm run build:web` succeeds and emits `dist/index.html`;
  `npm run check:worker` (`wrangler deploy --dry-run` against `dist/`) succeeds.
- **Intent validation:** The emitted `dist/` still externalizes `@tauri-apps/*` in the browser
  build (no Tauri APIs bundled into web output) and the SPA entry loads.

### 4. Fold in the npm-minor-and-patch group and migrate the Biome config

- **Behavior:** `npx biome check .` passes on Biome 2.5.5 with a migrated config, and
  `react`/`react-dom` 19.2.8 and `wrangler` 4.112.0 are present so `#119` is superseded.
- **Files:** `package.json` (`wrangler` pin → `4.112.0`; `react`/`react-dom`/`@biomejs/biome`
  update within existing caret ranges), `package-lock.json`, `biome.json`.
- **Implementation:** `npm install react@19.2.8 react-dom@19.2.8 @biomejs/biome@2.5.5
  wrangler@4.112.0`. Run `npx biome migrate --write` to update `biome.json` `$schema` to the
  2.5.5 URL and convert the deprecated `recommended` field to the `preset` form. Then
  `npx biome check --write .` and review the resulting diff (Biome 2.5.x carries CSS/formatting
  fixes). If Biome 2.5.5 surfaces *new lint rule* findings beyond formatting/config, fix only
  trivial mechanical ones here; anything requiring judgment becomes a linked follow-up issue
  rather than silent scope expansion.
- **Targeted verification:** `npx biome check .` exits `0`; `git diff biome.json` shows only the
  schema URL and `recommended`→`preset` migration (no rule silently disabled);
  `npm run check:worker` still passes on wrangler 4.112.0.
- **Intent validation:** The migration did not turn off any rule the repo relied on
  (`noExplicitAny`, `noDefaultExport`, `noUnusedImports`, etc. remain active); no source file was
  reformatted in a way that hides a behavior change.

### 5. Run the full combined verification gate including builds and E2E

- **Behavior:** The entire toolchain change passes the deterministic gate and the Tauri webview
  loads the Vite-8 output.
- **Files:** none (verification only).
- **Implementation:** Run `npm run ci:local`, then `bash scripts/ci-local.sh --e2e`, then
  `bash scripts/ci-local.sh --build` (or `npm run ci:docker:build` for cross-platform
  confidence). E2E is the gate for the acceptance criterion "output loads in browser and Tauri
  webview": `save-reopen.spec.ts` exercises `.thf` round-trip, `canvas-visual.spec.ts` guards
  rendering, and `app-launch.spec.ts` guards boot.
- **Targeted verification:** `npm run ci:local` green; Playwright suite green with traces
  retained on failure; `tauri build --frozen` produces a bundle on at least one desktop OS and
  the launched app renders the canvas.
- **Intent validation:** Confirm the produced desktop bundle actually opens and renders (not just
  that the build command exited `0`), and that a `.thf` file opens and re-saves in the running
  app.

### 6. Confirm superseded Dependabot PRs close (post-merge, owner/authorized)

- **Behavior:** `#85`, `#88`, `#89`, and `#119` are closed after this lands.
- **Files:** none.
- **Implementation:** After merge, Dependabot rebases `#85`/`#88`/`#89` and auto-closes them once
  the bumps are present; it closes the `#119` group once `react`/`react-dom`/`@biomejs/biome`/
  `wrangler` are all at or above its targets. Verify closure; close manually only if Dependabot
  does not. Link `Closes #93` and this plan in the PR body. This step is a GitHub mutation and
  requires the normal authorization — it is not part of the code change.
- **Targeted verification:** All four PRs show CLOSED after merge.
- **Intent validation:** No superseded PR is left open silently reintroducing an old pin.

## Cross-cutting requirements

- **Security and privacy:** Dev-toolchain/supply-chain change only; no IPC, key, CSP, or
  capability surface is touched. Vite 8 pulls Rolldown/Oxc native binaries and plugin-react 6
  *drops* Babel (net smaller surface); `npm run check:lockfile` must confirm registry provenance
  and integrity for the regenerated lockfile. Do not weaken peer resolution with `--force`,
  `--legacy-peer-deps`, or an `overrides` block.
- **`.thf` compatibility:** No schema, serializer, or `js-yaml` change in this issue. The build
  toolchain must not alter runtime YAML behavior; the browser `.thf` round-trip is guarded by the
  E2E `save-reopen` flow. `js-yaml` 5 is deliberately out of scope (`#94`).
- **Browser and desktop:** Both the web build (`build:web` + Worker dry-run) and the Tauri build
  must be verified; the browser build must continue to externalize `@tauri-apps/*`. Any Vite 8
  default-target shift is caught by the E2E + `--build` gate loading the WebKit webview.
- **AI safety:** Not applicable.
- **Accessibility and UX:** No UI change intended; unchanged E2E specs (keyboard, empty states,
  visual snapshots) guard against regressions.
- **Observability and evidence:** Preserve Playwright traces/screenshots on failure; attach the
  `npm run ci:local`, `--e2e`, and `--build` results and a screenshot of the launched desktop app
  rendering a `.thf` model to the PR.

## Verification gate

Targeted, in order:

```bash
rm -rf node_modules && npm ci        # proves no ERESOLVE from the locked graph
npm run check:lockfile               # registry provenance + integrity
npx tsc --noEmit                     # TS 7, baseUrl removed → expect exit 0
npx biome check .                    # Biome 2.5.5 with migrated config
npm run build:web && npm run check:worker
```

Final required gate:

```bash
npm run ci:local
```

Plus, required for this issue's acceptance criteria:

```bash
bash scripts/ci-local.sh --e2e       # webview/.thf round-trip proof
bash scripts/ci-local.sh --build     # Tauri bundle (or npm run ci:docker:build for all OSes)
```

## Owner validation

Green CI does not complete these:

- **Native TS 7 compiler parity:** `tsc --noEmit` exiting `0` proves the type gate, not that the
  native (Go) compiler behaves identically to 5.6 for edge inference. Exercise `npm run dev` +
  HMR and a production build, not just the type check.
- **Vite 8 bundler/target shift is the riskiest surface:** the acceptance criterion "output still
  loads in the Tauri webview" is the one thing the scratch investigation could not prove (it only
  proved install + `tsc`). Launch the built desktop app and confirm the canvas renders, elements
  are interactive, and a `.thf` file opens and re-saves — a bundle that builds but renders blank
  in WebKit is the plausible-but-wrong outcome to rule out.
- **Biome migration fidelity:** confirm `biome migrate` did not silently disable a relied-upon
  rule and that any reformatting is cosmetic, not behavior-altering.
- **Coordination with `#94`:** if `#94` (js-yaml 5) is mid-flight, only one of the two may hold
  the lockfile at a time. Decide the merge order with the owner; the second PR rebases its
  `package-lock.json` (and, for `#94`, `src/lib/thf-yaml.ts`) onto the first. Prefer landing this
  toolchain PR first so `#94` rebases onto a stable Vite 8 / TS 7 base.

## Specialist review

- [x] PR reviewer
- [x] Slop auditor
- [ ] Security auditor, when boundary/security lanes apply — invoke for the supply-chain/lockfile
      surface (new build-tool majors, native binaries, lockfile provenance).
- [ ] Threat-model expert — not required; no `.thf`, STRIDE, or serializer change (that lane
      belongs to `#94`).

## Replan log

Append changes; do not rewrite prior decisions.

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-07-21 | Initial plan | Issue #93; Dependabot job logs for #85/#88/#89/#119 (ERESOLVE both directions, `TS5102` baseUrl, Biome `recommended` deprecation); scratch install of vite@8.1.5 + plugin-react@6.0.3 + typescript@7.0.2 proving the TS 7 breakage is baseUrl-only with zero source errors; `.node-version` 22 satisfies Vite 8 `^20.19.0 \|\| >=22.12.0`. |
