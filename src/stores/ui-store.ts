import { create } from "zustand";

interface UiState {
	/** Whether the left sidebar (component palette) is visible */
	leftPanelOpen: boolean;
	/** Whether the right panel (properties/threats) is visible */
	rightPanelOpen: boolean;
	/** Width of the right panel in pixels */
	rightPanelWidth: number;
	/** Current right panel tab */
	rightPanelTab: "properties" | "threats";

	// Actions
	toggleLeftPanel: () => void;
	toggleRightPanel: () => void;
	setRightPanelTab: (tab: "properties" | "threats") => void;
	setRightPanelWidth: (width: number) => void;
}

export const useUiStore = create<UiState>((set) => ({
	leftPanelOpen: true,
	rightPanelOpen: true,
	rightPanelWidth: 320,
	rightPanelTab: "properties",

	toggleLeftPanel: () => set((state) => ({ leftPanelOpen: !state.leftPanelOpen })),
	toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
	setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
	setRightPanelWidth: (width) => set({ rightPanelWidth: width }),
}));
