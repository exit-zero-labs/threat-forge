import { z } from "zod";
import { send } from "./anthropic-sse";
import { expect, test } from "./fixtures";
import {
	assertProviderRequest,
	encryptedReasoning,
	nativeFunction,
	openProvider,
	response,
	signedThinking,
	type TestProvider,
} from "./provider-sse";
import { createDocument, switchToTab } from "./support/interactions";

const models: [TestProvider, string][] = [
	["openai", "gpt-6-astra"],
	["openai", "gpt-6.1-sol"],
	["openai", "gpt-6-luna"],
	["anthropic", "claude-fable-5-1"],
	["anthropic", "claude-opus-5-5"],
	["anthropic", "claude-sonnet-5-5"],
	["anthropic", "claude-haiku-4-5-20251001"],
];
const endpoint = (p: TestProvider) =>
	p === "openai" ? "https://api.openai.com/v1/responses" : "https://api.anthropic.com/v1/messages";
for (const [provider, model] of models) {
	test(`${model} greeting advertises compatible native tools`, async ({ page }) => {
		let requests = 0;
		await page.route(endpoint(provider), async (route) => {
			assertProviderRequest(provider, route.request().postDataJSON(), model);
			requests++;
			await route.fulfill({
				status: 200,
				contentType: "text/event-stream",
				body: response(provider, model, "text", "Hello 🌐"),
			});
		});
		await openProvider(page, provider, model);
		await send(page, "hi");
		await expect(page.getByTestId("chat-messages")).toContainText("Hello 🌐");
		await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
		expect(requests).toBe(1);
	});
}
for (const [provider, model] of [
	["openai", "gpt-6.1-sol"],
	["anthropic", "claude-sonnet-5-5"],
] as const) {
	test(`${provider} approval replays reasoning and undo restores the canvas`, async ({
		page,
	}, testInfo) => {
		let requests = 0;
		await page.route(endpoint(provider), async (route) => {
			const body = assertProviderRequest(provider, route.request().postDataJSON(), model);
			if (requests >= 1) {
				if (provider === "openai") {
					const input = z.array(z.record(z.string(), z.unknown())).parse(body.input);
					expect(input).toContainEqual(encryptedReasoning);
					expect(input).toContainEqual(nativeFunction);
					if (requests === 2) {
						expect(input).toContainEqual({
							...encryptedReasoning,
							id: "rs_item_2",
							encrypted_content: "e2e-encrypted-reasoning-two",
						});
						expect(input).toContainEqual({ ...nativeFunction, id: "fc_item_2", call_id: "call_2" });
						expect(input).toContainEqual(
							expect.objectContaining({ type: "function_call_output", call_id: "call_2" }),
						);
					}
					expect(input).toContainEqual(
						expect.objectContaining({ type: "function_call_output", call_id: "call_1" }),
					);
				} else {
					const content = z
						.array(
							z.object({ role: z.string(), content: z.array(z.record(z.string(), z.unknown())) }),
						)
						.parse(body.messages)
						.flatMap((m) => m.content);
					expect(content).toContainEqual(signedThinking);
					if (requests === 2) {
						expect(content).toContainEqual({
							...signedThinking,
							signature: "e2e-signed-two-thinking",
						});
						expect(content).toContainEqual(
							expect.objectContaining({
								type: "tool_result",
								tool_use_id: "call_2",
								is_error: false,
							}),
						);
					}
					expect(content).toContainEqual(
						expect.objectContaining({
							type: "tool_result",
							tool_use_id: "call_1",
							is_error: false,
						}),
					);
				}
			}
			requests++;
			await route.fulfill({
				status: 200,
				contentType: "text/event-stream",
				body:
					requests === 2
						? response(provider, model, "tool")
								.replaceAll("call_1", "call_2")
								.replaceAll("fc_item", "fc_item_2")
								.replaceAll("rs_item", "rs_item_2")
								.replaceAll("e2e-encrypted-reasoning", "e2e-encrypted-reasoning-two")
								.replaceAll("e2e-signed-", "e2e-signed-two-")
						: response(provider, model, requests === 1 ? "tool" : "text"),
			});
		});
		await openProvider(page, provider, model);
		await send(page, "add a cache");
		await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(0);
		await page.getByRole("button", { name: "Approve", exact: true }).click();
		await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(1);
		await page.getByRole("button", { name: "Approve", exact: true }).click();
		await expect(page.getByTestId("chat-messages")).toContainText("Done.");
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(2);
		expect(requests).toBe(3);
		const path = testInfo.outputPath(`${provider}-applied.png`);
		await page.screenshot({ path });
		await testInfo.attach(`${provider} applied`, { path, contentType: "image/png" });
		await page.getByRole("button", { name: /Undo this turn/ }).click();
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(0);
	});
	test(`${provider} denial and stop never apply an unapproved mutation`, async ({ page }) => {
		let requests = 0;
		await page.route(endpoint(provider), async (route) => {
			const body = assertProviderRequest(provider, route.request().postDataJSON(), model);
			if (requests === 1) expect(JSON.stringify(body)).toContain("declined");
			requests++;
			await route.fulfill({
				status: 200,
				contentType: "text/event-stream",
				body: response(provider, model, requests === 2 ? "text" : "tool"),
			});
		});
		await openProvider(page, provider, model);
		await send(page, "add a cache");
		await page.getByRole("button", { name: "Deny", exact: true }).click();
		await expect(page.getByTestId("chat-messages")).toContainText("Done.");
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(0);
		await page.getByRole("button", { name: "New chat", exact: true }).click();
		await send(page, "add another cache");
		await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
		await page.getByRole("button", { name: "Stop response" }).click();
		await expect(page.getByTestId("tool-call-call_1")).toHaveAttribute("data-status", "denied");
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(0);
		expect(requests).toBe(3);
	});
}

for (const [provider, model] of [
	["openai", "gpt-6.1-sol"],
	["anthropic", "claude-sonnet-5-5"],
] as const) {
	test(`${provider} signed context stays with its chat and document`, async ({ page }) => {
		let requests = 0;
		await page.route(endpoint(provider), async (route) => {
			const body = assertProviderRequest(provider, route.request().postDataJSON(), model);
			if (requests === 1 || requests === 2) {
				expect(JSON.stringify(body)).not.toContain("First architecture");
				expect(JSON.stringify(body)).not.toContain(
					provider === "openai" ? encryptedReasoning.encrypted_content : signedThinking.signature,
				);
			}
			if (requests === 3) {
				expect(JSON.stringify(body)).toContain("First architecture");
				expect(JSON.stringify(body)).not.toContain("Separate chat");
				expect(JSON.stringify(body)).not.toContain("Second document");
				expect(JSON.stringify(body)).toContain("call_1");
			}
			requests++;
			await route.fulfill({
				status: 200,
				contentType: "text/event-stream",
				body: response(
					provider,
					model,
					requests === 1 ? "tool" : "text",
					`Context response ${requests}`,
				),
			});
		});
		await openProvider(page, provider, model);
		await send(page, "First architecture");
		await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
		await page.getByRole("button", { name: "New chat", exact: true }).click();
		await send(page, "Separate chat");
		await expect(page.getByTestId("chat-messages")).toContainText("Context response 2");
		await page.getByRole("button", { name: "Choose chat" }).click();
		await page.getByRole("button", { name: "Open chat: First architecture" }).click();
		await expect(page.getByTestId("tool-call-call_1")).toHaveAttribute("data-status", "denied");
		await createDocument(page);
		await page.getByTestId("tab-ai").click();
		await send(page, "Second document");
		await expect(page.getByTestId("chat-messages")).toContainText("Context response 3");
		await switchToTab(page, { index: 0 });
		await page.getByTestId("tab-ai").click();
		await send(page, "Continue first");
		await expect(page.getByTestId("chat-messages")).toContainText("Context response 4");
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(0);
		expect(requests).toBe(4);
	});
	test(`${provider} corrupt output shows a safe error without approval`, async ({ page }) => {
		await page.route(endpoint(provider), async (route) => {
			assertProviderRequest(provider, route.request().postDataJSON(), model);
			const scripted = response(provider, model, "tool");
			const corrupted =
				provider === "openai"
					? scripted.replace(nativeFunction.arguments.replaceAll('"', '\\"'), "{never valid")
					: scripted
							.replace('"signature":"e2e-signed-"', '"signature":""')
							.replace('"signature":"thinking"', '"signature":""');
			await route.fulfill({ status: 200, contentType: "text/event-stream", body: corrupted });
		});
		await openProvider(page, provider, model);
		await send(page, "add a cache");
		await expect(page.getByTestId("right-panel").getByRole("alert")).toBeVisible();
		await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeHidden();
		await expect(page.locator("[data-testid^='node-']")).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
	});
	test(`${provider} saved previous model remains selected until explicitly changed`, async ({
		page,
	}) => {
		const previous = provider === "openai" ? "gpt-5.6-luna" : "claude-sonnet-5";
		await openProvider(page, provider, model);
		await page.evaluate(
			({ provider, previous }) => {
				const raw = localStorage.getItem("threatforge-settings");
				if (!raw) throw new Error("Expected saved settings");
				const stored = JSON.parse(raw);
				stored.state.settings[provider === "openai" ? "aiModelOpenai" : "aiModelAnthropic"] =
					previous;
				localStorage.setItem("threatforge-settings", JSON.stringify(stored));
			},
			{ provider, previous },
		);
		await page.reload();
		await createDocument(page);
		await page.getByTestId("tab-ai").click();
		await page.getByTitle("AI Settings", { exact: true }).click();
		await page.getByRole("combobox", { name: "Provider", exact: true }).selectOption(provider);
		await expect(page.getByRole("combobox", { name: "Model", exact: true })).toHaveValue(previous);
		await expect(page.getByRole("alert")).toContainText("Your selection is preserved");
		await page.getByRole("button", { name: /Switch to .*recommended default/ }).click();
		await expect(page.getByRole("combobox", { name: "Model", exact: true })).toHaveValue(model);
	});
}
