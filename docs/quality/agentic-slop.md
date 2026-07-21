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

### Documentation and operations

- Documentation restates code instead of linking to the canonical source.
- Rationale or precision is invented after the fact.
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
