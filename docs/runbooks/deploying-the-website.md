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

| Variable | Purpose |
|----------|---------|
| `VITE_CF_BEACON_TOKEN` | Optional Cloudflare Web Analytics site token. Web-only; the desktop build never reads it. |

Set the optional value in the shell or deployment environment before the build. See
`.env.example` for local setup. It is a public site token, not an AI provider credential.

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
- Confirm analytics traffic appears under **Web Analytics** when the beacon token is set.

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
