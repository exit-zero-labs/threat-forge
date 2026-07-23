import { defineConfig, devices } from "@playwright/test";

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
		baseURL: "http://localhost:3000",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	webServer: {
		command: "npm run dev:web",
		port: 3000,
		reuseExistingServer: !process.env.CI,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
