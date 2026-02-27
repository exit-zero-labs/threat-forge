import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Detect if we're building for Tauri (set by `tauri dev` / `tauri build`)
// @ts-expect-error process is a nodejs global
const isTauriBuild = !!process.env.TAURI_ENV_ARCH;

// biome-ignore lint/style/noDefaultExport: Vite requires default export
export default defineConfig(async () => ({
	plugins: [react(), tailwindcss()],

	resolve: {
		alias: {
			"@": "/src",
		},
	},

	// When building for the browser (not Tauri), externalize @tauri-apps/* packages
	// so they are never bundled into the web output. The adapter pattern ensures
	// these imports only appear in dynamically-imported tauri-*-adapter.ts files,
	// which Vite code-splits into separate chunks that the browser build ignores.
	build: isTauriBuild
		? {}
		: {
				rollupOptions: {
					external: (id: string) => id.startsWith("@tauri-apps/"),
				},
			},

	// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
	//
	// 1. prevent vite from obscuring rust errors
	clearScreen: false,
	// 2. tauri expects a fixed port, fail if that port is not available
	server: {
		port: 1420,
		strictPort: !!isTauriBuild,
		host: host || false,
		hmr: host
			? {
					protocol: "ws",
					host,
					port: 1421,
				}
			: undefined,
		watch: {
			// 3. tell vite to ignore watching `src-tauri`
			ignored: ["**/src-tauri/**"],
		},
	},
}));
