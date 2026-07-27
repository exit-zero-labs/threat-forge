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
  make the privacy page's claims false even though every test still passes. Both must return
  no match: `curl -s https://threatforge.dev | grep -i cloudflareinsights` and
  `curl -sI https://threatforge.dev | grep -i set-cookie`.

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
