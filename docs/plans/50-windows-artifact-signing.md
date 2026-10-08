# Issue 50 — Windows Artifact Signing

## Objective

Produce Windows application, MCP helper, NSIS installer/uninstaller and MSI artifacts with verified Exit Zero Labs LLC signatures and RFC 3161 timestamps before any upload.

## Issue contract

- **Issue:** [#50](https://github.com/exit-zero-labs/threat-forge/issues/50)
- **Parent initiative:** native Feature [#44](https://github.com/exit-zero-labs/threat-forge/issues/44)
- **Type:** Task
- **Effort:** High
- **Priority:** High
- **Autonomy:** HITL
- **Dependencies:** protected Production environment approval, provisioned Azure profile/federation; coordinated workflow editing with #51; separate commit/push/run authorization
- **Non-goals:** updater trust root (#49), complete release provenance program (#52), Store distribution, immediate SmartScreen reputation, public release publication

## Current behavior and evidence

Planning snapshot: 2026-10-03, source commit `53ffc0b647ca8a625537cced9e977785092cbaf2`. The issue's triage comment preserves M2, High/High and direct Feature ownership. The shared release matrix grants all platforms contents write, supplies legacy Azure secrets, downloads `Microsoft.Trusted.Signing.Client` 1.0.60 and gates signing behind unset `WINDOWS_SIGNING`. The live issue documents a failed v0.3.0 invocation: string command parsing, wrong relative script path and absent `%1`. The script assumes SignTool on PATH and does not robustly handle terminating errors. `src-tauri/trusted-signing-metadata.json` has the correct East US account/profile. Cargo builds `threat-forge` and `threatforge-mcp`; `bundle.targets` is `all`, therefore MSI remains in scope.

The orchestrator verified the active Public Trust profile, existing profile-scoped signer assignment and Production OIDC federation. This establishes provisioning, not a signed Windows release. The [release signing runbook](../runbooks/configuring-release-signing.md) is the canonical operational contract.

## Implementation steps

These are bounded executable decomposition proposals, not filed issues. Each implementation Task must be directly parented to Feature #44, linked as a dependency of #50 rather than placed under Task #50. Preserve existing tasks rather than silently reparenting. The planner's generic Low-step instruction conflicts with AGENTS' mandatory High classification for trust-boundary work; signing and credential implementation Tasks remain High. Mechanical documentation/evidence steps can be Low. File and claim authorized decomposition, and commit this plan before production edits.

### 1. Repair the packaging signer

- **Behavior:** every Tauri sign request receives exactly one literal path, fails nonzero on error and records successful verification without secret material.
- **Files:** `src-tauri/tauri.signing.conf.json`, `scripts/sign-windows.ps1`, focused PowerShell harness/tests under `scripts/`.
- **Implementation:** use object `signCommand` with command `pwsh`, args `-NoProfile`, `-NonInteractive`, `-File`, `../scripts/sign-windows.ps1`, `%1`; no embedded shell quotes. Use strict terminating error behavior and explicit catch/nonzero exit. Resolve x64 Windows SDK SignTool by numeric SDK version from its installed directory, require Microsoft's supported SDK version and .NET 8 runtime, then pass literal paths via argument arrays. Resolve metadata with one `Join-Path` relative child path or use the workflow's temporary metadata path. Validate file, dlib, metadata and tool exist before invoking. Sign with `/fd SHA256 /tr http://timestamp.acs.microsoft.com/ /td SHA256 /dlib ... /dmdf ...`. Verify immediately with `signtool verify /pa /all /v`; require valid Authenticode status, expected publisher subject and timestamp certificate. Do not pin rotating three-day certificate thumbprints. Preserve expected legal subject fields, comparing parsed fields rather than display-order assumptions.
- **Targeted verification:** harness runs the script from `src-tauri` with a target path containing spaces; missing file/tool/dlib/metadata, simulated signer nonzero and verifier nonzero all exit nonzero. Assert exact argv and no path splitting. This establishes invocation/failure semantics only; real provider proof is step 3.
- **Intent validation:** owner checks the legal publisher is Exit Zero Labs LLC, not merely any trusted certificate.

### 2. Isolate protected Windows OIDC execution

- **Behavior:** Windows alone can mint the Azure token; no secret fallback, unsigned release fallback or pre-verification upload.
- **Files:** `.github/workflows/release.yml`, optional shared signing rehearsal workflow, `src-tauri/trusted-signing-metadata.json` and runbook.
- **Implementation:** remove Windows from shared matrix and create Windows job using Production, `contents: read`, `id-token: write`; publication belongs to a later verified-upload job. SHA-pin `azure/login`, use Production vars tenant/client/subscription and existing federation. Download a specific current `Microsoft.ArtifactSigning.Client` version, record official immutable package SHA-512, validate before extraction/loading; do not invent or float hashes. Set metadata from approved Production vars and restrict documented `ExcludeCredentials` to Azure CLI credential established by login. Explicitly verify authenticated tenant/subscription. Replace old Azure secret references across all jobs. Build with repaired signing overlay regardless of unset rollout switch in the rehearsal; keep `WINDOWS_SIGNING` unset until proof. Production tagged builds must fail when signing prerequisites are absent rather than upload unsigned files. Keep tool and credential files outside caches; always cleanup/logout.
- **Targeted verification:** workflow structure check asserts only Windows signer grants id-token, secrets are absent from Linux/macOS, production signer cannot bypass overlay, failed verification prevents publication and all third-party actions use full SHA pins. Refresh vendor package/action versions at implementation time.
- **Intent validation:** owner approves Production deployment using a different required reviewer, preserving prevent-self-review and v* tag-only rules.

### 3. Rehearse all distributed Windows files

- **Behavior:** retained evidence binds verified final bytes to actual packaging outputs, including installed payloads.
- **Files:** new `scripts/verify-windows-signing.ps1`, release/rehearsal workflow and runbook.
- **Implementation:** build and sign main/helper, MSI and NSIS through Tauri packaging. Capture signer invocations proving NSIS temporary uninstaller was signed before embedding. Before any release upload require expected outputs and verify each file, signer identity and RFC 3161 timestamp. In an isolated Windows VM install the generated NSIS package, verify installed main/helper and actual generated uninstaller; install MSI separately and verify payload. A workspace main exe check alone does not prove embedded coverage. Generate final SHA-256 after signing and include nonsecret SignTool output and source/run identifiers in evidence. Download retained rehearsal artifacts and repeat verification; public release upload is separately authorized.
- **Targeted verification:** real Windows hosted runner/VM using Azure OIDC, not mocked signer. Negative cases remove expected artifact, mutate a copied signed file, wrong expected publisher and absent timestamp; verifier must fail. Clean VM installs/uninstalls both package types and verifies files before uninstall.
- **Intent validation:** owner observes UAC publisher and SmartScreen outcome on clean Windows 11, exercises create/save/reopen .thf and MCP helper. A valid signature does not promise immediate reputation.

### 4. Activate and document the proven path

- **Behavior:** active release claims match downloaded, verified signed builds.
- **Files:** runbook and existing Windows support copy located through `rg`, workflow rollout switch if retained.
- **Implementation:** after successful rehearsal and clean Windows validation, obtain scoped permission to set WINDOWS_SIGNING true and remove obsolete client-secret credential/values. Never delete old access before verified OIDC success. Update runbook readiness and unsigned waiver as dated evidence; update support copy only once the served build is actually signed. Retain Store as optional future work.
- **Targeted verification:** read back env/repo variable and secret names without values; verify currently served artifacts before removing unsigned instructions.
- **Intent validation:** owner accepts distribution presentation; no automatic Done transition.

## Cross-cutting requirements

- **Security and privacy:** profile-only signer role, job-only OIDC, protected approval, integrity-pinned native DLL and SDK, no credentials in cache/logs/artifacts. Do not broaden role scope or weaken environment protections.
- **.thf compatibility:** no schema changes; installation smoke checks existing file portability.
- **Browser and desktop:** desktop release boundary only; browser remains unchanged.
- **AI safety:** no provider or AI mutation changes.
- **Accessibility and UX:** accurate publisher/support instructions; no promise to bypass SmartScreen.
- **Observability and evidence:** retain verification output, artifact hashes and run/source identity; redact tokens/local private paths.

## Verification gate

Run focused signer/verifier failure tests and workflow validation first, then `npm run ci:local`, `npm run ci:docker`, `npm run ci:docker:build`. Docker checks cannot prove Windows Authenticode or OIDC. Require the real protected Windows rehearsal and downloaded-artifact verification described above.

Superseded rehearsal route (see the 2026-10-03 replan): a workflow_dispatch rehearsal must use a separately approved v* tag whose commit contains the rehearsal workflow; existing tags cannot execute newly added workflow content. Production admits no branches. Do not weaken that restriction or reuse an existing release version/tag. The rehearsal builds and uploads GitHub Actions artifacts only; it creates no GitHub release and has contents read. Commit, branch push, new tag push, run dispatch and environment approval are separate authorization gates. An approved publisher path can later upload verified bytes to an authorized draft release.

Current rehearsal route: push a separately authorized `v<app-version>-signing.<number>` tag containing the workflow. Verify that Production approval gates signing, Windows signing remains mandatory, all platform artifacts pass verification, and `publish-draft` is skipped. Manual dispatch is available only after the workflow reaches the default branch.

## Owner validation

Check plausible failures: signed installer embedding unsigned main/helper/uninstaller, valid wrong publisher, timestamp absent, verified workspace bytes differing from download, signing success misrepresented as SmartScreen reputation, installation succeeding while helper or uninstall fails. A release remains unpublished and issues remain In progress until authorized merge and local main validation.

## Specialist review

- [ ] PR reviewer
- [ ] Slop auditor
- [ ] Security auditor

## Replan log

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-10-03 | Initial independent plan | Live issues #50/#44, source at 53ffc0b, provisioning evidence supplied by orchestrator and official references |
| 2026-10-03 | Reserved signing tag enables nonpublishing rehearsal before merge | GitHub manual dispatch requires the workflow on the default branch. Use an authorized `v<app-version>-signing.<number>` tag push, preserve Production approval and skip draft publication; ordinary release tags retain the activation gate. |

## Primary references

[Microsoft Artifact Signing integrations](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-signing-integrations) specifies current client package, SDK/runtime requirements and region endpoint. [Tauri Windows signing](https://v2.tauri.app/distribute/sign/windows/) documents the custom command boundary. Package versions, credential exclusions and hashes must be refreshed against Microsoft metadata at implementation time.
