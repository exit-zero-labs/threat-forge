# Releasing a Version

Step-by-step guide for creating a new release of ThreatForge.

## Prerequisites

- One of the repository owners (`Shreyasdbz` or `exitzerolabs-admin`) creates the release
- All CI checks passing on `main`
- A second repository owner is available to approve the protected `Production` deployment
- The [Release Readiness](#release-readiness) rows are complete, or the owner has recorded a
  waiver for the ones that are not (see [Configuring release signing](configuring-release-signing.md))

## Release Readiness

Every row here should be complete before a release goes out. A row that is not complete is a
promise the release breaks, so it takes an explicit, recorded owner waiver rather than silence —
and the waiver has to say what users experience because of it.

| Control | Current state | Tracking |
|---------|---------------|----------|
| Protected production deployment | Configured; one owner approval required, self-approval disabled, `v*` tags only | [#52](https://github.com/exit-zero-labs/threat-forge/issues/52) |
| Windows Azure Artifact Signing | Profile-scoped OIDC provisioned; repaired signing path awaits a protected Windows rehearsal and clean-machine validation. Push releases fail while WINDOWS_SIGNING is unset | [#50](https://github.com/exit-zero-labs/threat-forge/issues/50) |
| macOS Developer ID and notarization | Both architectures pass local app/DMG trust checks; certificate password submission, protected CI rehearsal and clean-machine validation remain | [#51](https://github.com/exit-zero-labs/threat-forge/issues/51) |
| Tauri updater signing | Public key, private signing key, manifest, and update verification remain | [#49](https://github.com/exit-zero-labs/threat-forge/issues/49) |

The `Production` environment gates Windows/macOS signing and draft publication after validation. Linux receives no Apple or Azure credentials. Windows alone has OIDC token permission and authenticates from protected environment variables; the workflow has no client-secret fallback. Legacy repository secrets remain until verified replacement and authorized retirement. Reserved `v<app-version>-signing.<number>` tag pushes and manual dispatch retain Actions artifacts without creating a release; only ordinary successful release-tag pushes can create a draft after every platform's downloaded hashes are verified. Manual dispatch also requires this workflow on the default branch.

### Recorded waivers

**v0.3.0 — unsigned builds on every platform, and no updater.** The owner accepted shipping
v0.3.0 with rows #51, #50, and #49 open, to get 98 commits of work into users' hands rather than
hold it behind signing provisioning. What this costs users:

- **#51, macOS.** No Developer ID signature or notarization, so macOS reports the app as damaged
  on first launch and users must clear the quarantine flag by hand. The `/support` page carries
  the instructions and `/downloads` links to them ([#245]).
- **#50, Windows.** The installer is **unsigned**. Signing was wired in and enabled for the first
  v0.3.0 release attempt, and it failed the build outright — `failed to bundle project: failed to
  run powershell`, with three separate defects behind it (see #50). Rather than hold the release,
  the signing path was gated behind the `WINDOWS_SIGNING` repository variable, which is unset.
  Users get the SmartScreen "Windows protected your PC" dialog naming an unknown publisher, and
  `/support` tells them what to check before clicking through. Owner-facing: the Azure credentials
  remain repository-scoped rather than `Production`-scoped, so other workflows can reference them
  until the OIDC migration in #50 lands.
- **#49, updater.** There is no in-app update. Users return to the downloads page for the next
  version.

Revisit at the next release: if these rows are still open then, that is a signal to stop shipping
past them rather than to re-waive.

[#245]: https://github.com/exit-zero-labs/threat-forge/issues/245

Use [Configuring release signing](configuring-release-signing.md) for the portable owner and
implementation procedure. Project 2 and issues #49 through #52 remain the live status source.

## Version Numbering

ThreatForge uses [Semantic Versioning](https://semver.org/):

- **PATCH** (0.1.x): Bug fixes, no API/schema changes
- **MINOR** (0.x.0): New features, backward-compatible schema additions
- **MAJOR** (x.0.0): Breaking schema changes (requires migration path)

## Release Steps

### 1. Verify Main Is Clean

```bash
git checkout main
git pull origin main
npm run ci:local          # Local lint, test, and web-build gate
cargo test --manifest-path src-tauri/Cargo.toml --frozen
```

### 2. Bump Version Numbers

The version appears in five files that must agree — the four below plus `src-tauri/Cargo.lock`,
regenerated in step 4 — and step 3 adds a sixth place it must match. Neither lockfile is
optional: `scripts/check-lockfile-registry.mjs` rejects a `package-lock.json` whose root version
has drifted from `package.json`, and the release workflow runs `cargo fetch --locked`, which
fails on a stale `Cargo.lock`.

```bash
# 1. Cargo.toml
# version = "X.Y.Z"
vim src-tauri/Cargo.toml

# 2. tauri.conf.json
# "version": "X.Y.Z"
vim src-tauri/tauri.conf.json

# 3. package.json
# "version": "X.Y.Z"
vim package.json

# 4. package-lock.json — regenerate rather than hand-edit
npm install --package-lock-only --ignore-scripts
```

`__APP_VERSION__` is compiled from `package.json`, so the in-app version badge, settings
dialog, and site footer follow this bump with no further edits. The What's New overlay does not
— see the next step.

### 3. Add the What's New Entry

The overlay renders `entry.version` from the hand-maintained `CHANGELOG` in
`src/lib/whats-new.ts`, so it does **not** follow the version bump. Add an entry at the top of
the list — newest first — describing what changed in terms of what a user can now do, and scope
any bullet that only applies to one surface (`(desktop app)`, `Browser …`).
`src/lib/whats-new.test.ts` fails if the newest entry does not match the running version, so a
skipped entry stops CI rather than shipping a silent upgrade.

Date the entry for the day you expect it to publish rather than the day you write it — the tag
waits on a second owner's `Production` approval, so the two can differ. The date is rendered
verbatim; only its shape is checked.

### 4. Update Cargo.lock

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

### 5. Commit the Version Bump

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json \
        package.json package-lock.json src/lib/whats-new.ts
git commit -m "chore: bump version to X.Y.Z"
```

### 6. Create and Push the Tag

Only the two repository owners can update `main`. The owner who pushes the tag cannot approve
their own `Production` deployment, so coordinate with the other owner before tagging.

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin main
git push origin vX.Y.Z
```

### 7. Trigger Release Build

The `release.yml` workflow triggers on `v*` tags and builds binaries for:
- Ubuntu (x86_64)
- macOS (x86_64 + aarch64)
- Windows (x86_64)

The workflow validates the release first, then pauses at the protected `Production`
environment. The owner who did not initiate the release reviews and approves the deployment.
Monitor the workflow at: `Actions > Release > vX.Y.Z`.

### 8. Verify the Release

1. Check GitHub Releases page for the draft release
2. Confirm the draft carries all expected containers: Linux deb/rpm/AppImage, Windows NSIS/MSI, and both macOS DMGs/app archives. Signing or verification failure prevents draft creation; an unset WINDOWS_SIGNING also blocks ordinary push-triggered publication. A protected rehearsal signs Windows regardless of this rollout switch, uploads Actions artifacts and creates no release. Use a separately approved reserved `v<app-version>-signing.<number>` tag for pre-merge proof. Download those artifacts for first activation; never enable the switch merely because a build step exited successfully.
3. Download binaries for each platform and smoke test:
   - On Windows, verify both installer signatures, intended publisher, timestamps, installed main/helper and actual NSIS uninstaller. Observe clean-machine SmartScreen/UAC presentation; a valid signature does not guarantee immediate reputation.
   - On macOS, verify both architecture downloads, app/DMG notarization tickets and Gatekeeper acceptance. Launch with quarantine active on clean compatible Macs without an override. The historical v0.3.0 waiver does not authorize new unsigned builds.
   - App launches without errors
   - Can create, save, and reopen a `.thf` file
   - Import a `.tm7` file (File > Import) — elements, flows, boundaries, and threats appear on canvas
   - AI chat works (with valid API key): model selector, chat sessions, stop generating, markdown rendering
   - STRIDE analysis runs
4. Verify release checksums, signing evidence, and workflow logs are retained with the draft
   release. Updater artifacts are absent until #49 lands; releasing without them requires a
   recorded waiver in [Release Readiness](#release-readiness).
5. Write the release notes and publish the draft release (click "Publish release" on GitHub)
6. Deploy the website so `/downloads` resolves the new release — see
   [Deploying the website](deploying-the-website.md)

### 9. Post-Release

- Once #49 enables updater publication, verify its manifest and separately signed updater bundles. Platform signing alone does not enable the updater.
- Announce on relevant channels
- Close related GitHub milestones/issues

## Hotfix Process

For critical bugs in a released version:

```bash
git checkout vX.Y.Z            # the released tag being fixed
git checkout -b fix/critical-bug
# ... fix the bug ...
git commit -m "fix: critical bug description"
git checkout main
git merge fix/critical-bug
```

Then run [Release Steps](#release-steps) 1 through 9 as for any release, using the next patch
version. A hotfix is a release: it tags a commit, it fires `release.yml`, and it still needs the
`Production` approval from the owner who did not push the tag. Skipping the version bump ships a
build that reports the previous version everywhere and announces no What's New entry for the fix
users are being asked to install.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Production deployment is waiting | The owner who did not push the tag must approve the protected environment |
| macOS build fails signing | Check the Apple Developer secrets and certificate validity tracked in issue #51 |
| Windows build fails signing | Check Azure credentials, Artifact Signing metadata, and issue #50 |
| Updater artifacts are absent | Expected until #49 lands. Publishing without them needs a recorded waiver |
| A platform's artifact is missing from the draft | That platform's build or signing step failed. Read its job log; do not publish a partial release without saying so in the notes |
| Release workflow doesn't trigger | Ensure tag matches `v*` pattern |
| Binary too large | Check that `profile.release` settings are applied (LTO, strip, opt-level) |
