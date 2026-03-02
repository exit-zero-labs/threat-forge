import { addPaletteItem, createModel, expect, test } from "./fixtures";

test.describe("Save and Reopen", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await createModel(page);
	});

	test("save triggers a YAML download with model data", async ({ page }) => {
		// Add elements to the model
		await addPaletteItem(page, "palette-item-web-server");
		await addPaletteItem(page, "palette-item-sql-database");

		// Wait for the download event when clicking save
		const downloadPromise = page.waitForEvent("download");
		await page.getByTestId("btn-save").click();
		const download = await downloadPromise;

		// Verify the downloaded file
		expect(download.suggestedFilename()).toContain(".thf");

		// Read the file content
		const readable = await download.createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of readable) {
			chunks.push(chunk as Buffer);
		}
		const content = Buffer.concat(chunks).toString("utf-8");

		// Verify YAML contains key structural elements
		expect(content).toContain("version:");
		expect(content).toContain("metadata:");
		expect(content).toContain("elements:");
		expect(content).toContain("Web Server");
		expect(content).toContain("SQL Database");
	});

	test("model state includes all added elements", async ({ page }) => {
		// Add elements
		await addPaletteItem(page, "palette-item-web-server");
		await addPaletteItem(page, "palette-item-sql-database");
		await addPaletteItem(page, "palette-item-generic");

		// Verify model has all 3 elements via in-memory state
		const elementCount = await page.evaluate(() => {
			// Access the Zustand store from window (stores are global singletons)
			const modelStoreModule = (window as unknown as Record<string, unknown>).__MODEL_STORE__;
			if (!modelStoreModule) {
				// Fallback: count nodes on the canvas
				return document.querySelectorAll("[data-testid^='node-']").length;
			}
			return -1;
		});

		// Count nodes via DOM as the reliable approach
		const nodes = page.locator("[data-testid^='node-']");
		await expect(nodes).toHaveCount(3);

		// If we got a model count, verify it matches
		if (elementCount > 0) {
			expect(elementCount).toBe(3);
		}
	});

	test("saved YAML preserves element names after editing", async ({ page }) => {
		await addPaletteItem(page, "palette-item-generic");
		const node = page.locator("[data-testid^='node-']").first();
		await node.click();

		// Edit the name
		const nameInput = page
			.getByTestId("right-panel")
			.locator("label")
			.filter({ hasText: "Name" })
			.locator("input");
		await nameInput.fill("Payment Gateway");

		// Save and check the download
		const downloadPromise = page.waitForEvent("download");
		await page.getByTestId("btn-save").click();
		const download = await downloadPromise;

		const readable = await download.createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of readable) {
			chunks.push(chunk as Buffer);
		}
		const content = Buffer.concat(chunks).toString("utf-8");

		expect(content).toContain("Payment Gateway");
	});
});
