import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";

const mockSaveModel = vi.fn(() => Promise.resolve());

vi.mock("@/hooks/use-file-operations", () => ({
	useFileOperations: () => ({
		saveModel: mockSaveModel,
		saveModelAs: vi.fn(),
		openModel: vi.fn(),
		newModel: vi.fn(),
		closeModel: vi.fn(),
	}),
}));

// Import AFTER mocks are set up
const { useAutosave } = await import("./use-autosave");

describe("useAutosave", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockSaveModel.mockClear();

		// Reset stores to known state
		useSettingsStore.setState({
			settings: {
				...useSettingsStore.getState().settings,
				autosaveEnabled: false,
				autosaveIntervalSeconds: 30,
			},
		});
		useModelStore.setState({
			isDirty: false,
			filePath: null,
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns enabled=false when autosave is disabled", () => {
		const { result } = renderHook(() => useAutosave());
		expect(result.current.enabled).toBe(false);
		expect(result.current.lastSaved).toBeNull();
	});

	it("returns enabled=true when autosave is enabled", () => {
		useSettingsStore.setState({
			settings: {
				...useSettingsStore.getState().settings,
				autosaveEnabled: true,
			},
		});
		const { result } = renderHook(() => useAutosave());
		expect(result.current.enabled).toBe(true);
	});

	it("does not call saveModel when disabled", () => {
		useModelStore.setState({ isDirty: true, filePath: "/tmp/test.yaml" });

		renderHook(() => useAutosave());
		vi.advanceTimersByTime(60_000);

		expect(mockSaveModel).not.toHaveBeenCalled();
	});

	it("does not call saveModel when not dirty", () => {
		useSettingsStore.setState({
			settings: {
				...useSettingsStore.getState().settings,
				autosaveEnabled: true,
			},
		});
		useModelStore.setState({ isDirty: false, filePath: "/tmp/test.yaml" });

		renderHook(() => useAutosave());
		vi.advanceTimersByTime(60_000);

		expect(mockSaveModel).not.toHaveBeenCalled();
	});

	it("does not call saveModel when no filePath (new unsaved model)", () => {
		useSettingsStore.setState({
			settings: {
				...useSettingsStore.getState().settings,
				autosaveEnabled: true,
			},
		});
		useModelStore.setState({ isDirty: true, filePath: null });

		renderHook(() => useAutosave());
		vi.advanceTimersByTime(60_000);

		expect(mockSaveModel).not.toHaveBeenCalled();
	});

	it("calls saveModel after interval when enabled, dirty, and has filePath", async () => {
		useSettingsStore.setState({
			settings: {
				...useSettingsStore.getState().settings,
				autosaveEnabled: true,
				autosaveIntervalSeconds: 10,
			},
		});
		useModelStore.setState({ isDirty: true, filePath: "/tmp/test.yaml" });

		renderHook(() => useAutosave());

		// Advance past the interval
		await act(async () => {
			vi.advanceTimersByTime(10_000);
		});

		expect(mockSaveModel).toHaveBeenCalledOnce();
	});

	it("does not call saveModel before interval elapses", () => {
		useSettingsStore.setState({
			settings: {
				...useSettingsStore.getState().settings,
				autosaveEnabled: true,
				autosaveIntervalSeconds: 30,
			},
		});
		useModelStore.setState({ isDirty: true, filePath: "/tmp/test.yaml" });

		renderHook(() => useAutosave());
		vi.advanceTimersByTime(15_000); // Only half the interval

		expect(mockSaveModel).not.toHaveBeenCalled();
	});

	it("respects custom interval setting", async () => {
		useSettingsStore.setState({
			settings: {
				...useSettingsStore.getState().settings,
				autosaveEnabled: true,
				autosaveIntervalSeconds: 5,
			},
		});
		useModelStore.setState({ isDirty: true, filePath: "/tmp/test.yaml" });

		renderHook(() => useAutosave());

		await act(async () => {
			vi.advanceTimersByTime(5_000);
		});

		expect(mockSaveModel).toHaveBeenCalledOnce();
	});
});
