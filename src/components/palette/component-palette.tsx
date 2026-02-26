import { Box, Database, Globe, ShieldAlert } from "lucide-react";
import { useCanvasStore } from "@/stores/canvas-store";

const DFD_ELEMENTS = [
	{
		type: "process",
		label: "Process",
		icon: Box,
		description: "A processing step or function",
	},
	{
		type: "data_store",
		label: "Data Store",
		icon: Database,
		description: "A place where data is stored",
	},
	{
		type: "external_entity",
		label: "External Entity",
		icon: Globe,
		description: "An actor outside the system",
	},
] as const;

const BOUNDARY_ELEMENTS = [
	{
		type: "trust_boundary",
		label: "Trust Boundary",
		icon: ShieldAlert,
		description: "A security trust zone boundary",
	},
] as const;

export function ComponentPalette() {
	return (
		<div className="flex h-full flex-col">
			<div className="border-b border-border px-3 py-2">
				<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Components
				</h2>
			</div>

			<div className="flex-1 overflow-y-auto p-2">
				<div className="flex flex-col gap-1">
					{DFD_ELEMENTS.map((element) => (
						<PaletteItem
							key={element.type}
							type={element.type}
							icon={element.icon}
							label={element.label}
							description={element.description}
						/>
					))}
				</div>

				<div className="mt-6 border-t border-border pt-4 px-1">
					<h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Boundaries
					</h3>
					<div className="flex flex-col gap-1">
						{BOUNDARY_ELEMENTS.map((element) => (
							<PaletteItem
								key={element.type}
								type={element.type}
								icon={element.icon}
								label={element.label}
								description={element.description}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function PaletteItem({
	icon: Icon,
	label,
	type,
	description,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	type: string;
	description: string;
}) {
	return (
		<div
			className="flex cursor-grab items-center gap-3 rounded-md border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-accent"
			draggable
			onDragStart={(e) => {
				e.dataTransfer.setData("application/threatforge-element", JSON.stringify({ type }));
				e.dataTransfer.effectAllowed = "copy";
				useCanvasStore.getState().setDraggedType(type);
			}}
			onDragEnd={() => {
				useCanvasStore.getState().setDraggedType(null);
			}}
		>
			<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-secondary">
				<Icon className="h-4 w-4 text-muted-foreground" />
			</div>
			<div className="min-w-0">
				<p className="text-sm font-medium leading-tight">{label}</p>
				<p className="text-xs text-muted-foreground truncate">{description}</p>
			</div>
		</div>
	);
}
