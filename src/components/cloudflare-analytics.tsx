import { useEffect } from "react";

const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";
const BEACON_TOKEN = import.meta.env.VITE_CF_BEACON_TOKEN as string | undefined;

/**
 * Cloudflare Web Analytics beacon for the web build only.
 *
 * Privacy-first and cookieless — no user profiling. The beacon is injected at
 * runtime so it is never bundled into the Tauri desktop build, and it only loads
 * when `VITE_CF_BEACON_TOKEN` is set at build time.
 * Callers must still gate this behind `!isTauri()`.
 */
export function CloudflareAnalytics() {
	useEffect(() => {
		if (!BEACON_TOKEN) return;
		if (document.querySelector("script[data-cf-beacon]")) return;

		const script = document.createElement("script");
		script.defer = true;
		script.src = BEACON_SRC;
		script.setAttribute("data-cf-beacon", JSON.stringify({ token: BEACON_TOKEN }));
		document.head.appendChild(script);
	}, []);

	return null;
}
