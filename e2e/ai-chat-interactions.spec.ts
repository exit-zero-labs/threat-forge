import {
	addElementResponse,
	openAiPanelWithModel,
	routeAnthropic,
	send,
	sse,
	textResponse,
} from "./anthropic-sse";
import { expect, test } from "./fixtures";
import { scanAccessibility } from "./support/accessibility";
import { createDocument, switchToTab } from "./support/interactions";

const longAnswer = `## Protect the cache\n\n${"Validate user and tenant access before reading cached data. Keep credentials out of logs.\n\n".repeat(18)}\n\`\`\`\nconst cacheKey = "${"namespace:".repeat(35)}";\n\`\`\`\n\n| Component | Threat | Mitigation |\n| --- | --- | --- |\n| Cache | Unauthorized read | Validate tenant and user permissions |`;

test.describe("Chat interactions", () => {
	test.use({ viewport: { width: 1280, height: 800 }, hasTouch: true });

	test("reading history stays put as a live response arrives", async ({ page }, testInfo) => {
		let requests = 0;
		const releases: Array<() => void> = [];
		await page.route("https://api.anthropic.com/v1/messages", async (route) => {
			requests++;
			if (requests > 1)
				await new Promise<void>((resolve) => {
					releases.push(resolve);
				});
			await route.fulfill({
				status: 200,
				contentType: "text/event-stream",
				body: textResponse(requests === 1 ? longAnswer : "The latest cache review is ready."),
			});
		});
		await openAiPanelWithModel(page);
		await send(page, "Review the cache");
		await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
		await send(page, "Continue with the next risks");
		await expect(page.getByRole("button", { name: "Stop response" })).toBeVisible();
		await expect.poll(() => releases.length).toBe(1);
		const scroller = page.getByTestId("chat-messages");
		await scroller.hover();
		await page.mouse.wheel(0, -400);
		await expect(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
		const readingTop = await scroller.evaluate((el) => el.scrollTop);
		releases[0]?.();
		await expect(scroller).toContainText("The latest cache review is ready.");
		await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
		expect(await scroller.evaluate((el) => el.scrollTop)).toBe(readingTop);
		const path = testInfo.outputPath("reading-history.png");
		await page.screenshot({ path });
		await testInfo.attach("reading-history", { path, contentType: "image/png" });
		await page.getByRole("button", { name: "Jump to latest" }).click();
		await expect
			.poll(() => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight))
			.toBeLessThanOrEqual(1);
		await expect(page.getByRole("button", { name: "Jump to latest" })).toBeHidden();

		await send(page, "Continue the touch scroll review");
		await expect.poll(() => releases.length).toBe(2);
		const box = await scroller.boundingBox();
		if (!box) throw new Error("The conversation must have layout");
		const cdp = await page.context().newCDPSession(page);
		const point = { x: box.x + box.width / 2, y: box.y + box.height / 3 };
		const touchScrollEnded = scroller.evaluate(
			(el) =>
				new Promise<number>((resolve) => {
					el.addEventListener("scrollend", () => resolve(el.scrollTop), { once: true });
				}),
		);
		await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
		for (let step = 1; step <= 8; step++) {
			await cdp.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [{ ...point, y: point.y + step * 25 }],
			});
		}
		await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		const touchReadingTop = await touchScrollEnded;
		await cdp.detach();
		await expect(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
		releases[1]?.();
		await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
		expect(await scroller.evaluate((el) => el.scrollTop)).toBe(touchReadingTop);
	});

	test("many chats support keyboard search rename deletion and separate drafts", async ({
		page,
	}, testInfo) => {
		await routeAnthropic(page, [textResponse("This review is ready.")]);
		await openAiPanelWithModel(page);
		for (let i = 1; i <= 24; i++) {
			if (i > 1) await page.getByRole("button", { name: "New chat", exact: true }).click();
			await send(page, `Review architecture ${i}`);
			await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
		}
		const input = page.getByRole("textbox", { name: "Message AI assistant" });
		await input.fill("Last chat draft");
		await page.getByRole("button", { name: "Choose chat" }).click();
		const path = testInfo.outputPath("chat-picker.png");
		await page.screenshot({ path });
		await testInfo.attach("chat-picker", { path, contentType: "image/png" });
		await page.getByRole("textbox", { name: "Search chats" }).fill("architecture 12");
		await page.getByRole("textbox", { name: "Search chats" }).press("ArrowDown");
		await page.keyboard.press("Enter");
		await expect(input).toBeEmpty();
		await input.fill("Twelfth chat draft");
		await page.getByRole("button", { name: "Choose chat" }).click();
		await page.getByRole("button", { name: "Rename chat: Review architecture 12" }).click();
		await page.getByRole("textbox", { name: "Chat name" }).fill("Cache permission review");
		await page.getByRole("textbox", { name: "Chat name" }).press("Enter");
		await page.getByRole("textbox", { name: "Search chats" }).fill("permission");
		await page.getByRole("button", { name: "Delete chat: Cache permission review" }).click();
		await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("textbox", { name: "Search chats" })).toBeFocused();
		await expect(
			page.getByRole("button", { name: "Open chat: Cache permission review" }),
		).toBeVisible();
		await page.getByRole("button", { name: "Delete chat: Cache permission review" }).click();
		await page.getByRole("button", { name: "Delete chat", exact: true }).click();
		await expect(page.getByRole("textbox", { name: "Search chats" })).toBeFocused();
		await expect(
			page.getByRole("button", { name: "Open chat: Cache permission review" }),
		).toBeHidden();
		await page.getByRole("textbox", { name: "Search chats" }).fill("architecture 24");
		await page.getByRole("textbox", { name: "Search chats" }).press("Enter");
		await expect(input).toHaveValue("Last chat draft");
	});

	test("panel and document switching preserve context and cancel pending approvals", async ({
		page,
	}) => {
		await routeAnthropic(page, [
			textResponse("First document response."),
			addElementResponse(),
			textResponse("Second document response."),
		]);
		await openAiPanelWithModel(page);
		await send(page, "Review first document");
		await expect(page.getByTestId("chat-messages")).toContainText("First document response.");
		const input = page.getByRole("textbox", { name: "Message AI assistant" });
		await input.fill("First document draft");
		await page.getByTestId("tab-properties").click();
		await page.getByTestId("tab-ai").click();
		await expect(input).toHaveValue("First document draft");
		await expect(page.getByTestId("chat-messages")).toContainText("First document response.");
		await send(page, "Add a cache");
		await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
		await createDocument(page);
		await page.getByTestId("tab-ai").click();
		await expect(page.getByTestId("right-panel")).toContainText("Explore your threat model");
		await send(page, "Review second document");
		await expect(page.getByTestId("chat-messages")).toContainText("Second document response.");
		await switchToTab(page, { index: 0 });
		await expect(page.getByTestId("chat-messages")).toContainText("First document response.");
		await expect(page.getByTestId("chat-messages")).not.toContainText("Second document response.");
		await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeHidden();
		await expect(page.locator(".react-flow__node")).toHaveCount(0);
	});

	for (const mode of ["light", "dark"] as const) {
		test(`${mode} chat handles multiline drafts errors and narrow markdown`, async ({
			page,
		}, testInfo) => {
			await page.emulateMedia({ colorScheme: mode });
			await page.addInitScript(() =>
				localStorage.setItem("threatforge-panel-widths", JSON.stringify({ left: 224, right: 260 })),
			);
			await routeAnthropic(page, [
				textResponse(longAnswer),
				sse([
					{
						event: "error",
						data: {
							type: "error",
							error: { type: "invalid_request_error", message: "scripted error" },
						},
					},
				]),
			]);
			await openAiPanelWithModel(page);
			const input = page.getByRole("textbox", { name: "Message AI assistant" });
			const empty = testInfo.outputPath(`${mode}-empty.png`);
			await page.screenshot({ path: empty });
			await testInfo.attach(`${mode}-empty`, { path: empty, contentType: "image/png" });
			const initialHeight = (await input.boundingBox())?.height ?? 0;
			await input.fill(
				"Line one\nLine two\nLine three\nLine four\nLine five\nLine six\nLine seven\nLine eight\nLine nine",
			);
			const grownHeight = (await input.boundingBox())?.height ?? 0;
			expect(grownHeight).toBeGreaterThan(initialHeight);
			expect(grownHeight).toBeLessThanOrEqual(160);
			await input.press("Shift+Enter");
			await expect(input).toHaveValue(/Line nine\n/);
			await input.press("Enter");
			await expect(page.getByTestId("chat-messages")).toContainText("Protect the cache");
			await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
			expect(
				await page.getByTestId("chat-messages").evaluate((el) => el.scrollWidth - el.clientWidth),
			).toBeLessThanOrEqual(1);
			const markdown = testInfo.outputPath(`${mode}-markdown.png`);
			await page.screenshot({ path: markdown });
			await testInfo.attach(`${mode}-markdown`, { path: markdown, contentType: "image/png" });
			const panelBox = await page.getByTestId("right-panel").boundingBox();
			if (!panelBox) throw new Error("The chat panel must have layout");
			await page.mouse.move(panelBox.x + 2, panelBox.y + 200);
			await page.mouse.down();
			await page.mouse.move(panelBox.x - 238, panelBox.y + 200, { steps: 5 });
			await page.mouse.up();
			await expect
				.poll(async () => (await page.getByTestId("right-panel").boundingBox())?.width ?? 0)
				.toBeGreaterThanOrEqual(499);
			expect(
				await page.getByTestId("chat-messages").evaluate((el) => el.scrollWidth - el.clientWidth),
			).toBeLessThanOrEqual(1);
			const wide = testInfo.outputPath(`${mode}-wide.png`);
			await page.screenshot({ path: wide });
			await testInfo.attach(`${mode}-wide`, { path: wide, contentType: "image/png" });
			await send(page, "Continue");
			await expect(page.getByTestId("right-panel").getByRole("alert")).toBeVisible();
			const error = testInfo.outputPath(`${mode}-error.png`);
			await page.screenshot({ path: error });
			await testInfo.attach(`${mode}-error`, { path: error, contentType: "image/png" });
			const scan = await scanAccessibility(page, { include: ["[data-testid='right-panel']"] });
			expect(
				scan.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
			).toEqual([]);
		});
	}
});
