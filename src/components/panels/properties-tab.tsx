import { ArrowLeftRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { type DfdEdge, useCanvasStore } from "@/stores/canvas-store";
import { useModelStore } from "@/stores/model-store";
import { useUiStore } from "@/stores/ui-store";
import type { DataFlow } from "@/types/threat-model";

export function PropertiesTab() {
	const selectedElementId = useModelStore((s) => s.selectedElementId);
	const selectedEdgeId = useModelStore((s) => s.selectedEdgeId);
	const model = useModelStore((s) => s.model);

	if (!model) {
		return <p className="text-xs text-muted-foreground">No model open.</p>;
	}

	if (selectedEdgeId) {
		const flow = model.data_flows.find((f) => f.id === selectedEdgeId);
		if (!flow) {
			return <p className="text-xs text-muted-foreground">Data flow not found.</p>;
		}
		return <EdgeProperties flow={flow} />;
	}

	if (selectedElementId) {
		return <ElementProperties elementId={selectedElementId} />;
	}

	return (
		<p className="text-xs text-muted-foreground">
			Select an element or connector on the canvas to view its properties.
		</p>
	);
}

function EdgeProperties({ flow }: { flow: DataFlow }) {
	const model = useModelStore((s) => s.model);
	const updateDataFlow = useModelStore((s) => s.updateDataFlow);
	const reverseEdge = useCanvasStore((s) => s.reverseEdge);

	const fromElement = model?.elements.find((e) => e.id === flow.from);
	const toElement = model?.elements.find((e) => e.id === flow.to);

	const syncEdgeData = (updates: Partial<DataFlow>) => {
		const edges = useCanvasStore.getState().edges;
		const updatedEdges: DfdEdge[] = edges.map((e) =>
			e.id === flow.id ? { ...e, data: { ...e.data, ...updates } as DfdEdge["data"] } : e,
		);
		useCanvasStore.setState({ edges: updatedEdges });
	};

	return (
		<div className="flex flex-col gap-3">
			<ReadOnlyField label="ID" value={flow.id} />
			<ReadOnlyField
				label="Direction"
				value={`${fromElement?.name ?? flow.from} → ${toElement?.name ?? flow.to}`}
			/>

			<button
				type="button"
				onClick={() => reverseEdge(flow.id)}
				className="flex items-center gap-1.5 self-start rounded border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			>
				<ArrowLeftRight className="h-3 w-3" />
				Flip Direction
			</button>

			<EditableField
				label="Name"
				value={flow.name}
				placeholder="e.g. Login Request"
				onChange={(value) => {
					updateDataFlow(flow.id, { name: value });
					syncEdgeData({ name: value });
				}}
			/>

			<EditableField
				label="Protocol"
				value={flow.protocol}
				placeholder="e.g. HTTPS, gRPC"
				onChange={(value) => {
					updateDataFlow(flow.id, { protocol: value });
					syncEdgeData({ protocol: value });
				}}
			/>

			<CommaSeparatedField
				label="Data"
				items={flow.data}
				placeholder="Comma-separated data items"
				onCommit={(data) => {
					updateDataFlow(flow.id, { data });
					syncEdgeData({ data });
				}}
			/>

			<label className="flex items-center gap-2">
				<input
					type="checkbox"
					checked={flow.authenticated}
					onChange={(e) => {
						updateDataFlow(flow.id, { authenticated: e.target.checked });
						syncEdgeData({ authenticated: e.target.checked });
					}}
					className="h-3.5 w-3.5 rounded border-border accent-primary"
				/>
				<span className="text-xs text-foreground">Authenticated</span>
			</label>

			{/* Related threats for this flow */}
			<FlowThreats flowId={flow.id} />
		</div>
	);
}

function FlowThreats({ flowId }: { flowId: string }) {
	const model = useModelStore((s) => s.model);
	const relatedThreats = model?.threats.filter((t) => t.element === flowId) ?? [];

	if (relatedThreats.length === 0) return null;

	return (
		<div className="border-t border-border pt-3">
			<p className="mb-1.5 text-[10px] font-medium text-muted-foreground">
				Related Threats ({relatedThreats.length})
			</p>
			<div className="flex flex-col gap-1">
				{relatedThreats.map((threat) => (
					<ThreatLink
						key={threat.id}
						threatId={threat.id}
						title={threat.title}
						severity={threat.severity}
					/>
				))}
			</div>
		</div>
	);
}

function ElementProperties({ elementId }: { elementId: string }) {
	const model = useModelStore((s) => s.model);
	const updateElement = useModelStore((s) => s.updateElement);

	const element = model?.elements.find((e) => e.id === elementId);
	if (!element) {
		return <p className="text-xs text-muted-foreground">Element not found.</p>;
	}

	const elementTypeLabel = element.type
		.split("_")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");

	const relatedThreats = model?.threats.filter((t) => t.element === element.id) ?? [];

	return (
		<div className="flex flex-col gap-3">
			<ReadOnlyField label="ID" value={element.id} />
			<ReadOnlyField label="Type" value={elementTypeLabel} />

			<EditableField
				label="Name"
				value={element.name}
				onChange={(value) => {
					updateElement(element.id, { name: value });
					syncNodeLabel(element.id, value);
				}}
			/>

			<EditableField
				label="Trust Zone"
				value={element.trust_zone}
				placeholder="e.g. internal, dmz, external"
				onChange={(value) => {
					updateElement(element.id, { trust_zone: value });
					syncNodeTrustZone(element.id, value);
				}}
			/>

			<EditableTextarea
				label="Description"
				value={element.description}
				placeholder="Describe this element..."
				onChange={(value) => updateElement(element.id, { description: value })}
			/>

			<EditableField
				label="Technologies"
				value={(element.technologies ?? []).join(", ")}
				placeholder="e.g. nginx, TLS, OAuth"
				onChange={(value) => {
					const technologies = value
						.split(",")
						.map((t) => t.trim())
						.filter((t) => t.length > 0);
					updateElement(element.id, { technologies });
				}}
			/>

			{relatedThreats.length > 0 && (
				<div className="border-t border-border pt-3">
					<p className="mb-1.5 text-[10px] font-medium text-muted-foreground">
						Related Threats ({relatedThreats.length})
					</p>
					<div className="flex flex-col gap-1">
						{relatedThreats.map((threat) => (
							<ThreatLink
								key={threat.id}
								threatId={threat.id}
								title={threat.title}
								severity={threat.severity}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function ThreatLink({
	threatId,
	title,
	severity,
}: {
	threatId: string;
	title: string;
	severity: string;
}) {
	const setSelectedThreat = useModelStore((s) => s.setSelectedThreat);
	const setRightPanelTab = useUiStore((s) => s.setRightPanelTab);

	return (
		<button
			type="button"
			onClick={() => {
				setSelectedThreat(threatId);
				setRightPanelTab("threats");
			}}
			className="flex items-center justify-between rounded px-1.5 py-1 text-xs hover:bg-accent transition-colors text-left"
		>
			<span className="truncate">{title}</span>
			<SeverityDot severity={severity} />
		</button>
	);
}

function SeverityDot({ severity }: { severity: string }) {
	const colorMap: Record<string, string> = {
		critical: "bg-red-400",
		high: "bg-orange-400",
		medium: "bg-yellow-400",
		low: "bg-blue-400",
		info: "bg-gray-400",
	};

	return (
		<span className={`h-2 w-2 shrink-0 rounded-full ${colorMap[severity] ?? "bg-gray-400"}`} />
	);
}

function syncNodeLabel(elementId: string, name: string) {
	const nodes = useCanvasStore.getState().nodes;
	const updatedNodes = nodes.map((n) =>
		n.id === elementId ? { ...n, data: { ...n.data, label: name } } : n,
	);
	useCanvasStore.setState({ nodes: updatedNodes });
}

function syncNodeTrustZone(elementId: string, trustZone: string) {
	const nodes = useCanvasStore.getState().nodes;
	const updatedNodes = nodes.map((n) =>
		n.id === elementId ? { ...n, data: { ...n.data, trustZone } } : n,
	);
	useCanvasStore.setState({ nodes: updatedNodes });
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="text-[10px] font-medium text-muted-foreground">{label}</dt>
			<dd className="mt-0.5 text-xs text-foreground/80">{value}</dd>
		</div>
	);
}

function EditableField({
	label,
	value,
	placeholder,
	onChange,
}: {
	label: string;
	value: string;
	placeholder?: string;
	onChange: (value: string) => void;
}) {
	return (
		<label className="block">
			<span className="mb-0.5 block text-[10px] font-medium text-muted-foreground">{label}</span>
			<input
				type="text"
				value={value}
				placeholder={placeholder}
				onChange={(e) => onChange(e.target.value)}
				className="w-full rounded border border-border bg-background px-2 py-1 text-xs placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
			/>
		</label>
	);
}

function EditableTextarea({
	label,
	value,
	placeholder,
	onChange,
}: {
	label: string;
	value: string;
	placeholder?: string;
	onChange: (value: string) => void;
}) {
	return (
		<label className="block">
			<span className="mb-0.5 block text-[10px] font-medium text-muted-foreground">{label}</span>
			<textarea
				value={value}
				placeholder={placeholder}
				onChange={(e) => onChange(e.target.value)}
				rows={3}
				className="w-full resize-none rounded border border-border bg-background px-2 py-1 text-xs placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
			/>
		</label>
	);
}

/**
 * A text input that accepts comma-separated values but only parses them on blur,
 * allowing the user to type commas freely without the input fighting them.
 */
function CommaSeparatedField({
	label,
	items,
	placeholder,
	onCommit,
}: {
	label: string;
	items: string[];
	placeholder?: string;
	onCommit: (items: string[]) => void;
}) {
	const [rawText, setRawText] = useState(items.join(", "));
	const [isFocused, setIsFocused] = useState(false);

	// Sync from external changes only when not focused
	useEffect(() => {
		if (!isFocused) {
			setRawText(items.join(", "));
		}
	}, [items, isFocused]);

	const commitValue = useCallback(() => {
		const parsed = rawText
			.split(",")
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		onCommit(parsed);
	}, [rawText, onCommit]);

	return (
		<label className="block">
			<span className="mb-0.5 block text-[10px] font-medium text-muted-foreground">{label}</span>
			<input
				type="text"
				value={rawText}
				placeholder={placeholder}
				onChange={(e) => setRawText(e.target.value)}
				onFocus={() => setIsFocused(true)}
				onBlur={() => {
					setIsFocused(false);
					commitValue();
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter") commitValue();
				}}
				className="w-full rounded border border-border bg-background px-2 py-1 text-xs placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
			/>
		</label>
	);
}
