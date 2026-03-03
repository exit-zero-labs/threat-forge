import { addPaletteItem, createModel, expect, test } from "./fixtures";

test.describe("Element Editing", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/app");
		await createModel(page);
	});

	test("selecting an element shows its properties", async ({ page }) => {
		await addPaletteItem(page, "palette-item-web-server");
		const node = page.locator("[data-testid^='node-']").first();
		await node.click();

		// Properties panel should show element fields
		const rightPanel = page.getByTestId("right-panel");
		await expect(rightPanel).toContainText("Web Server");
		await expect(rightPanel).toContainText("ID");
		await expect(rightPanel).toContainText("Type");
		await expect(rightPanel).toContainText("Name");
	});

	test("editing element name updates the canvas node label", async ({ page }) => {
		await addPaletteItem(page, "palette-item-generic");
		const node = page.locator("[data-testid^='node-']").first();
		await node.click();

		// Find the Name input in the properties panel and change it
		const nameInput = page
			.getByTestId("right-panel")
			.locator("label")
			.filter({ hasText: "Name" })
			.locator("input");

		await nameInput.fill("My Custom API");

		// Canvas node should reflect the new name
		await expect(node).toContainText("My Custom API");
	});

	test("editing element trust zone updates via properties panel", async ({ page }) => {
		await addPaletteItem(page, "palette-item-generic");
		const node = page.locator("[data-testid^='node-']").first();
		await node.click();

		// Find the Trust Zone input
		const trustZoneInput = page
			.getByTestId("right-panel")
			.locator("label")
			.filter({ hasText: "Trust Zone" })
			.locator("input");

		await trustZoneInput.fill("dmz");

		// The trust zone label should appear on the node
		await expect(node).toContainText("dmz");
	});

	test("changing element type persists in properties", async ({ page }) => {
		await addPaletteItem(page, "palette-item-generic");
		const node = page.locator("[data-testid^='node-']").first();
		await node.click();

		// Change the type dropdown (use .first() to avoid matching "Sub Type" label)
		const typeSelect = page
			.getByTestId("right-panel")
			.locator("label")
			.filter({ hasText: "Type" })
			.locator("select")
			.first();

		await typeSelect.selectOption("sql_database");

		// Verify the dropdown value persisted
		await expect(typeSelect).toHaveValue("sql_database");
	});
});
