import { ReactFlowProvider } from "@xyflow/react";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useUiStore } from "@/stores/ui-store";
import { Canvas } from "../canvas/canvas";
import { ComponentPalette } from "../palette/component-palette";
import { RightPanel } from "../panels/right-panel";
import { StatusBar } from "./status-bar";
import { TopMenuBar } from "./top-menu-bar";

export function AppLayout() {
	const leftPanelOpen = useUiStore((s) => s.leftPanelOpen);
	const rightPanelOpen = useUiStore((s) => s.rightPanelOpen);

	useKeyboardShortcuts();

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
			</div>
		</ReactFlowProvider>
	);
}
