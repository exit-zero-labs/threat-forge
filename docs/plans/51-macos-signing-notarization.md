# Issue 51 — macOS signing and notarization

## Objective

Produce Apple Silicon and Intel application/DMG artifacts signed as Exit Zero Labs LLC, hardened, notarized and stapled, and reject invalid artifacts before upload.

## Issue contract

- **Issue:** [#51](https://github.com/exit-zero-labs/threat-forge/issues/51)
- **Parent initiative:** native Feature [#44](https://github.com/exit-zero-labs/threat-forge/issues/44)
- **Type:** Task
- **Effort:** High
- **Priority:** High
- **Autonomy:** HITL
- **Dependencies:** protected Apple certificate/password and notarization key, Production approval, coordinated shared workflow changes with #50; separate commit/push/run authorization
- **Non-goals:** Mac App Store, updater trust root (#49), public release publication, certificate revocation or retirement

## Current behavior and evidence

Planning snapshot: 2026-10-03, source `53ffc0b647ca8a625537cced9e977785092cbaf2`. The release matrix builds both architectures but all Apple signing env references are commented. Cargo has main binary `threat-forge` and helper `threatforge-mcp`; Tauri bundles both. Hardened runtime defaults true in the installed CLI schema but is not explicit in project config. The live issue requires both architectures, native verification and clean downloaded-artifact validation. The [release signing runbook](../runbooks/configuring-release-signing.md) remains canonical operational guidance.

The orchestrator verified a working new Developer ID Application identity for team Q4N97LZS6U, protected p12/p8 secrets and nonsecret Production vars. Password entry must be verified by secret name, without exposing its value. Local Apple Silicon app was signed, notarized and stapled; its independently notarized DMG was accepted. These are local proofs, not signed CI releases. A clean Intel build exposed ordering failure: signing the main executable found unsigned `Contents/MacOS/threatforge-mcp`. Cached earlier signatures masked that failure on Apple Silicon. Fix ordering rather than changing the valid certificate. The subsequent orchestrator Intel helper-first signing plus `tauri bundle` succeeded: app notarization Accepted and codesign/Gatekeeper/stapler passed. Intel DMG independent notarization remained pending at plan writing; its success must be verified before completing that architecture.

## Implementation steps

These are proposed executable decomposition Tasks, not filed issues. Every implementation Task must be directly parented to Feature #44 and linked as #51's dependency; do not create a Task-under-Task chain. Commit this plan before production edits. The generic planner Low-step requirement conflicts with AGENTS' mandatory High classification for cryptography/trust-boundary work; security implementation Tasks stay High, with bounded steps rather than falsely Low labels.

### 1. Prepare ephemeral Apple credentials and deterministic signing order

- **Behavior:** both architectures work from freshly compiled unsigned helper code and never depend on previously signed build caches.
- **Files:** `.github/workflows/release.yml`, focused `scripts/sign-macos.sh` if needed, `src-tauri/tauri.conf.json`, script/workflow tests.
- **Implementation:** macOS steps alone receive protected APPLE_CERTIFICATE, APPLE_CERTIFICATE_PASSWORD, APPLE_API_PRIVATE_KEY and vars APPLE_SIGNING_IDENTITY, APPLE_API_KEY, APPLE_API_ISSUER. Fail early on absent values. Decode p12/p8 with umask 077 under RUNNER_TEMP, mode600; create a random-password ephemeral keychain, import p12, grant codesign partition access, preserve original search-list/default-keychain state. Select the approved Developer ID identity and expected Team ID rather than ambiguous login-keychain matches. Set explicit `bundle.macOS.hardenedRuntime: true`; retain existing entitlements if needed, add none without exercised capability evidence. Run `npm run tauri -- build --target <target> --no-bundle -- --frozen`, sign `src-tauri/target/<target>/release/threatforge-mcp` first with `codesign --force --timestamp --options runtime --keychain <temporary-keychain> --sign <identity>`. Verify helper immediately. Then run `npm run tauri -- bundle --target <target> --bundles app,dmg` with API key path and signing identity, letting Tauri sign main/enclosing bundle, notarize app and staple. Do not use `codesign --deep` for signing or broad runtime entitlements. Validate this smallest workaround on fresh binaries for both architectures; if the installed bundler still rewrites/recompiles helper, stop and append evidence-backed replan rather than weakening verification.
- **Targeted verification:** clean isolated target outputs on each architecture; verify helper has no inherited valid signature before ordered signing. Assert executable architecture via `file`/`lipo -archs`, helper/main and bundle authority/team/runtime/timestamp. Missing credentials, wrong identity, unsigned nested helper and signer failure abort before upload. Shell failure-path tests use temporary fixtures and establish control flow only; real Apple proof remains mandatory.
- **Intent validation:** owner exercises app startup and MCP helper; check minimal entitlements support current capabilities without introducing unrelated access.

### 2. Verify app and independently notarize final DMG

- **Behavior:** every final distributed container carries valid trust evidence, and verification covers extracted application bytes.
- **Files:** new focused `scripts/verify-macos-signing.sh` or existing release helper, release workflow.
- **Implementation:** assert exactly expected app and DMG outputs for each architecture; run `codesign --verify --deep --strict --verbose=2`, display authority/team/runtime/timestamp and assess app with `spctl --assess --type execute --verbose=4`; require stapler app validation. Capture successful Tauri app submission evidence. Sign final DMG if not already properly signed, submit that final DMG separately with `xcrun notarytool submit --key <p8> --key-id <id> --issuer <issuer> --wait --output-format json`, require Accepted, staple and validate DMG. Never treat app notarization as proof the DMG is stapled. Retain submission IDs/status and sanitized verification output, fetch diagnostic log on rejection. Mount final DMG read-only, verify extracted app/helper again, and always detach. Generate SHA-256 after final stapling; no mutation afterward.
- **Targeted verification:** invalid copied signature, missing helper/app/DMG, wrong architecture/team, absent hardened runtime, missing ticket and non-Accepted submission all fail before artifact upload. Verify notarytool command/API syntax against installed Xcode and Apple current docs during implementation.
- **Intent validation:** owner launches downloaded DMG app on a clean compatible Mac with Gatekeeper/quarantine active and no override. Team/certificate correctness does not alone demonstrate first-download UX.

### 3. Keep verification ahead of publication and guarantee cleanup

- **Behavior:** no unverified upload, no private files in caches, no residual keychain or credentials after success/failure.
- **Files:** `.github/workflows/release.yml`, a nonpublishing rehearsal workflow if needed, runbook.
- **Implementation:** replace coupled build-and-release action execution with build/sign/notarize/verify steps followed by explicit upload of verified final paths. Apple jobs need contents read until separately authorized publication; never grant Azure id-token. Keep target caches restricted to unsigned build inputs or avoid saving signing outputs; do not cache temporary keychain/p12/p8. Cleanup `if: always()` restores keychain state, deletes workflow-created keychain and credential files, detaches mounted images and checks no leftovers. Use SHA-pinned actions. Update runbook with actual sequence, minimal entitlement rationale, certificate/API-key rotation and failure recovery, preserving healthy old identities until deliberate retirement.
- **Targeted verification:** workflow checks assert Apple secrets occur only in macOS preparation/signing steps, cleanup executes after induced failure, no upload precedes verification, no skip-stapling/no-sign/ad-hoc fallback and no private paths fall under cache/artifact globs. Both matrix targets must succeed; one does not satisfy the issue.
- **Intent validation:** owner accepts evidence and backup custody; removal of original Downloads key copies requires verified encrypted backup and scoped deletion approval.

### 4. Run protected two-architecture rehearsal

- **Behavior:** CI runner credentials and downloaded artifacts reproduce local signing proof.
- **Files:** signing rehearsal workflow and runbook evidence references.
- **Implementation:** workflow_dispatch builds from a separately authorized new v* tag whose commit includes these changes, uses Production, and uploads only GitHub Actions artifacts/evidence with contents read. Existing branch dispatch cannot pass Production's tag-only rules; existing tag workflows cannot include new code. Preserve required reviewers/prevent-self-review and require another owner approval. Do not create or publish a GitHub release. Download both architecture artifacts and verify final hashes/native checks again; owner performs clean compatible-Mac launch/save/reopen .thf and helper validation. Release publication remains separate.
- **Targeted verification:** arm64 and x86_64 protected CI runs each show Developer ID authority, expected Team ID, hardened runtime, secure timestamp, Accepted submissions and valid app/DMG tickets. Downloaded byte digests match final CI evidence. Record clean-machine validation separately from CI.
- **Intent validation:** Apple Silicon and Intel-compatible Macs accept downloaded apps without override; signing issue remains In progress until owner validation/merge/local-main validation.

## Cross-cutting requirements

- **Security and privacy:** protected credentials only, temporary keychain and mode600 files, fail closed, no private key or password in logs/source/cache/artifacts. Never revoke a healthy certificate as routine cleanup.
- **.thf compatibility:** no schema change; validate existing local file create/save/reopen after installation.
- **Browser and desktop:** signing applies to desktop; browser behavior unchanged.
- **AI safety:** no AI provider or mutation changes.
- **Accessibility and UX:** accurate distribution instructions and Gatekeeper presentation; no unnecessary entitlement-driven UX change.
- **Observability and evidence:** source/run identifiers, architecture, authority/team/runtime/timestamp, notarization IDs and final digests, without credentials.

## Verification gate

Run focused shell/workflow and verifier failure-path checks, then `npm run ci:local`, `npm run ci:docker`, `npm run ci:docker:build`. Docker cannot establish Apple trust or notarization. Require fresh two-architecture local/CI signing and protected downloaded-artifact rehearsal. Parent #44 additionally needs updater and broader provenance work outside this plan.

## Owner validation

Inspect plausible-but-wrong outcomes: ARM succeeds only because cache contained signatures, unsigned Intel helper blocks enclosing signature, DMG lacks its own ticket despite notarized app, incorrect legal publisher, valid workspace artifact differs from uploaded/downloaded bytes, one architecture omitted, app launch succeeds while helper/file persistence fails. Do not label current public releases signed based on local proof.

## Specialist review

- [ ] PR reviewer
- [ ] Slop auditor
- [ ] Security auditor

## Replan log

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-10-03 | Initial independent plan with clean helper ordering and DMG ticket gates | Live issue #51/#44, source 53ffc0b, orchestrator clean Intel failure and local ARM proof |
| 2026-10-03 | Intel DMG verification completed after initial writing | Orchestrator reports submission `58a1b417-8c75-48fb-85f4-9bd0523a2341` Accepted, stapling and validation successful, final signature valid, and `spctl --assess --type open --context context:primary-signature` Accepted with source Notarized Developer ID. Both architecture app/DMG pairs now pass local native verification; protected CI and clean-machine owner validation remain outstanding. |

## Primary references

[Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/) documents certificate and API env inputs. [Apple TN2206](https://developer.apple.com/library/archive/technotes/tn2206/_index.html) explains nested signing order and verification; its archived guidance is used specifically for code-structure invariants. [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) is the current notarization authority. Installed Tauri build/bundle help confirms separate no-bundle build and target-specific bundling; validate final behavior on this repository rather than assuming helpers are ordered correctly.
