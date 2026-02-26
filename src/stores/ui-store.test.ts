import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./ui-store";

describe("useUiStore", () => {
	beforeEach(() => {
		// Reset store state before each test
		useUiStore.setState({
			leftPanelOpen: true,
			rightPanelOpen: true,
			rightPanelWidth: 320,
			rightPanelTab: "properties",
		});
	});

	it("starts with both panels open", () => {
		const state = useUiStore.getState();
		expect(state.leftPanelOpen).toBe(true);
		expect(state.rightPanelOpen).toBe(true);
	});

	it("toggles left panel", () => {
		useUiStore.getState().toggleLeftPanel();
		expect(useUiStore.getState().leftPanelOpen).toBe(false);
		useUiStore.getState().toggleLeftPanel();
		expect(useUiStore.getState().leftPanelOpen).toBe(true);
	});

	it("toggles right panel", () => {
		useUiStore.getState().toggleRightPanel();
		expect(useUiStore.getState().rightPanelOpen).toBe(false);
	});

	it("changes right panel tab", () => {
		useUiStore.getState().setRightPanelTab("threats");
		expect(useUiStore.getState().rightPanelTab).toBe("threats");
	});

	it("updates right panel width", () => {
		useUiStore.getState().setRightPanelWidth(400);
		expect(useUiStore.getState().rightPanelWidth).toBe(400);
	});
});
