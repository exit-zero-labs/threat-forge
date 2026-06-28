# Deploying the Website

The web version of ThreatForge — the marketing site plus the browser build — is served
at [threatforge.dev](https://threatforge.dev) from **Cloudflare Pages**. The desktop app
ships separately via GitHub Releases (see [releasing-a-version.md](./releasing-a-version.md)).

## How it deploys

Cloudflare Pages is connected to this repository via Git integration. Every push to `main`
triggers an automatic production build and deploy. Pull requests get preview deployments.
There is no deploy workflow in the repo — the build runs on Cloudflare's infrastructure.

## Build settings (Cloudflare Pages project)

| Setting | Value |
|---------|-------|
| Production branch | `main` |
| Build command | `npm run build:web` |
| Build output directory | `dist` |
| Node version | from `.node-version` (Node 20) |

`wrangler.toml` records `pages_build_output_dir = "dist"`. SPA routing is handled by
`public/_redirects` (`/* /index.html 200`), which Vite copies into `dist` on build —
every path falls back to `index.html` so react-router can take over client-side.

## Environment variables (set in the Pages dashboard)

| Variable | Purpose |
|----------|---------|
| `VITE_CF_BEACON_TOKEN` | Cloudflare Web Analytics beacon token. Web-only — the desktop build never reads it. |

Set this under **Settings → Environment variables → Production** (and Preview if you want
analytics on previews). See `.env.example` for the full description.

## First-time setup (one-time, in the Cloudflare dashboard)

1. **Create the Pages project**
   - Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
   - Select this repository, production branch `main`.
   - Framework preset: **None** (Vite). Build command `npm run build:web`, output `dist`.
   - Deploy. The first build provisions a `*.pages.dev` URL.

2. **Attach the custom domain**
   - Pages project → **Custom domains** → **Set up a domain** → `threatforge.dev`.
   - If the domain's DNS is on Cloudflare, the record is added automatically. Otherwise
     point a CNAME at the `*.pages.dev` target.

3. **Enable Web Analytics**
   - Dashboard → **Web Analytics** → add `threatforge.dev` → copy the beacon **token**.
   - Add it as the `VITE_CF_BEACON_TOKEN` env var (above) and redeploy. The beacon then
     loads on the web build only (gated by `!isTauri()`).

4. **Decommission Vercel**
   - Once threatforge.dev resolves to Cloudflare and the site is verified, remove the
     project from the Vercel dashboard to stop billing. Delete the domain from Vercel only
     after DNS has fully cut over to Cloudflare.

## Verifying a deploy

- Check the deploy status in the Pages project's **Deployments** tab.
- Load `https://threatforge.dev`, hard-refresh, and click through `/downloads`, `/about`,
  `/privacy`, `/terms`, `/support` — deep links must resolve (confirms `_redirects` works).
- Confirm analytics traffic appears under **Web Analytics** (only if the beacon token is set).

## Rollback

Pages project → **Deployments** → pick the last good deployment → **Rollback to this
deployment**. Production traffic switches instantly; no rebuild needed.

## Local check before pushing

```bash
npm run build:web        # builds to dist/
ls dist/_redirects       # confirm the SPA fallback shipped
npx vite preview         # serve dist/ locally and click through routes
```
