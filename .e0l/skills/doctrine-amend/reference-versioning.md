<!-- @format -->

# Doctrine versioning

Reference for the `doctrine-amend` skill.

`.e0l/VERSION` carries `e0l-doctrine vMAJOR.MINOR.PATCH` and the ISO date it was cut.

## Choosing the bump

The bump follows the **conformance class** of what changed, not the size of the diff. A one-word change to a Class A rule is MAJOR; a whole new Class C stack table is MINOR.

| Bump | When | Effect on repos |
| --- | --- | --- |
| MAJOR | A Class A governance rule changed | Every adopted repo syncs before its next merge. The drift check fails on a MAJOR gap |
| MINOR | A new principle, or a Class B or C change | A sync pull request opens. Nothing is blocked |
| PATCH | Wording, typos, examples, a clarified sentence that changes no obligation | Sync is opportunistic |

The test for MAJOR versus PATCH: **would a repo that was conformant yesterday be non-conformant today?** If yes, it is MAJOR regardless of how few words moved.

## The manifest is the proof

`e0l-export.sh` writes `manifest.json` as sorted, newline-delimited `path: sha256` pairs. That format exists so the diff is reviewable — a reviewer can see exactly which propagated files changed, without reading the payload.

Two failure modes it catches:

- A version bump that changes nothing, which means the edit never reached the export surface.
- A version bump that changes more than expected, which usually means a symlinked directory pulled in something unintended.

Never hand-edit `manifest.json`. It is generated, and a hand-edit makes the drift check assert something untrue.

## Publication

On merge, the bundle publishes to the public `exit-zero-labs/.github` repo under `e0l-doctrine/`, with a `latest.json` pointing at the current version. Public repos fetch it anonymously, because their CI cannot read the private workspace and a token in a public repo would break on fork pull requests.

Private repos read the same bundle in CI to materialise `.e0l/`, since their symlink escapes the repository root and always dangles in a hosted checkout.

## Yanking a bad version

Do not delete a published version — a repo may already have synced it. Cut the next PATCH with the fix, and add a changelog row saying what the yanked version got wrong. The changelog is append-only for the same reason the re-plan log is: it is an audit trail, not a description of the present.
