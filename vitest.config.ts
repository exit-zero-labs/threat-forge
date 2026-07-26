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
		// Vitest otherwise takes every core but one. On a developer workstation that starves
		// the editor and any parallel agent session; capping at half leaves the machine usable
		// and costs little, since the suite is dominated by startup rather than by width.
		// CI runners have few cores, where the cap is at or below the default anyway.
		maxWorkers: "50%",
	},
	resolve: {
		alias: {
			"@": "/src",
		},
	},
});
