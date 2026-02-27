import { useCanvasStore } from "@/stores/canvas-store";
import { useModelStore } from "@/stores/model-store";
import { useUiStore } from "@/stores/ui-store";

export function PropertiesTab() {
	const selectedElementId = useModelStore((s) => s.selectedElementId);
	const model = useModelStore((s) => s.model);
	const updateElement = useModelStore((s) => s.updateElement);

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

	const elementTypeLabel = element.type
		.split("_")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");

	const relatedThreats = model.threats.filter((t) => t.element === element.id);

	return (
		<div className="flex flex-col gap-3">
			{/* Read-only fields */}
			<ReadOnlyField label="ID" value={element.id} />
			<ReadOnlyField label="Type" value={elementTypeLabel} />

			{/* Editable fields */}
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

			{/* Related threats summary */}
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
