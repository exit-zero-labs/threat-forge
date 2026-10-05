import { defineConfig, devices } from "@playwright/test";

// A separate local port avoids reusing another project's development server.
const webPort = Number(process.env.THREATFORGE_E2E_PORT ?? 3000);
if (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65535)
	throw new Error("THREATFORGE_E2E_PORT must be a port from 1024 to 65535");

// biome-ignore lint/style/noDefaultExport: Playwright requires default export
export default defineConfig({
	testDir: "e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [
		["html", { open: "never" }],
		["list"],
		// Machine-readable report consumed by scripts/summarize-playwright.mjs to
		// surface flaky and skipped outcomes in the CI run summary. It lives under
		// test-results/ rather than beside the HTML report because the HTML reporter
		// deletes its own output folder at the start of onEnd, which would make
		// correctness depend on reporter array order. test-results/ is gitignored and
		// already uploaded with the HTML report on failure.
		["json", { outputFile: "test-results/results.json" }],
	],
	use: {
		baseURL: `http://localhost:${webPort}`,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
		// Pin the browser's reduced-motion preference across host environments (issue #65, D3).
		// Specs still wait on observable state rather than transition duration.
		contextOptions: { reducedMotion: "reduce" },
	},
	webServer: {
		command: `npm run dev:web -- --port ${webPort} --strictPort`,
		port: webPort,
		reuseExistingServer: !process.env.CI,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
