import { expect, test } from "./fixtures";
import {
	BoundedConsoleTranscript,
	shouldCaptureDiagnostics,
	stripQueryAndFragment,
} from "./support/base";

const LOCATION = {
	url: "http://localhost:3000/app?token=secret#fragment",
	lineNumber: 1,
	columnNumber: 2,
};

test.describe("bounded console diagnostics", () => {
	test("strips query and fragment from valid and non-URL location strings", () => {
		expect(stripQueryAndFragment(LOCATION.url)).toBe("http://localhost:3000/app");
		expect(stripQueryAndFragment("not a URL?token=secret#fragment")).toBe("not a URL");
	});

	test.describe("diagnostic capture predicate", () => {
		test("captures an unexpected pass of an expected-failure test", () => {
			expect(shouldCaptureDiagnostics("passed", "failed", 0)).toBe(true);
		});

		test("does not capture an ordinary passing test without violations", () => {
			expect(shouldCaptureDiagnostics("passed", "passed", 0)).toBe(false);
		});

		test("captures a pending browser violation even before the fixture throws", () => {
			expect(shouldCaptureDiagnostics("passed", "passed", 1)).toBe(true);
		});
	});

	test("keeps the newest 300 entries within 20,000 characters and records evictions", () => {
		const transcript = new BoundedConsoleTranscript();
		for (let index = 0; index <= 300; index += 1) {
			transcript.add("log", `message-${index}`, LOCATION);
		}

		const rendered = transcript.render();
		expect(rendered.length).toBeLessThanOrEqual(20_000);
		expect(transcript.droppedEntries).toBeGreaterThan(0);
		expect(rendered).toContain("earlier entries truncated");
		expect(rendered).toContain("message-300");
		expect(rendered).not.toContain("[log] message-0 ");
		expect(rendered).not.toContain("token=secret");
	});

	test("bounds one oversized message without starving the newest complete message", () => {
		const transcript = new BoundedConsoleTranscript();
		transcript.add("debug", "x".repeat(50_000), LOCATION);
		transcript.add("info", "LATEST-COMPLETE-MESSAGE", LOCATION);

		const rendered = transcript.render();
		expect(rendered.length).toBeLessThanOrEqual(20_000);
		expect(transcript.truncatedMessages).toBe(1);
		expect(rendered).toContain("oversized messages truncated");
		expect(rendered).toContain("LATEST-COMPLETE-MESSAGE");
		expect(rendered).not.toContain("token=secret");
	});
});
