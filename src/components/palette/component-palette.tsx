import { useReactFlow } from "@xyflow/react";
import { Box, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import {
	COMPONENT_CATEGORIES,
	COMPONENT_LIBRARY,
	type ComponentDefinition,
	getComponentsByCategory,
	getIconComponent,
	searchComponents,
} from "@/lib/component-library";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvas-store";

/** Generic palette items (always visible at top) */
const GENERIC_ITEMS = [
	{
		type: "generic" as const,
		label: "Component",
		icon: Box,
		description: "Generic component",
	},
	{
		type: "trust_boundary" as const,
		label: "Boundary",
		icon: ShieldAlert,
		description: "Trust zone boundary",
	},
];

export function ComponentPalette() {
	const [searchQuery, setSearchQuery] = useState("");
	const [activeCategory, setActiveCategory] = useState("All");

	const filteredComponents = useMemo(() => {
		if (searchQuery.trim()) {
			return searchComponents(searchQuery);
		}
		if (activeCategory !== "All") {
			return getComponentsByCategory(activeCategory);
		}
		return COMPONENT_LIBRARY.filter((c) => c.category !== "Generic");
	}, [searchQuery, activeCategory]);

	return (
		<div data-testid="component-palette" className="flex h-full flex-col">
			{/* Generic section */}
			<div className="border-b border-border px-3 py-2">
				<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Generic
				</h2>
			</div>
			<div className="border-b border-border p-2">
				<div className="flex flex-col gap-1">
					{GENERIC_ITEMS.map((item) => (
						<GenericPaletteItem
							key={item.type}
							type={item.type}
							icon={item.icon}
							label={item.label}
							description={item.description}
						/>
					))}
				</div>
			</div>

			{/* Library section */}
			<div className="px-3 py-2">
				<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Library
				</h2>
			</div>

			{/* Search */}
			<div className="px-2 pb-2">
				<div className="relative">
					<Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<input
						data-testid="library-search"
						type="text"
						placeholder="Search components..."
						value={searchQuery}
						onChange={(e) => {
							setSearchQuery(e.target.value);
							if (e.target.value) setActiveCategory("All");
						}}
						className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-tf-signal focus:outline-none"
					/>
				</div>
			</div>

			{/* Category tabs */}
			{!searchQuery && (
				<div className="flex gap-0.5 overflow-x-auto px-2 pb-2 scrollbar-none">
					<CategoryTab
						label="All"
						active={activeCategory === "All"}
						onClick={() => setActiveCategory("All")}
					/>
					{COMPONENT_CATEGORIES.map((cat) => (
						<CategoryTab
							key={cat}
							label={cat}
							active={activeCategory === cat}
							onClick={() => setActiveCategory(cat)}
						/>
					))}
				</div>
			)}

			{/* Component list */}
			<div className="flex-1 overflow-y-auto p-2">
				<div className="flex flex-col gap-0.5">
					{filteredComponents.map((comp) => (
						<LibraryPaletteItem key={comp.id} component={comp} />
					))}
					{filteredComponents.length === 0 && (
						<p className="px-2 py-4 text-center text-xs text-muted-foreground">
							No matching components
						</p>
					)}
				</div>
			</div>
		</div>
	);
}

function CategoryTab({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={cn(
				"shrink-0 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
				active
					? "bg-accent text-accent-foreground"
					: "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
			)}
			onClick={onClick}
		>
			{label}
		</button>
	);
}

/** Get the center of the visible canvas area in flow coordinates */
function getCanvasCenter(
	screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number },
) {
	const canvasEl = document.querySelector(".react-flow");
	if (!canvasEl) return { x: 200, y: 200 };
	const rect = canvasEl.getBoundingClientRect();
	return screenToFlowPosition({
		x: rect.left + rect.width / 2,
		y: rect.top + rect.height / 2,
	});
}

/** Generic items: Component (generic) and Boundary. No subtype. */
function GenericPaletteItem({
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
	const { screenToFlowPosition } = useReactFlow();

	const handleDoubleClick = () => {
		const position = getCanvasCenter(screenToFlowPosition);
		if (type === "trust_boundary") {
			useCanvasStore.getState().addTrustBoundary("New Boundary", position);
		} else {
			useCanvasStore.getState().addElement(type, position);
		}
	};

	return (
		<div
			data-testid={`palette-item-${type.replace(/_/g, "-")}`}
			className="flex cursor-grab items-center gap-3 rounded-md border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-accent"
			draggable
			onDoubleClick={handleDoubleClick}
			onDragStart={(e) => {
				e.dataTransfer.setData("text/plain", type);
				e.dataTransfer.effectAllowed = "copy";
				// Use setDraggedComponent to clear any stale subtype/icon/name from a prior library drag
				useCanvasStore.getState().setDraggedComponent({ type });
			}}
			onDragEnd={(e) => {
				const draggedType = useCanvasStore.getState().draggedType;
				useCanvasStore.getState().setDraggedComponent(null);
				if (!draggedType) return;

				const target = document.elementFromPoint(e.clientX, e.clientY);
				const canvas = document.querySelector(".react-flow");
				if (!canvas || !canvas.contains(target)) return;

				const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });

				if (draggedType === "trust_boundary") {
					useCanvasStore.getState().addTrustBoundary("New Boundary", position);
				} else {
					useCanvasStore.getState().addElement(draggedType, position);
				}
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

/** Library items: specific typed components. */
function LibraryPaletteItem({ component }: { component: ComponentDefinition }) {
	const { screenToFlowPosition } = useReactFlow();
	const Icon = getIconComponent(component.icon);

	const handleDoubleClick = () => {
		const position = getCanvasCenter(screenToFlowPosition);
		useCanvasStore
			.getState()
			.addElement(component.id, position, { icon: component.icon, name: component.label });
	};

	return (
		<div
			data-testid={`palette-item-${component.id.replace(/_/g, "-")}`}
			className="flex cursor-grab items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-accent"
			draggable
			onDoubleClick={handleDoubleClick}
			onDragStart={(e) => {
				e.dataTransfer.setData("text/plain", component.id);
				e.dataTransfer.effectAllowed = "copy";
				useCanvasStore.getState().setDraggedComponent({
					type: component.id,
					icon: component.icon,
					name: component.label,
				});
			}}
			onDragEnd={(e) => {
				const draggedType = useCanvasStore.getState().draggedType;
				useCanvasStore.getState().setDraggedComponent(null);
				if (!draggedType) return;

				const target = document.elementFromPoint(e.clientX, e.clientY);
				const canvas = document.querySelector(".react-flow");
				if (!canvas || !canvas.contains(target)) return;

				const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
				useCanvasStore
					.getState()
					.addElement(draggedType, position, { icon: component.icon, name: component.label });
			}}
		>
			<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-secondary">
				{Icon ? (
					<Icon className="h-3.5 w-3.5 text-muted-foreground" />
				) : (
					<Box className="h-3.5 w-3.5 text-muted-foreground" />
				)}
			</div>
			<p className="min-w-0 text-xs font-medium leading-tight truncate">{component.label}</p>
		</div>
	);
}
