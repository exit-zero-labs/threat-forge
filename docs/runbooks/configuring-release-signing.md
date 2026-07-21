# Configuring release signing

This runbook preserves the remaining owner and implementation work required to ship signed,
notarized, and updater-verifiable ThreatForge desktop releases.

GitHub issues and Threat Forge Project 2 remain the live execution tracker. The ordered tasks here
define the dependency sequence and evidence required to complete:

- [#49 - Tauri updater signing](https://github.com/exit-zero-labs/threat-forge/issues/49)
- [#50 - Windows Artifact Signing](https://github.com/exit-zero-labs/threat-forge/issues/50)
- [#51 - macOS Developer ID signing and notarization](https://github.com/exit-zero-labs/threat-forge/issues/51)
- [#52 - Protected releases and retained evidence](https://github.com/exit-zero-labs/threat-forge/issues/52)

These issues are children of
[#44 - signed, verifiable desktop releases](https://github.com/exit-zero-labs/threat-forge/issues/44).
Update issue and Project 2 state as work proceeds; do not use this file as a parallel status
tracker.

## Completion definition

Signing is complete only when all of the following are true:

- Windows application and installer executables have a valid Public Trust Artifact Signing
  signature, expected publisher identity, and RFC 3161 timestamp.
- macOS Intel and Apple Silicon artifacts are signed with Developer ID Application, notarized,
  stapled, and accepted by Gatekeeper.
- Every updater artifact is signed by the Tauri updater key, and one complete `latest.json`
  references every supported platform and architecture.
- A protected release rehearsal verifies downloaded artifacts on clean Windows and macOS systems
  and performs an update from the previous supported version.
- Verification output, checksums, updater manifests, and release workflow provenance are retained
  with the draft release.
- No long-lived Azure client secret is required by GitHub Actions.
- Provider credential rotation, failed notarization, compromised-key response, and release
  rollback procedures have been exercised or reviewed by an owner.

## Repository configuration reviewed on 2026-07-21

This baseline covers repository and GitHub configuration only. It does not verify live Apple or
Azure resources.

| Area | Current repository state | Remaining gap |
|------|--------------------------|---------------|
| Release workflow | `.github/workflows/release.yml` builds Linux, Windows, Intel macOS, and Apple Silicon macOS from `v*` tags into a draft release. | Signing checks and release evidence are incomplete. |
| Release protection | Every release matrix job targets the protected `Production` environment. It requires approval by one of the two owners and prevents self-review. | Provider credentials must move into this environment before use. |
| Windows | `src-tauri/tauri.signing.conf.json`, `scripts/sign-windows.ps1`, and `src-tauri/trusted-signing-metadata.json` define a custom SignTool path for account `threatforge-signing`, profile `threatforge-public`, and East US. Azure credential names exist as repository secrets. The workflow also installs `AzureSignTool`, but its custom signing path does not invoke it. | The Azure resources and publisher identity have not been verified from a release. The workflow installs legacy Trusted Signing packages, includes an unused tool, and uses a client secret. |
| macOS | Both architectures build in CI. Apple environment variables are present only as commented examples. | No Developer ID certificate or notarization API key is wired into `Production`. |
| Updater | The app checks the latest GitHub release. | `plugins.updater.pubkey` is empty, updater artifacts are not enabled, and no updater signing secrets exist. |

Never infer that a credential is valid because a secret name exists. GitHub does not expose secret
values, and the release path has not supplied verification evidence yet.

Each signing implementation PR must update this baseline and the release-readiness table in
`releasing-a-version.md` when repository or provider evidence changes.

## Responsibility boundary

### Owner-only work

An authorized owner must perform work involving legal identity, external accounts, or secret
custody:

- choose and verify the public publisher identity
- complete Microsoft and Apple identity checks and agreements
- create or approve certificates, API keys, and federated credentials
- back up private signing material outside GitHub
- enter protected environment secrets without exposing values in issues, logs, or commits
- approve the protected release rehearsal
- validate publisher names and operating-system trust prompts on clean systems

### Repository implementation work

An agent or contributor may implement settled issue criteria after owner prerequisites are
complete:

- update Tauri configuration and release workflows
- replace legacy Windows signing dependencies and client-secret authentication
- reconstruct ephemeral Apple credentials on macOS runners
- generate and validate updater artifacts and the aggregate manifest
- add fail-closed signature checks and retained evidence
- update release and recovery documentation

The implementation must proceed one issue and pull request at a time unless the issue contracts
are explicitly replanned.

## Phase 0: settle identity and custody

Complete this phase before creating replacement credentials.

### Choose the public publisher identity

- Decide whether Apple and Microsoft should display the Exit Zero Labs legal entity or an
  owner's personal legal name.
- Confirm the Apple Developer membership type matches that decision.
  - An individual membership displays the member's verified personal name.
  - An organization membership displays Apple's verified legal organization name and might
    require D-U-N-S verification.
- Confirm the Microsoft Artifact Signing Public Trust identity validation uses the same
  intended legal publisher.
- Record the expected Windows publisher and macOS signing identity in the private owner
  operations record. Do not put identity documents in GitHub.
- Treat a mismatch between Apple and Microsoft publisher identities as an owner decision, not
  an implementation detail.

### Establish private-key custody

- Select the owner-managed password vault or hardware-encrypted archive for:
  - Apple Developer ID `.p12` and its export password
  - App Store Connect `.p8` key
  - Tauri updater private key and password
- Store each private key in at least two independent encrypted locations controlled by owners.
- Confirm recovery access without printing key material to a terminal transcript or CI log.
- Record certificate expiry dates and schedule owner reminders at 90, 60, and 30 days.
- Define who can revoke Apple and Microsoft credentials after suspected compromise.

## Phase 1: provision Windows Artifact Signing

This phase unblocks issue #50.

### Verify the Artifact Signing resources

In the Azure portal:

- Open the subscription intended to own release-signing resources.
- Confirm the Artifact Signing account is named `threatforge-signing`.
- Confirm the account and certificate profile are in East US and use the matching endpoint:
  `https://eus.codesigning.azure.net/`.
- Complete **Public Trust** identity validation for the selected publisher.
- Confirm `threatforge-public` is a **Public Trust** certificate profile.
- Reject a Private Trust or Public Trust Test profile for public releases.
- Record the exact verified certificate subject and publisher name for clean-machine
  validation.

If the existing resource names or region differ, update
`src-tauri/trusted-signing-metadata.json` in the issue #50 implementation. Do not create duplicate
accounts merely to match repository placeholders.

### Create least-privilege GitHub OIDC access

In Microsoft Entra ID:

- Create a dedicated application and service principal for ThreatForge release signing.
- Add a federated credential with:

  ```text
  Issuer:   https://token.actions.githubusercontent.com
  Subject:  repo:exit-zero-labs/threat-forge:environment:Production
  Audience: api://AzureADTokenExchange
  ```

- Assign **Artifact Signing Certificate Profile Signer** at the narrowest supported scope for
  `threatforge-public`.
- Do not assign Owner, Contributor, User Access Administrator, subscription-wide signing
  access, or unrelated Key Vault roles to the workflow identity.
- Test token issuance only from a job that targets the protected `Production` environment.
- Confirm pull requests and unapproved jobs cannot obtain a usable signing token.

### Configure GitHub environment values

Place provider values in the protected `Production` environment rather than repository-wide
secrets.

Environment variables:

```text
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
AZURE_ENDPOINT
AZURE_CODE_SIGNING_ACCOUNT_NAME
AZURE_CERTIFICATE_PROFILE_NAME
```

No `AZURE_CLIENT_SECRET` should remain after OIDC succeeds.

- Add the six non-secret identifiers as `Production` environment variables.
- Confirm the environment still requires one owner approval and prevents self-review.
- Delete the repository-level `AZURE_CLIENT_SECRET` only after the OIDC rehearsal succeeds.
- Remove obsolete repository-level Azure values after the workflow consumes the environment
  variables.

### Implement the Windows signing path

Under issue #50:

- Split Windows signing from the shared platform matrix into a separately permissioned job;
  GitHub Actions permissions apply to the whole job, not an individual matrix leg.
- Add `id-token: write` only to the Windows release job that performs Azure login; do not grant
  OIDC token minting to Linux or macOS jobs.
- Authenticate with a SHA-pinned `azure/login` action and OIDC.
- Replace `Microsoft.Trusted.Signing.Client` with the current Microsoft Artifact Signing
  client package.
- Configure Artifact Signing's `DefaultAzureCredential` path to use the Azure CLI credential
  established by `azure/login` and exclude unused interactive or developer credentials.
- Keep the Tauri custom `signCommand` fail-closed so files are signed during packaging, not
  merely after an installer has embedded unsigned executables.
- Update terminology from Trusted Signing to Artifact Signing in active scripts and runbooks.
- Use SHA-256 for the file and timestamp digests.
- Timestamp with `http://timestamp.acs.microsoft.com/`; Artifact Signing certificates are
  short-lived, so a valid RFC 3161 timestamp is mandatory.
- Prove Tauri invokes the signer for:
  - the Threat Forge application executable
  - the NSIS installer
  - the NSIS uninstaller
  - the MSI package, currently published through `bundle.targets: "all"`
- Fail the job when any expected file is absent, unsigned, signed by the wrong subject, or has
  an invalid timestamp.

### Verify Windows artifacts

Run verification against the built files before upload and again after downloading the draft
release:

```powershell
$signature = Get-AuthenticodeSignature -FilePath "<artifact>"
if ($signature.Status -ne "Valid") {
    throw "Invalid Authenticode signature: $($signature.Status)"
}
$signature.SignerCertificate.Subject
```

Also retain verbose SignTool verification:

```powershell
signtool verify /pa /all /v "<artifact>"
```

- Compare the certificate subject to the owner-approved publisher identity.
- Save verification output as a release evidence artifact.
- Install the downloaded package in a clean Windows 11 virtual machine.
- Record the exact SmartScreen and UAC publisher presentation.
- Do not claim SmartScreen reputation from signature validity alone; reputation can require
  real download history.

### Rotate or recover Windows signing access

- Rotate the OIDC service principal by creating and testing a replacement federated identity
  before removing the old role assignment and federated credential.
- If the workflow identity is compromised, remove its certificate-profile signer role and
  federated credential immediately, then inspect Artifact Signing history before issuing a
  replacement.
- If the verified publisher identity changes, complete a new Public Trust identity validation
  and certificate profile instead of editing the expected subject in CI.
- Treat an Artifact Signing outage or failed sign request as a failed release. Do not upload an
  unsigned fallback.
- Keep direct signed downloads as the initial distribution path. Microsoft Store packaging,
  identity, submission, and Store policy validation are optional follow-up work and are not
  part of this release rehearsal.

## Phase 2: provision Apple signing and notarization

This phase unblocks issue #51.

### Create the Developer ID Application certificate

On an owner-controlled Mac:

- Generate a Certificate Signing Request in Keychain Access.
- In Apple Developer, create a **Developer ID Application** certificate for distribution
  outside the Mac App Store.
- Do not substitute Apple Development or Apple Distribution certificates.
- Install the downloaded certificate into the login keychain.
- Verify the private key is attached and obtain the exact signing identity:

  ```bash
  security find-identity -v -p codesigning
  ```

- Export the certificate and private key as a password-protected `.p12`.
- Generate a strong, unique export password and store it with the encrypted backup.
- Encode the `.p12` for GitHub without committing an intermediate file:

  ```bash
  openssl base64 -A -in DeveloperIDApplication.p12 -out certificate-base64.txt
  ```

- Remove `certificate-base64.txt` and the exported `.p12` from unencrypted local paths,
  Downloads, shell history, and clipboard history after encrypted backups and GitHub secret
  entry are verified.

### Create App Store Connect notarization credentials

Prefer an App Store Connect API key over an Apple ID app-specific password:

- In App Store Connect, open **Users and Access > Integrations**.
- Create a dedicated API key with the minimum role Apple permits for notarization; Tauri's
  current guidance uses Developer access.
- Record the Key ID and Issuer ID.
- Download the `.p8` private key once and place it in encrypted owner custody.
- Encode the `.p8` as a single-line base64 value for GitHub.
- Remove the raw `.p8` download and base64 intermediate from Downloads, shell history, and
  clipboard history immediately after encrypted backup and GitHub secret entry are verified.
- Do not reuse this key for unrelated automation.

### Configure GitHub environment values

Protected `Production` environment secrets:

```text
APPLE_CERTIFICATE
APPLE_CERTIFICATE_PASSWORD
APPLE_API_PRIVATE_KEY
```

Protected `Production` environment variables:

```text
APPLE_API_KEY
APPLE_API_ISSUER
APPLE_SIGNING_IDENTITY
```

- Set `APPLE_CERTIFICATE` to the base64 `.p12` content.
- Set `APPLE_CERTIFICATE_PASSWORD` to the `.p12` export password.
- Set `APPLE_API_PRIVATE_KEY` to the base64 `.p8` content.
- Set `APPLE_API_KEY` to the App Store Connect Key ID.
- Set `APPLE_API_ISSUER` to the App Store Connect Issuer ID.
- Set `APPLE_SIGNING_IDENTITY` to the exact Developer ID Application identity.
- Confirm no Apple private key or password is stored as a repository variable, workflow
  literal, artifact, cache entry, or log output.

### Implement the macOS signing path

Under issue #51:

- Decode `APPLE_API_PRIVATE_KEY` into an ephemeral runner file named
  `AuthKey_${APPLE_API_KEY}.p8` under `$RUNNER_TEMP`, set `umask 077`, and verify the file mode is
  `600`.
- Set `APPLE_API_KEY_PATH` to that ephemeral file.
- Supply `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_SIGNING_IDENTITY`, `APPLE_API_KEY`, and `APPLE_API_ISSUER` only to macOS release
  steps.
- Let Tauri import the `.p12`, sign nested code in the correct order, submit notarization, and
  staple the result.
- Verify the current Tauri schema and generated bundle before adding macOS entitlements.
- Keep hardened runtime enabled.
- Add only entitlements required by exercised application capabilities; do not copy broad
  entitlement templates.
- Build and verify both `aarch64-apple-darwin` and `x86_64-apple-darwin`.
- Verify Tauri removes any keychain it creates, and delete the temporary `.p8`, decoded
  certificate, and any workflow-created keychain in an `if: always()` cleanup step.
- Ensure neither the `.p8` nor `.p12` enters the GitHub Actions cache.

### Verify macOS artifacts

Run these against the built application before upload and against the downloaded draft artifact:

```bash
codesign --verify --deep --strict --verbose=2 "Threat Forge.app"
codesign --display --verbose=4 "Threat Forge.app"
spctl --assess --type execute --verbose=4 "Threat Forge.app"
xcrun stapler validate "Threat Forge.app"
```

- Confirm the signing authority is the expected Developer ID Application identity.
- Confirm hardened runtime and the expected Team ID are present.
- Confirm notarization succeeds for both architectures.
- Confirm the stapled ticket validates without relying on the original CI workspace.
- Save verification and notarization identifiers as release evidence without saving
  credentials.
- Validate the distributed DMG as well as the application extracted from it.
- Download and launch each architecture on a clean compatible Mac.
- Verify Gatekeeper accepts the downloaded artifact without an override.

### Rotate or recover Apple credentials

- Before Developer ID expiry, issue and test a replacement certificate, update the protected
  `.p12` secrets, and complete a notarized rehearsal before retiring the old certificate.
- Rotate the App Store Connect API key independently: create and test the replacement, then
  revoke the old key after a successful notarization.
- If either private key is exposed, revoke the affected credential, remove it from GitHub and
  owner storage, inspect release history, and create a replacement.
- Revoke a Developer ID certificate only for actual compromise or Apple-directed remediation;
  revocation can prevent previously signed apps from installing or launching.
- If notarization fails:
  - retain the submission ID and fetch the diagnostic log with `xcrun notarytool log`
  - inspect rejected nested code, signatures, hardened runtime, entitlements, and bundle
    structure
  - correct the build and submit a newly produced artifact
  - rerun codesign, Gatekeeper, and stapling verification
  - keep the release draft unpublished
- Never use ad-hoc signing, `--skip-stapling`, disabled hardened runtime, or an unsigned upload
  as a production fallback.

## Phase 3: create the Tauri updater trust root

This phase unblocks issue #49. The Tauri updater key is independent of Apple and Microsoft
platform signing.

### Generate and back up the key

On an owner-controlled machine:

```bash
npm run tauri signer generate -- -w ~/.tauri/threat-forge.key
```

- Use a strong, unique key password.
- Confirm the command creates the private key and matching `.pub` file.
- Back up the private key and password in two independent encrypted owner-controlled
  locations.
- Test restoring the key from each backup before deleting temporary copies.
- Never commit, attach, paste, or upload the private key to an issue, pull request, release, or
  CI artifact.

### Configure the repository and protected environment

Under issue #49:

- Put the complete public key content, not a file path, in
  `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`.
- Set `bundle.createUpdaterArtifacts` to `true`.
- Add the private key content to the protected `Production` environment secret
  `TAURI_SIGNING_PRIVATE_KEY`.
- Add the password to the protected `Production` environment secret
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Supply both secrets only to release build steps.
- Add a fail-closed check that rejects an empty or placeholder updater public key.

### Produce one complete updater manifest

- Confirm each release matrix build emits its expected updater bundle and `.sig` file.
- Aggregate platform metadata into one deterministic `latest.json` after all builds succeed.
- Reject last-writer-wins behavior from parallel release jobs.
- Require entries for every supported target:
  - Linux x86_64
  - Windows x86_64
  - macOS x86_64
  - macOS aarch64
- Verify every manifest URL points to an artifact in the same draft release.
- Verify every manifest signature is the content of the corresponding `.sig` file, not a path
  or URL.
- Reject missing targets, duplicate targets, invalid SemVer, malformed signatures, and version
  disagreement among Cargo, Tauri, package, tag, and manifest values.

### Exercise the updater

- Add a staging updater configuration or test-only Tauri configuration overlay before the
  first rehearsal.
- Keep the production endpoint unchanged in production builds.
- Serve the draft artifacts and manifest through the staging endpoint using the same static
  manifest contract as production.
- Do not expect GitHub's `releases/latest` endpoint to return a draft or prerelease; it excludes
  both.
- Install the previous signed rehearsal or supported release configured for the staging
  endpoint on each platform.
- Confirm it discovers the new version.
- Confirm a modified bundle or signature is rejected.
- Complete download and installation.
- Relaunch and confirm the expected new version is running.
- Exercise core local-first behavior after update: create, save, close, and reopen a `.thf`
  file.
- Retain updater logs with secrets and local paths redacted.
- Add an automated desktop E2E test that installs the prior signed rehearsal build, discovers
  the staged update, verifies and applies it, relaunches, and asserts the new version.
- Add a negative E2E case proving a modified bundle or signature is rejected.
- Capture platform-specific logs and failure artifacts without replacing the real updater,
  installer, or signature boundary with mocks. Coordinate this work with issue #68 where its
  desktop harness is reused.

### Protect against updater-key loss or compromise

The configured public key is a trust root embedded in every installation. There is no safe,
automatic recovery if owners lose the private key, and a leaked key lets an attacker create
updates that old clients trust.

- Do not rotate the updater key casually.
- Before any planned rotation, design and test a transition release that existing clients can
  authenticate.
- If the private key is lost, stop updater publication and require a separately distributed,
  platform-signed reinstall unless a previously tested transition path exists.
- If the private key is compromised:
  - disable or replace the updater endpoint immediately
  - stop release publication
  - revoke exposed provider credentials
  - publish a security advisory through owner-approved channels
  - require a platform-signed reinstall unless a safe transition mechanism was already
    deployed
- Never describe replacing `plugins.updater.pubkey` in a new build as sufficient rotation;
  existing installations still trust the old key.

## Phase 4: retain release evidence

Complete issue #52 alongside the provider implementations.

- Preserve SHA-pinned third-party actions and least-privilege workflow permissions.
- Keep the protected `Production` approval boundary for every job that can use signing
  credentials.
- Generate SHA-256 checksums after final signing and notarization.
- Retain:
  - source commit and annotated tag
  - workflow run URL and GitHub artifact attestations when enabled
  - dependency lockfiles and SBOM
  - Windows SignTool and Authenticode verification output
  - Apple codesign, Gatekeeper, notarization, and stapling output
  - updater bundles, `.sig` files, and final `latest.json`
  - targeted tests and release smoke-test results
- Ensure evidence contains certificate subjects and artifact digests but no private keys,
  passwords, tokens, identity documents, or raw secret values.
- Keep the GitHub release in draft state until owner validation is complete.
- Do not modify published release assets in place; issue a new patch release when a released
  artifact must change.

### Recover from a bad release

- For a failed draft, keep it unpublished, preserve diagnostics, correct the source, and
  produce a new release-candidate build.
- For an ordinary defect in a published release, do not revoke healthy certificates or replace
  assets in place. Publish a corrected, signed patch release and let the updater advance users
  to it.
- If a published manifest or artifact is actively unsafe, stop update delivery and downloads
  only with explicit owner authorization, publish an advisory, and preserve evidence before
  removal.
- If signing material is compromised, follow the provider-specific response above before
  resuming release work.
- Do not point `latest.json` at an older version as an untested rollback. Tauri's version
  comparison and installed application state require a deliberately designed downgrade path.
- Record the incident, affected versions, owner decision, remediation release, and validation
  evidence in the relevant GitHub security or release issue.

## Phase 5: run the protected release rehearsal

Use a release-candidate version and tag after issues #49, #50, #51, and #52 have converged through
review. Do not use a production version already consumed by users.

- Merge each verified implementation through the protected `main` flow.
- Synchronize all version sources to one release-candidate SemVer.
- Create and push an annotated `v*` release-candidate tag with explicit owner authorization.
- Have the other owner review and approve the `Production` environment deployment.
- Confirm all platform jobs succeed without fallback to unsigned artifacts.
- Download every artifact from the draft release rather than testing CI workspace outputs.
- Execute the Windows, macOS, and updater verification checklists above.
- Confirm Linux updater artifacts and signatures are complete even though Linux does not use
  Apple or Microsoft platform signing.
- Record plausible-but-wrong outcomes:
  - publisher name is legally valid but not the intended public brand
  - installers are signed but embedded application or uninstaller is not
  - notarization succeeds but the ticket is not stapled
  - only one macOS architecture is signed
  - `latest.json` contains only the last matrix job
  - clean installations work but update installation fails
  - CI validates workspace files but uploaded assets differ
- Keep the release draft unpublished until an owner accepts these outcomes.
- Delete the release-candidate draft and tag only with explicit GitHub authorization if the
  rehearsal is intentionally disposable.

## Completion handoff

When the rehearsal passes:

- Attach or link the retained evidence to issues #49, #50, #51, and #52.
- Confirm the PR reviewer, slop auditor, and security auditor have no unresolved must-fix or
  should-fix findings.
- Move each completed child issue to `In review`.
- Have an owner validate intended publisher presentation, install behavior, and update
  behavior.
- Squash-merge only after owner validation and separate merge authorization.
- Confirm Project 2 marks child issues `Done` only after merge or validated closure.
- Close parent initiative #44 only when every exit criterion is met.

## Official references

- [Tauri macOS code signing](https://v2.tauri.app/distribute/sign/macos/)
- [Tauri Windows code signing](https://v2.tauri.app/distribute/sign/windows/)
- [Tauri updater](https://v2.tauri.app/plugin/updater/)
- [Tauri environment variables](https://v2.tauri.app/reference/environment-variables/)
- [Apple Developer ID certificates](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)
- [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Microsoft Artifact Signing integrations](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-signing-integrations)
- [Microsoft Artifact Signing resources and roles](https://learn.microsoft.com/en-us/azure/artifact-signing/concept-resources-roles)
- [Artifact Signing GitHub Action](https://github.com/Azure/artifact-signing-action)
- [GitHub Actions OIDC with Azure](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure)
