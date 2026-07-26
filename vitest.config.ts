import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Same source as vite.config.ts, so tests exercise the real version string rather
// than a placeholder that no semver comparison could evaluate.
const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };

// biome-ignore lint/style/noDefaultExport: Vitest requires default export
export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
	test: {
		globals: true,
		environment: "jsdom",
		setupFiles: ["./src/test-setup.ts"],
		include: ["src/**/*.test.{ts,tsx}", "worker/**/*.test.ts", "scripts/**/*.test.mjs"],
	},
	resolve: {
		alias: {
			"@": "/src",
		},
	},
});
