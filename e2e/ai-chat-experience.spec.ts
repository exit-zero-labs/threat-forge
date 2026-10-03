import {
	addElementResponse,
	openAiPanelWithModel,
	routeAnthropic,
	send,
	textResponse,
} from "./anthropic-sse";
import { expect, test } from "./fixtures";

const longAnswer = `## Protect the cache\n\n${"Keep credentials out of logs. Apply timeouts at the API boundary and verify access before reading cached data.\n\n".repeat(16)}\n\`\`\`typescript\nconst cacheKey = "${"namespace:".repeat(35)}";\n\`\`\`\n\n| Component | Threat | Mitigation |\n| --- | --- | --- |\n| Cache | Unauthorized read | Validate tenant and user permissions |`;

test.describe("AI chat experience", () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test("a hundred exchanges survive switching chats with follow-up context", async ({
		page,
	}, testInfo) => {
		test.setTimeout(120_000);
		const requests: { messages: { role: string; content: unknown }[] }[] = [];
		await page.route("https://api.anthropic.com/v1/messages", async (route) => {
			requests.push(route.request().postDataJSON());
			await route.fulfill({
				status: 200,
				contentType: "text/event-stream",
				body: textResponse(`Response ${requests.length}: validate the cache access policy.`),
			});
		});
		await openAiPanelWithModel(page);
		for (let i = 1; i <= 100; i++) {
			await send(page, i === 1 ? "Review the cache access policy" : `Check ${i}`);
			await expect(page.getByTestId("chat-messages")).toContainText(`Response ${i}:`);
			await expect(page.getByTitle("Send (Enter)")).toBeVisible();
		}
		const path = testInfo.outputPath("long-session.png");
		await page.screenshot({ path });
		await testInfo.attach("long-session", { path, contentType: "image/png" });
		await expect(page.getByTestId("right-panel")).toContainText("Review the cache access policy");
		await page.getByTitle("New chat session").click();
		await send(page, "A separate database review");
		await expect(page.getByTestId("chat-messages")).toContainText("Response 101:");
		await page.getByRole("button", { name: "Choose chat" }).click();
		await page.getByRole("button", { name: "Open chat: Review the cache access policy" }).click();
		await expect(page.getByTestId("chat-messages")).toContainText("Response 100:");
		await send(page, "Continue our cache review");
		await expect(page.getByTestId("chat-messages")).toContainText("Response 102:");
		expect(JSON.stringify(requests.at(-1)?.messages)).toContain("Response 100:");
		expect(JSON.stringify(requests.at(-1)?.messages)).not.toContain("separate database review");
		expect(requests.at(-1)?.messages.length).toBeLessThanOrEqual(201);
	});

	test("long markdown stays bounded and the stop control stays visible", async ({
		page,
	}, testInfo) => {
		await routeAnthropic(page, [textResponse(longAnswer), addElementResponse()]);
		await openAiPanelWithModel(page);
		await send(page, "Review this architecture in detail");
		await expect(page.getByTestId("chat-messages")).toContainText("Protect the cache");
		await expect(page.getByTitle("Send (Enter)")).toBeVisible();
		await send(page, "add a cache");
		await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
		const path = testInfo.outputPath("pending-approval.png");
		await page.screenshot({ path });
		await testInfo.attach("pending-approval", { path, contentType: "image/png" });
		const colors = await page.getByTitle("Stop generating (Esc)").evaluate((button) => {
			const style = getComputedStyle(button);
			return { foreground: style.color, background: style.backgroundColor };
		});
		expect(colors.foreground).not.toBe(colors.background);
		const overflow = await page
			.getByTestId("chat-messages")
			.evaluate((el) => el.scrollWidth - el.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
