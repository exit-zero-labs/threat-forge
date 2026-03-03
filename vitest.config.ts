import { defineConfig } from "vitest/config";

// biome-ignore lint/style/noDefaultExport: Vitest requires default export
export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify("test"),
	},
	test: {
		globals: true,
		environment: "jsdom",
		setupFiles: ["./src/test-setup.ts"],
		include: ["src/**/*.test.{ts,tsx}"],
	},
	resolve: {
		alias: {
			"@": "/src",
		},
	},
});
