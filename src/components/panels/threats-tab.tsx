import {
	AlertTriangle,
	ChevronDown,
	ChevronRight,
	Loader2,
	Shield,
	Trash2,
	Zap,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useModelStore } from "@/stores/model-store";
import { useUiStore } from "@/stores/ui-store";
import type {
	Mitigation,
	MitigationStatus,
	Severity,
	StrideCategory,
	Threat,
} from "@/types/threat-model";

const STRIDE_CATEGORIES: StrideCategory[] = [
	"Spoofing",
	"Tampering",
	"Repudiation",
	"Information Disclosure",
	"Denial of Service",
	"Elevation of Privilege",
];

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

const MITIGATION_STATUSES: MitigationStatus[] = [
	"not_started",
	"in_progress",
	"mitigated",
	"accepted",
	"transferred",
];

export function ThreatsTab() {
	const model = useModelStore((s) => s.model);
	const selectedElementId = useModelStore((s) => s.selectedElementId);
	const selectedThreatId = useModelStore((s) => s.selectedThreatId);
	const setSelectedThreat = useModelStore((s) => s.setSelectedThreat);
	const isAnalyzing = useModelStore((s) => s.isAnalyzing);
	const analyzeThreats = useModelStore((s) => s.analyzeThreats);
	const [filterByElement, setFilterByElement] = useState(false);

	if (!model) {
		return <p className="text-xs text-muted-foreground">No model open.</p>;
	}

	const hasElements = model.elements.length > 0;
	const threats =
		filterByElement && selectedElementId
			? model.threats.filter((t) => t.element === selectedElementId || t.flow === selectedElementId)
			: model.threats;

	const selectedElement = selectedElementId
		? model.elements.find((e) => e.id === selectedElementId)
		: null;

	return (
		<div className="flex flex-col gap-3">
			{/* Analyze button */}
			<button
				type="button"
				disabled={!hasElements || isAnalyzing}
				onClick={() => void analyzeThreats()}
				className={cn(
					"flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors",
					hasElements
						? "bg-primary text-primary-foreground hover:bg-primary/90"
						: "cursor-not-allowed bg-muted text-muted-foreground",
				)}
			>
				{isAnalyzing ? (
					<>
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
						Analyzing...
					</>
				) : (
					<>
						<Zap className="h-3.5 w-3.5" />
						Run STRIDE Analysis
					</>
				)}
			</button>

			{/* Filter toggle when element is selected */}
			{selectedElement && model.threats.length > 0 && (
				<button
					type="button"
					onClick={() => setFilterByElement(!filterByElement)}
					className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					<Shield className="h-3 w-3" />
					{filterByElement
						? `Showing threats for "${selectedElement.name}"`
						: "Filter by selected element"}
				</button>
			)}

			{/* Empty states */}
			{!hasElements && (
				<div className="flex flex-col items-center gap-2 py-6 text-center">
					<AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
					<p className="text-xs text-muted-foreground">
						Add elements to the canvas, then run STRIDE analysis to identify threats.
					</p>
				</div>
			)}

			{hasElements && threats.length === 0 && (
				<p className="text-xs text-muted-foreground">
					{filterByElement
						? "No threats linked to this element."
						: 'No threats identified yet. Click "Run STRIDE Analysis" to get started.'}
				</p>
			)}

			{/* Threat list */}
			{threats.map((threat) => (
				<ThreatCard
					key={threat.id}
					threat={threat}
					isSelected={selectedThreatId === threat.id}
					onSelect={() => setSelectedThreat(selectedThreatId === threat.id ? null : threat.id)}
				/>
			))}
		</div>
	);
}

function ThreatCard({
	threat,
	isSelected,
	onSelect,
}: {
	threat: Threat;
	isSelected: boolean;
	onSelect: () => void;
}) {
	const setSelectedElement = useModelStore((s) => s.setSelectedElement);
	const setRightPanelTab = useUiStore((s) => s.setRightPanelTab);
	const model = useModelStore((s) => s.model);

	const linkedElement = model?.elements.find((e) => e.id === threat.element);

	return (
		<div
			className={cn(
				"rounded-md border text-xs transition-colors",
				isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
			)}
		>
			{/* Header - clickable to expand/collapse */}
			<button type="button" onClick={onSelect} className="flex w-full items-start gap-2 p-2">
				{isSelected ? (
					<ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
				) : (
					<ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
				)}
				<div className="flex flex-1 flex-col items-start gap-1">
					<span className="font-medium text-left">{threat.title}</span>
					<div className="flex items-center gap-1.5">
						<CategoryBadge category={threat.category} />
						<SeverityBadge severity={threat.severity} />
						{threat.mitigation && <MitigationBadge status={threat.mitigation.status} />}
					</div>
				</div>
			</button>

			{/* Linked element link */}
			{linkedElement && !isSelected && (
				<div className="border-t border-border/50 px-2 py-1">
					<button
						type="button"
						onClick={() => {
							setSelectedElement(linkedElement.id);
							setRightPanelTab("properties");
						}}
						className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
					>
						{linkedElement.name}
					</button>
				</div>
			)}

			{/* Expanded detail editor */}
			{isSelected && <ThreatEditor threat={threat} />}
		</div>
	);
}

function ThreatEditor({ threat }: { threat: Threat }) {
	const updateThreat = useModelStore((s) => s.updateThreat);
	const deleteThreat = useModelStore((s) => s.deleteThreat);
	const setSelectedThreat = useModelStore((s) => s.setSelectedThreat);
	const setSelectedElement = useModelStore((s) => s.setSelectedElement);
	const setRightPanelTab = useUiStore((s) => s.setRightPanelTab);
	const model = useModelStore((s) => s.model);

	const linkedElement = model?.elements.find((e) => e.id === threat.element);

	const handleMitigationChange = (updates: Partial<Mitigation>) => {
		const current: Mitigation = threat.mitigation ?? {
			status: "not_started",
			description: "",
		};
		updateThreat(threat.id, { mitigation: { ...current, ...updates } });
	};

	return (
		<div className="flex flex-col gap-2 border-t border-border/50 p-2">
			{/* Title */}
			<FieldGroup label="Title">
				<input
					type="text"
					value={threat.title}
					onChange={(e) => updateThreat(threat.id, { title: e.target.value })}
					className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
				/>
			</FieldGroup>

			{/* Category + Severity row */}
			<div className="grid grid-cols-2 gap-2">
				<FieldGroup label="Category">
					<select
						value={threat.category}
						onChange={(e) =>
							updateThreat(threat.id, {
								category: e.target.value as StrideCategory,
							})
						}
						className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
					>
						{STRIDE_CATEGORIES.map((c) => (
							<option key={c} value={c}>
								{c}
							</option>
						))}
					</select>
				</FieldGroup>

				<FieldGroup label="Severity">
					<select
						value={threat.severity}
						onChange={(e) =>
							updateThreat(threat.id, {
								severity: e.target.value as Severity,
							})
						}
						className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
					>
						{SEVERITIES.map((s) => (
							<option key={s} value={s}>
								{s.charAt(0).toUpperCase() + s.slice(1)}
							</option>
						))}
					</select>
				</FieldGroup>
			</div>

			{/* Description */}
			<FieldGroup label="Description">
				<textarea
					value={threat.description}
					onChange={(e) => updateThreat(threat.id, { description: e.target.value })}
					rows={3}
					className="w-full resize-none rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
				/>
			</FieldGroup>

			{/* Linked element */}
			{linkedElement && (
				<FieldGroup label="Element">
					<button
						type="button"
						onClick={() => {
							setSelectedElement(linkedElement.id);
							setRightPanelTab("properties");
						}}
						className="text-xs text-primary hover:underline"
					>
						{linkedElement.name} ({linkedElement.type.replace("_", " ")})
					</button>
				</FieldGroup>
			)}

			{/* Mitigation */}
			<FieldGroup label="Mitigation Status">
				<select
					value={threat.mitigation?.status ?? "not_started"}
					onChange={(e) =>
						handleMitigationChange({
							status: e.target.value as MitigationStatus,
						})
					}
					className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
				>
					{MITIGATION_STATUSES.map((s) => (
						<option key={s} value={s}>
							{formatMitigationStatus(s)}
						</option>
					))}
				</select>
			</FieldGroup>

			<FieldGroup label="Mitigation Notes">
				<textarea
					value={threat.mitigation?.description ?? ""}
					onChange={(e) => handleMitigationChange({ description: e.target.value })}
					rows={2}
					placeholder="Describe the mitigation approach..."
					className="w-full resize-none rounded border border-border bg-background px-2 py-1 text-xs placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
				/>
			</FieldGroup>

			{/* Delete */}
			<button
				type="button"
				onClick={() => {
					deleteThreat(threat.id);
					setSelectedThreat(null);
				}}
				className="flex items-center gap-1 self-start rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10 transition-colors"
			>
				<Trash2 className="h-3 w-3" />
				Delete threat
			</button>
		</div>
	);
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: children always contain a form control
		<label className="block">
			<span className="mb-0.5 block text-[10px] font-medium text-muted-foreground">{label}</span>
			{children}
		</label>
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

function CategoryBadge({ category }: { category: StrideCategory }) {
	const initial =
		category === "Information Disclosure"
			? "ID"
			: category === "Denial of Service"
				? "DoS"
				: category === "Elevation of Privilege"
					? "EoP"
					: category.charAt(0);

	return (
		<span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
			{initial}
		</span>
	);
}

function MitigationBadge({ status }: { status: MitigationStatus }) {
	const colorMap: Record<MitigationStatus, string> = {
		not_started: "bg-gray-500/20 text-gray-400",
		in_progress: "bg-blue-500/20 text-blue-400",
		mitigated: "bg-green-500/20 text-green-400",
		accepted: "bg-yellow-500/20 text-yellow-400",
		transferred: "bg-purple-500/20 text-purple-400",
	};

	return (
		<span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", colorMap[status])}>
			{formatMitigationStatus(status)}
		</span>
	);
}

function formatMitigationStatus(status: MitigationStatus): string {
	return status
		.split("_")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}
