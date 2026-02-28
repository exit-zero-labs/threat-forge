import { ArrowLeftRight, Copy, Pencil, Shield, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ContextMenuItem {
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	onClick: () => void;
	variant?: "danger";
}

interface CanvasContextMenuProps {
	x: number;
	y: number;
	items: ContextMenuItem[];
	onClose: () => void;
}

export function CanvasContextMenu({ x, y, items, onClose }: CanvasContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				onClose();
			}
		}
		function handleEscape(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
		}
		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [onClose]);

	return (
		<div
			ref={menuRef}
			className="fixed z-50 min-w-[160px] rounded-md border border-border bg-card py-1 shadow-lg"
			style={{ left: x, top: y }}
		>
			{items.map((item) => (
				<button
					type="button"
					key={item.label}
					className={cn(
						"flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors",
						item.variant === "danger"
							? "text-red-400 hover:bg-red-400/10"
							: "text-foreground hover:bg-accent",
					)}
					onClick={() => {
						item.onClick();
						onClose();
					}}
				>
					<item.icon className="h-3.5 w-3.5" />
					{item.label}
				</button>
			))}
		</div>
	);
}

/** Build menu items for a node context menu */
export function buildNodeMenuItems({
	onEditProperties,
	onDelete,
	onDuplicate,
	onViewThreats,
}: {
	onEditProperties: () => void;
	onDelete: () => void;
	onDuplicate: () => void;
	onViewThreats: () => void;
}): ContextMenuItem[] {
	return [
		{ label: "Edit Properties", icon: Pencil, onClick: onEditProperties },
		{ label: "View Threats", icon: Shield, onClick: onViewThreats },
		{ label: "Duplicate", icon: Copy, onClick: onDuplicate },
		{ label: "Delete", icon: Trash2, onClick: onDelete, variant: "danger" },
	];
}

/** Build menu items for an edge context menu */
export function buildEdgeMenuItems({
	onEditProperties,
	onDelete,
	onReverseDirection,
}: {
	onEditProperties: () => void;
	onDelete: () => void;
	onReverseDirection: () => void;
}): ContextMenuItem[] {
	return [
		{ label: "Edit Properties", icon: Pencil, onClick: onEditProperties },
		{
			label: "Reverse Direction",
			icon: ArrowLeftRight,
			onClick: onReverseDirection,
		},
		{ label: "Delete", icon: Trash2, onClick: onDelete, variant: "danger" },
	];
}

export type { ContextMenuItem };
