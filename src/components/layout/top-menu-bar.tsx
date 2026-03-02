import {
	BookOpen,
	FilePlus,
	FolderOpen,
	HelpCircle,
	LayoutPanelLeft,
	PanelRight,
	Save,
	Settings,
} from "lucide-react";
import { useState } from "react";
import { useFileOperations } from "@/hooks/use-file-operations";
import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";
import { GuidePicker } from "../onboarding/guide-picker";
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
	const [guidePickerOpen, setGuidePickerOpen] = useState(false);

	const title = model?.metadata.title ?? "ThreatForge";
	const displayTitle = isDirty ? `${title} *` : title;
	const isMac = navigator.platform.includes("Mac");
	const modKey = isMac ? "\u2318" : "Ctrl+";

	return (
		<header
			data-testid="top-menu-bar"
			className="flex h-10 shrink-0 items-center border-b border-border bg-card px-3"
		>
			{/* App title / branding */}
			<div className="flex items-center gap-2">
				<img src="/logo_square.png" alt="ThreatForge" className="h-5 w-5" />
				<span className="text-sm font-semibold tracking-tight">{displayTitle}</span>
			</div>

			{/* File operations */}
			<div className="ml-4 flex items-center gap-0.5">
				<MenuButton
					testId="btn-new"
					icon={<FilePlus className="h-3.5 w-3.5" />}
					tooltip={`New Model (${modKey}N)`}
					keytip={keytipsVisible ? `${modKey}N` : undefined}
					onClick={() => void newModel()}
				/>
				<MenuButton
					testId="btn-open"
					icon={<FolderOpen className="h-3.5 w-3.5" />}
					tooltip={`Open Model (${modKey}O)`}
					keytip={keytipsVisible ? `${modKey}O` : undefined}
					onClick={() => void openModel()}
				/>
				<MenuButton
					testId="btn-save"
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
					testId="btn-toggle-left-panel"
					icon={<LayoutPanelLeft className="h-4 w-4" />}
					tooltip="Toggle component palette"
					onClick={toggleLeftPanel}
				/>
				<MenuButton
					testId="btn-toggle-right-panel"
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
					testId="btn-guide-picker"
					icon={<BookOpen className="h-4 w-4" />}
					tooltip="Guided Tours"
					onClick={() => setGuidePickerOpen(true)}
				/>
				<MenuButton
					testId="btn-shortcuts-dialog"
					icon={<HelpCircle className="h-4 w-4" />}
					tooltip={`Keyboard Shortcuts (${modKey}/)`}
					onClick={openShortcutsDialog}
				/>
				<MenuButton
					testId="btn-settings-dialog"
					icon={<Settings className="h-4 w-4" />}
					tooltip={`Settings (${modKey},)`}
					onClick={openSettingsDialog}
				/>
			</div>
			{guidePickerOpen && <GuidePicker onClose={() => setGuidePickerOpen(false)} />}
		</header>
	);
}

function MenuButton({
	testId,
	icon,
	tooltip,
	keytip,
	onClick,
	disabled,
}: {
	testId?: string;
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
				data-testid={testId}
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
