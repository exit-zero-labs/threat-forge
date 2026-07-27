# Deploying the Website

The web version of ThreatForge — the marketing site plus the browser build — is served
at [threatforge.dev](https://threatforge.dev) from **Cloudflare Workers Static Assets**.
The desktop app ships separately via GitHub Releases (see
[releasing-a-version.md](./releasing-a-version.md)).

## How It Deploys

`npm run deploy:web` builds the Vite application and deploys `dist/` with Wrangler.
`wrangler.jsonc` is the source of truth for the Worker, static assets, SPA fallback, and
the `threatforge.dev` and `www.threatforge.dev` custom domains.

Cloudflare is the origin. Do not add another hosting provider in front of the Worker.

## Prerequisites

- Node 22 from `.node-version`
- `npm install`
- Wrangler authentication: `npx wrangler login`
- Access to the Exit Zero Labs Cloudflare account

## Environment Variables

None. The web build reads no build-time environment variables.

## Deploy

Automatic deployment from `main` is tracked in
[issue #69](https://github.com/exit-zero-labs/threat-forge/issues/69). Until it is enabled,
manual deployment is a break-glass owner operation:

1. Deploy only a clean commit already merged to `main`.
2. Confirm required GitHub checks passed for that commit.
3. Use a least-privilege Cloudflare credential or an approved owner Wrangler session.
4. Record the deployed commit and Cloudflare deployment identifier in the issue or release
   record.
5. Run the deployment manually as an owner. Claude settings deny direct production Worker
   mutation commands, and Cloudflare credentials must not be exposed to agent environments.

```bash
git switch main
git pull --ff-only
git diff --exit-code
npm run deploy:web
```

Wrangler uploads only changed assets, deploys the Worker, provisions the custom-domain
DNS records, and manages TLS certificates. Both hostnames must return Cloudflare as the
origin.

## Preview Locally

```bash
npm run preview:web
```

Wrangler serves the production build with the same SPA fallback behavior used at the edge.

## Verify a Deploy

- Check the deployment under **Workers & Pages → threat-forge-web**.
- Load `https://threatforge.dev`, hard-refresh, and click through `/downloads`, `/about`,
  `/privacy`, `/terms`, and `/support`; deep links must resolve.
- Run `curl -I https://threatforge.dev` and `curl -I https://www.threatforge.dev`; responses
  must identify Cloudflare as the serving edge.
- Confirm the served CSP still contains `script-src 'self'` with no third-party origin:
  `curl -sI https://threatforge.dev | grep -i content-security-policy`.
- Confirm the zone has not started injecting anything the repo cannot see. Cloudflare can add
  an analytics beacon to the served HTML and set cookies without any change here, which would
  make the privacy page's claims false even though every test still passes. **`curl` alone will
  not catch this** — Cloudflare's Web Analytics auto-injection is conditional on a browser-like
  `User-Agent`, so a plain `curl` returns clean HTML while every real visitor gets the script.
  Send a browser UA:
  `curl -s https://threatforge.dev -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' | grep -i cloudflareinsights`
  and `curl -sI https://threatforge.dev | grep -i set-cookie`. Both must return no match.
- Load the site in a real browser and confirm the console is clean. A CSP violation here means
  the edge is injecting a script the policy blocks — safe, but visible to every visitor.
- Check the release lookup, which serves the downloads widget:
  `curl -sS -D- -o /dev/null https://threatforge.dev/api/latest-release`.
  - `200` with `cache-control: public, max-age=300` — a fresh answer the Worker just built.
  - `200` with `cache-control: no-store` — GitHub is refusing us and this colo is serving its
    last known good copy. The page is intact; the version may be up to a day behind.
  - `502` — this colo has never stored a good answer, or its copy aged out. This is the only
    case the downloads page's "Could not load releases" copy should still be reachable through.
  - `200` with `cf-cache-status: HIT`, a non-zero `age`, and `cache-control: public,
    max-age=14400` — `Cache-Control` has been rewritten to the 4-hour Browser Cache TTL.
    **This is the normal steady state**, measured on 2026-07-27, not a fault. What produced the
    `HIT` is not settled: `caches.default` is documented as the same cache `fetch` uses, so a
    hit the Worker itself served may carry the header, and it is not established that a separate
    zone cache sits in front of this route. Either way the `max-age` a client sees is set by
    zone configuration rather than by the Worker, so **do not read a stale-vs-fresh conclusion
    out of the `max-age` number**, and do not read a `HIT` as proof of where the response came
    from.
    `no-store` is passed through unrewritten — observed on a live `502`, and inferred for the
    stale `200` on the documented rule that the override is a numeric comparison `no-store` does
    not participate in.
  - Because the zone rewrites `Cache-Control` on cached hits, `curl` **cannot** detect the one
    failure this route's two-entry cache design is exposed to: a zone cache key that strips the
    query string would collapse the 5-minute freshness entry and the 24-hour fallback entry onto
    one key, letting a day-old release be served as fresh. Confirm in the dashboard instead —
    Caching → Cache Rules, checking for a custom cache key on `/api/*` — and if one exists, move
    the fallback entry to a distinct *path*. A different query cannot help against a rule that
    strips the query. The handler normalizes every incoming request onto one path, so a distinct
    path stays unreachable from outside exactly as the query variant does.
- Watch how often the fallback is carrying the page: `npx wrangler tail --format pretty` and
  look for `latest-release: upstream unavailable`. Every refusal logs one line with a `reason`:
  - `upstream-status` — GitHub answered with a non-`2xx`. Nearly always the shared-egress rate
    limiting this fallback exists for; the logged `status` says which.
  - `fetch-failed` — the request never completed. A network failure; not a timeout, which has
    its own token.
  - `upstream-timeout` — our own 5-second bound had passed when the request failed, either
    before the headers arrived or while the body was still streaming. The signal is read after
    the failure rather than at it, so a request that was failing anyway in the moments after the
    deadline lands here too; treat a lone one as approximate. Benign in isolation; sustained, it
    means GitHub is slow rather than refusing us, which is a different conversation from
    `upstream-status`.
  - `invalid-json` — GitHub's body was not JSON.
  - `schema-rejected` — valid JSON that failed `parseGithubRelease`. **Investigate this one.** It
    means GitHub's payload contract broke, or a release shipped an asset link pointing somewhere
    other than `github.com`, and the widget is alive only because of a stale copy that expires in
    24 hours.
  - `fallback-unreadable` — the stale path ran and this colo's stored copy was itself unusable.
    Always follows one of the five above, and means the visitor got a `502`.

  A logged refusal does **not** by itself tell you what the visitor saw: the first five lines are
  written identically whether the fallback then carried the page as a `200` or nothing was stored
  and a `502` went out. `--format pretty` will not disambiguate them — it prints an *outcome*
  (`Ok`, `Exception Thrown`, …), and a sanitized `502` is a perfectly `Ok` invocation. Use
  `npx wrangler tail --format json` and read `event.response.status`, or open Workers Logs, which
  `wrangler.jsonc` already enables with `persist: true`. The fallback entry is not externally
  addressable — the handler normalizes every request onto the bare path — so logs are the only
  view of it.
- Run these against a real deploy, not a preview. Cloudflare guarantees functional cache
  operations for Workers on custom domains and states that dashboard-editor and Playground
  previews have none, so a local or preview session is not evidence about production.

## Roll Back

```bash
npx wrangler versions list
npx wrangler rollback
```

`rollback` restores a *version* of the script. `workers_dev` and `preview_urls` are script-level
settings rather than versioned ones, so it does not restore either — and the two then behave
differently, which is worth knowing before assuming a revert undid them:

- `workers_dev` is recomputed on every deploy as `config.workers_dev ?? (routes.length === 0)`,
  so with routes configured it is sent as `false` whether or not the key is present. Deleting the
  key changes nothing; deleting the **routes** flips workers.dev back on with nobody having
  touched the setting.
- `preview_urls` has no default, so with the key absent Wrangler omits it from the request
  entirely. What the API does with an omitted key is not established here — Wrangler carries a
  branch for it changing — so a revert leaves preview URLs in an unasserted state. Set the value
  explicitly and deploy rather than inferring it.

## Local Check Before Pushing

```bash
npm run build:web
npm run check:worker
```
