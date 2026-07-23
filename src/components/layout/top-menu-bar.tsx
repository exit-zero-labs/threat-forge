import {
	BookOpen,
	FileOutput,
	FilePlus,
	FolderOpen,
	LayoutPanelLeft,
	PanelRight,
	Save,
	Settings,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useFileOperations } from "@/hooks/use-file-operations";
import { documentDisplayTitle } from "@/lib/document-display-title";
import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";
import { GuidePicker } from "../onboarding/guide-picker";
import { Keytip } from "../ui/keytip";

export function TopMenuBar() {
	const isDirty = useModelStore((s) => s.isDirty);
	const model = useModelStore((s) => s.model);
	const componentCount = model?.elements.length ?? 0;
	const dataFlowCount = model?.data_flows.length ?? 0;
	const threatCount = model?.threats.length ?? 0;
	const mitigatedThreatCount =
		model?.threats.filter((threat) => threat.mitigation?.status === "mitigated").length ?? 0;
	const filePath = useModelStore((s) => s.filePath);
	const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);
	const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);
	const openSettingsDialog = useSettingsStore((s) => s.openSettingsDialog);
	const keytipsVisible = useSettingsStore((s) => s.settings.keytipsVisible);
	const { newModel, openModel, saveModel, saveModelAs, exportAsHtml } = useFileOperations();
	const [guidePickerOpen, setGuidePickerOpen] = useState(false);
	const [editingTitle, setEditingTitle] = useState(false);
	const titleInputRef = useRef<HTMLInputElement>(null);

	// Show file basename when saved, otherwise model title — from the shared helper so the tab,
	// window title, and this menu-bar title cannot drift, and a Windows path resolves correctly.
	const title = documentDisplayTitle(model, filePath);
	const displayTitle = isDirty ? `${title} *` : title;
	const isMac = navigator.platform.includes("Mac");
	const modKey = isMac ? "\u2318" : "Ctrl+";

	const commitTitle = useCallback(() => {
		const newTitle = titleInputRef.current?.value.trim();
		setEditingTitle(false);
		if (!newTitle || !model) return;
		if (newTitle !== model.metadata.title) {
			useModelStore.getState().updateMetadata({ title: newTitle });
			// Trigger save-as so user can choose the filename
			void saveModelAs();
		}
	}, [model, saveModelAs]);

	const cancelEdit = useCallback(() => {
		setEditingTitle(false);
	}, []);

	return (
		<header
			data-testid="top-menu-bar"
			className="flex h-10 shrink-0 items-center border-b border-border bg-card px-3"
		>
			{/* App title / branding */}
			<div className="flex min-w-0 items-center gap-2">
				<img src="/logo_square.png" alt="Threat Forge" className="h-5 w-5 shrink-0" />
				{editingTitle && model ? (
					<input
						ref={titleInputRef}
						defaultValue={model.metadata.title}
						autoFocus
						className="w-40 rounded border border-primary bg-background px-1.5 py-0.5 text-sm font-semibold tracking-tight text-foreground focus:outline-none"
						onKeyDown={(e) => {
							e.stopPropagation();
							if (e.key === "Enter") commitTitle();
							if (e.key === "Escape") cancelEdit();
						}}
						onBlur={cancelEdit}
					/>
				) : (
					<span
						className="min-w-0 truncate text-sm font-semibold tracking-tight cursor-default"
						onDoubleClick={() => {
							if (model) setEditingTitle(true);
						}}
						title={model ? `${displayTitle} - Double-click to rename` : undefined}
					>
						{displayTitle}
					</span>
				)}
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
				<MenuButton
					testId="btn-export"
					icon={<FileOutput className="h-3.5 w-3.5" />}
					tooltip={`Export HTML (${modKey}${isMac ? "⇧" : "Shift+"}E)`}
					onClick={() => void exportAsHtml()}
					disabled={!model}
				/>
			</div>

			{/* Spacer */}
			<div className="flex-1" />

			{model && (
				<section
					aria-label={`Canvas summary: ${countLabel(componentCount, "component")}, ${countLabel(dataFlowCount, "data flow")}, ${countLabel(threatCount, "identified threat")}, ${countLabel(mitigatedThreatCount, "mitigated threat")}`}
					data-testid="canvas-count-badge"
					className="flex shrink-0 items-center divide-x divide-border rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm"
				>
					<dl className="flex items-center divide-x divide-border">
						<CountItem label="Components" value={componentCount} />
						<CountItem label="Data flows" value={dataFlowCount} />
						<CountItem
							label="Threats"
							value={`${threatCount} / ${mitigatedThreatCount}`}
							title="Threats: identified / mitigated"
						/>
					</dl>
				</section>
			)}

			{/* Divider */}
			{model && <div className="mx-1.5 h-4 w-px bg-border" />}

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

function CountItem({
	label,
	value,
	title,
}: {
	label: string;
	value: number | string;
	title?: string;
}) {
	return (
		<div className="flex gap-1 whitespace-nowrap px-2 first:pl-0 last:pr-0" title={title}>
			<dt>{label}</dt> <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
		</div>
	);
}

function countLabel(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
