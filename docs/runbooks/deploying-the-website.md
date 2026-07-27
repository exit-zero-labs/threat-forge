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
    max-age=14400` — the zone is serving its own cached copy and has rewritten `Cache-Control`
    to the 4-hour Browser Cache TTL. **This is the normal steady state**, measured on
    2026-07-27, not a fault. It does mean the `max-age` a client sees is set by zone
    configuration rather than by the Worker, so **do not read a stale-vs-fresh conclusion out of
    the `max-age` number** unless `cf-cache-status` says the response came from the Worker.
    `no-store` is passed through unrewritten, so the stale and `502` cases above stay legible.
  - Because the zone rewrites `Cache-Control` on cached hits, `curl` **cannot** detect the one
    failure this route's two-entry cache design is exposed to: a zone cache key that strips the
    query string would collapse the 5-minute freshness entry and the 24-hour fallback entry onto
    one key, letting a day-old release be served as fresh. Confirm in the dashboard instead —
    Caching → Cache Rules, checking for a custom cache key on `/api/*` — and if one exists, the
    fallback must move to a distinct path rather than a query variant.
- Watch how often the fallback is carrying the page: `npx wrangler tail --format pretty` and
  look for `latest-release: upstream unavailable` with its `reason`. `"upstream-status"` is the
  shared-egress rate limiting this fallback exists for. `"schema-rejected"` means GitHub's
  payload contract broke and the widget is only alive because of a stale copy — investigate that
  one rather than letting it ride out the 24-hour ceiling.
- Run these against a real deploy, not a preview. Cloudflare guarantees functional cache
  operations for Workers on custom domains and states that dashboard-editor and Playground
  previews have none, so a local or preview session is not evidence about production.

## Roll Back

```bash
npx wrangler versions list
npx wrangler rollback
```

## Local Check Before Pushing

```bash
npm run build:web
npm run check:worker
```
