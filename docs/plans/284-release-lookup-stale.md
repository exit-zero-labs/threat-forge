# Issue 284 — Serve the last known good release when GitHub will not answer

## Objective

A visitor to `/downloads` gets the real release widget — OS detection, direct download, version,
file sizes — whenever this colo has ever seen a good answer from GitHub, even while GitHub is
refusing the Worker's request. The bare "Could not load releases" link is reached only when no
good answer has ever been stored here. A successful lookup is still capped at 300s of freshness,
a served-stale answer is never re-cached as fresh, and no upstream status, body, or exception
text reaches the client on any path.

*Correction from round-2 review:* the 300s cap holds in the Worker and is overridden in the
visitor's browser, because the zone's default 4-hour Browser Cache TTL rewrites any smaller
`max-age`. Tracked as `#285`; see residual risk 5 and the replan log.

## Issue contract

- **Issue:** `#284`
- **Parent initiative:** `N/A` (originating issue: `#172`, which introduced the route)
- **Type:** `Bug`
- **Effort:** `Medium`
- **Priority:** `High`
- **Autonomy:** `AUTO`
- **Milestone:** `M2 • Beta`
- **Dependencies:** none. No secret, binding, namespace, or account action is required
- **Non-goals:**
  - the downloads page failure copy (`src/pages/downloads-page.tsx:47-61`) — explicitly out of
    scope in the issue, and still correct for the never-cached case
  - authenticating the upstream call (ruled out below, with the conditions that would reopen it)
  - reducing how many upstream attempts an outage costs (negative caching — see "Deliberate
    residual risk")
  - any change to `src/lib/github-release-schema.ts`, which was confirmed against the live
    payload and is not implicated

## Current behavior and evidence

`worker/latest-release.ts` is the whole handler, 112 lines. On a `GET`:

1. `:68-76` — look up `caches.default` under a key normalized to the bare path, and return the
   cached response verbatim on a hit.
2. `:78-99` — otherwise fetch the fixed GitHub endpoint and reject the answer through four
   separate branches, each `return errorResponse(502)`: the fetch rejecting (`:81-83`), a non-ok
   status (`:85-87`), a body that is not JSON (`:90-94`), and a payload the schema refuses
   (`:96-99`).
3. `:101-111` — on success, build a `200` with `Cache-Control: public, max-age=300`, store a
   clone under the one key, and return it.

`errorResponse` (`:36-53`) sets `Cache-Control: no-store` and a fixed body,
`{ "error": "release lookup unavailable" }`. Nothing about the upstream leaves the Worker.

The failure the issue reproduces is at step 2, branch two. GitHub answers `403` with
`API rate limit exceeded for 104.22.93.38`, a shared Cloudflare egress IP; the unauthenticated
REST limit is 60 requests/hour **per IP** and the budget is shared with every other tenant
egressing through that address. Our own volume is nowhere near the limit. Because only successes
are stored (`:110`), there is nothing to fall back to and the route returns `502`; because the
error is `no-store`, the next visitor re-attempts and gets refused again. Observed in production
as `502 502 200 200 …` on the first two requests after each 300s expiry, and as six of six
failures under `wrangler dev --remote` — the refusal rate varies by colo and egress IP, so some
colos serve the page degraded most of the time.

Downstream of the Worker:

- `src/lib/github-releases.ts:87-127` — `fetchLatestRelease` reads a `sessionStorage` entry
  (`tf-latest-release`, 5-minute TTL, `:89-99`), throws on a non-2xx (`:102-104`), **re-validates
  the Worker's own body with the same schema** and throws if it fails (`:106-111`), then caches
  the mapped result for 5 minutes ignoring response headers (`:119-127`).
- `src/hooks/use-latest-release.ts:27-41` turns that throw into `error`, and
  `src/pages/downloads-page.tsx:47-61` renders the bare GitHub link.

Platform facts this plan depends on, taken from Cloudflare's documentation rather than assumed
(`https://developers.cloudflare.com/workers/runtime-apis/cache/`):

- **Expired entries are a miss.** "cache.match generates a 504 error response when the requested
  content is missing **or expired**. The Cache API does not expose this 504 directly to the
  Worker script, instead returning `undefined`." A design that assumes `cache.match` hands back
  an entry past its freshness lifetime is wrong; the stored copy's own `Cache-Control` is what
  decides how long it can be read.
- **`Cache-Control` on the response passed to `put()` sets that lifetime.** The Cache API
  "respects the following HTTP headers on the response passed to `put()`: `Cache-Control` …
  `Expires`, `ETag`, `Last-Modified`". Without directives the default Edge TTL for a `200` is
  120 minutes (`https://developers.cloudflare.com/cache/how-to/configure-cache-status-code/`).
- **`stale-while-revalidate` and `stale-if-error` do not work here.** "The stale-while-revalidate
  and stale-if-error directives are not supported when using the `cache.put` or `cache.match`
  methods."
- **`put()` refuses uncacheable responses.** "cache.put returns a 413 error if `Cache-Control`
  instructs not to cache" — so a `no-store` response cannot be stored even by mistake.
- **The cache is per-colo and evictable.** "the contents of the cache do not replicate outside of
  the originating data center", and it is "ephemeral, data center-local storage".
- **Cache operations are real in this deployment.** "Workers deployed to custom domains have
  access to functional cache operations"; `wrangler.jsonc:30-39` binds `threatforge.dev` and
  `www.threatforge.dev` as custom domains. Dashboard-editor and Playground previews are
  explicitly excluded, which is why acceptance criterion 7 requires a live check.
- **Nothing caches this Worker's responses in front of it today.** Workers Cache is opt-in
  through a `cache: { enabled: true }` block in the Wrangler configuration
  (`https://developers.cloudflare.com/workers/cache/configuration/`); `wrangler.jsonc` has no
  such block.

Existing coverage: `worker/latest-release.test.ts`, 12 tests, green on this tree at `24e350e`
(`npx vitest run worker/latest-release.test.ts` → 12 passed, 593 ms). Its cache double
(`:8-18`) is a `Map` with `match`/`put` spies and **no model of freshness at all** — it returns
whatever was stored, forever. That matters more than it looks: it is exactly the property this
change turns on, so a stale-serving test written against the double as it stands would pass no
matter what `Cache-Control` the implementation chose. Step 1 fixes that before any production
line is written.

## Decision — a second, longer-lived cache entry, written on success and read only on failure

**Chosen.** On a validated upstream `200` the handler writes two entries: the existing freshness
copy under the normalized path key with `public, max-age=300`, and a second **last-known-good**
copy under `\`${LATEST_RELEASE_PATH}?fallback=last-known-good\`` with
`public, max-age=86400`. The read path is unchanged on the hot path. Only when the upstream call
does not produce a validated release does the handler read the fallback key, re-validate what
came back, and return it as a `200` with `Cache-Control: no-store`. If that read misses or fails
validation, today's sanitized `502` is returned unchanged.

This is the issue's proposed mechanism, with one correction that is the whole crux: **the second
entry is only readable after the first expires because it carries its own longer `max-age`.**
Storing `response.clone()` under both keys — the obvious implementation, and the one the current
test double cannot distinguish — makes both entries expire at the same instant and the fallback
can never once be read. Step 3 pins the two header values, and step 4 proves the behaviour with a
double that models the documented expiry semantics.

### Why not the alternatives

**A. `stale-while-revalidate` / `stale-if-error` on the stored response.** Ruled out by the API
itself: "The stale-while-revalidate and stale-if-error directives are not supported when using
the `cache.put` or `cache.match` methods." This would have been the one-entry, no-new-branch
mechanism. It does not exist on this surface.

**B. Workers Cache (`cache: { enabled: true }`) plus
`Cache-Control: public, max-age=300, stale-if-error=86400`.** This is real, documented, available
to us (it needs Wrangler ≥ 4.69.0; the repo pins 4.113.0 in `package.json`), and would implement
the entire feature with one config block and one header:
"`stale-if-error` lets Cloudflare return a previously cached response when the Worker fails while
refreshing an expired cache entry — for example, when it throws, times out, or returns a `5xx`
response", and "A true cache miss (no prior entry) cannot benefit from `stale-if-error`" — which
is acceptance criteria 1 and 3, for free. It is genuinely simpler than what this plan proposes,
so it is ruled out on evidence rather than taste:

1. **It bills the whole site.** "When caching is enabled, every request to your Worker is charged
   at the standard Workers request rate, **including requests that are normally free: static
   asset requests**", and the pricing table lists `Static asset request → Standard rate`
   (`https://developers.cloudflare.com/workers/cache/index.md`, "Pricing"). threatforge.dev is a
   static-asset site; every image, chunk, and HTML request is free today. Changing the billing
   model of the entire site to fix one API route is not a bug fix, and it is not the planner's
   call to make.
2. **It cannot be tested.** Acceptance criterion 6 requires `worker/latest-release.test.ts` to
   cover stale-on-each-failure-mode, `502` with nothing stored, and staleness not re-cached as
   fresh. Under B those behaviours live in Cloudflare's edge, not in code the suite can run; the
   only verification is a manual post-deploy check that cannot be re-run on demand, because
   reproducing it requires GitHub to refuse us. `npm run check:worker` is
   `wrangler deploy --dry-run` and asserts nothing about cache semantics.
3. **The stale copy reaches browsers labelled fresh.** On a stale hit the Worker does not run, so
   it cannot rewrite headers; Cloudflare serves the stored response with its original
   `max-age=300`. Every client that receives it caches it as a fresh answer for five minutes.
   Acceptance criterion 2 asks for the opposite.
4. **The default is unbounded.** "If you do not set `stale-if-error` explicitly … Cloudflare's
   default behavior is to serve stale responses on Worker error indefinitely … This is helpful
   for resilience but can mask real failures from your monitoring." The ceiling becomes a
   directive that must be remembered on every response rather than a constant with a test.

Reopen B if the owner wants the site on Workers Cache for its own reasons. It is not the cheap
version of this fix; it is a different infrastructure decision wearing its clothes.

**C. One entry with a long TTL and an in-band timestamp, freshness computed in code.** Viable,
and it has one real advantage: it writes a single entry, so it would not disturb
`"normalizes query strings to one cache key"` (`worker/latest-release.test.ts:147-164`), which
asserts `cache.store.size` is 1. Ruled out because it moves new logic onto the path that
currently works. The hit path is `return cached` (`:74-76`); under C every hit must be rebuilt to
strip the internal timestamp header and to recompute a `max-age` for the client, since the stored
header would say `86400` and the client must still be told `300`. A defect in that arithmetic
breaks the healthy case, which is 100% of traffic. The chosen design confines every new line to
the branch that is currently a dead end, and pays one edited assertion for it.

**D. Cache the upstream subrequest (`fetch(url, { cf: { cacheTtl … cacheTtlByStatus … } })`).**
One TTL cannot be both the 300s freshness window and the 24h fallback. Set to 86400 it violates
acceptance criterion 5 by serving a day-old release as fresh under `max-age=300`; set to 300 it
changes nothing about the failure path. `cacheTtlByStatus` can stop errors being cached; it
cannot manufacture a fallback that outlives the freshness window.

**E. Authenticate the upstream call.** A token moves us out of the shared-IP bucket to
5,000 requests/hour, and it is the only option here that addresses the *cause* rather than the
symptom. It is still not this issue's fix, for four reasons that survive that concession:

1. **It does not remove the need for a fallback.** GitHub incidents, secondary rate limits, and a
   schema change would all still produce a `502` today. Three of the five failure modes in
   acceptance criterion 1 are untouched by authentication. An authenticated deployment wants this
   fallback too, so building it first is not wasted work.
2. **It is a provisioning step, which `AGENTS.md` defines as `HITL`** — "`HITL` means a secret,
   provisioning step, unresolved product or design decision … is required". The issue is `AUTO`
   and the owner has deferred provisioning this session. Doing it here would silently rescope.
3. **It puts a credential on an origin whose stated posture is that it holds none.**
   `public/_headers` argues at length that `api.github.com` is deliberately kept off this origin
   because it is "a write-capable multi-tenant API"; adding a GitHub credential to the Worker is a
   security decision with its own review lane, not a line in a bug fix.
4. **A token expires.** A fine-grained PAT reintroduces `403` on a schedule, with a cause nobody
   will remember. That failure mode wants exactly the fallback this plan builds.

File it as a follow-up if the fallback proves insufficient — the trigger is named under "Owner
validation".

**F. KV, R2, or a Durable Object as the last-known-good store.** Genuinely better on one axis:
durable and cross-colo, so it would close the gap the issue admits (a cold colo that is also
being refused still degrades). Ruled out now because it needs a namespace provisioned and a
binding added to `wrangler.jsonc` — an owner action, and `HITL` by the same clause as E — and it
adds eventual consistency and a new failure mode to a route whose entire job is to be simpler
than the thing it proxies. The per-colo cache converges after one success per colo, which is
enough at this traffic level. Escalate to F only with evidence that colos routinely start cold
*and* refused.

**G. Bake the release into the build.** The site has no build-time environment
(`docs/runbooks/deploying-the-website.md`, "Environment Variables: None"), deploys are a manual
break-glass owner operation with automation still open as `#69`, and release cadence is not
coupled to deploy cadence. A build-time snapshot would go stale with no recovery path at all.

### The freshness ceiling: 24 hours

`FALLBACK_TTL_SECONDS = 86_400`, enforced by the stored copy's own `Cache-Control` — per the
documented `match` semantics above, the entry stops being readable the moment it expires, so the
ceiling needs no clock of our own.

- **It must outlive several rate-limit buckets to be worth anything.** GitHub's unauthenticated
  limit resets hourly. Production recovered after two refused requests; `--remote` refused all
  six. A one-hour ceiling barely outlives the bucket it exists to survive: a colo refused across
  two consecutive hours would expire the fallback and return to `502`. 24h covers 24 consecutive
  refused buckets, far beyond anything observed.
- **It bounds the only case where this change is worse than today.** A user arriving in a refused
  colo within the ceiling of a genuine release is shown release *N-1*, where today they would be
  shown a link to release *N*. At a handful of releases a year, the exposed window is at most a
  day per release and only for colos being refused at that moment. A week-long ceiling would
  multiply that window sevenfold to buy resilience against an outage class that has never been
  observed to last a day.
- **It is a ceiling, not a promise.** The cache is "ephemeral, data center-local storage" and
  evictable; a low-traffic colo may lose the entry long before 24h. Raising the number does not
  make the entry more durable, it only lengthens the worst case.

### Should the client be able to tell? No

No response header, no field, no client change. The reasoning, so it is a decision and not an
omission:

1. **Nothing would act on it.** The downloads page renders a stale payload identically to a fresh
   one, because it *is* the last real release. The only copy that could change is the failure
   text the issue puts out of scope, and authoring a "possibly outdated" line is a product-voice
   decision (`docs/knowledge/product-voice.md`) rather than a bug fix.
2. **The one plausible client behaviour buys five minutes.** `fetchLatestRelease` would have to
   skip its `sessionStorage` write (`src/lib/github-releases.ts:119-127`) for stale payloads. That
   window is the same five minutes a *fresh* payload occupies, in a tab that is already showing a
   correct release. It is not worth a new field in the response contract.
3. **`AGENTS.md` calls this out by name** — "speculative abstractions before a second real
   caller". A discriminator with no consumer is a contract we would have to keep.
4. **The operator's question is answered better elsewhere.** "How often are we serving stale, and
   why" is a logs question, and `wrangler.jsonc:18-25` already enables Workers Logs at
   `head_sampling_rate: 1` with `persist: true`. Step 2 adds one structured `console.warn`
   carrying a reason token and the upstream status — the same information the owner had to add
   temporary logging under `wrangler dev --remote` to obtain. Response headers are not aggregated;
   logs are.
5. **The stale path is still externally observable without a new header.** Fresh answers carry
   `Cache-Control: public, max-age=300` from the Worker; stale answers carry `no-store` with a
   `200`; never-cached failures are `502`. The three states are distinguishable on the wire, which
   is what acceptance criterion 7 needs. Two corrections from implementation: the check is
   `curl -s -D- -o /dev/null`, not `curl -I` — `HEAD` is rejected `405` on this route (`#263`) —
   and the zone rewrites a cached `200`'s `Cache-Control` to `max-age=14400`, so only the `no-store`
   and `502` states read verbatim at the edge. See the replan log.

### What stops a stale answer being re-cached as fresh

Traced through every actor that could hold it:

- **The edge.** The handler calls `cache.put` **only** on the success path. The stale response is
  never stored, so the freshness key stays empty and the very next request after upstream
  recovers goes upstream and repopulates it. Belt and braces: the stale response carries
  `no-store`, and "cache.put returns a 413 error if `Cache-Control` instructs not to cache", so
  even a mistaken `put` would store nothing. Step 4's recovery test asserts the behaviour rather
  than the header.
- **In front of the Worker.** Workers Cache is opt-in and `wrangler.jsonc` does not enable it, so
  no response of this Worker is cached ahead of execution today. If the owner ever enables it, the
  headers this plan sets already express the right intent under RFC 9111 — `max-age=300` on fresh,
  `no-store` on stale.
- **The browser.** `no-store` on the stale response. This is strictly stronger than the fresh
  path, which browsers may hold for 300s.
- **The client's session cache.** `fetchLatestRelease` caches any parsed `200` for five minutes
  regardless of headers (`src/lib/github-releases.ts:89-99, 119-127`). A tab that fetched during
  the outage keeps showing that payload for up to five minutes after the edge recovers. This is
  the same five-minute window every fresh answer occupies, the payload is a real release, and the
  next session load is correct. Edge recovery is immediate, which is what the criterion is about;
  no client change is warranted and none is proposed.
- **The fallback entry itself.** It is written **only** from a validated upstream `200`, never
  from a value read back out of the cache. Without that rule a colo could refresh the fallback
  from itself on every stale serve and ratchet its age past the ceiling forever. Step 4's ceiling
  test is sequenced to catch exactly that.

### Where this could serve stale when a fresh answer was available

The honest list, with what closes each one:

1. **Stale stored under the freshness key** — 300s of stale after recovery, self-perpetuating if
   it also refreshed the fallback. Closed by never calling `put` on the failure path; asserted by
   `serves the fresh release again as soon as upstream recovers` and by a `put` call-count
   assertion on the stale path.
2. **The fallback ratcheting its own age** — closed as above; asserted by the ceiling test's
   sequencing (stale serve at t=301, then expiry checked against the original store time).
3. **A schema break masked for a day.** If GitHub changes the payload, or a release ships an asset
   whose `browser_download_url` is not a `github.com` HTTPS URL, `parseGithubRelease` refuses it
   and we now serve the *previous* release for up to 24h instead of failing loudly. This is the
   one place the change trades diagnosis for availability, and the issue's acceptance criterion 1
   asks for it explicitly. Mitigated, not eliminated: the ceiling bounds it to a day, and step 2's
   log line records `reason: "schema-rejected"` so the cause is visible in Workers Logs rather
   than inferred from a silent widget. Recorded under "Deliberate residual risk".
4. **A cache-key collision at the zone level.** If this zone carried a Cache Rule with a custom
   cache key that strips the query string, both entries would collapse onto one key and the
   fallback's `max-age=86400` would overwrite the freshness copy — a day-old release served as
   fresh. The Cache API docs reference exactly this class of configuration ("a custom cache key
   set via Workers or Page Rules that strips the query string"), so the hazard is real and not
   hypothetical, but it cannot be checked from the repository. The design makes it *loud*: the two
   entries differ in their stored `Cache-Control`, and the hit path returns the stored response
   verbatim, so a collision would show as `cache-control: public, max-age=86400`. **That tripwire
   does not work**: the zone rewrites a cached `200` to `max-age=14400`, so a collision reads the
   same as a healthy hit. Detection moves to the dashboard, which is owner-validation item 3. If it
   ever fires, the remedy is a **distinct path** for the fallback entry. A different query cannot
   decollide keys against a rule that strips the query — that was briefly written here and is
   wrong. A distinct path is available: the handler normalizes every incoming request onto the
   bare path, so a second path constant is no more externally reachable than the query variant,
   and a cache key is only ever a key — nothing fetches it, so what it would route to is moot.
5. **The 300s freshness cap does not hold in the visitor's browser.** Measured: the zone's default
   4-hour Browser Cache TTL rewrites any smaller `max-age`, so a client is told to hold this
   response for four hours rather than five minutes, and a reload will not fix it. Acceptance
   criterion 5 is therefore met in the Worker and violated where the user actually is. Tracked as
   `#285`.

   **Inferred, not measured — and it should be checked at the same dashboard visit:** whether the
   zone *also* caches this route in its own edge cache independently of `caches.default`. The
   documentation says Workers run before the cache and that Workers Caching is opt-in (this
   Worker does not enable it), which would mean no edge copy exists and every request reaches
   the handler. If that is wrong, two things follow that nothing here has verified: the freshness
   entry could be older than 300s without the handler running, and an edge fill of
   `…?fallback=last-known-good` could overwrite the 24-hour entry with an ordinary `max-age=300`
   response, quietly removing the fallback 300 seconds later. Added to owner-validation item 3.

   The live `cf-cache-status: HIT` with a non-zero `age` looks like it settles this, and it does
   not settle it either way. `caches.default` is documented as "the same cache shared with
   `fetch` requests", and the handler returns the object `cache.match` produced, so a header
   stamped by that store would structurally reach the client. **This is reasoning, not a
   citation:** the Cache API reference enumerates the headers `match` and `put` act on and
   `CF-Cache-Status` is not among them, and the one Cloudflare sentence asserting the header is
   written about `fetch` read-through. Pushing the other way, the round-1 measurement found the
   `max-age=14400` rewrite on the `HIT` and the Worker's own `max-age=300` on a `MISS` — a
   correlation the zone could not produce if it were never consulted. The honest position is
   that the measurement is ambiguous and the dashboard is the only place it resolves. The
   rewrite itself is not in doubt: `14400` is a value this Worker never emits, and `#285`
   stands on it.
6. **A user in a refused colo within 24h of a genuine release** sees release *N-1* with a working
   download, where today they see a link to release *N*. Deliberate, bounded, and the trade the
   owner validates.

### Decomposition — no sub-issues

`#284` is `Effort: Medium`. `AGENTS.md` requires decomposition into executable sub-issues for
`High` work only; `Medium` requires this committed plan and nothing more. The steps below are the
unit of work and land in one PR.

Splitting would also be actively harmful here: step 3 alone (write the fallback, never read it)
ships a cache entry nothing consumes, and step 4 alone cannot be written. The production diff is
one file — a helper extraction, a second `put`, and one failure branch — plus a test harness and a
runbook line.

## Existing test ledger

All 12 tests in `worker/latest-release.test.ts` pass at `24e350e`. After this change:

**Unchanged, and must keep passing verbatim (10).** Any edit to these is a signal the design
drifted.

| Test | Line | Why it still holds |
|------|------|--------------------|
| `rejects non-GET methods without touching the cache or upstream` | `:63` | The `405` branch (`:64-66`) is untouched, and its `cache.match` not-called assertion still holds because the new keys are built after it |
| `fetches, validates, and trims the upstream response on a cache miss` | `:75` | Success path keeps `max-age=300`, `nosniff`, and the narrowed body. Mechanical edit only: its inline expected object moves to a shared `NARROWED_RELEASE` const with identical assertion semantics |
| `serves the cached response without a second upstream fetch on a cache hit` | `:130` | The hit path stays `return cached`. It seeds the store with a header-less `Response`; step 1's double treats an entry with no `Cache-Control` as non-expiring, matching Cloudflare's 120-minute default Edge TTL for a `200` |
| `returns a sanitized 502 and caches nothing when upstream is not ok` | `:166` | Empty cache, so the new fallback read misses and the `502` is returned. Now also covers acceptance criterion 3 |
| `returns 502 and caches nothing when the upstream fetch rejects` | `:185` | As above |
| `returns 502 when the upstream body is not JSON` | `:196` | As above |
| `returns 502 when the upstream JSON fails schema validation` | `:209` | As above |
| `rejects non-GitHub asset links instead of proxying them to the downloads page` | `:222` | Schema rejection still yields `502` with an empty cache; the `javascript:` URL still never reaches a client |
| `routes the API path to the release handler` | `:237` | Routing untouched |
| `delegates every non-API request to the static assets binding` | `:251` | Routing untouched |

**Changed (2), both because the handler now owns two cache keys.** Neither loses a property:

| Test | Line | Change | Property preserved |
|------|------|--------|--------------------|
| `stores the validated response in the edge cache` | `:118` | Renamed to `stores the validated response under both the freshness key and the fallback key`; `toHaveBeenCalledOnce` → `toHaveBeenCalledTimes(2)` plus an assertion on each entry's `Cache-Control` | It asserted "a successful lookup is stored". It now asserts what is stored where, and becomes the legible statement of the crux |
| `normalizes query strings to one cache key` | `:147` | `cache.store.size` / `keys()` assertions replaced by `expect([...cache.store.keys()]).toEqual([RELEASE_URL, FALLBACK_URL])` | It used "exactly one entry" as a proxy for "no client-supplied query string creates a cache key". The second key is a handler-owned constant, not client-derived, so the property is intact — and the new form additionally pins the fallback key's shape, so a change that made it client-reachable fails |

**Harness (1 file, test-only).** `createCache` (`:8-18`) gains a virtual clock and expiry, and
returns an independent `Response` per `match`. Detail and justification in step 1.

## Implementation steps

Each step is `Low` on its own. Steps 1 and 2 are behaviour-preserving; 3 and 4 are the change; 5
is documentation. Do them in order — 4 cannot be verified without 1.

### 1. Make the cache double model the Cache API behaviour this fix turns on

- **Behavior:** no production change. The test double stops being a `Map` that returns everything
  forever and starts modelling the two documented behaviours the fix depends on.
- **Files:** `worker/latest-release.test.ts` (`createCache`, `:8-18`)
- **Implementation:**
  1. Keep `store` a `Map<string, Response>` so the existing direct seeding at `:131` and the key
     assertions at `:162-163` keep working. Add a parallel `storedAt: Map<string, number>` and a
     module-local virtual clock `now` starting at `0`. Do not touch `Date` or use fake timers —
     the handler reads no clock, so a global clock would be a bigger mock than the test needs
     (`tests.instructions.md`: "keep clocks … deterministic").
  2. `put(request, response)` sets both maps.
  3. `match(request)` returns `undefined` when the entry is absent; parses `max-age` out of the
     stored response's `Cache-Control`; returns `undefined` when `now - (storedAt ?? 0) >=
     max-age`; otherwise returns `response.clone()`.
  4. Expose `advanceSeconds(seconds)`.
  5. Comment the double with the two doc sentences it implements — the `match`-returns-`undefined`
     -on-expiry rule and the `Cache-Control`-respected-on-`put` rule — and state the one place it
     deliberately diverges: an entry stored without `Cache-Control` never expires here, where
     Cloudflare would apply a 120-minute default Edge TTL. No production path stores one, so the
     divergence is unreachable outside the seeded fixture at `:131`.
  6. `clone()` per match is not cosmetic: production now reads the fallback entry's body, and a
     double that hands back the same `Response` object twice would fail on a consumed body in a
     way Cloudflare never would.
- **Targeted verification:** `npx vitest run worker/latest-release.test.ts` → **12 passed, none
  edited**. That is the whole assertion for this step: a harness change that alters an outcome is
  a harness bug.
- **Intent validation:** the owner reads the double's comment and agrees it models the documented
  API rather than the implementation that is about to be written.

### 2. Collapse the four upstream failure branches into one helper that says why

- **Behavior:** identical responses on every existing path. One structured `console.warn` is
  emitted per failed upstream attempt, carrying a fixed reason token and, for a rejected status,
  the status code — never the upstream body, never an exception message.
- **Files:** `worker/latest-release.ts`, `worker/latest-release.test.ts`
- **Implementation:**
  1. Add `async function fetchUpstreamRelease(): Promise<GithubRelease | null>` holding the
     current `:78-99` logic. Import the type: `import { parseGithubRelease, type GithubRelease }
     from "../src/lib/github-release-schema"`.
  2. Each of the four failure branches returns `null` after one
     `console.warn(UPSTREAM_UNAVAILABLE_LOG, { reason, ...(status ? { status } : {}) })` with
     `reason` one of `"fetch-failed" | "upstream-status" | "invalid-json" | "schema-rejected"`.
     *Correction from review:* the union shipped with two more — `"fallback-unreadable"` for a
     stored copy that cannot be read back, and `"upstream-timeout"`, added answering round-2
     review because a timeout firing while the body streamed was otherwise reported as
     `"invalid-json"`, the one token the runbook says to investigate immediately.
     `"fallback-unreadable"` was not a review finding — it came with the original
     implementation. See the replan log.
     Do not log `await upstream.text()`, the caught exception, or the raw payload: the module's
     guarantee (`:36-40`) is that upstream text never leaves the Worker, and a log is a place it
     could leave it.
  3. `handleLatestRelease` calls the helper and keeps `return errorResponse(502)` when it returns
     `null`. No observable change yet.
  4. Justify the log in one comment: `wrangler.jsonc:18-25` enables Workers Logs at full sampling
     with `persist: true`, and diagnosing this very issue required adding this line temporarily
     under `wrangler dev --remote`. Making it permanent is what distinguishes "the fallback is
     working" from "the fallback is masking something". `console.warn` is the established house
     call for a degraded-but-handled condition (`src/stores/update-store.ts:63`,
     `src/lib/adapters/load-keychain-adapter.ts:49`) and Biome's configured rules do not restrict
     it (`biome.json:27-47`).
- **Tests to add:**
  - `it("records why a lookup failed without logging the upstream body")` — 403 whose body is the
    existing `"rate limited: token abc"` fixture (`:168`); assert `console.warn` called once, that
    the serialized arguments contain `"upstream-status"` and `403`, and that they do **not**
    contain `"token"`. *Discriminates:* deleting the log fails the call assertion; logging
    `upstream.text()` or the whole response fails the `token` assertion. It is not vacuous because
    the fixture body deliberately contains a secret-shaped string, the same trick the existing
    `:178-181` assertions use on the response body.
  - `it("logs nothing when the lookup succeeds")` — successful fetch, assert the `console.warn`
    spy was not called. *Discriminates:* an unconditional log, which would turn the hot path into
    noise at `head_sampling_rate: 1`. Not vacuous: it fails today if the log is placed in
    `handleLatestRelease` rather than in the failure branches.
- **Targeted verification:** `npx vitest run worker/latest-release.test.ts` → 14 passed, the
  original 12 unedited. Then `npm run check:worker-types`.
- **Intent validation:** the owner reads one `wrangler tail` line from a real refusal after deploy
  and agrees it says enough to diagnose without saying anything that should not be in a log.

### 3. Store the last known good copy under its own key with its own lifetime

- **Behavior:** a validated upstream `200` writes two cache entries — the freshness copy
  (`public, max-age=300`) under the normalized path key, and the last-known-good copy
  (`public, max-age=86400`) under `?fallback=last-known-good`. Nothing reads the second one yet;
  no response changes.
- **Files:** `worker/latest-release.ts`, `worker/latest-release.test.ts`
- **Implementation:**
  1. Add `const FALLBACK_TTL_SECONDS = 86_400;` and
     `const FALLBACK_CACHE_QUERY = "fallback=last-known-good";` with a comment carrying the
     ceiling rationale from the Decision — that it must outlive several hourly rate-limit buckets
     and must not outlive a release by more than a day.
  2. Extract the key construction into
     `function releaseCacheKey(requestUrl: string, query?: string): Request`, preserving the
     normalization comment at `:69-71` verbatim; the fallback key is the same path plus the fixed
     query. Two reasons the key stays on this path rather than becoming a new path: the incoming
     request is normalized to the bare path before any lookup, so no client request can ever be
     keyed onto it; and `run_worker_first` (`wrangler.jsonc:16`) matches by path, so a request for
     `/api/latest-release?fallback=last-known-good` still enters this handler and is normalized
     away, where a distinct path would fall through to the assets binding.

     *Two corrections from review, kept here rather than rewritten.* The signature shipped as
     `releaseCacheKey(query?: string)` — it reads no part of the request at all, which is the
     round-2 security fix. And the second reason above is wrong twice over: an unrouted path is
     served the SPA shell at 200, not a 404, and it does not matter either way because a cache
     key is never fetched. The first reason is the true one, and a distinct path remains
     available as the collision remedy. See the replan log.
  3. Build the fallback response with `jsonResponse(release, …)` from the same validated
     `release` object — **not** from a second `response.clone()`. Two independent responses avoid
     any body-locking question and, more importantly, make it structurally impossible to
     accidentally give both entries the same `Cache-Control`.
  4. Write both under one `ctx.waitUntil(Promise.all([...]))`.
  5. Update the module docblock at `:55-58`, which currently claims the handler "caches only a
     successful validated response" — still true of *what* is cached, no longer true of how many
     entries. Say what each entry is for.
  6. In the test file, add `const FALLBACK_URL = \`${RELEASE_URL}?fallback=last-known-good\`;`
     beside `RELEASE_URL` (`:5`). Both edited tests and every test in step 4 refer to it, and a
     single constant means the key's shape is asserted in one place rather than spelled out five
     times.
- **Tests to change:** the two rows in the ledger above.
  - `stores the validated response under both the freshness key and the fallback key` — assert
    `cache.put` called twice, `cache.store.get(RELEASE_URL)` has `public, max-age=300`, and
    `cache.store.get(FALLBACK_URL)` has `public, max-age=86400`. *Discriminates:* this is the trap
    test. An implementation that stores `response.clone()` under both keys fails on the second
    header, and it is the only assertion in the suite that would catch it before step 4's
    behavioural test exists.
  - `normalizes query strings to one cache key` — as described in the ledger. *Discriminates:* a
    key built from `request.url` instead of the normalized URL puts `cache-bust=one` into the key
    list and fails the equality; so does a fallback key of a different shape.
- **Targeted verification:** `npx vitest run worker/latest-release.test.ts` → 14 passed. Both
  edited tests must **fail before** the production edit and pass after; run them at the previous
  commit's `latest-release.ts` to confirm, or assert it by temporarily removing the second `put`.
- **Intent validation:** the owner confirms the fallback key is not a URL any visitor can request
  a response from, and that `?fallback=last-known-good` reads as internal rather than as a
  supported API parameter.

### 4. Serve the stored copy when upstream will not answer

- **Behavior:** when `fetchUpstreamRelease` returns `null`, the handler reads the fallback entry,
  re-validates it with `parseGithubRelease`, and returns it as a `200` with
  `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. If the entry is missing,
  expired, unreadable, or refused by the schema, today's sanitized `502` is returned. Nothing is
  written to the cache on this path.
- **Files:** `worker/latest-release.ts`, `worker/latest-release.test.ts`
- **Implementation:**
  1. Add `async function readLastKnownGood(cache, key): Promise<GithubRelease | null>` — `match`,
     `json()` inside a `try`, `parseGithubRelease`, one `console.warn` with
     `reason: "fallback-unreadable"` when a stored entry exists but does not validate.
  2. Re-validating a value we ourselves stored is deliberate, and is the house pattern rather
     than a reflex: `src/lib/github-releases.ts:106-111` re-validates the Worker's own response
     "so a malformed body fails closed", for the same reason. The Cache API is shared,
     zone-scoped, evictable storage addressed by URL — it is not this module's private memory —
     and the cost is one `JSON.parse` of a few kilobytes on a path that only runs during an
     outage. The branch is reachable and is covered by a named test below, so it is not a
     defensive branch nobody can enter.
  3. Return through `jsonResponse(lastKnownGood, …)`, re-serializing from the parsed object. The
     sanitization guarantee then holds on this path by construction, exactly as it does on the
     success path: only schema fields are serialized.
  4. Do not call `cache.put` anywhere in this branch, and add a comment saying why — writing here
     is how the fallback would ratchet past its own ceiling and how a stale answer would outlive
     upstream recovery.
  5. In the test file, lift the expected narrowed object out of
     `"fetches, validates, and trims the upstream response on a cache miss"` (`:100-113`) into a
     `NARROWED_RELEASE` const beside `FULL_GITHUB_RESPONSE` (`:31-49`) and reference it from that
     test. The assertion semantics are identical; the stale tests need the same expectation and
     two copies of it would drift.
- **Tests to add,** in a new `describe("when GitHub will not answer")`. Every one of them seeds a
  good response first, calls `cache.advanceSeconds(301)` to expire the freshness copy, then drives
  the failure. Each asserts `fetch` was called twice — that assertion is what stops the whole
  group from passing vacuously off the still-fresh first entry.
  - `it.each` producing five named cases:
    - `serves the last known good release when upstream returns 403`
    - `serves the last known good release when upstream returns 500`
    - `serves the last known good release when the upstream fetch rejects`
    - `serves the last known good release when the upstream body is not JSON`
    - `serves the last known good release when the upstream payload fails schema validation`

    Each asserts `status === 200`, `Cache-Control === "no-store"`,
    `body toEqual NARROWED_RELEASE`, `fetch` twice, and `cache.put` still exactly twice.
    *Discriminates:* on today's code every case is a `502`. They map one-to-one onto acceptance
    criterion 1's five modes and onto the four failure branches plus the non-ok status class.
    The `toEqual` is exact, so an extra annotation field on the stale payload fails it.
  - `it("does not leak the upstream status or body on the stale path")` — the 403 case with the
    `"rate limited: token abc"` body; assert the serialized stale body contains neither `"token"`
    nor `"403"`. *Discriminates:* it is the `:178-181` guarantee re-asserted on a path that did
    not exist, and it fails for any implementation that streams the stored bytes through with an
    added reason field or that reports why it fell back.
  - `it("serves the fresh release again as soon as upstream recovers")` — seed `v0.2.0`, expire,
    fail (stale served), then a third call whose mock returns `v0.3.0`; assert the body is
    `v0.3.0` and `Cache-Control` is `public, max-age=300`. *Discriminates:* this is the direct
    test for acceptance criterion 2. An implementation that stored the stale response under the
    freshness key returns `v0.2.0` here and fails. Not vacuous: it fails on the previous line of
    the same test if the stale serve did not happen.
  - `it("stops serving the last known good release once it is older than a day")` — seed at
    `t=0`, `advanceSeconds(301)`, fail once (assert `200`, so the fallback really was alive),
    `advanceSeconds` past `86_400` total, fail again; assert `502` with the sanitized body and
    `no-store`. *Discriminates:* an unbounded fallback TTL returns `200` and fails. It also
    catches the ratchet — an implementation that re-stored the fallback during the first stale
    serve would reset `storedAt` and survive the second expiry. It is the counterpart to the
    `it.each` cases: the two demand *opposite* answers from the double at different virtual times,
    based on a header the production code chose, so neither can be satisfied by a double that
    simply says yes.
  - `it("returns the sanitized 502 when the stored copy is not a valid release")` — seed the
    fallback key directly with `new Response("<html>not json</html>", { headers: { "Cache-Control":
    "public, max-age=86400" } })`, and a second case with `{"tag_name": 42}`; upstream failing.
    Assert `502`, `no-store`, `{ error: "release lookup unavailable" }`. *Discriminates:* an
    implementation that returns `new Response(stored.body, …)` without re-parsing returns `200`
    with HTML and fails. This is the test that makes step 4.2's re-validation a reachable branch
    rather than dead defense.
  - Acceptance criterion 3 — `502` when nothing was ever stored — needs no new test: the four
    existing `502` tests (`:166-220`) and `:222` all run against an empty cache and now traverse
    the fallback-miss path to get there. Confirm they still pass rather than duplicating them.
- **Targeted verification:**
  `npx vitest run worker/latest-release.test.ts` — the 14 from steps 1–3 all still pass, plus the
  new block (nine or ten cases depending on whether the unreadable-copy test is parameterized).
  Then `npm run check:worker-types` and `npx biome check worker`.
- **Intent validation:** the owner reads the new `describe` block and agrees the five failure
  modes are the five in acceptance criterion 1, and that "last known good" means what the plan
  says it means — validated at store time and again at read time, never assembled from an error.

### 5. Write down how to see this on the live endpoint

- **Behavior:** documentation only. The deploy runbook gains the check that distinguishes fresh,
  stale, and never-cached, plus the cache-key-collision tripwire.
- **Files:** `docs/runbooks/deploying-the-website.md` ("Verify a Deploy")
- **Implementation:** add bullets:
  - `curl -sS -D- -o /dev/null https://threatforge.dev/api/latest-release` must return `200` with
    `cache-control: public, max-age=300` on a fresh answer, or `200` with `cache-control:
    no-store` when the last known good copy is being served. **`max-age=86400` on this endpoint
    means the two cache entries have collided** — the zone is stripping the query string from
    cache keys — and the fallback key must be changed to a distinct path.
  - `502` here now means this colo has never stored a good answer, which is the only case the
    downloads page's "Could not load releases" copy should still be reachable through.
  - `npx wrangler tail --format pretty` and watch for `latest-release: upstream unavailable` with
    its `reason`; that is how often the fallback is carrying the page, and `reason:
    "schema-rejected"` there means the payload contract broke and the widget is being kept alive
    by a stale copy.
  - Note that the Cache API documentation guarantees functional cache operations for Workers
    deployed to custom domains and states that dashboard-editor and Playground previews have no
    impact, so a local or preview session is not evidence about production; this check belongs
    after a real deploy.
- **Targeted verification:** none automated — `biome.json:8-19` includes only `src/**`, three
  `worker` globs, `scripts/*.mjs`, `e2e/**`, and root `*.ts`/`*.json`, so Markdown is linted by
  nothing. Verify by running each added command against the deployed endpoint and checking the
  output matches what the bullet claims; a runbook step nobody has executed is documentation
  drift by another name.
- **Intent validation:** the owner runs the three commands after deploying and confirms each says
  what the runbook claims it says.

## Cross-cutting requirements

- **Security and privacy:** the trust boundary is GitHub's response, and it does not move. Every
  value returned on the new path passes `parseGithubRelease` twice — once before it is stored,
  once after it is read back — and is re-serialized from the parsed object, so the "never leaks
  upstream status, body, or exception text" guarantee holds on the stale path by construction and
  is asserted by a named test. The new log line is the one place upstream-derived data could
  escape into a new sink; it carries a fixed reason token and a numeric status only, never a body
  or an exception. The route remains a fixed-URL, `GET`-only, query-normalized proxy: no client
  input reaches the upstream URL or a cache key, and the open-proxy tests at `:63` and `:147`
  still hold. No secret is introduced, so `public/_headers`' claim that this origin holds no
  third-party credential stays true.
- **`.thf` compatibility:** untouched. No schema, no serialization, no migration.
- **Browser and desktop:** the desktop app does not use this route; the downloads page is web-only.
  No adapter, IPC, or Tauri surface is touched.
- **AI safety:** not applicable — no model output, tool call, or approval path.
- **Accessibility and UX:** no rendered change. The success state now appears where a failure state
  used to; the failure copy at `src/pages/downloads-page.tsx:47-61` is unchanged and still reachable.
- **Observability and evidence:** the PR records the 12-unchanged/2-changed test ledger, the
  before/after of `npx vitest run worker/latest-release.test.ts`, and the live `curl` output for
  the fresh path. The stale path cannot be forced on demand in production, so its live evidence is
  the `wrangler tail` line the next real refusal produces — called out in the handoff as
  outstanding rather than claimed.

## Deliberate residual risk

Stated so nobody has to rediscover it:

1. **A schema break is masked for up to 24 hours.** Refusing a payload now serves the previous
   release instead of a `502`. The ceiling bounds it and the `schema-rejected` log line surfaces
   it, but a maintainer who does not read logs will not see the widget fail. This is the
   availability-for-diagnosability trade the issue asks for, and it is the reason the log line is
   part of the fix rather than an optional extra.
2. **A refused colo can show release N-1 for up to a day after release N ships.** The download it
   offers works; the version number is one behind and links to a release page that names the
   newer one. Today those users get a bare link. This is the only respect in which the change can
   be worse than the status quo.
3. **A cold colo that is also being refused still returns `502`.** Acknowledged in the issue.
   Convergence is one success per colo; closing it fully needs option F.
4. **The ceiling is not a durability promise.** Per-colo LRU eviction can drop the entry at any
   time.
5. **An outage still costs one upstream attempt per request.** No negative caching or cooldown is
   added, so we consume the shared per-IP budget exactly as today — no worse, no better. A short
   backoff entry would reduce it, at the cost of the immediate recovery acceptance criterion 2
   requires. Out of scope; noted below as a possible follow-up.
6. **A tab that fetched during an outage keeps the stale payload for up to five minutes** after
   the edge recovers, from `sessionStorage`. Same window a fresh answer occupies.

## Verification gate

Targeted, in order:

```bash
npx vitest run worker/latest-release.test.ts
npm run check:worker-types
npx biome check worker
npm run check:worker
```

`npm run check:worker` is `wrangler deploy --dry-run` and runs offline. Then the full gate before
handoff, once, not in a parallel lane (`AGENTS.md`, "Local machine resources"):

```bash
npm run ci:local
```

No E2E is required: `e2e/` has no downloads-release spec, and the page's rendered states do not
change. Live verification against the deployed endpoint (acceptance criterion 7) is an owner
step, per step 5.

## Owner validation

Green CI decides none of these.

1. **Is the trade right?** Within 24h of a genuine release, a refused colo shows the previous
   version instead of a link to the new one. The plan argues a working download of release N-1
   beats no download at all, and bounds it at a day. The owner accepts that or names a different
   ceiling — it is one constant.
2. **Is 24 hours the number?** The argument is "several hourly rate-limit buckets, but not much
   more than one release cycle of wrongness". Shorter risks expiring mid-outage; longer buys
   nothing durable because the entry is evictable anyway.
3. **Confirm the zone has no custom cache key stripping query strings** for `/api/*` (Cloudflare
   dashboard → Caching → Cache Rules). This is the one assumption the repository cannot check, and
   it is the only way this change could serve a day-old release *as fresh*. The step-5 `curl`
   tripwire the plan originally relied on **cannot detect it** — the zone rewrites a cached `200`'s
   `Cache-Control` to `max-age=14400`, so a collision reads identically to a healthy hit. The
   dashboard is now the only check. Two more things to settle in the same visit: `#285` asks for
   this route's Browser Cache TTL to stop overriding the Worker's 300s, and residual risk 5 needs
   confirmation of whether the zone caches `/api/latest-release` in its own edge cache at all —
   the plan reasons it does not, and has not measured it. Do not take the live
   `cf-cache-status: HIT` as settling it in either direction — see residual risk 5 for why that
   measurement is ambiguous rather than decisive. Cache Rules in the dashboard are the only
   place this is legible.
4. **Deploy, then verify live.** The Cache API documentation guarantees functional cache
   operations for custom-domain Workers and states that previews have none, so a dev or preview
   session is not evidence about production. Run the three step-5 commands after
   `npm run deploy:web`.
5. **Watch one real refusal.** After a day or so of `wrangler tail` or Workers Logs, confirm the
   fallback is firing with `reason: "upstream-status"` and not with `reason: "schema-rejected"`.
   The second would mean the widget is being kept alive over a broken payload contract. Capture
   the **response headers** at the same time, not only the log line: a live stale serve is the
   one chance to see whether `no-store` survives on a cacheable status, which residual risk 5
   currently infers rather than measures.
6. **Decide whether to file the authentication follow-up now.** The trigger to reopen option E is
   evidence that colos are being refused often enough that a `502` still reaches users — i.e. the
   fallback expiring or a cold colo — not the mere presence of `403`s in the logs.
7. **Confirm the response contract should stay silent about staleness.** The plan says no header
   and no client change, on the grounds that nothing would act on it. If the owner wants the
   downloads page to be able to say "this may be a moment out of date", that is a copy and product
   decision and belongs in its own issue with `docs/knowledge/product-voice.md` in scope.

## Follow-up issues to file (not sub-issues, not in scope)

1. **`.github/instructions/security.instructions.md` does not cover `worker/**`.** Its `applyTo`
   glob lists `src-tauri/**`, `src/lib/adapters/**`, `src/lib/ai-*.ts`, workflows, and the
   lockfile — but not the Worker, which is the site's only server-side trust boundary and the one
   place untrusted third-party JSON is validated. The security lane still applies here on the
   merits; the routing file just does not say so.
2. **No negative cache during an upstream outage.** Every request while GitHub refuses still costs
   an upstream attempt against a budget we are already losing. A short cooldown entry would cut
   that, and trades against immediate recovery — worth deciding deliberately rather than inheriting.
3. **Durable cross-colo storage for the last known good release (option F).** Only if evidence
   shows cold-and-refused colos in practice.
4. **The hot path returns a cache hit without re-validating it; the cold fallback path does.** The
   asymmetry is backwards — the rare path is the careful one. Nothing untrusted can write
   `caches.default` today, so this is defence in depth rather than a live hole, but re-parsing on
   the hit path costs one schema run per 300s per colo. Same follow-up: the schema pins the
   *host* (`github.com`) but not the *repository*, so a `browser_download_url` pointing at any
   other GitHub repo validates.
5. **Unauthenticated requests can flood the Workers Logs budget.** Every refused lookup writes a
   `console.warn`, and requests are unauthenticated, so a sustained outage — or someone driving
   one — can exhaust the log budget and silence the diagnostic this design depends on. A negative
   cache marker (follow-up 2) would bound it as a side effect.
6. **Bound the zone's `Cache-Control` rewrite** — filed as `#285`. Acceptance criterion 5 is met in
   the Worker and violated at the edge until that lands.

## Specialist review

- [ ] PR reviewer
- [ ] Slop auditor — required. This change adds a fallback path, a re-validation branch, and a log
      line, which is exactly the shape that attracts speculative defense; each one is argued above
      and each is covered by a named test that fails without it.
- [ ] Security auditor — required on the merits, though `security.instructions.md` does not glob
      `worker/**` (follow-up 1). A network trust boundary, a sanitized-error guarantee extended to
      a new path, a new log sink that could carry upstream text, and a cache-key change on a route
      whose open-proxy protections are load-bearing.
- [ ] Threat-model expert — not applicable. No `.thf` schema, STRIDE, or threat-quality surface.

## Replan log

Append changes; do not rewrite prior decisions.

| Date | Answers | Change | Evidence and reason |
|------|---------|--------|---------------------|
| 2026-07-27 | Round 3 | Timeout classification made runtime-independent | Round-2 fix recognised the abort by `error.name === "TimeoutError"`. Security noted the test constructs that `DOMException` itself, so it proves the guard *handles* a timeout, not that workerd *produces* one — if the runtime named it otherwise the token would silently revert to `invalid-json`, the exact failure the token was added to remove. Slop built the obvious alternative (`signal.aborted` alone) and proved it fails the new test, because a mocked `fetch` never aborts a real signal. Both are right about different halves, so the signal is now hoisted and the check is `timeout.aborted || isUpstreamTimeout(error)`: `aborted` is authoritative at runtime whatever the rejection is named, `name` is the half a synthetic error can exercise. Round 4 measured what round 3 had only inferred: deleting the `name` half alone fails a test, and deleting `aborted` alone failed nothing, because a mocked `fetch` never reaches a real signal. Closed rather than labelled — substituting an already-aborted signal and giving the rejection a name the `name` check cannot match reaches the half that carries the point, and each half now fails a test when deleted alone |
| 2026-07-27 | Round 3 | `never a 502` removed from the timeout rationale — it was false | Reviewer and slop both caught it. On a colo holding nothing, an abort reaches `readLastKnownGood`, misses, and returns the sanitized 502 — the module's central invariant, stated correctly eleven lines above and pinned by an existing test. The sentence was new in round 2, added while correcting something else; the same paragraph also restated the one above it and quietly restored the unsourced 100-second figure that round had just removed. Whole paragraph deleted. **A correction can propagate in the wrong direction — this is the second instance this issue** |
| 2026-07-27 | Round 3 | Cache-key origin test made bidirectional | Security: the round-2 assertion checks the constant names *a* deployed hostname, not that *every* deployed hostname shares its zone. Adding a second, unrelated zone would leave it green while requests arriving there wrote keys off their own zone — the same silent cache outage from the other side. A second case now requires every `custom_domain` pattern to be the pinned apex or a subdomain of it; proven by adding `threatforge.app` to the config |
| 2026-07-27 | Round 3 | The fallback-key comment now states the real tradeoff | Reviewer: the docblock justified a query over a path with an argument that holds identically for a path. Both work; the query is chosen for the smaller surface, and a path is the remedy if a zone rule ever strips query strings. This is the comment at the centre of the round-2 regression, so leaving a non-reason in it was how that regression could recur |
| 2026-07-27 | Round 3 | Runbook: token count corrected, rollback caveat added, `no-store` claim hedged | All three lanes found the off-by-one — "one of the four above" was not updated when the sixth token landed, in the fix for a documentation-accuracy finding, in the document read during an incident. Reviewer also established that `wrangler rollback` restores a *version* and these are script-level settings, so neither it nor reverting the commit restores preview URLs; and that "`no-store` is passed through unrewritten" was measured on a `502` and inferred for the stale `200`. Both now say so |
| 2026-07-27 | Round 3 | `cf-cache-status: HIT` does not evidence a front-of-Worker cache | Reviewer: `cache.match` is documented to add `CF-Cache-Status: HIT` to what it returns, so the live `HIT` and non-zero `age` behind residual risk 5 are fully explained by the Worker's own `caches.default`. The `Cache-Control: max-age=14400` rewrite is unaffected and `#285` stands — but the one measurement that looked like evidence of an independent edge cache is not. Worth having in hand at the dashboard visit |
| 2026-07-27 | Round 1 | Cache key normalized to a fixed origin; upstream fetch bounded at 5s; three documentation claims corrected | Preflight round 1, three independent lanes on frozen `08f935e`. **Security (MEDIUM, taken as must-fix):** `releaseCacheKey` built the key with `new URL(path, request.url)`, which retains scheme, host, and port. Measured live: `https://threatforge.dev:8443/api/latest-release` → 200, `:2053` → 200, `www.threatforge.dev` → 200, each its own cache entry with its own upstream fetch. A client cycling those namespaces multiplies our request rate against the 60/hour budget the fallback exists to survive, and fragments the fallback so it cannot carry the page either. The key is now derived from `CACHE_KEY_ORIGIN` and this route's own path constant; the request URL is not read at all, which also makes the function's existing "a caller cannot bypass the cache" docstring true rather than aspirational. **Reviewer:** the upstream `fetch` had no timeout, so a hung GitHub produced a 524 (that ceiling is quoted from memory, not from a doc read) while a good fallback sat unread; `AbortSignal.timeout(5_000)` lands in the existing `catch` and therefore on the stale path. Both fixes carry tests proven to fail without them. **Slop:** the `FALLBACK_CACHE_QUERY` docblock claimed a distinct path "would be served as a 404 page" — false, `not_found_handling: "single-page-application"` returns `/index.html` at 200 and there is no 404 route; and irrelevant, since a cache key is never fetched. The handler docblock credited `no-store` for immediate recovery when the mechanism is never calling `cache.put`. Residual risks 4 and 5 and the client-visibility argument corrected |
| 2026-07-27 | Round 2 | Collision remedy restored to a distinct path | **A regression I introduced.** Residual risk 4 and the runbook both define the hazard as a Cache Rule *that strips the query string*, and I had changed the remedy to "give the fallback a different query" — inert against exactly the configuration it names. It came from resolving round 1's finding in the wrong direction: the finding was that a *code comment's* rationale for rejecting a distinct path was false, and I kept the comment and changed the remedy instead of the reverse. Caught by slop as a must-fix |
| 2026-07-27 | Round 2 | Timeout given its own reason token | **Two lanes independently.** A timeout firing while the body streams is caught at `await upstream.json()` and was logged `invalid-json` — the one token the runbook tells an operator to drop everything and investigate. Fixed at the source rather than footnoted in the runbook |
| 2026-07-27 | Round 2 | `CACHE_KEY_ORIGIN` tied to `wrangler.jsonc`; preview URLs pinned off | **Two lanes independently** on the first: the constant duplicated the zone hostname with nothing tying them, and the drift fails silently toward 100% upstream traffic — the exact exhaustion this issue exists to fix, arriving with every response still looking correct. `worker/cache-key-origin.test.ts` now asserts the coupling. Security separately found `preview_urls` was never asserted by the repository, so every deploy inherited whatever the API last held, on a hostname where the Cache API is a documented no-op and this route degrades to an unthrottled proxy of `api.github.com`. Both subdomain keys are now stated |
| 2026-07-27 | Round 2 | Runbook `wrangler tail` correlation step corrected; residual risk 5 narrowed | Slop: `--format pretty` prints an outcome, and a sanitized `502` is an `Ok` invocation, so the step could never answer the question it was written for — now `--format json` with `event.response.status`. Reviewer and slop both found residual risk 5 asserted an edge-level mechanism on browser-level evidence; the difference changes the 24-hour ceiling arithmetic. Reframed as browser-level, with the edge-cache question marked inferred and routed to owner validation rather than asserted |
| 2026-07-27 | Implementation | Step 5's `curl` tripwire corrected during implementation; steps 1–4 unchanged | The plan states "Nothing caches this Worker's responses in front of it today" and builds step 5's collision tripwire on it (`max-age=86400` observed ⇒ entries collided). Measured against the live endpoint instead: `curl -sS -D- https://threatforge.dev/api/latest-release` returns `cf-cache-status: HIT`, a non-zero `age`, and `cache-control: public, max-age=14400` — a value this Worker never emits — while a `cf-cache-status` miss returns the Worker's own `public, max-age=300`. The zone caches this route and rewrites `Cache-Control` to a 4-hour Browser Cache TTL on hits, so the tripwire could never fire: a collision would also read `14400`. `no-store` is passed through unrewritten (observed on a live `502`), so the stale and never-cached cases stay legible and the fix's guarantees are unaffected. Step 5 now records the measured steady state and routes the collision check to the dashboard, which the plan already required as owner-validation item 3. Residual risk 4 is therefore **not** self-announcing as the plan claims — raised for the owner rather than resolved here |
| 2026-07-27 | — | Initial plan | Issue `#284` (no comments) and closed `#172`; branch `bug/284-release-lookup-stale` at `24e350e`, clean tree. Source read in full: `worker/latest-release.ts:1-112`, `worker/latest-release.test.ts:1-265`, `worker/index.ts`, `src/lib/github-release-schema.ts`, `src/lib/github-releases.ts:83-127`, `src/hooks/use-latest-release.ts`, `src/pages/downloads-page.tsx:30-75`, `wrangler.jsonc`, `tsconfig.worker.json`, `public/_headers`, `docs/runbooks/deploying-the-website.md`, `AGENTS.md`, `.github/instructions/tests.instructions.md`, `.github/instructions/security.instructions.md`, and `docs/plans/234-vault-usable-status.md` as the shape reference. Baseline executed: `npx vitest run worker/latest-release.test.ts` → 12 passed. Cloudflare documentation read rather than assumed: `workers/runtime-apis/cache/` (expired `match` returns `undefined`; `Cache-Control` respected on `put`; `stale-while-revalidate`/`stale-if-error` unsupported; `put` refuses `no-store`; per-colo; custom domains functional), `cache/how-to/configure-cache-status-code/` (120-minute default Edge TTL for `200`), `workers/cache/` and `workers/cache/configuration/` (Workers Cache is opt-in via `cache.enabled`, needs Wrangler ≥ 4.69.0 — repo has 4.113.0 — supports `stale-if-error` with an unbounded default, and bills static-asset requests that are free today). The issue's proposed mechanism is adopted; the correction is that the fallback entry's own `Cache-Control` is what makes it readable after 300s, and the existing test double could not have detected getting that wrong |
