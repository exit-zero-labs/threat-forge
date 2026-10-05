import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Separate opt-in command: real credentials never enter instrumented browser E2E. */
// biome-ignore lint/style/noDefaultExport: Vitest requires a default config export.
export default defineConfig({
	resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
	test: {
		environment: "node",
		include: ["scripts/provider-live.smoke.ts"],
		testTimeout: 180_000,
		maxWorkers: 1,
		fileParallelism: false,
		reporters: ["dot"],
	},
});
