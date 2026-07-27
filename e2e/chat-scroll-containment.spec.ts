import {
	addElementResponse,
	MODEL,
	openAiPanelWithModel,
	routeAnthropic,
	send,
	sse,
} from "./anthropic-sse";
import { expect, test } from "./fixtures";

/**
 * A long AI answer must never scroll the application out from under the user (issue #293).
 *
 * The failure this pins is specific and was measured, not assumed. A long tool-loop turn makes
 * the right panel's content taller than its box. `scrollIntoView` then walks every scrollable
 * ancestor of the anchor — including the layout's middle row, which is `overflow: hidden`
 * precisely so the user cannot scroll it. The script scrolls it anyway, the user cannot scroll
 * it back, and the chat input rides up out of reach. Measured on the unfixed build at a 520px
 * viewport: middle row `scrollTop` 390, chat input top 48 instead of 438.
 *
 * Reverting `useScrollPinnedToBottom` to `scrollIntoView` fails the ancestor assertion below.
 *
 * The short viewport is not incidental. A taller one leaves the panel enough room that nothing
 * overflows, and with nothing to scroll the bug cannot appear at all.
 */

/** A closing text turn long enough to overflow the panel several times over. */
function longTextResponse(): string {
	const body = `Here is what changed. ${"Each sentence adds another line of explanation to the answer. ".repeat(120)}`;
	return sse([
		{
			event: "message_start",
			data: {
				message: { id: "msg_2", model: MODEL, usage: { input_tokens: 30, output_tokens: 1 } },
			},
		},
		{ event: "content_block_start", data: { index: 0, content_block: { type: "text", text: "" } } },
		{ event: "content_block_delta", data: { index: 0, delta: { type: "text_delta", text: body } } },
		{ event: "content_block_stop", data: { index: 0 } },
		{
			event: "message_delta",
			data: { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 900 } },
		},
		{ event: "message_stop", data: { type: "message_stop" } },
	]);
}

test.describe("Chat scroll containment", () => {
	test.use({ viewport: { width: 1000, height: 520 } });

	test("a long answer leaves the layout and the chat input where they were", async ({ page }) => {
		await routeAnthropic(page, [addElementResponse(), longTextResponse()]);
		await openAiPanelWithModel(page);

		const input = page.getByPlaceholder("Ask about threats...");
		const inputBoxBefore = await input.boundingBox();
		expect(inputBoxBefore).not.toBeNull();

		await send(page, "add a cache");
		await page.getByRole("button", { name: "Approve" }).click();
		await expect(page.getByTestId("right-panel")).toContainText("Here is what changed.");

		// The panel content must actually exceed its box, or the containment proves nothing.
		const overflowed = await page.evaluate(() => {
			const scroller = document.querySelector<HTMLElement>("[data-testid='chat-messages']");
			return scroller ? scroller.scrollHeight > scroller.clientHeight * 2 : false;
		});
		expect(overflowed, "the answer must overflow the panel for this test to discriminate").toBe(
			true,
		);

		// The smooth scroll settles a few frames after the last token.
		await expect
			.poll(async () =>
				page.evaluate(() => {
					const scroller = document.querySelector<HTMLElement>("[data-testid='chat-messages']");
					return scroller ? Math.round(scroller.scrollTop) : 0;
				}),
			)
			.toBeGreaterThan(0);

		// Nothing outside the message list may have scrolled. The middle row is `overflow: hidden`,
		// so any scroll offset here is one the user has no way to undo.
		const strayScroll = await page.evaluate(() => {
			const offsets: { where: string; top: number }[] = [];
			const scroller = document.querySelector<HTMLElement>("[data-testid='chat-messages']");
			for (let node = scroller?.parentElement ?? null; node; node = node.parentElement) {
				if (node.scrollTop !== 0) {
					offsets.push({ where: node.className.toString().slice(0, 60), top: node.scrollTop });
				}
			}
			const doc = document.scrollingElement;
			if (doc && doc.scrollTop !== 0) {
				offsets.push({ where: "document", top: doc.scrollTop });
			}
			return offsets;
		});
		expect(strayScroll).toEqual([]);

		// And the input the user types into stays exactly where it was.
		const inputBoxAfter = await input.boundingBox();
		expect(inputBoxAfter?.y).toBeCloseTo(inputBoxBefore?.y ?? -1, 0);
	});
});
