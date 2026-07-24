import { handleLatestRelease, LATEST_RELEASE_PATH } from "./latest-release";

interface StaticAssets {
	fetch(request: Request): Promise<Response>;
}

export async function routeRequest(
	request: Request,
	assets: StaticAssets,
	ctx: Pick<ExecutionContext, "waitUntil">,
): Promise<Response> {
	const url = new URL(request.url);
	if (url.pathname === LATEST_RELEASE_PATH) {
		return handleLatestRelease(request, ctx);
	}
	return assets.fetch(request);
}

/**
 * Static-assets Worker entrypoint for the deployed web build.
 *
 * `assets.run_worker_first` in `wrangler.jsonc` routes only
 * `/api/latest-release` here; every other request is served directly by the
 * Asset Worker and never invokes this script. The `ASSETS` fallback below keeps
 * static-asset and single-page-application routing intact for any request that
 * still reaches the Worker.
 */
export const worker = {
	async fetch(request, env, ctx): Promise<Response> {
		return routeRequest(request, env.ASSETS, ctx);
	},
} satisfies ExportedHandler<Env>;

// biome-ignore lint/style/noDefaultExport: Cloudflare Workers require the module's default export to be the handler.
export default worker;
