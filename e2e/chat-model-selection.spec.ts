import { serializeFrames } from "../src/lib/ai/providers/test-fixtures/fake-stream";
import { OPENAI_TEXT_STREAM } from "../src/lib/ai/providers/test-fixtures/openai-fixtures";
import { DEFAULT_USER_SETTINGS } from "../src/types/settings";
import { textResponse } from "./anthropic-sse";
import { addPaletteItem, createModel, expect, test } from "./fixtures";
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
	const picker = panel.getByRole("combobox", { name: "Model" });
	expect(
		await picker
			.locator("optgroup")
			.evaluateAll((groups) => groups.map((group) => group.getAttribute("label"))),
	).toEqual(["OpenAI", "Anthropic"]);
	await picker.selectOption("openai:gpt-5.6-luna");
	await expect(panel).toContainText("No API key configured");
	await panel.getByRole("button", { name: "Configure API Key", exact: true }).click();
	const settings = page.getByTestId("settings-dialog");
	await expect(settings.getByRole("combobox", { name: "Model" })).toHaveCount(0);
	await expect(settings.getByRole("combobox", { name: "API key provider" })).toHaveValue("openai");
	await settings.getByLabel("OpenAI API key").fill(OPENAI_KEY);
	await settings.getByRole("button", { name: "Save", exact: true }).click();
	await expect(settings).toContainText("API key encrypted and saved in this browser.");
	await settings.getByRole("combobox", { name: "API key provider" }).selectOption("anthropic");
	await settings.getByLabel("Anthropic API key").fill(ANTHROPIC_KEY);
	await settings.getByRole("button", { name: "Save", exact: true }).click();
	await expect(settings).toContainText("API key encrypted and saved in this browser.");
	await testInfo.attach("credential-only-ai-settings", {
		body: await page.screenshot(),
		contentType: "image/png",
	});
	await settings.getByRole("combobox", { name: "API key provider" }).press("Escape");
	await expect(settings).toBeHidden();
	await expect(picker).toHaveValue("openai:gpt-5.6-luna");
	await page.reload();
	await page.getByTestId("tab-ai").click();
	await expect(picker).toHaveValue("openai:gpt-5.6-luna");
	const input = panel.getByRole("textbox", { name: "Message AI assistant" });
	await input.fill("Review this architecture.");
	await panel.getByRole("button", { name: "Send message" }).click();
	await expect(picker).toBeDisabled();
	releaseOpenAi();
	await expect(panel.getByTestId("chat-messages")).toContainText("Review the gateway.");
	await expect(picker).toBeEnabled();
	expect(requests).toEqual([
		{ provider: "openai", model: "gpt-5.6-luna", key: `Bearer ${OPENAI_KEY}` },
	]);
	await testInfo.attach("chat-model-selector-light", {
		body: await page.screenshot(),
		contentType: "image/png",
	});
	await picker.focus();
	await expect(picker).toBeFocused();
	await picker.press("End");
	await expect(picker).toHaveValue("anthropic:claude-haiku-4-5-20251001");
	await expect(input).toBeVisible();
	await input.fill("Review with Claude.");
	await panel.getByRole("button", { name: "Send message" }).click();
	await expect(panel.getByTestId("chat-messages")).toContainText("Anthropic review ready.");
	expect(requests[1]).toEqual({
		provider: "anthropic",
		model: "claude-haiku-4-5-20251001",
		key: ANTHROPIC_KEY,
	});
	await picker.selectOption("openai:gpt-5.6-luna");
	await page.setViewportSize({ width: 800, height: 700 });
	await page.emulateMedia({ colorScheme: "dark" });
	await expect(picker).toBeVisible();
	const bounds = await picker.boundingBox();
	const panelBounds = await panel.boundingBox();
	expect(bounds).not.toBeNull();
	expect(panelBounds).not.toBeNull();
	if (bounds && panelBounds)
		expect(bounds.x + bounds.width).toBeLessThanOrEqual(panelBounds.x + panelBounds.width);
	await testInfo.attach("chat-model-selector", {
		body: await page.screenshot(),
		contentType: "image/png",
	});
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
	const picker = panel.getByRole("combobox", { name: "Model" });
	await expect(picker).toHaveValue(`anthropic:${legacy}`);
	await expect(panel.getByRole("alert")).toContainText(legacy);
	await expect(panel).toContainText("No API key configured");
	await picker.selectOption("openai:gpt-5.6-luna");
	await picker.selectOption(`anthropic:${legacy}`);
	await expect(picker).toHaveValue(`anthropic:${legacy}`);
	await page.evaluate(() => {
		document.documentElement.style.zoom = "2";
	});
	await expect(picker).toBeVisible();
	await picker.focus();
	await expect(picker).toBeFocused();
	expect(
		await picker.locator("..").evaluate((element) => element.scrollWidth <= element.clientWidth),
	).toBe(true);
	await testInfo.attach("legacy-model-selector-css-zoom", {
		body: await page.screenshot(),
		contentType: "image/png",
	});
	const replace = panel.getByRole("button", { name: /recommended default/ });
	await panel.hover();
	await page.mouse.wheel(0, 2000);
	await expect(replace).toBeInViewport({ ratio: 1 });
	await expect(
		panel.getByRole("button", { name: "Configure API Key", exact: true }),
	).toBeInViewport({
		ratio: 1,
	});
	await testInfo.attach("legacy-controls-css-zoom", {
		body: await page.screenshot(),
		contentType: "image/png",
	});
	await replace.click();
	await expect(picker).toHaveValue("anthropic:claude-sonnet-5");
	await expect(panel.getByRole("alert")).toHaveCount(0);
});
