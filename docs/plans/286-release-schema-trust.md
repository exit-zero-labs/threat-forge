# Issue 286 — Apply the release contract where the traffic is, and pin it to this repository

## Objective

Two halves of one trust question in `worker/latest-release.ts` and
`src/lib/github-release-schema.ts`.

First, the schema runs on the path that almost never executes and not on the path that serves
almost every request. `readLastKnownGood` re-parses the stored fallback and refuses it if it
fails, with a comment explaining that the Cache API is shared, zone-scoped, evictable storage
rather than this module's private memory. The freshness hit a few lines earlier returns
`cache.match`'s response straight to the client with no schema run at all. The file's own stated
reasoning is not applied where the traffic is.

Second, the schema pins release URLs to the `github.com` **host** and not to this
**repository**. A `browser_download_url` of
`https://github.com/someone-else/anything/releases/download/v1/evil.dmg` validates today and
would be rendered as a download button a visitor clicks to run a binary.

Neither is a live hole. Nothing untrusted can write `caches.default` for this zone, and GitHub's
own API is what populates the payload. Both are defence in depth on the one route that hands a
user an executable.

## Issue contract

- **Issue:** `#286`
- **Parent initiative:** `N/A` (originating issue: `#284`, whose security lane found both)
- **Type:** `Bug`
- **Effort:** `Medium`
- **Priority:** `Low`
- **Autonomy:** `AUTO`
- **Milestone:** `M3 • Release 1`
- **Dependencies:** none. No secret, binding, namespace, or account action is required
- **Non-goals:**
  - negative caching of refusals — that is `#287`, filed separately because it is one mechanism
    with its own recovery trade
  - the fallback path, which already validates and needs no change
  - the downloads page failure copy
  - authenticating the upstream call

## Current behavior and evidence

`worker/latest-release.ts:290-293`:

```ts
const cached = await cache.match(cacheKey);
if (cached) {
    return cached;
}
```

The response object is handed to the client unread. By contrast `readLastKnownGood`
(`:226-247`) reads the body, `JSON.parse`s it, runs `parseGithubRelease`, and logs
`fallback-unreadable` and returns `null` on either failure.

`src/lib/github-release-schema.ts:3-10`:

```ts
const url = new URL(value);
return url.protocol === "https:" && url.hostname === "github.com";
```

`https://github.com/attacker/repo/releases/download/v1/evil.dmg` satisfies this. So does
`https://github.com:8443/...`, because the check reads `hostname` and ignores the port, and so
does `https://user:password@github.com/...`.

## Approach

### 1. Validate the freshness hit

Read a clone of the stored response, `JSON.parse` it, and run `parseGithubRelease`. On success
return the **stored response unchanged**. On failure log a fixed reason token and fall through
to the upstream fetch exactly as a miss would.

Returning the stored response rather than a re-serialization is deliberate and is the narrower
change. The stored entry carries its own `Cache-Control: public, max-age=300` and whatever `Age`
the runtime attached, which together are what tell the visitor's browser how much of the 300
seconds is left. Re-serializing would emit a fresh `max-age=300` measured from the hit, silently
extending client-side freshness — a regression introduced by a hardening change, which is the
worst kind. The bytes returned are the bytes validated, because the clone and the original are
the same body.

The one property re-serialization would add and this does not is stripping unknown keys from a
poisoned-but-schema-valid entry. That is already covered downstream: `src/lib/github-releases.ts`
re-validates this Worker's response with the same schema before use, so extra keys never reach
`downloads-page.tsx`. Adding a second strip here would buy nothing and cost the freshness
semantics above.

Reason token: `freshness-unreadable`, mirroring the existing `fallback-unreadable`. The
`UnavailableReason` docstring widens from "why a lookup could not produce a validated release" to
cover a stored value that could not be used, because a rejected freshness hit is not fatal — the
request continues upstream.

Cost: one `JSON.parse` of a few kilobytes per request. This is the hot path, so that is worth
naming rather than waving at: the body is the narrowed release, on the order of a kilobyte for a
release with seven assets, and the alternative is a request that reaches GitHub. It is not per
upstream fetch, it is per request, and it is still far below the cost of the response itself.

### 2. Pin release URLs to this repository

Replace the host check with an origin-and-path check:

- `url.origin === "https://github.com"` — this subsumes both the protocol and the port, where
  `hostname` ignored the port
- no `username` or `password` — a genuine API payload never carries credentials, and a URL that
  does is a phishing shape
- `url.pathname` begins with a maintainer-controlled release path

*Corrected after the round-1 security review — see the change log.* The first draft pinned to
`/exit-zero-labs/threat-forge/`, on the assumption that our own repository path is our own
content. It is not. GitHub stores every pull request head as `refs/pull/N/head` **in the base
repository**, so a commit anyone pushes to a fork becomes addressable under our path:
`github.com/exit-zero-labs/threat-forge/raw/<fork-pr-sha>/evil.dmg` serves that contributor's
bytes and needs no privilege at all. Measured against a live external-fork pull request —
`github.com/cli/cli/raw/65fb1e0…/README.md` returns 200 for a commit whose head repository is
`offbyone/cli`.

So the prefixes are the paths that require write access, and the two fields get different ones:

| Field | Prefix | Why that boundary |
|-------|--------|-------------------|
| `browser_download_url` | `/exit-zero-labs/threat-forge/releases/download/` | uploading a release asset needs write access |
| `html_url` | `/exit-zero-labs/threat-forge/releases/` | only a maintainer can create a release page, and this covers `tag/` without pinning to release-page naming |

The trailing slash is load-bearing on both: without it `/releases/downloadable/…` and
`/releases-of-someone-else/…` satisfy a prefix check. `url.pathname` is the normalized path, so
`https://github.com/exit-zero-labs/threat-forge/../x` is normalized to `/x` by `new URL` before
the check sees it.

The comparison lowercases the pathname. GitHub resolves owner and repository names
case-insensitively — `https://github.com/Exit-Zero-Labs/Threat-Forge/releases/tag/v0.3.0` returns
200 directly, measured — so `/Exit-Zero-Labs/Threat-Forge/…` is the same repository and not a
different one, and the namespace is single, so no attacker can hold the variant. `toLowerCase`
rather than `toLocaleLowerCase`, which is locale-dependent.

This applies to `html_url` as well as `browser_download_url`. **This is one step past AC3**,
which names only the asset URL. It is taken deliberately: the shape of the check is the same,
`html_url` is rendered as a link on the downloads page, and the issue's own argument for filing
both halves together — "fixing one without the other leaves the interesting half open" — applies
with equal force inside the schema. Called out here and in the PR rather than slipped in.

## Acceptance criteria mapping

| AC | Where it is met |
|----|-----------------|
| 1 | `handleLatestRelease` validates the freshness hit and falls through on failure |
| 2 | Worker test seeds a poisoned freshness entry and asserts it is not served |
| 3 | `releaseUrlUnder` path prefixes |
| 4 | Schema test with `https://github.com/someone-else/anything/releases/download/v1/evil.dmg` |
| 5 | `FULL_GITHUB_RESPONSE` / `NARROWED_RELEASE` and the frontend fixtures are unchanged |

## Test plan

Every test must fail without its change; each is mutation-proved before it is trusted.

1. **Poisoned freshness entry is not served** — seed `RELEASE_URL` with a schema-invalid body,
   mock a good upstream, assert the response is the upstream release and not the poison, and
   that `fetch` was called. Fails today because the poison is returned verbatim.
2. **A valid freshness entry is still served verbatim without an upstream fetch** — the existing
   test at `latest-release.test.ts:253`, whose fixture body `{ tag_name: "cached" }` is not a
   valid release and must become one. Its `X-From-Cache` assertion is kept, which is what proves
   the stored response is returned rather than a rebuilt one.
3. **A poisoned freshness hit is logged with its own token** — distinguishes it from
   `fallback-unreadable` in Workers Logs.
4. **Wrong-repository asset URL is rejected** — realistic `someone-else/anything` download URL.
5. **`threat-forge-evil` is rejected** — the repository-name boundary.
6. **Case variant is accepted** — proves the lowercasing is deliberate and not an accident.
7. **Credentialed and non-443-port github.com URLs are rejected.**
8. **Genuine payload round-trips unchanged** — the existing fixtures, untouched.
9. **A fork pull-request commit path is rejected** — `…/raw/<sha>/evil.dmg`. Fails against the
   repository-root prefix the first draft used, which is what makes it the regression guard for
   the security finding.
10. **A `/blob/<sha>/` path is rejected as `html_url`.**
11. **A release *page* is rejected as an asset URL** — the two prefixes are genuinely different.
12. **`/releases/downloadable/…` is rejected** — proves the trailing slash, and fails against a
    prefix written without one.

## Deliberate residual risk

1. **A poisoned entry that satisfies the schema is still served.** The schema is a shape check,
   not an authenticity check; an attacker who can write this zone's cache with a well-formed
   release pointing at our own release assets can make the page advertise a real asset of ours
   under a wrong version or name. With the corrected prefixes the bytes behind that link are
   still ours, which is what the first draft wrongly assumed of the repository root. Closing it
   properly means signing the payload, which is `#49`'s territory and not this route's.
2. **URLs are pinned to the release path, not to the current tag.** A payload naming
   `/exit-zero-labs/threat-forge/releases/download/v0.0.1/…` would validate for a current
   release. Everything under that prefix required write access to put there, so this downgrades
   to serving an older real binary; pinning to the tag would couple the schema to release naming
   for no further gain.
3. **The extra `JSON.parse` runs on the hot path.** Measured against the alternative of not
   validating; see the cost note above.
4. **One bad asset invalidates the whole release.** `assets` is a `z.array` of the asset schema,
   so a single out-of-prefix `browser_download_url` rejects the entire payload and the page
   degrades to the static GitHub link rather than rendering the remaining assets. That is the
   right way round: an out-of-prefix asset URL is a strong signal that the payload contract broke
   or the entry was poisoned, and dropping the bad asset silently would render a partial download
   grid while hiding the event. The `schema-rejected` runbook entry is what surfaces it.
5. **`html_url` is pinned to `/releases/` rather than `/releases/tag/`,** which every real value
   matches. Both review lanes raised the tighter option; it was declined because every subpath
   under `/releases/` already requires write access to put content there, so the tighter prefix
   buys no security and would fail the whole lookup closed if GitHub ever changed the
   release-page shape.

## Change log

### 2026-07-28 — correction from the round-1 security review

The security lane refuted the plan's central assumption. The first draft pinned release URLs to
`/exit-zero-labs/threat-forge/` and residual risk 1 claimed a poisoned-but-valid payload "can only
make the page advertise a real asset of ours". Both were wrong: fork pull-request heads live in
the base repository as `refs/pull/N/head`, so `/raw/<sha>/` and `/blob/<sha>/` under our own path
serve bytes any outside contributor controls, with no privilege required. Verified independently
against `cli/cli` PR #13982, whose head repository is `offbyone/cli`: `github.com/cli/cli/raw/
65fb1e0…/README.md` returns 200.

The prefixes were tightened to the paths that require write access, split per field, and four
tests were added — the fork-commit rejection being the regression guard. Residual risks 1 and 2
were rewritten to say what is now true rather than what was assumed.

The same review confirmed, with evidence, that the URL predicate has no accepted-but-wrong-host
string (homoglyph and IDN inputs serialize to punycode origins and fail; traversal collapses
inside the prefix and 404s server-side), that returning the cached response unchanged is not a
leak vector, and that `src/lib/github-releases.ts` does strip unknown keys client-side as the
plan claimed.

The slop lane found no must-fix. Two `consider`s were applied: the `UnavailableReason` docstring,
reworded once already, was made accurate for all seven tokens rather than for the new one, and the
duplicated Cache-API rationale in `storedReleaseIsValid` was replaced with a reference to
`readLastKnownGood`.

### 2026-07-28 — round-2 lanes

A round-2 security lane and a fresh PR-review lane both returned no must-fix and no should-fix
against the corrected commit. The security lane measured the new prefixes rather than reasoning
about them: `release.yml` triggers only on a `v*` tag push, `/releases/latest` excludes drafts,
`/releases/tag/` resolves only real tags — a fork ref returns 404 — and `expanded_assets` reflects
names set at upload, so every `/releases/` subpath is write-gated. It re-ran the bypass hunt
against the split prefixes and found nothing accepted that a browser resolves elsewhere; the one
near-miss, percent-encoded separators that stay literal through `new URL`, was measured against
GitHub and returns 404 inside our own path rather than escaping it.

Four `consider`s were applied: the homoglyph sentence was narrower than the truth and was
reworded, the reason for stopping the page prefix at `/releases/` was recorded in the schema and
in residual risk 5, the all-or-nothing asset behaviour became residual risk 4, and the credentials
predicate gained two tests so each of its clauses is independently discriminated — the realistic
`user:password@` shape is refused by either clause alone, so it proved neither.
