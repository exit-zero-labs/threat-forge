import { describe, expect, it } from "vitest";
import { budgetMessages, capMessageHistory } from "./budget";
import { assertToolPairing, type ProtocolMessage } from "./messages";

function userText(text: string): ProtocolMessage {
	return { role: "user", content: [{ type: "text", text }] };
}

function assistantText(text: string): ProtocolMessage {
	return { role: "assistant", content: [{ type: "text", text }] };
}

function assistantCall(id: string, name: string, input: unknown): ProtocolMessage {
	return { role: "assistant", content: [{ type: "tool_call", id, name, input }] };
}

function userResult(toolCallId: string, content: string): ProtocolMessage {
	return { role: "user", content: [{ type: "tool_result", toolCallId, content }] };
}

/** A tool call whose serialized input is far larger than any other message. */
function bigCall(id: string): ProtocolMessage {
	return assistantCall(id, "add_element", { description: "x".repeat(800) });
}

describe("budgetMessages", () => {
	it("returns the whole history when it fits", () => {
		const messages = [userText("Hi"), assistantText("Hello, how can I help?")];
		const result = budgetMessages(messages, { maxInputTokens: 10_000, reserveOutputTokens: 1000 });
		expect(result).toEqual({ ok: true, messages });
	});

	it("drops a whole tool group rather than splitting it at the budget boundary", () => {
		// G0=[user], G1=[assistant tool_call A, user tool_result A], G2=[assistant text].
		// The budget fits G2 and would fit the tool_result alone, but not the large
		// tool_call — exactly the boundary a tail slice would cut through.
		const messages = [
			userText("Explain the gateway"),
			bigCall("call-A"),
			userResult("call-A", "ok"),
			assistantText("All set."),
		];

		const result = budgetMessages(messages, { maxInputTokens: 30, reserveOutputTokens: 0 });
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// (a) The retained window is fully paired.
		expect(assertToolPairing(result.messages)).toEqual([]);
		// (b) The whole group is gone: neither the call nor its result survives.
		const serialized = JSON.stringify(result.messages);
		expect(serialized).not.toContain("call-A");
		expect(result.messages).toEqual([assistantText("All set.")]);

		// (c) Control: a naive tail slice of the same input keeps the orphaned
		// result, so this test fails the moment budgeting regresses to slicing.
		const naiveTail = messages.slice(-2);
		expect(assertToolPairing(naiveTail)).toEqual([
			{ kind: "orphan_tool_result", toolCallId: "call-A", messageIndex: 0 },
		]);
	});

	it("reports context_overflow when the newest group alone does not fit", () => {
		const messages = [bigCall("call-A"), userResult("call-A", "ok")];
		const result = budgetMessages(messages, { maxInputTokens: 10, reserveOutputTokens: 0 });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("context_overflow");
	});

	it("treats an empty history as trivially within budget", () => {
		expect(budgetMessages([], { maxInputTokens: 10, reserveOutputTokens: 0 })).toEqual({
			ok: true,
			messages: [],
		});
	});
});

describe("capMessageHistory", () => {
	it("returns the history unchanged when it is within the cap", () => {
		const messages = [userText("Hi"), assistantText("Hello")];
		expect(capMessageHistory(messages, 10)).toEqual(messages);
	});

	it("caps at group granularity so a tool group is never split", () => {
		const messages = [
			userText("Explain the gateway"),
			assistantCall("call-A", "add_element", {}),
			userResult("call-A", "ok"),
			assistantText("All set."),
		];

		const capped = capMessageHistory(messages, 2);
		// Keeping the last two raw messages would orphan the tool_result; the cap
		// keeps only the newest whole group instead.
		expect(capped).toEqual([assistantText("All set.")]);
		expect(assertToolPairing(capped)).toEqual([]);

		expect(assertToolPairing(messages.slice(-2))).toEqual([
			{ kind: "orphan_tool_result", toolCallId: "call-A", messageIndex: 0 },
		]);
	});

	it("keeps the newest group whole even when it alone exceeds the cap", () => {
		const messages = [assistantCall("call-A", "add_element", {}), userResult("call-A", "ok")];
		const capped = capMessageHistory(messages, 1);
		// Persistence must not split or drop the group: a valid oversized history
		// beats a broken one.
		expect(capped).toEqual(messages);
		expect(assertToolPairing(capped)).toEqual([]);
	});
});
