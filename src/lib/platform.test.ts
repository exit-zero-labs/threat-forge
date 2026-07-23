import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeTextToTauriClipboard } from "./adapters/tauri-clipboard-adapter";
import { copyTextToClipboard } from "./platform";

vi.mock("./adapters/tauri-clipboard-adapter", () => ({
	writeTextToTauriClipboard: vi.fn(),
}));

const mockedWriteTextToTauriClipboard = vi.mocked(writeTextToTauriClipboard);

describe("copyTextToClipboard", () => {
	beforeEach(() => {
		mockedWriteTextToTauriClipboard.mockReset();
	});

	afterEach(() => {
		Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
		vi.unstubAllGlobals();
	});

	it("writes through the browser Clipboard API outside Tauri", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", { clipboard: { writeText } });

		await copyTextToClipboard("- id: threat-1\n");

		expect(writeText).toHaveBeenCalledExactlyOnceWith("- id: threat-1\n");
	});

	it("uses the Tauri clipboard plugin instead of the browser API on desktop", async () => {
		Object.defineProperty(window, "__TAURI_INTERNALS__", {
			configurable: true,
			value: {},
		});
		const browserWriteText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", { clipboard: { writeText: browserWriteText } });
		mockedWriteTextToTauriClipboard.mockResolvedValue(undefined);

		await copyTextToClipboard("- id: threat-1\n");

		expect(mockedWriteTextToTauriClipboard).toHaveBeenCalledExactlyOnceWith("- id: threat-1\n");
		expect(browserWriteText).not.toHaveBeenCalled();
	});

	it("maps a browser clipboard rejection to a user-safe error", async () => {
		const writeText = vi.fn().mockRejectedValue(new Error("denied"));
		vi.stubGlobal("navigator", { clipboard: { writeText } });

		await expect(copyTextToClipboard("text")).rejects.toThrow(
			"Unable to copy text to the clipboard.",
		);
	});

	it("throws a user-safe error when the Clipboard API is unavailable", async () => {
		vi.stubGlobal("navigator", {});

		await expect(copyTextToClipboard("text")).rejects.toThrow(
			"Unable to copy text to the clipboard.",
		);
	});

	it("maps a Tauri plugin rejection to the same user-safe error", async () => {
		Object.defineProperty(window, "__TAURI_INTERNALS__", {
			configurable: true,
			value: {},
		});
		mockedWriteTextToTauriClipboard.mockRejectedValue(new Error("raw platform failure"));

		await expect(copyTextToClipboard("text")).rejects.toThrow(
			"Unable to copy text to the clipboard.",
		);
	});
});
