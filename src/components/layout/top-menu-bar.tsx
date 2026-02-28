import {
	FilePlus,
	FolderOpen,
	HelpCircle,
	LayoutPanelLeft,
	PanelRight,
	Save,
	Settings,
	Shield,
} from "lucide-react";
import { useFileOperations } from "@/hooks/use-file-operations";
import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";
import { Keytip } from "../ui/keytip";

export function TopMenuBar() {
	const isDirty = useModelStore((s) => s.isDirty);
	const model = useModelStore((s) => s.model);
	const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);
	const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);
	const openSettingsDialog = useSettingsStore((s) => s.openSettingsDialog);
	const openShortcutsDialog = useSettingsStore((s) => s.openShortcutsDialog);
	const keytipsVisible = useSettingsStore((s) => s.settings.keytipsVisible);
	const { newModel, openModel, saveModel } = useFileOperations();

	const title = model?.metadata.title ?? "ThreatForge";
	const displayTitle = isDirty ? `${title} *` : title;
	const isMac = navigator.platform.includes("Mac");
	const modKey = isMac ? "\u2318" : "Ctrl+";

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
					keytip={keytipsVisible ? `${modKey}N` : undefined}
					onClick={() => void newModel()}
				/>
				<MenuButton
					icon={<FolderOpen className="h-3.5 w-3.5" />}
					tooltip={`Open Model (${modKey}O)`}
					keytip={keytipsVisible ? `${modKey}O` : undefined}
					onClick={() => void openModel()}
				/>
				<MenuButton
					icon={<Save className="h-3.5 w-3.5" />}
					tooltip={`Save (${modKey}S)`}
					keytip={keytipsVisible ? `${modKey}S` : undefined}
					onClick={() => void saveModel()}
					disabled={!model}
				/>
			</div>

			{/* Spacer */}
			<div className="flex-1" />

			{/* View toggles */}
			<div className="flex items-center gap-0.5">
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

			{/* Divider */}
			<div className="mx-1.5 h-4 w-px bg-border" />

			{/* Settings + Help */}
			<div className="flex items-center gap-0.5">
				<MenuButton
					icon={<HelpCircle className="h-4 w-4" />}
					tooltip={`Keyboard Shortcuts (${modKey}/)`}
					onClick={openShortcutsDialog}
				/>
				<MenuButton
					icon={<Settings className="h-4 w-4" />}
					tooltip={`Settings (${modKey},)`}
					onClick={openSettingsDialog}
				/>
			</div>
		</header>
	);
}

function MenuButton({
	icon,
	tooltip,
	keytip,
	onClick,
	disabled,
}: {
	icon: React.ReactNode;
	tooltip: string;
	keytip?: string;
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<span className="relative">
			<button
				type="button"
				onClick={onClick}
				disabled={disabled}
				title={tooltip}
				className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
			>
				{icon}
			</button>
			{keytip && <Keytip shortcut={keytip} />}
		</span>
	);
}
