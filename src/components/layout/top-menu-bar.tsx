import {
	FilePlus,
	FolderOpen,
	LayoutPanelLeft,
	Palette,
	PanelRight,
	Save,
	Shield,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFileOperations } from "@/hooks/use-file-operations";
import { useModelStore } from "@/stores/model-store";
import { useUiStore } from "@/stores/ui-store";
import { ThemePicker } from "../panels/theme-picker";

export function TopMenuBar() {
	const isDirty = useModelStore((s) => s.isDirty);
	const model = useModelStore((s) => s.model);
	const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);
	const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);
	const { newModel, openModel, saveModel } = useFileOperations();

	const title = model?.metadata.title ?? "ThreatForge";
	const displayTitle = isDirty ? `${title} *` : title;
	const isMac = navigator.platform.includes("Mac");
	const modKey = isMac ? "\u2318" : "Ctrl+";

	const [themePickerOpen, setThemePickerOpen] = useState(false);
	const themePickerRef = useRef<HTMLDivElement>(null);

	const closeThemePicker = useCallback(() => setThemePickerOpen(false), []);

	// Close theme picker when clicking outside
	useEffect(() => {
		if (!themePickerOpen) return;

		const handleClickOutside = (event: MouseEvent) => {
			if (themePickerRef.current && !themePickerRef.current.contains(event.target as Node)) {
				setThemePickerOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [themePickerOpen]);

	return (
		<header className="flex h-10 shrink-0 items-center border-b border-border bg-card px-3">
			{/* App title / branding */}
			<div className="flex items-center gap-2">
				<Shield className="h-4 w-4 text-tf-signal" />
				<span className="text-sm font-semibold tracking-tight">{displayTitle}</span>
			</div>

			{/* File operations */}
			<div className="ml-4 flex items-center gap-0.5">
				<MenuButton
					icon={<FilePlus className="h-3.5 w-3.5" />}
					tooltip={`New Model (${modKey}N)`}
					onClick={() => void newModel()}
				/>
				<MenuButton
					icon={<FolderOpen className="h-3.5 w-3.5" />}
					tooltip={`Open Model (${modKey}O)`}
					onClick={() => void openModel()}
				/>
				<MenuButton
					icon={<Save className="h-3.5 w-3.5" />}
					tooltip={`Save (${modKey}S)`}
					onClick={() => void saveModel()}
					disabled={!model}
				/>
			</div>

			{/* Spacer */}
			<div className="flex-1" />

			{/* View toggles */}
			<div className="flex items-center gap-1">
				<div ref={themePickerRef} className="relative">
					<MenuButton
						icon={<Palette className="h-4 w-4" />}
						tooltip="Theme"
						onClick={() => setThemePickerOpen((prev) => !prev)}
					/>
					{themePickerOpen && <ThemePicker onClose={closeThemePicker} />}
				</div>
				<MenuButton
					icon={<LayoutPanelLeft className="h-4 w-4" />}
					tooltip="Toggle component palette"
					onClick={toggleLeftPanel}
				/>
				<MenuButton
					icon={<PanelRight className="h-4 w-4" />}
					tooltip="Toggle properties panel"
					onClick={toggleRightPanel}
				/>
			</div>
		</header>
	);
}

function MenuButton({
	icon,
	tooltip,
	onClick,
	disabled,
}: {
	icon: React.ReactNode;
	tooltip: string;
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			title={tooltip}
			className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
		>
			{icon}
		</button>
	);
}
