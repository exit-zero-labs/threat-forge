import { ReactFlowProvider } from "@xyflow/react";
import { useAutosave } from "@/hooks/use-autosave";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";
import { Canvas } from "../canvas/canvas";
import { ComponentPalette } from "../palette/component-palette";
import { RightPanel } from "../panels/right-panel";
import { SettingsDialog } from "../panels/settings-dialog";
import { ShortcutsDialog } from "../panels/shortcuts-dialog";
import { StatusBar } from "./status-bar";
import { TopMenuBar } from "./top-menu-bar";

export function AppLayout() {
	const leftPanelOpen = useUiStore((s) => s.leftPanelOpen);
	const rightPanelOpen = useUiStore((s) => s.rightPanelOpen);
	const settingsDialogOpen = useSettingsStore((s) => s.settingsDialogOpen);
	const shortcutsDialogOpen = useSettingsStore((s) => s.shortcutsDialogOpen);

	useKeyboardShortcuts();
	useAutosave();

	return (
		<ReactFlowProvider>
			<div className="flex h-full w-full flex-col bg-background text-foreground">
				<TopMenuBar />

				<div className="flex flex-1 overflow-hidden">
					{/* Left sidebar — Component palette */}
					{leftPanelOpen && (
						<aside className="w-56 shrink-0 border-r border-border bg-card">
							<ComponentPalette />
						</aside>
					)}

					{/* Main canvas area */}
					<main className="flex-1 overflow-hidden">
						<Canvas />
					</main>

					{/* Right panel — Properties / Threats */}
					{rightPanelOpen && (
						<aside className="w-80 shrink-0 border-l border-border bg-card">
							<RightPanel />
						</aside>
					)}
				</div>

				<StatusBar />

				{/* Dialogs */}
				{settingsDialogOpen && <SettingsDialog />}
				{shortcutsDialogOpen && <ShortcutsDialog />}
			</div>
		</ReactFlowProvider>
	);
}
