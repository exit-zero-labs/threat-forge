import { cn } from "@/lib/utils";
import { useModelStore } from "@/stores/model-store";
import { useUiStore } from "@/stores/ui-store";
import { PropertiesTab } from "./properties-tab";
import { ThreatsTab } from "./threats-tab";

export function RightPanel() {
	const tab = useUiStore((s) => s.rightPanelTab);
	const setTab = useUiStore((s) => s.setRightPanelTab);
	const model = useModelStore((s) => s.model);

	return (
		<div className="flex h-full flex-col">
			{/* Tab bar */}
			<div className="flex border-b border-border">
				<TabButton active={tab === "properties"} onClick={() => setTab("properties")}>
					Properties
				</TabButton>
				<TabButton active={tab === "threats"} onClick={() => setTab("threats")}>
					Threats
					{model && model.threats.length > 0 && (
						<span className="ml-1.5 rounded-full bg-secondary px-1.5 text-xs">
							{model.threats.length}
						</span>
					)}
				</TabButton>
			</div>

			{/* Tab content */}
			<div className="flex-1 overflow-y-auto p-3">
				{tab === "properties" ? <PropertiesTab /> : <ThreatsTab />}
			</div>
		</div>
	);
}

function TabButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex-1 px-3 py-2 text-xs font-medium transition-colors",
				active
					? "border-b-2 border-primary text-foreground"
					: "text-muted-foreground hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}
