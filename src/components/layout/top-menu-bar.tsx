import { LayoutPanelLeft, PanelRight, Shield } from "lucide-react";
import { useModelStore } from "@/stores/model-store";
import { useUiStore } from "@/stores/ui-store";

export function TopMenuBar() {
	const isDirty = useModelStore((s) => s.isDirty);
	const model = useModelStore((s) => s.model);
	const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);
	const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);

	const title = model?.metadata.title ?? "ThreatForge";
	const displayTitle = isDirty ? `${title} *` : title;

	return (
		<header className="flex h-10 shrink-0 items-center border-b border-border bg-card px-3">
			{/* App title / branding */}
			<div className="flex items-center gap-2">
				<Shield className="h-4 w-4 text-tf-signal" />
				<span className="text-sm font-semibold tracking-tight">{displayTitle}</span>
			</div>

			{/* Spacer */}
			<div className="flex-1" />

			{/* View toggles */}
			<div className="flex items-center gap-1">
				<button
					type="button"
					onClick={toggleLeftPanel}
					className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
					title="Toggle component palette"
				>
					<LayoutPanelLeft className="h-4 w-4" />
				</button>
				<button
					type="button"
					onClick={toggleRightPanel}
					className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
					title="Toggle properties panel"
				>
					<PanelRight className="h-4 w-4" />
				</button>
			</div>
		</header>
	);
}
