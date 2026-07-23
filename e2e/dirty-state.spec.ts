import { addPaletteItem, createModel, expect, modKey, test } from "./fixtures";

test.describe("Dirty State — New opens a tab, Close still guards", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/app");
		await createModel(page);
		// Add an element to make the model dirty
		await addPaletteItem(page, "palette-item-generic");
		// Verify the status bar shows unsaved changes
		await expect(page.getByTestId("status-bar")).toContainText("Unsaved changes");
	});

	test("Cmd+N with unsaved changes opens a second tab and prompts nothing (#54)", async ({
		page,
	}) => {
		// After #54, New is non-destructive: it must not raise a discard dialog.
		let dialogAppeared = false;
		page.on("dialog", async (dialog) => {
			dialogAppeared = true;
			await dialog.dismiss();
		});

		await page.keyboard.press(`${modKey}+n`);

		// A second tab opened and is now the active, empty document.
		await expect(page.getByRole("tab")).toHaveCount(2);
		await expect(page.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(0);
		expect(dialogAppeared).toBe(false);

		// The first document's node is preserved on its own tab.
		await page.getByRole("tab").nth(0).click();
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(1);
	});

	test("toolbar New button opens a second tab and prompts nothing (#54)", async ({ page }) => {
		let dialogAppeared = false;
		page.on("dialog", async (dialog) => {
			dialogAppeared = true;
			await dialog.dismiss();
		});

		await page.getByTestId("btn-new").click();

		await expect(page.getByRole("tab")).toHaveCount(2);
		expect(dialogAppeared).toBe(false);
		// The first document still has its node.
		await page.getByRole("tab").nth(0).click();
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(1);
	});

	test("Closing a dirty tab prompts, and dismissing keeps the document", async ({ page }) => {
		let dialogMessage = "";
		page.on("dialog", async (dialog) => {
			expect(dialog.type()).toBe("confirm");
			dialogMessage = dialog.message();
			await dialog.dismiss();
		});

		await expect(page.locator("[data-testid^='node-']")).toHaveCount(1);
		await page.getByRole("button", { name: /^Close / }).click();

		// The prompt names unsaved changes; dismissing leaves the document and its node in place.
		expect(dialogMessage).toContain("unsaved changes");
		await expect(page.getByRole("tab")).toHaveCount(1);
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(1);
		await expect(page.getByTestId("status-bar")).toContainText("Unsaved changes");
	});

	test("Closing a dirty tab and accepting discards it", async ({ page }) => {
		page.on("dialog", async (dialog) => {
			await dialog.accept();
		});

		await expect(page.locator("[data-testid^='node-']")).toHaveCount(1);
		await page.getByRole("button", { name: /^Close / }).click();

		// The only document closed: the empty launch view returns.
		await expect(page.getByTestId("empty-canvas")).toBeVisible();
		await expect(page.getByRole("tab")).toHaveCount(0);
	});

	test("no dialog appears when creating a new model from a clean document", async ({ page }) => {
		// Start fresh — a clean single document.
		await page.goto("/app");
		await createModel(page);

		let dialogAppeared = false;
		page.on("dialog", async () => {
			dialogAppeared = true;
		});

		await page.keyboard.press(`${modKey}+n`);

		// A second tab opens directly, with no dialog.
		await expect(page.getByRole("tab")).toHaveCount(2);
		expect(dialogAppeared).toBe(false);
		await expect(page.getByTestId("canvas-area")).toBeVisible();
	});
});
