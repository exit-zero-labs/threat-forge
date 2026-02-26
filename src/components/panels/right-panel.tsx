import { cn } from "@/lib/utils";
import { useModelStore } from "@/stores/model-store";
import { useUiStore } from "@/stores/ui-store";

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

function PropertiesTab() {
	const selectedElementId = useModelStore((s) => s.selectedElementId);
	const model = useModelStore((s) => s.model);

	if (!model) {
		return <p className="text-xs text-muted-foreground">No model open.</p>;
	}

	if (!selectedElementId) {
		return (
			<p className="text-xs text-muted-foreground">
				Select an element on the canvas to view its properties.
			</p>
		);
	}

	const element = model.elements.find((e) => e.id === selectedElementId);
	if (!element) {
		return <p className="text-xs text-muted-foreground">Element not found.</p>;
	}

	return (
		<div className="flex flex-col gap-3">
			<PropertyRow label="ID" value={element.id} />
			<PropertyRow label="Name" value={element.name} />
			<PropertyRow label="Type" value={element.type} />
			<PropertyRow label="Trust Zone" value={element.trust_zone || "—"} />
			<PropertyRow label="Description" value={element.description || "—"} />
		</div>
	);
}

function ThreatsTab() {
	const model = useModelStore((s) => s.model);

	if (!model) {
		return <p className="text-xs text-muted-foreground">No model open.</p>;
	}

	if (model.threats.length === 0) {
		return (
			<p className="text-xs text-muted-foreground">
				No threats identified yet. Add elements to the canvas and run STRIDE analysis.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			{model.threats.map((threat) => (
				<div
					key={threat.id}
					className="rounded-md border border-border p-2 text-xs transition-colors hover:bg-accent"
				>
					<div className="flex items-center justify-between">
						<span className="font-medium">{threat.title}</span>
						<SeverityBadge severity={threat.severity} />
					</div>
					<span className="text-muted-foreground">{threat.category}</span>
				</div>
			))}
		</div>
	);
}

function PropertyRow({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="text-xs font-medium text-muted-foreground">{label}</dt>
			<dd className="mt-0.5 text-sm">{value}</dd>
		</div>
	);
}

function SeverityBadge({ severity }: { severity: string }) {
	const colorMap: Record<string, string> = {
		critical: "bg-red-500/20 text-red-400",
		high: "bg-orange-500/20 text-orange-400",
		medium: "bg-yellow-500/20 text-yellow-400",
		low: "bg-blue-500/20 text-blue-400",
		info: "bg-gray-500/20 text-gray-400",
	};

	return (
		<span
			className={cn(
				"rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
				colorMap[severity] ?? "bg-gray-500/20 text-gray-400",
			)}
		>
			{severity}
		</span>
	);
}
