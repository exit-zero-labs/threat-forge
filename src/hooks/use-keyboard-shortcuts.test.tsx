import { fireEvent, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";

vi.mock("@/hooks/use-file-operations", () => ({
	useFileOperations: () => ({
		newModel: vi.fn(),
		openModel: vi.fn(),
		saveModel: vi.fn(),
		saveModelAs: vi.fn(),
		exportAsHtml: vi.fn(),
	}),
}));

const { useKeyboardShortcuts } = await import("./use-keyboard-shortcuts");

describe("useKeyboardShortcuts", () => {
	beforeEach(() => {
		useUiStore.setState({ keyboardShortcutsDialogOpen: false });
		useSettingsStore.setState({ settingsDialogOpen: false, settingsDialogInitialTab: null });
	});

	it("opens the keyboard shortcuts dialog with ?", () => {
		renderHook(() => useKeyboardShortcuts());

		fireEvent.keyDown(window, { key: "?", shiftKey: true });

		expect(useUiStore.getState().keyboardShortcutsDialogOpen).toBe(true);
	});

	it("closes the keyboard shortcuts dialog with Escape before other Escape behavior", () => {
		useUiStore.setState({ keyboardShortcutsDialogOpen: true });

		renderHook(() => useKeyboardShortcuts());

		fireEvent.keyDown(window, { key: "Escape" });

		expect(useUiStore.getState().keyboardShortcutsDialogOpen).toBe(false);
	});
});
