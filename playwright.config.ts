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
		// Machine-readable sibling of the HTML report, consumed by
		// scripts/summarize-playwright.mjs to surface flaky/skipped outcomes in the CI
		// run summary. Written after the HTML reporter regenerates the folder.
		["json", { outputFile: "playwright-report/results.json" }],
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
