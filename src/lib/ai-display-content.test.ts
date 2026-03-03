import { describe, expect, it } from "vitest";
import { extractDisplayContent, stripBlocksForStreaming } from "@/components/panels/ai-chat-tab";

describe("extractDisplayContent", () => {
	it("extracts text from response tags", () => {
		const content = "<response>Here is my analysis.</response>\n\n```actions\n[]\n```";
		expect(extractDisplayContent(content)).toBe("Here is my analysis.");
	});

	it("joins multiple response blocks", () => {
		const content =
			"<response>Part one.</response>\n```actions\n[]\n```\n<response>Part two.</response>";
		expect(extractDisplayContent(content)).toBe("Part one.\n\nPart two.");
	});

	it("falls back to block stripping when no response tags", () => {
		const content = 'Some analysis.\n\n```actions\n[{"action":"delete_element","id":"x"}]\n```';
		expect(extractDisplayContent(content)).toBe("Some analysis.");
	});

	it("strips threats blocks in fallback mode", () => {
		const content = 'Analysis here.\n\n```threats\n- title: "test"\n```';
		expect(extractDisplayContent(content)).toBe("Analysis here.");
	});

	it("falls back when response tags contain only whitespace", () => {
		const content = "<response>   </response>\n\nActual text here.\n\n```actions\n[]\n```";
		// Empty response tags should be filtered, triggering fallback
		expect(extractDisplayContent(content)).toBe("Actual text here.");
	});

	it("handles empty response tags mixed with non-empty ones", () => {
		const content = "<response></response>\n<response>Real content.</response>";
		expect(extractDisplayContent(content)).toBe("Real content.");
	});

	it("returns empty string for content with only code blocks", () => {
		const content = '```actions\n[{"action":"delete_element","id":"x"}]\n```';
		expect(extractDisplayContent(content)).toBe("");
	});

	it("handles content with no special formatting", () => {
		const content = "Just a plain response with no blocks or tags.";
		expect(extractDisplayContent(content)).toBe("Just a plain response with no blocks or tags.");
	});
});

describe("stripBlocksForStreaming", () => {
	it("strips complete response tags", () => {
		const content = "<response>Hello</response>";
		expect(stripBlocksForStreaming(content)).toBe("Hello");
	});

	it("strips actions blocks", () => {
		const content = 'Text here.\n\n```actions\n[{"action":"add_element"}]\n```';
		expect(stripBlocksForStreaming(content)).toBe("Text here.");
	});

	it("strips partial response tag at end of stream", () => {
		const content = "Some text <response";
		expect(stripBlocksForStreaming(content)).toBe("Some text");
	});

	it("strips partial closing tag at end of stream", () => {
		const content = "Some text </response";
		expect(stripBlocksForStreaming(content)).toBe("Some text");
	});

	it("strips partial <respon at end of stream", () => {
		const content = "Some text <respon";
		expect(stripBlocksForStreaming(content)).toBe("Some text");
	});

	it("strips partial <resp at end of stream", () => {
		const content = "Some text <resp";
		expect(stripBlocksForStreaming(content)).toBe("Some text");
	});

	it("strips partial </resp at end of stream", () => {
		const content = "Some text </resp";
		expect(stripBlocksForStreaming(content)).toBe("Some text");
	});

	it("handles content with no tags or blocks", () => {
		const content = "Just plain text being streamed.";
		expect(stripBlocksForStreaming(content)).toBe("Just plain text being streamed.");
	});
});
