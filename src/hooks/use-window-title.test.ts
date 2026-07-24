import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_DISPLAY_LENGTH } from "@/lib/document-display-title";
import { useModelStore } from "@/stores/model-store";
import type { ThreatModel } from "@/types/threat-model";
import { useWindowTitle } from "./use-window-title";

// Mock only the Tauri window boundary the hook crosses via `setTitle`. `isTauri()` reads
// `window.__TAURI_INTERNALS__` directly, so it is exercised for real rather than mocked.
const setTitle = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: () => ({ setTitle }),
}));

function makeModel(title: string): ThreatModel {
	return {
		version: "1.0",
		metadata: { title, author: "", created: "", modified: "", description: "" },
		elements: [],
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [],
	};
}

async function flushMicrotasks(): Promise<void> {
	await waitFor(() => expect(setTitle).toHaveBeenCalled());
}

beforeEach(() => {
	setTitle.mockClear();
	Object.defineProperty(window, "__TAURI_INTERNALS__", {
		configurable: true,
		value: {},
	});
});

afterEach(() => {
	Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
	useModelStore.getState().clearModel();
	document.title = "";
});

describe("useWindowTitle IPC boundary (#175)", () => {
	it("sends the sanitized, bounded title to both document.title and the native setTitle IPC call", async () => {
		const hostileTitle = `Evil\u202E${"x".repeat(MAX_DISPLAY_LENGTH + 50)}`;
		useModelStore.getState().setModel(makeModel(hostileTitle), null);

		renderHook(() => useWindowTitle());
		await flushMicrotasks();
		expect(document.title).not.toContain("\u202E");
		expect(document.title.startsWith("Threat Forge - Evil")).toBe(true);

		expect(setTitle).toHaveBeenCalledTimes(1);
		const [nativeTitle] = setTitle.mock.calls[0] as [string];
		expect(nativeTitle).toBe(document.title);
		expect(nativeTitle).not.toContain("\u202E");

		// "Threat Forge - " (15 chars) + the capped label must not exceed the documented bound.
		const label = nativeTitle.replace("Threat Forge - ", "");
		expect(Array.from(label)).toHaveLength(MAX_DISPLAY_LENGTH);
		expect(label.endsWith("\u2026")).toBe(true);
	});

	it("sends a sanitized title built from a malicious file basename to the native window", async () => {
		const hostilePath = "/home/jane/invoice\u202Egpj.exe.thf";
		useModelStore.getState().setModel(makeModel("Ignored"), hostilePath);

		renderHook(() => useWindowTitle());
		await flushMicrotasks();

		expect(setTitle).toHaveBeenCalledWith("Threat Forge - invoicegpj.exe");
		expect(document.title).toBe("Threat Forge - invoicegpj.exe");
	});
});
