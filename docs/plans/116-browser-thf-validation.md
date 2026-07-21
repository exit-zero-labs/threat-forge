# Issue 116 — Browser read path applies no `.thf` validation

## Objective

Make `BrowserFileAdapter.openThreatModel` reject the same malformed `.thf` documents that
`read_threat_model` (`src-tauri/src/file_io/reader.rs`) rejects — unsupported schema version,
duplicate IDs within a section, and dangling cross-references — and replace the unchecked
`yaml.load(text) as ThreatModel` assertion with fail-closed narrowing. The two platforms must
not be able to disagree silently about what constitutes a valid document, and a rejected file
must surface the same actionable, user-safe error on both.

## Issue contract

- **Issue:** `#116`
- **Parent initiative:** `N/A`
- **Type:** `Bug`
- **Size:** `M`
- **Priority:** `P1`
- **Autonomy:** `Automatable`
- **Dependencies:**
  - **`#115` (must merge first).** `#115` fixes date coercion on this exact adapter and, per
    its acceptance criteria, "replaces the unchecked `as ThreatModel` assertion with real
    narrowing" so that `metadata.created`/`modified` are strings at runtime. This plan builds on
    that narrowing entry point rather than re-introducing it. Sequencing rationale is in
    *Design decision* below; the first implementation action is to rebase on merged `#115` and
    read whatever narrowing it left at the open boundary.
  - **`#55` (related, not absorbed).** `#55` requires browser and Tauri adapters to pass shared
    contract tests for create/open/save/save-as/close. This issue is the read-validation half of
    that contract only. It introduces the browser read validator and its corpus contract test;
    `#55` may later fold this into a broader adapter contract suite.
  - **`#57` (parallel, not blocking).** `#57` extends the schema with new sections and new
    reference rules in `reader.rs` and adds fixtures. This plan must not enumerate `#57`'s rules;
    it defines the mechanism (the shared invalid-fixture manifest) by which `#57` extends browser
    validation in lockstep. See *Design decision*.
- **Non-goals:**
  - No retroactive validation of documents already loaded into the store, documents created via
    `createNewModel`, or documents mutated by AI. Validation is a read-boundary check at
    `openThreatModel` only, matching `reader.rs`, which validates on read and not on any other
    path.
  - No save-side validation. `write_threat_model` (`src-tauri/src/file_io/writer.rs`) does not
    validate before serializing, so the browser writer stays symmetric. Validating on save is a
    separate concern and out of scope.
  - No change to the date-coercion behavior owned by `#115`.
  - No new schema fields, no new reference rules, no widening of `validate_version`. This issue
    mirrors the three checks that exist today; it does not add checks the desktop lacks (a
    browser-only check would be a disagreement in the other direction).
  - No toast/notification infrastructure. The repository has none today; error surfacing reuses
    the existing `window.alert` pattern already used by `importModel`.

## Current behavior and evidence

### The gap

`read_threat_model` (`src-tauri/src/file_io/reader.rs:7`) runs, in order:

1. `serde_yaml::from_str` — full struct deserialization. A missing required section or a
   truncated document fails here as `ThreatForgeError::YamlParse`.
2. `validate_version(&model.version)` (`reader.rs:104`) — exact string match on `"1.0"`, else
   `UnsupportedVersion`.
3. `validate_references(&model)` (`reader.rs:115`) — in this order: duplicate element IDs
   (`DuplicateId { section: "elements" }`), duplicate flow IDs
   (`DuplicateId { section: "data_flows" }`), each `data_flows[].from` and `.to` resolves to an
   element (`InvalidReference`), each `trust_boundaries[].contains` entry resolves to an element,
   each `threats[].element` resolves to an element, each `threats[].flow` resolves to a flow.

`reader.rs` deduplicates **only** `elements` and `data_flows`, and its reference checks are
exactly the six above. Parity means reproducing this set and this order precisely — not a
superset.

`BrowserFileAdapter.openThreatModel` (`src/lib/adapters/browser-file-adapter.ts:41`) does
`yaml.load(text) as ThreatModel`, normalizes empty arrays, and returns. It performs none of the
three checks, and the cast asserts a shape nothing verified. Missing required sections are
invisible because `js-yaml` has no schema.

### What the shared corpus already pins

`tests/fixtures/thf/` (README: `tests/fixtures/thf/README.md`) is read from both languages —
`src-tauri/src/file_io/fixtures_test.rs` and `src/types/thf-fixtures.test.ts` (via Vite `?raw`).
The Rust side already asserts the target behavior:

- `invalid_fixtures_are_rejected_with_the_expected_error` (`fixtures_test.rs:395`) maps each
  invalid fixture to its expected `ThreatForgeError` variant.
- `valid_fixtures_pass_reader_validation` (`fixtures_test.rs:444`) asserts every valid fixture
  survives `read_threat_model`.

The TypeScript side currently pins the **broken** behavior as characterization:
`applies no version or reference validation on the browser read path`
(`src/types/thf-fixtures.test.ts:179`) asserts the browser opens all three invalid fixtures and a
metadata-less document. This test is now false against the target behavior and must be inverted,
following the same discipline `#115` applies to its own characterization tests.

Invalid fixtures and their `reader.rs` verdicts:

| Fixture | `reader.rs` variant | Determined by document content only |
|---------|---------------------|-------------------------------------|
| `invalid/unsupported-version.thf` | `UnsupportedVersion { version: "2.0", supported: ["1.0"] }` | yes |
| `invalid/duplicate-element-id.thf` | `DuplicateId { id: "app", section: "elements" }` | yes |
| `invalid/unknown-flow-target.thf` | `InvalidReference { field: "data_flows[flow-1].to", reference: "missing-db", valid: [...] }` | yes |
| `invalid/truncated.thf` | `YamlParse` (malformed YAML) | no (path + parser text) |
| `invalid/missing-metadata.thf` | `YamlParse` (required section absent) | no (path + parser text) |

### How errors reach the user today

`open_threat_model` (`src-tauri/src/commands/file_commands.rs:12`) maps `ThreatForgeError` to a
`String` via `e.to_string()` (the `#[error(...)]` `Display` in `src-tauri/src/errors.rs:36-50`).
That string rejects the `invoke` promise. But `openModel` (`src/hooks/use-file-operations.ts:117`)
does **not** wrap `adapter.openThreatModel()` in a try/catch (unlike `importModel`, which
`window.alert`s the message at `:214-217`). So today the desktop error is thrown but never shown —
callers use `void openModel()`. Achieving "same user-facing error" therefore requires surfacing in
the shared consumer, which also fixes the currently-swallowed desktop error. There is no toast
system; `test-setup.ts` stubs nothing, so `window.alert` is a jsdom no-op that tests spy on.

### Relevant Display strings (the message-parity source of truth)

From `src-tauri/src/errors.rs`, rendered for the three content-determined fixtures:

- `Unsupported schema version '2.0'. Supported versions: ["1.0"]`
- `Duplicate ID 'app' in section 'elements'`
- `Invalid reference in 'data_flows[flow-1].to': 'missing-db' not found. Valid IDs: ["app"]`

Note the vector rendering: Rust `{:?}` on `Vec<String>` emits `["1.0"]` and, for multiple
elements, `["a", "b"]` — double-quoted, **comma-space** separated. A TypeScript mirror must join
with `", "` and quote each element; `JSON.stringify(["a","b"])` would emit `["a","b"]` (no space)
and drift.

## Design decision: keeping browser validation in lockstep with `reader.rs`

The acceptance criterion "the two must not be able to disagree silently" is the load-bearing
design question. Three approaches were weighed against this codebase's actual constraints.

**Rejected — compile the Rust checks to WASM.** There is no WASM toolchain in the repository
today: no `wasm-pack`/`wasm-bindgen`, no `.wasm` step in `vite.config.ts`, and the browser build
is a plain web bundle. `CONTRIBUTING.md` lists "dependencies that significantly increase binary
size" among changes the project will likely reject, and bundle size is called out as a first-class
constraint. Shipping a Rust→WASM blob (plus its toolchain, CI wiring, and load-time cost) to run
three checks that are string equality, `HashSet` duplicate detection, and membership over
string arrays is disproportionate. It also would not, on its own, guarantee the *user-facing
message* parity the issue also requires.

**Rejected — generate both validators from a shared declarative spec.** There is no codegen
infrastructure in the repo, and the three checks are not uniformly declarative: `validate_version`
is exact-string, dedup is per-section, and the reference rules are heterogeneous (flow→element,
boundary-child→element, threat→element, threat→flow, some optional). A spec expressive enough to
capture "field X references an ID in section Y, required vs optional, in this order" plus an
interpreter in two languages is more machinery than two callers justify (anti-slop: no speculative
abstraction before a second real caller — there are exactly two consumers, Rust and TS). The spec
itself would become a fourth artifact that can drift from `reader.rs`, and `#57` would have to grow
it in lockstep anyway.

**Chosen — a TypeScript mirror held together by contract tests over the shared fixture corpus.**
This is the mechanism the repository already uses for the schema itself: `src/types/threat-model.ts`
mirrors the Rust structs and is kept honest by the corpus, not by codegen. The corpus already
exists and is already loaded from both sides. The lockstep guarantee is:

> Every fixture that `read_threat_model` rejects must be rejected by the browser validator with a
> corresponding class, and every fixture `read_threat_model` accepts must be accepted by the
> browser validator. Because both languages consume the identical bytes, a divergence is a red
> test, in the same CI run that already runs both fixture suites.

This is consistent with the established pattern, adds no toolchain, adds negligible bundle weight,
and is the only option that also lets us pin the *message* text. Its weakness — a TypeScript copy
can drift from a `reader.rs` edit — is mitigated by (a) the corpus classification test failing on
any behavioral divergence, and (b) a cross-linking comment in both the module and the test naming
`reader.rs` and `fixtures_test.rs` so a future editor of either side sees the other.

### Defining "same" error, testably

Parity is defined at two levels, because the two error classes have different determinism:

1. **Classification parity (CI-enforced, the anti-silent-disagreement guarantee).** For every
   fixture in the shared corpus, the browser validator's rejection class matches the `reader.rs`
   verdict, asserted through a per-fixture manifest that mirrors the Rust match arms in
   `invalid_fixtures_are_rejected_with_the_expected_error`. `reader.rs` lumps both `truncated` and
   `missing-metadata` under `YamlParse`; the browser distinguishes them (a `js-yaml` parse
   failure vs. a shape-narrowing failure). The manifest therefore maps those two to
   `class ∈ { parse, missing-section }`, and both remain fail-closed. The three
   content-determined fixtures map 1:1.

2. **Message parity (user-facing text).** For the three content-determined variants
   (`UnsupportedVersion`, `DuplicateId`, `InvalidReference`) the browser validator formats its
   `Error.message` byte-identically to the `reader.rs` `#[error(...)]` `Display`, including the
   `", "`-joined quoted vector rendering. The contract test pins the three exact strings above.
   These strings contain no path and no parser text, so byte identity is achievable and stable.
   For the `parse` and `missing-section` classes byte identity is impossible — the desktop message
   embeds a filesystem path and `serde_yaml`'s parser text, neither of which exists in the browser
   — so parity there is class-level plus an actionable, path-free, secret-free message. The
   browser's `missing-section` message may be *more* specific than desktop's generic "Failed to
   parse YAML"; this is an intentional, documented divergence in the more-actionable direction.

### How `#57` stays in lockstep without this plan going stale

The anti-staleness mechanism is the **shared invalid-fixture manifest**, not a rule list. When
`#57` adds a reference rule to `reader.rs`, it also adds an `invalid/<rule>.thf` fixture and a
manifest entry (on both the Rust and TS sides, exactly as the current corpus works). The browser
contract test iterates the manifest and asserts the expected class per fixture, so a new invalid
fixture that the browser validator does not yet handle is a failing test — forcing `#57`'s
implementer to extend the browser validator in the same change. This plan therefore names the
mechanism and deliberately does **not** enumerate `#57`'s future rules; adding them is `#57`'s
work, gated by the manifest.

### Preserving the browser writer's forward-compatibility (a hard constraint)

`file-format.md` (Schema versioning policy → Residual risk) and the pinned test
`carries unknown sections and keys through a load/dump/load cycle`
(`src/types/thf-fixtures.test.ts:115`) document that the **browser** writer preserves unknown
sections and keys across load/save, unlike the desktop writer. That behavior depends on
`openThreatModel` returning the *plain parsed object* with unknown fields intact. Therefore the
validator must be **non-destructive**: it validates the parsed value (runtime shape guard +
semantic checks) and returns that same object typed as `ThreatModel`, applying array defaults
in place. It must not reconstruct a clean, stripped `ThreatModel`, which would silently regress
the documented forward-compatibility asymmetry. This is the sharpest correctness hazard in the
change.

### Shape-narrowing depth (an intentional, documented difference)

`serde` on desktop validates every non-`Option` field of every struct. The browser guard
validates the **skeleton the semantic checks and safe rendering require**: `version` is a string;
`metadata` is present and an object with string `title`, `author`, and (post-`#115`) string
`created`/`modified`; and each collection, when present, is an array of objects each carrying a
string `id`. It tolerates unknown fields (matching `serde`'s non-`deny_unknown_fields`) and does
not re-validate every optional scalar's type. This depth is corpus-anchored: the only shape
fixture today is `missing-metadata`, and any future fixture exercising deeper shape validation
forces the guard to deepen via the manifest. The difference is documented in Step 6, satisfying
"any intentional difference is documented as such."

## Implementation steps

Each step is independently executable at XS/S size. Steps 1–2 are pure and land before any
adapter or UI wiring.

### 0. Rebase on merged `#115` and read its narrowing (gate, no new code)

- **Behavior:** No behavior change; establishes the baseline this plan builds on.
- **Files:** read `src/lib/adapters/browser-file-adapter.ts` and `src/types/threat-model.ts` as
  merged after `#115`.
- **Implementation:** confirm `#115` has merged. Identify where `#115` narrows the parsed value at
  the open boundary and whether `metadata.created`/`modified` are strings at runtime. If `#115`
  introduced a narrowing function, Step 1 extends it rather than creating a parallel one.
- **Targeted verification:** `npm run test -- src/types/thf-fixtures.test.ts` passes on the merged
  baseline (the `#115`-inverted date tests are green).
- **Intent validation:** owner confirms `#115` is merged, not merely open, before code begins.

### 1. Add the shared browser read validator

- **Behavior:** a pure function that turns the untyped `js-yaml` output into a validated
  `ThreatModel` or throws a typed, user-safe error, mirroring `reader.rs` exactly and preserving
  unknown fields.
- **Files:** new `src/lib/thf-validation.ts`.
- **Implementation:**
  - Export a discriminated error type (e.g. `ThfValidationError` extending `Error`) whose `kind`
    is one of `unsupported-version | duplicate-id | invalid-reference | parse | missing-section`,
    carrying the structured fields needed for message parity (`version`/`supported`,
    `id`/`section`, `field`/`reference`/`valid`).
  - Export `validateThreatModel(parsed: unknown): ThreatModel`. It:
    1. Narrows shape fail-closed (skeleton depth defined above). A missing/!object `metadata`
       throws `missing-section`. Tolerate unknown keys.
    2. Applies the existing in-place array defaults (`elements`, `data_flows`,
       `trust_boundaries`, `threats`, `diagrams` default to `[]`; each element's `technologies`
       defaults to `[]`) on the same object so unknown fields survive.
    3. Runs the semantic checks in `reader.rs` order: version exact-match → duplicate element IDs
       → duplicate flow IDs → each `data_flows[].from` → `.to` → `trust_boundaries[].contains` →
       `threats[].element` → `threats[].flow`. First failure throws.
    4. Returns the same (now type-safe, unknown-field-preserving) object.
  - Message formatting reproduces the three `#[error]` templates byte-for-byte, including the
    `", "`-joined, double-quoted vector rendering (a small `formatIdList` helper, not
    `JSON.stringify`).
  - Header comment cross-links `src-tauri/src/file_io/reader.rs` and
    `src-tauri/src/file_io/fixtures_test.rs` as the parity source.
  - Mirror precisely: dedup only `elements` and `data_flows`; do not add checks `reader.rs` lacks.
- **Targeted verification:** covered by Step 2 (this module has no DOM dependency and is tested
  directly).
- **Intent validation:** owner confirms the check set and order match `reader.rs`, and that the
  function returns the original object (unknown fields intact) rather than a rebuilt one.

### 2. Corpus contract test — the lockstep guarantee

- **Behavior:** the browser validator agrees with `reader.rs` on every corpus fixture, by class
  and (for the three content-determined variants) by exact message.
- **Files:** new `src/lib/thf-validation.test.ts`.
- **Implementation:**
  - Import all fixtures via `?raw` (same mechanism as `src/types/thf-fixtures.test.ts`).
  - Define an invalid-fixture manifest mapping each fixture to its expected browser class,
    mirroring `invalid_fixtures_are_rejected_with_the_expected_error`
    (`fixtures_test.rs:395`). Map `truncated`→`parse`, `missing-metadata`→`missing-section`
    (with a comment that `reader.rs` lumps both under `YamlParse`), and the three
    content-determined fixtures to their 1:1 classes.
  - Assert `validateThreatModel(yaml.load(raw))` throws the expected class for each invalid
    fixture, and for `unsupported-version`, `duplicate-element-id`, `unknown-flow-target` assert
    the exact `Error.message` strings from *Relevant Display strings* above.
  - Assert every valid fixture (`v1.0-minimal`, `v1.0-canonical-full`, `v1.0-unknown-fields`,
    `legacy-sidecar/model`) passes `validateThreatModel` without throwing — the mirror of
    `valid_fixtures_pass_reader_validation`.
  - Assert the returned object for `v1.0-unknown-fields` still carries `unknown_future_section`
    and `metadata.unknown_future_flag` — the non-destructive-preservation guard.
  - Header comment cross-links `fixtures_test.rs` and states the manifest is the shared checklist
    `#57` extends.
- **Targeted verification:** `npm run test -- src/lib/thf-validation.test.ts` passes; temporarily
  removing the version check from Step 1 turns the `unsupported-version` case red (discriminating).
- **Intent validation:** owner confirms the manifest matches the Rust match arms one-to-one for
  the content-determined fixtures and that unknown-field preservation is asserted.

### 3. Wire the validator into `BrowserFileAdapter.openThreatModel`

- **Behavior:** the browser open path parses, validates, and returns — or throws a typed,
  user-safe error. The `as ThreatModel` cast is gone.
- **Files:** `src/lib/adapters/browser-file-adapter.ts`.
- **Implementation:**
  - Wrap `yaml.load(text)` so a `yaml.YAMLException` is caught and rethrown as the validator's
    `parse` error with an actionable, path-free message (do not leak raw parser internals).
  - Replace `const parsed = yaml.load(text) as ThreatModel` and the inline array-normalization
    block with `const model = validateThreatModel(yaml.load(text))` (normalization now lives in
    the validator). Return `{ model, path: file.name }`.
  - Preserve cancellation (`pickFile` returning `null` still returns `null`).
- **Targeted verification:** `npm run test -- src/lib/thf-validation.test.ts` and
  `npm run test -- src/types/thf-fixtures.test.ts` (after Step 4) pass; `npx tsc --noEmit`
  confirms the cast removal type-checks.
- **Intent validation:** owner confirms a truncated file and a valid file both behave correctly in
  a real browser open, and that a browser-saved valid file still round-trips (unknown-field
  preservation not regressed).

### 4. Invert the stale characterization test

- **Behavior:** the corpus test file stops asserting the now-fixed broken behavior.
- **Files:** `src/types/thf-fixtures.test.ts`.
- **Implementation:** remove `applies no version or reference validation on the browser read path`
  (`:179`) and replace it with a short assertion (or comment pointer) that validation now lives in
  `validateThreatModel`, covered by `src/lib/thf-validation.test.ts`. Do not weaken any other
  assertion; leave the `#115` date tests and the unknown-field-preservation test untouched.
- **Targeted verification:** `npm run test -- src/types/thf-fixtures.test.ts` passes with the stale
  test gone; `grep` confirms no remaining assertion claims the browser skips validation.
- **Intent validation:** owner confirms the characterization test was inverted deliberately, not
  silently deleted to make CI green, and that its coverage moved to Step 2.

### 5. Surface the rejection to the user in the shared consumer

- **Behavior:** a rejected open shows the user an actionable alert on both platforms, and leaves
  the current document untouched.
- **Files:** `src/hooks/use-file-operations.ts`; new `src/hooks/use-file-operations.test.ts`.
- **Implementation:**
  - Wrap `adapter.openThreatModel()` in `openModel` (`:125`) in try/catch, `window.alert(message)`
    on failure — matching the existing `importModel` pattern (`:214-217`). On error, return early
    without calling `setModel`, so a failed open cannot partially replace the open document. This
    also surfaces the previously-swallowed desktop error, since the rejected `invoke` message is
    the same Rust `Display` string.
  - Add a focused hook test: mock the adapter so `openThreatModel` rejects with a known message;
    `vi.spyOn(window, "alert")`; assert `alert` is called with that message and the model store is
    unchanged. Add a success case asserting `setModel` is called and no alert fires.
- **Targeted verification:** `npm run test -- src/hooks/use-file-operations.test.ts` passes; the
  rejecting case asserts both the alert text and the untouched store (discriminating against a
  partial-load regression).
- **Intent validation:** owner opens `invalid/unknown-flow-target.thf` in the browser and confirms
  the alert text equals the desktop alert text for the same file, and that the previously-open
  document is still intact.

### 6. Document the parity contract and the intentional differences

- **Behavior:** the deliberate cross-platform contract is written down, not implicit.
- **Files:** `docs/knowledge/file-format.md` (a short subsection under Schema versioning policy or
  Testing); `tests/fixtures/thf/README.md`.
- **Implementation:** record that the browser read path now applies the same three checks as
  `read_threat_model`; that classification parity is enforced by the shared invalid-fixture
  manifest across `fixtures_test.rs` and `thf-validation.test.ts`; that message parity is
  byte-identical for the three content-determined variants and class-level for `parse` and
  `missing-section` (with the browser possibly more specific); that shape-narrowing is
  skeleton-depth by design; and that validation runs only at open — no retroactive or save-side
  validation. Cross-link `reader.rs`, `src/lib/thf-validation.ts`, and the manifest. Note that
  `#57` extends the manifest, not this document's rule list.
- **Targeted verification:** `npm run test` (docs-adjacent tests unaffected); a reviewer confirms
  the doc names the mechanism, not a frozen rule list.
- **Intent validation:** owner confirms the documented differences are the ones actually shipped
  and that ADR-009's fail-closed argument now reads as applying to both platforms.

## Cross-cutting requirements

- **Security and privacy:** the `.thf` file is untrusted input crossing into the app. Validation
  fails closed; error messages are user-safe (no filesystem paths, no `js-yaml` internals, no
  secrets). Catch `YAMLException` and rethrow a sanitized message rather than surfacing raw parser
  text. `security-auditor` lane applies (file input trust boundary).
- **`.thf` compatibility:** no schema change. The validator is non-destructive and preserves
  unknown fields, keeping the browser writer's documented forward-compat behavior and the
  `carries unknown sections and keys` test green. All existing corpus round-trip and
  backward-compat assertions must stay untouched. `threat-model-expert` lane applies (reference
  rules and version gating).
- **Browser and desktop:** this closes the accidental divergence flagged in `AGENTS.md`
  ("deliberate rather than accidental fallbacks"). Remaining differences (message text for
  path/parser-dependent classes; shape-narrowing depth) are intentional and documented in Step 6.
- **AI safety:** N/A to this change directly; validation runs on the file read path, not AI
  mutations. No retroactive validation of AI-produced in-memory state (explicit non-goal).
- **Accessibility and UX:** error surfacing reuses `window.alert` (existing pattern); no new UI.
  A failed open leaves the current document and canvas untouched (no partial-load state).
- **Observability and evidence:** the corpus contract test is the durable evidence; capture the
  browser alert screenshot for the invalid-flow-target case as the parity artifact for owner
  validation.

## Verification gate

Targeted checks while iterating:

```bash
npm run test -- src/lib/thf-validation.test.ts
npm run test -- src/types/thf-fixtures.test.ts
npm run test -- src/hooks/use-file-operations.test.ts
npx tsc --noEmit
npx biome check .
```

Final required gate before handoff:

```bash
npm run ci:local
```

No Rust changes are introduced, so no new Cargo work is required; the Rust corpus suite stays the
reference and must remain green. No E2E, Docker, or release checks are required for this change.

## Owner validation

Green CI does not complete these:

- Open each of `invalid/unsupported-version.thf`, `invalid/duplicate-element-id.thf`, and
  `invalid/unknown-flow-target.thf` in a real browser build and confirm the alert text is
  identical to the desktop alert for the same file.
- Open `invalid/truncated.thf` and `invalid/missing-metadata.thf` in the browser and confirm the
  messages are actionable, leak no path or parser internals, and that the app does not enter a
  half-loaded state.
- Open a valid file, then a valid file that was previously **saved by the browser** (carrying
  unknown future sections), and confirm it still opens and re-saves with those sections intact —
  i.e., validation did not strip unknown fields.
- Confirm a rejected open leaves the previously-open document and canvas unchanged.
- Confirm no browser-only check exists that the desktop lacks (a file the desktop accepts must not
  be rejected in the browser).

## Specialist review

- [ ] PR reviewer
- [ ] Slop auditor
- [ ] Security auditor, when boundary/security lanes apply — **applies** (untrusted file input,
      fail-closed, user-safe errors).
- [ ] Threat-model expert, when schema/STRIDE/threat lanes apply — **applies** (`.thf` reference
      rules and version gating parity).

## Replan log

Append changes; do not rewrite prior decisions.

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-07-21 | Initial plan | Issue #116 body; `reader.rs`, `errors.rs`, `file_commands.rs`, `browser-file-adapter.ts`, `use-file-operations.ts`, the `tests/fixtures/thf/` corpus and both fixture suites, `file-format.md` ADR-009 / schema-versioning section, and `#115`/`#55`/`#57` relationships |
