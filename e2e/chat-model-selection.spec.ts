import { KEY_VAULT_DB_NAME } from "../src/lib/adapters/browser-key-vault";
import { KEY_STORAGE_UNREADABLE } from "../src/lib/adapters/keychain-adapter";
import { serializeFrames } from "../src/lib/ai/providers/test-fixtures/fake-stream";
import { OPENAI_TEXT_STREAM } from "../src/lib/ai/providers/test-fixtures/openai-fixtures";
import { DEFAULT_USER_SETTINGS } from "../src/types/settings";
import { textResponse } from "./anthropic-sse";
import { addPaletteItem, createModel, expect, test } from "./fixtures";
import { filterUnexceptedViolations, scanAccessibility } from "./support/accessibility";
import { waitForLocalSave } from "./support/interactions";

const OPENAI_KEY = "sk-proj-e2e-not-a-real-key";
const ANTHROPIC_KEY = "sk-ant-e2e-not-a-real-key";

test("chat model selection survives reload and credential management without rerouting", async ({
	page,
}, testInfo) => {
	let releaseOpenAi = () => {};
	const openAiReady = new Promise<void>((resolve) => {
		releaseOpenAi = resolve;
	});
	const requests: Array<{ provider: string; model: string; key: string | undefined }> = [];
	await page.route("https://api.openai.com/v1/chat/completions", async (route) => {
		const request = route.request();
		requests.push({
			provider: "openai",
			model: request.postDataJSON().model,
			key: request.headers().authorization,
		});
		await openAiReady;
		await route.fulfill({
			status: 200,
			contentType: "text/event-stream",
			body: serializeFrames(OPENAI_TEXT_STREAM),
		});
	});
	await page.route("https://api.anthropic.com/v1/messages", async (route) => {
		const request = route.request();
		requests.push({
			provider: "anthropic",
			model: request.postDataJSON().model,
			key: request.headers()["x-api-key"],
		});
		await route.fulfill({
			status: 200,
			contentType: "text/event-stream",
			body: textResponse("Anthropic review ready."),
		});
	});
	await page.goto("/app");
	await createModel(page);
	await addPaletteItem(page, "palette-item-generic");
	await waitForLocalSave(page);
	await page.getByTestId("tab-ai").click();
	const panel = page.getByTestId("right-panel");
	const picker = panel.getByRole("button", { name: "Model", exact: true });
	async function chooseModel(provider: string, label: string) {
		await picker.click();
		await panel
			.getByRole("menu", { name: "Model" })
			.getByRole("group", { name: provider })
			.getByRole("menuitemradio", { name: label, exact: true })
			.click();
		await expect(panel.getByRole("menu")).toHaveCount(0);
	}
	await picker.click();
	expect(
		await panel
			.getByRole("menu", { name: "Model" })
			.getByRole("group")
			.evaluateAll((groups) => groups.map((group) => group.getAttribute("aria-label"))),
	).toEqual(["OpenAI", "Anthropic"]);
	await page.keyboard.press("Escape");
	await chooseModel("OpenAI", "GPT-5.6 Luna");
	await expect(panel).toContainText("No API key configured");
	await testInfo.attach("keyless-model-footer", {
		body: await page.screenshot({ animations: "disabled" }),
		contentType: "image/png",
	});
	await panel.getByRole("button", { name: "Configure API Key", exact: true }).click();
	const settings = page.getByTestId("settings-dialog");
	await expect(settings.getByRole("button", { name: "Model", exact: true })).toHaveCount(0);
	await expect(settings.getByRole("combobox", { name: "API key provider" })).toHaveValue("openai");
	await settings.getByLabel("OpenAI API key").fill(OPENAI_KEY);
	await settings.getByRole("button", { name: "Save", exact: true }).click();
	await expect(settings).toContainText("API key encrypted and saved in this browser.");
	await settings.getByRole("combobox", { name: "API key provider" }).selectOption("anthropic");
	await settings.getByLabel("Anthropic API key").fill(ANTHROPIC_KEY);
	await settings.getByRole("button", { name: "Save", exact: true }).click();
	await expect(settings).toContainText("API key encrypted and saved in this browser.");
	await testInfo.attach("credential-only-ai-settings", {
		body: await page.screenshot({ animations: "disabled" }),
		contentType: "image/png",
	});
	await settings.getByRole("combobox", { name: "API key provider" }).press("Escape");
	await expect(settings).toBeHidden();
	await expect(picker).toHaveText("GPT-5.6 Luna");
	await page.reload();
	await page.getByTestId("tab-ai").click();
	await expect(picker).toHaveText("GPT-5.6 Luna");
	const input = panel.getByRole("textbox", { name: "Message AI assistant" });
	const composer = panel.getByRole("group", { name: "Message composer" });
	await expect(composer.getByRole("button", { name: "Model", exact: true })).toHaveCount(1);
	const inputBounds = await input.boundingBox();
	const pickerBounds = await picker.boundingBox();
	const sendBounds = await composer.getByRole("button", { name: "Send message" }).boundingBox();
	expect(inputBounds).not.toBeNull();
	expect(pickerBounds).not.toBeNull();
	expect(sendBounds).not.toBeNull();
	if (inputBounds && pickerBounds && sendBounds) {
		expect(pickerBounds.y).toBeGreaterThanOrEqual(inputBounds.y + inputBounds.height);
		expect(pickerBounds.x + pickerBounds.width).toBeLessThanOrEqual(sendBounds.x);
		expect(Math.abs(pickerBounds.y - sendBounds.y)).toBeLessThanOrEqual(1);
	}

	expect(
		await composer.getByRole("status").evaluate((el) => el.getBoundingClientRect().height),
	).toBeLessThanOrEqual(1);
	await expect(composer).not.toContainText("Optimized for cost-sensitive");
	await page.emulateMedia({ reducedMotion: "no-preference" });
	const restingBounds = await composer.boundingBox();
	await picker.hover();
	expect(await composer.boundingBox()).toEqual(restingBounds);
	await testInfo.attach("minimal-composer-hover", {
		body: await panel.screenshot({ animations: "disabled" }),
		contentType: "image/png",
	});
	await page.mouse.down();
	expect(await composer.boundingBox()).toEqual(restingBounds);
	await testInfo.attach("minimal-composer-active", {
		body: await panel.screenshot({ animations: "disabled" }),
		contentType: "image/png",
	});
	await page.mouse.up();
	await page.keyboard.press("Escape");
	expect(await picker.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
	expect(await composer.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
	await picker.focus();
	expect(await composer.boundingBox()).toEqual(restingBounds);
	await testInfo.attach("minimal-composer-focus", {
		body: await panel.screenshot({ animations: "disabled" }),
		contentType: "image/png",
	});
	await picker.press("ArrowDown");
	const openMenu = panel.getByRole("menu", { name: "Model" });
	await expect(openMenu.getByRole("menuitemradio", { name: "GPT-5.6 Luna" })).toHaveAttribute(
		"aria-checked",
		"true",
	);
	await expect(openMenu).toBeInViewport({ ratio: 1 });
	const a11y = await scanAccessibility(page, { include: ['[data-testid="right-panel"]'] });
	expect(filterUnexceptedViolations(a11y.violations, [])).toEqual([]);
	await testInfo.attach("minimal-model-menu-light", {
		body: await panel.screenshot({ animations: "disabled" }),
		contentType: "image/png",
	});
	await page.keyboard.press("Escape");
	await expect(picker).toBeFocused();
	await input.fill("Review this architecture.");
	await picker.click();
	await page.keyboard.press("Control+l");
	await expect(input).toBeFocused();
	await expect(panel.getByRole("menu")).toHaveCount(0);
	await picker.click();
	await page.keyboard.press("Tab");
	await expect(composer.getByRole("button", { name: "Send message" })).toBeFocused();
	await expect(panel.getByRole("menu")).toHaveCount(0);
	await panel.getByRole("button", { name: "Send message" }).click();
	await expect(picker).toBeDisabled();
	await expect(composer.getByRole("button", { name: "Stop response" })).toBeVisible();
	expect(await composer.boundingBox()).toEqual(restingBounds);
	expect(await composer.getByRole("button", { name: "Stop response" }).boundingBox()).toEqual(
		sendBounds,
	);
	await testInfo.attach("minimal-composer-busy", {
		body: await panel.screenshot({ animations: "disabled" }),
		contentType: "image/png",
	});
	releaseOpenAi();
	await expect(panel.getByTestId("chat-messages")).toContainText("Review the gateway.");
	await expect(picker).toBeEnabled();
	expect(requests).toEqual([
		{ provider: "openai", model: "gpt-5.6-luna", key: `Bearer ${OPENAI_KEY}` },
	]);
	await testInfo.attach("chat-model-selector-light", {
		body: await page.screenshot({ animations: "disabled" }),
		contentType: "image/png",
	});
	await picker.focus();
	await expect(picker).toBeFocused();
	await picker.press("ArrowDown");
	const menu = panel.getByRole("menu", { name: "Model" });
	await menu.press("End");
	await page.keyboard.press("Enter");
	await expect(picker).toHaveText("Claude Haiku 4.5");
	await expect(input).toBeVisible();
	await expect(picker).toBeFocused();
	await input.fill("Review with Claude.");
	await panel.getByRole("button", { name: "Send message" }).click();
	await expect(panel.getByTestId("chat-messages")).toContainText("Anthropic review ready.");
	expect(requests[1]).toEqual({
		provider: "anthropic",
		model: "claude-haiku-4-5-20251001",
		key: ANTHROPIC_KEY,
	});
	await chooseModel("OpenAI", "GPT-5.6 Luna");
	await page.setViewportSize({ width: 800, height: 700 });
	await page.emulateMedia({ colorScheme: "dark" });
	await expect(picker).toBeVisible();
	const bounds = await picker.boundingBox();
	const panelBounds = await panel.boundingBox();
	expect(bounds).not.toBeNull();
	expect(panelBounds).not.toBeNull();
	if (bounds && panelBounds)
		expect(bounds.x + bounds.width).toBeLessThanOrEqual(panelBounds.x + panelBounds.width);
	await picker.click();
	await expect(panel.getByRole("menu")).toBeInViewport({ ratio: 1 });
	const darkA11y = await scanAccessibility(page, { include: ['[data-testid="right-panel"]'] });
	expect(filterUnexceptedViolations(darkA11y.violations, [])).toEqual([]);
	await testInfo.attach("minimal-model-menu-dark", {
		body: await panel.screenshot({ animations: "disabled" }),
		contentType: "image/png",
	});
	await page.keyboard.press("Escape");
	await testInfo.attach("chat-model-selector", {
		body: await page.screenshot({ animations: "disabled" }),
		contentType: "image/png",
	});
});

test("model menu stays usable when encrypted storage is unavailable", async ({
	page,
}, testInfo) => {
	await page.addInitScript((vaultName) => {
		const open = IDBFactory.prototype.open;
		IDBFactory.prototype.open = function (name, version) {
			if (name === vaultName) throw new DOMException("Scripted vault denial", "SecurityError");
			return version === undefined ? open.call(this, name) : open.call(this, name, version);
		};
	}, KEY_VAULT_DB_NAME);
	await page.setViewportSize({ width: 800, height: 520 });
	await page.goto("/app");
	await createModel(page);
	await page.getByTestId("tab-ai").click();
	const panel = page.getByTestId("right-panel");
	await expect(panel.getByTestId("key-storage-fault")).toContainText(KEY_STORAGE_UNREADABLE);
	await expect(panel).not.toContainText("No API key configured");
	await expect(panel).not.toContainText("Scripted vault denial");
	await expect(panel.getByRole("textbox", { name: "Message AI assistant" })).toHaveCount(0);
	const picker = panel.getByRole("button", { name: "Model", exact: true });
	await picker.click();
	const menu = panel.getByRole("menu", { name: "Model" });
	await expect(menu).toBeInViewport({ ratio: 1 });
	await menu.getByRole("menuitemradio", { name: "GPT-5.6 Luna" }).click();
	await expect(picker).toHaveText("GPT-5.6 Luna");
	await expect(panel.getByTestId("key-storage-fault")).toBeVisible();
	const faultA11y = await scanAccessibility(page, { include: ['[data-testid="right-panel"]'] });
	expect(filterUnexceptedViolations(faultA11y.violations, [])).toEqual([]);
	await testInfo.attach("minimal-composer-storage-fault", {
		body: await panel.screenshot({ animations: "disabled" }),
		contentType: "image/png",
	});
	await panel.getByRole("button", { name: "Open AI settings", exact: true }).click();
	await expect(page.getByTestId("settings-dialog")).toBeVisible();
});

test("legacy model selection stays reachable in a narrow zoomed panel", async ({
	page,
}, testInfo) => {
	const legacy = `retired-${"long-model-id".repeat(20)}`;
	await page.addInitScript(
		({ legacy, settings }) => {
			localStorage.setItem(
				"threatforge-settings",
				JSON.stringify({
					state: { settings: { ...settings, aiModelAnthropic: legacy } },
					version: 0,
				}),
			);
			localStorage.setItem("threatforge-panel-widths", JSON.stringify({ left: 224, right: 260 }));
		},
		{ legacy, settings: DEFAULT_USER_SETTINGS },
	);
	await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
	await page.goto("/app");
	await createModel(page);
	await page.getByTestId("tab-ai").click();
	const panel = page.getByTestId("right-panel");
	const picker = panel.getByRole("button", { name: "Model", exact: true });
	async function chooseModel(provider: string, label: string) {
		await picker.click();
		await panel
			.getByRole("menu", { name: "Model" })
			.getByRole("group", { name: provider })
			.getByRole("menuitemradio", { name: label, exact: true })
			.click();
		await expect(panel.getByRole("menu")).toHaveCount(0);
	}
	await expect(picker).toHaveText(legacy);
	await expect(panel.getByRole("alert")).toContainText("Tool use stays disabled");
	await expect(panel).toContainText("No API key configured");
	await chooseModel("OpenAI", "GPT-5.6 Luna");
	await chooseModel("Anthropic", legacy);
	await expect(picker).toHaveText(legacy);
	await page.evaluate(() => {
		document.documentElement.style.zoom = "2";
	});
	await expect(picker).toBeVisible();
	await panel.hover();
	await page.mouse.wheel(0, 2000);
	await expect(picker).toBeInViewport({ ratio: 1 });
	await picker.focus();
	await expect(picker).toBeFocused();
	expect(
		await picker.locator("..").evaluate((element) => element.scrollWidth <= element.clientWidth),
	).toBe(true);
	await testInfo.attach("legacy-model-selector-css-zoom", {
		body: await page.screenshot({ animations: "disabled" }),
		contentType: "image/png",
	});
	const replace = panel.getByRole("button", { name: /recommended default/ });
	await panel.hover();
	await page.mouse.wheel(0, 2000);
	await expect(replace).toBeInViewport({ ratio: 1 });
	await testInfo.attach("legacy-controls-css-zoom", {
		body: await page.screenshot({ animations: "disabled" }),
		contentType: "image/png",
	});
	await panel.hover();
	await page.mouse.wheel(0, -2000);
	await expect(
		panel.getByRole("button", { name: "Configure API Key", exact: true }),
	).toBeInViewport({ ratio: 1 });
	await testInfo.attach("keyless-configure-css-zoom", {
		body: await page.screenshot({ animations: "disabled" }),
		contentType: "image/png",
	});
	await panel.hover();
	await page.mouse.wheel(0, 2000);
	await expect(replace).toBeInViewport({ ratio: 1 });
	await picker.click();
	const zoomMenu = panel.getByRole("menu", { name: "Model" });
	await expect(zoomMenu).toBeInViewport({ ratio: 1 });
	expect(await zoomMenu.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
	await page.keyboard.press("Home");
	await expect(zoomMenu.getByRole("menuitemradio", { name: "GPT-5.6 Sol" })).toBeInViewport({
		ratio: 1,
	});
	await page.keyboard.press("End");
	await expect(zoomMenu.getByRole("menuitemradio", { name: "Claude Haiku 4.5" })).toBeInViewport({
		ratio: 1,
	});
	await testInfo.attach("minimal-model-menu-css-zoom", {
		body: await panel.screenshot({ animations: "disabled" }),
		contentType: "image/png",
	});
	await page.keyboard.press("Escape");
	await expect(picker).toBeFocused();
	await replace.click();
	await expect(picker).toHaveText("Claude Sonnet 5");
	await expect(panel.getByRole("alert")).toHaveCount(0);
});
