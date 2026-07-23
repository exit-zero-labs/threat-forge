import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeTextToTauriClipboard } from "./tauri-clipboard-adapter";

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
	writeText: vi.fn(),
}));

const mockedWriteText = vi.mocked(writeText);

describe("writeTextToTauriClipboard", () => {
	beforeEach(() => {
		mockedWriteText.mockReset();
	});

	it("writes through the official clipboard plugin", async () => {
		mockedWriteText.mockResolvedValue(undefined);

		await writeTextToTauriClipboard("- id: threat-1\n");

		expect(mockedWriteText).toHaveBeenCalledExactlyOnceWith("- id: threat-1\n");
	});

	it("propagates plugin failures to the platform boundary", async () => {
		mockedWriteText.mockRejectedValue(new Error("plugin failed"));

		await expect(writeTextToTauriClipboard("text")).rejects.toThrow("plugin failed");
	});
});
