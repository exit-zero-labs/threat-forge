# Agentic slop doctrine

This doctrine identifies low-signal or falsely complete engineering output without rewarding
destructive cleanup. It applies to human- and AI-authored changes.

## False-positive guards

### Functionality is sacred

Do not remove working behavior, validation, accessibility, error handling, compatibility,
tests, or security controls merely to reduce lines or make a diff look cleaner.

### Signal over noise

Boundary defense, domain complexity, platform-specific behavior, and thorough tests are not
slop when they protect a real invariant. A review that manufactures findings is itself noise.

## Recognition patterns

### Architecture and code

- An abstraction exists before a second real caller or varying behavior.
- A partial implementation is presented as complete while consumers ignore or collapse it.
- Errors are swallowed, broadly caught, or converted into success-shaped defaults.
- Defensive branches cover impossible states while realistic failure paths are unhandled.
- APIs, CLI flags, status codes, environment behavior, or platform guarantees are guessed.
- Logic is duplicated instead of using an established contract or helper.
- A control's label and render condition are updated together while its handler keeps doing what
  the old condition implied.
- Dead scaffolding, placeholder values, fake adapters, or TODO behavior remains on a success
  path.
- `any`, double casts, `as never`, non-null assertions, or unvalidated records bypass the type
  system.
- Browser and Tauri adapters drift for behavior that should share a contract.
- Rust, TypeScript, schema, prompt, documentation, and tests are only partially wired.

### Tests

- Only happy paths exist for changed behavior.
- A test proves a mock or implementation detail rather than the user-visible contract.
- The assertion would pass before the implementation or after deleting the behavior.
- Assertions are weakened, timing is inflated, or failures are skipped to make CI green.
- Large snapshots are updated without inspecting the behavioral difference.
- E2E failures lose screenshots, traces, console errors, or reproducible fixture state.
- A test result is reported without stating which tree state produced it, so a red or green
  observed during someone else's edit is indistinguishable from a real one.

### Documentation and operations

- Documentation restates code instead of linking to the canonical source.
- Rationale or precision is invented after the fact.
- A rule or comment is justified only by a mistake that never existed outside the change making
  it, so nothing supporting it survives the branch.
- A runbook claims a deployment, security, or signing control that is not configured.
- One hosting, release, or project surface changes while DNS, workflows, privacy text, or
  repository policy remains stale.
- Engineering documentation uses marketing filler or claims completion without evidence.

## ThreatForge-specific high-risk patterns

- A `.thf` field is added in Rust but not TypeScript, adapters, migration, fixtures, and
  round-trip tests.
- Unknown YAML fields are rejected or silently lost despite forward-compatibility policy.
- AI text is parsed into graph mutations without schema validation, approval, and undo.
- Generated threats repeat generic STRIDE descriptions without evidence from the current
  architecture.
- Severity, CVE, asset, protocol, trust boundary, or mitigation claims are fabricated.
- A model mutation tool validates shape but not current document references or invariants.
- Multi-document work retains singleton assumptions in model, canvas, history, selection,
  settings, or conversation state.
- Screenshot baselines are regenerated without inspecting hierarchy, clipping, contrast,
  overlap, and interaction states.
- A manual deployment path bypasses the reviewed commit and protected release boundary.

## Review procedure

1. Read the issue or plan, diff, full changed files, tests, and neighboring conventions.
2. Confirm intended behavior before proposing cleanup.
3. Classify findings:
   - `must-fix`: false behavior, fake completeness, broken contract, or unsafe bypass
   - `should-fix`: meaningful reliability or maintainability defect
   - `consider`: optional tradeoff
4. Prefer the smallest behavior-preserving fix.
5. Re-run targeted verification after changes.
6. Record a new recognition pattern only when concrete evidence is novel and repeatable.

## Recognition log

### 2026-07-20 — Machine registry leaked into the lockfile

**Tell:** a dependency update produced non-canonical package URLs and weaker integrity values
because the author's global npm registry silently affected generated metadata.

**Fix:** pin the project registry, regenerate from a clean install, enforce canonical
`registry.npmjs.org` URLs and SHA-512 integrity before install/release, and audit the result.

### 2026-07-20 — Dependency update expanded an event contract

**Tell:** E2E behavior passed while TypeScript failed because a library callback widened from a
React mouse event to DOM mouse-or-touch events.

**Fix:** adopt the library's exported callback type instead of narrowing the handler or pinning
back a security-maintained dependency.

### 2026-07-20 — Source migration did not prove runtime migration

**Tell:** repository text described Cloudflare while production DNS still targeted the previous
host and no Cloudflare project existed.

**Fix:** treat source, deployed service, custom domains, DNS, headers, analytics, privacy text,
verification, and rollback as one migration contract.

### 2026-07-27 — A concurrent review lane fabricated a finding out of another lane's mutation

**Tell:** a `must-fix` arrived with everything a true finding has — a reproduction count, a named
line, a plausible mechanism, and a verified minimal fix — and none of it existed. Three review
lanes ran in parallel against one checkout; one had reverted a production fix to prove a test
caught it, and another ran the suite in that window and diagnosed the breakage as a flaky test.
The reported failure was byte-identical to the mutation the first lane said it had applied. A
quiet tree was green 8 runs out of 8.

The general shape: **a finding is only as trustworthy as the tree state it was observed on, and
a report that omits that state cannot be checked.** The dangerous direction is not the false red
— that one gets caught by re-running. It is the false **green**, where a half-applied mutation
makes a suite pass for a lane that then clears the change.

**Fix:** serialize any lane that mutates the working tree, keep read-only lanes parallel, and
require every lane that has a shell to open its report with the tree state it observed and to
confirm — not assume — that it restored what it changed. A lane with no shell cannot read that
state and is given its commit instead. See #264 and `.claude/skills/pr-preflight/SKILL.md`.

### 2026-07-27 — A control was relabeled to match its new gate while its handler kept the old one

**Tell:** the clear-text key notice's render condition widened from the selected provider to any
provider holding residue, and its label was rewritten from a destructive phrasing to a re-read
phrasing. The gate and the label agreed with each other. The handler still called `deleteKey`,
which commits a permanent revocation marker — so an `unverified` reading rendered a red `Trash2`
control labeled `Check again` that destroyed a key the user had asked it only to look at. Later
in the same change, a control whose copy spoke only about the clear-text slot destroyed an
encrypted key saved in a second tab. Two review lanes found that one independently in round two:
it survives the author, and it survives every test that asserts the label.

The general shape: **relabeling is the cheapest edit in a review cycle.** When a reviewer says
the wording is wrong the fix is a string, and nothing about editing a string prompts anyone to
re-derive whether the dispatch beneath it still follows from the new condition.

**Fix:** when a control's label or render condition changes, re-derive its handler from the new
condition, and pin the *dispatch* in a test rather than the label. See PR #266 (`fddaab3`) and the
2026-07-27 deviation rows in `docs/plans/233-persistent-clear-text-key-warning.md`.

### 2026-07-27 — A comment was justified by a mistake that only existed in its own draft

**Tell:** comments drafted during #233 explained why an approach had been rejected, where the
rejected approach had only ever existed in an earlier draft of the same diff. They read as
hard-won and cited nothing a reader could reach. Nobody outside the branch could have made the
mistake being warned about, and the warning would outlive every reader able to interpret it.

This is not the neighboring pattern of inventing rationale. There the reasoning is fabricated;
here it is sound and simply undurable — the evidence was discarded with the draft, so the rule it
supports cannot be re-derived, re-tested, or retired when it stops applying. From the artifact
alone the two look identical, because a justification with no trace in the record reads the same
either way, and the artifact-level remedy is the same for both. The distinction is for the author,
who is this document's primary reader during self-review and the one person who knows which they
are doing.

**Boundary, so this cannot be used to strip legitimate comments:** a self-review correction is
good evidence for a comment describing *the code as shipped*. The launch-probe comment in
`src/components/layout/app-layout.tsx` is the shape that holds up — it says why the probe exists
and points at a dated measurement in that plan's replan log, so its support outlived the branch.
The pattern is specifically about rules whose only support is a discarded alternative.

**Fix:** ground a rule in something that outlived the branch — a committed plan row, an issue, or
a test that fails without it — or state the fact about the shipped code and drop the story. This
entry is held to that standard too: #233's own instances were caught in its review rounds and
never merged, so no line of the diff records them. The contemporaneous filing is #267, made the
same day the fix landed and describing them — a record of the observation, not of the hazard.
