import { defineConfig } from "vitest/config";

// biome-ignore lint/style/noDefaultExport: Vitest requires default export
export default defineConfig({
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
