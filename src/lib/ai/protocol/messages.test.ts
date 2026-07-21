import { describe, expect, it } from "vitest";
import {
	assertToolPairing,
	flattenText,
	type LegacyChatMessage,
	type ProtocolMessage,
	upgradeLegacyMessage,
} from "./messages";

/** Shape written by the string-only chat store into `threatforge-chat-sessions:<path>`. */
const PERSISTED_SESSION = {
	id: "session-1737412800000-a1b2c3",
	title: "Review the auth flow",
	messages: [
		{ role: "user", content: "What is exposed at the gateway?" },
		{
			role: "assistant",
			content:
				"<response>The gateway terminates TLS.</response>\n\n" +
				'```actions\n[{ "action": "update_element", "id": "api-gw", "updates": { "description": "Edge" } }]\n```',
		},
	] satisfies LegacyChatMessage[],
	createdAt: "2026-01-20T21:20:00.000Z",
	updatedAt: "2026-01-20T21:21:00.000Z",
};

function textMessage(role: "user" | "assistant", text: string): ProtocolMessage {
	return { role, content: [{ type: "text", text }] };
}

describe("upgradeLegacyMessage", () => {
	it("round-trips a persisted session to blocks and back to the same display string", () => {
		for (const legacy of PERSISTED_SESSION.messages) {
			const upgraded = upgradeLegacyMessage(legacy);
			expect(upgraded.role).toBe(legacy.role);
			expect(upgraded.content).toEqual([{ type: "text", text: legacy.content }]);
			expect(flattenText(upgraded)).toBe(legacy.content);
		}
	});

	it("keeps an empty assistant turn as an empty text block", () => {
		// The store creates this message before the first chunk arrives, so it has
		// to survive a reload rather than collapsing to a contentless message.
		const upgraded = upgradeLegacyMessage({ role: "assistant", content: "" });
		expect(upgraded.content).toEqual([{ type: "text", text: "" }]);
		expect(flattenText(upgraded)).toBe("");
	});
});

describe("flattenText", () => {
	it("concatenates text blocks and ignores tool blocks", () => {
		const message: ProtocolMessage = {
			role: "assistant",
			content: [
				{ type: "text", text: "Adding a gateway. " },
				{ type: "tool_call", id: "call-1", name: "add_element", input: { name: "gw" } },
				{ type: "text", text: "Done." },
			],
		};
		expect(flattenText(message)).toBe("Adding a gateway. Done.");
	});
});

describe("assertToolPairing", () => {
	const paired: ProtocolMessage[] = [
		textMessage("user", "Add a gateway"),
		{
			role: "assistant",
			content: [{ type: "tool_call", id: "call-1", name: "add_element", input: {} }],
		},
		{
			role: "user",
			content: [{ type: "tool_result", toolCallId: "call-1", content: "ok" }],
		},
		textMessage("assistant", "Added."),
	];

	it("reports nothing for a fully paired history", () => {
		expect(assertToolPairing(paired)).toEqual([]);
	});

	it("reports the orphan id when a result has no preceding call", () => {
		const orphaned: ProtocolMessage[] = [
			textMessage("user", "Add a gateway"),
			{ role: "user", content: [{ type: "tool_result", toolCallId: "call-9", content: "ok" }] },
		];
		expect(assertToolPairing(orphaned)).toEqual([
			{ kind: "orphan_tool_result", toolCallId: "call-9", messageIndex: 1 },
		]);
	});

	it("reports a call whose result never arrived", () => {
		const unanswered: ProtocolMessage[] = [
			textMessage("user", "Add a gateway"),
			{
				role: "assistant",
				content: [{ type: "tool_call", id: "call-1", name: "add_element", input: {} }],
			},
		];
		expect(assertToolPairing(unanswered)).toEqual([
			{ kind: "unanswered_tool_call", toolCallId: "call-1", messageIndex: 1 },
		]);
	});

	it("reports a result that shares a message with its call", () => {
		// Providers only accept results in the turn after the tool use, so a
		// same-message pair is unusable even though both blocks are present.
		const sameMessage: ProtocolMessage[] = [
			{
				role: "assistant",
				content: [
					{ type: "tool_call", id: "call-1", name: "add_element", input: {} },
					{ type: "tool_result", toolCallId: "call-1", content: "ok" },
				],
			},
		];
		expect(assertToolPairing(sameMessage)).toEqual([
			{ kind: "orphan_tool_result", toolCallId: "call-1", messageIndex: 0 },
			{ kind: "unanswered_tool_call", toolCallId: "call-1", messageIndex: 0 },
		]);
	});

	it("reports a reused call id, which would make the pairing ambiguous", () => {
		const reused: ProtocolMessage[] = [
			{
				role: "assistant",
				content: [{ type: "tool_call", id: "call-1", name: "add_element", input: {} }],
			},
			{ role: "user", content: [{ type: "tool_result", toolCallId: "call-1", content: "ok" }] },
			{
				role: "assistant",
				content: [{ type: "tool_call", id: "call-1", name: "add_threat", input: {} }],
			},
			{ role: "user", content: [{ type: "tool_result", toolCallId: "call-1", content: "ok" }] },
		];
		expect(assertToolPairing(reused)).toEqual([
			{ kind: "duplicate_tool_call_id", toolCallId: "call-1", messageIndex: 2 },
		]);
	});

	it("detects the break a tail-slice truncation introduces", () => {
		// `src/stores/chat-store.ts` currently caps history with `slice(-n)`. The
		// boundary here falls between a call and its result, which is the case
		// group-atomic truncation (issue #61 step 4) has to avoid. This test is
		// what proves `assertToolPairing` can see the difference.
		expect(assertToolPairing(paired)).toEqual([]);

		const naivelyTruncated = paired.slice(-2);
		expect(assertToolPairing(naivelyTruncated)).toEqual([
			{ kind: "orphan_tool_result", toolCallId: "call-1", messageIndex: 0 },
		]);
	});
});
