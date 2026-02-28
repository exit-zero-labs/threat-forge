import {
	Keyboard,
	Monitor,
	Paintbrush,
	RotateCcw,
	Settings,
	Sliders,
	Sparkles,
	X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings-store";
import { KEYBOARD_SHORTCUTS } from "@/types/settings";
import { AiSettingsContent } from "./ai-settings-content";

type SettingsSection = "general" | "appearance" | "editor" | "ai" | "shortcuts";

const SECTIONS: {
	id: SettingsSection;
	label: string;
	icon: React.ReactNode;
}[] = [
	{
		id: "general",
		label: "General",
		icon: <Sliders className="h-3.5 w-3.5" />,
	},
	{
		id: "appearance",
		label: "Appearance",
		icon: <Paintbrush className="h-3.5 w-3.5" />,
	},
	{ id: "editor", label: "Editor", icon: <Monitor className="h-3.5 w-3.5" /> },
	{ id: "ai", label: "AI", icon: <Sparkles className="h-3.5 w-3.5" /> },
	{
		id: "shortcuts",
		label: "Shortcuts",
		icon: <Keyboard className="h-3.5 w-3.5" />,
	},
];

export function SettingsDialog() {
	const closeSettingsDialog = useSettingsStore((s) => s.closeSettingsDialog);
	const [section, setSection] = useState<SettingsSection>("general");

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Escape") {
			closeSettingsDialog();
		}
	}

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: overlay click to close is a convenience
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onClick={(e) => {
				if (e.target === e.currentTarget) closeSettingsDialog();
			}}
		>
			<div
				className="flex h-[520px] w-full max-w-2xl rounded-lg border border-border bg-background shadow-lg"
				onKeyDown={handleKeyDown}
			>
				{/* Sidebar nav */}
				<nav className="flex w-44 shrink-0 flex-col border-r border-border p-2">
					<div className="mb-3 flex items-center gap-2 px-2 pt-1">
						<Settings className="h-4 w-4 text-muted-foreground" />
						<h2 className="text-sm font-medium">Settings</h2>
					</div>
					{SECTIONS.map((s) => (
						<button
							key={s.id}
							type="button"
							onClick={() => setSection(s.id)}
							className={cn(
								"flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors",
								section === s.id
									? "bg-accent text-foreground"
									: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
							)}
						>
							{s.icon}
							{s.label}
						</button>
					))}

					<div className="flex-1" />
					<ResetButton />
				</nav>

				{/* Content */}
				<div className="flex flex-1 flex-col overflow-hidden">
					<div className="flex items-center justify-between border-b border-border px-4 py-2.5">
						<span className="text-xs font-medium">
							{SECTIONS.find((s) => s.id === section)?.label}
						</span>
						<button
							type="button"
							onClick={closeSettingsDialog}
							className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
					<div className="flex-1 overflow-y-auto p-4">
						{section === "general" && <GeneralSection />}
						{section === "appearance" && <AppearanceSection />}
						{section === "editor" && <EditorSection />}
						{section === "ai" && <AiSettingsContent />}
						{section === "shortcuts" && <ShortcutsSection />}
					</div>
				</div>
			</div>
		</div>
	);
}

function ResetButton() {
	const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);
	return (
		<button
			type="button"
			onClick={resetToDefaults}
			className="flex items-center gap-1.5 rounded px-2 py-1.5 text-[10px] text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
		>
			<RotateCcw className="h-3 w-3" />
			Reset to defaults
		</button>
	);
}

/* ---------- Section components ---------- */

function GeneralSection() {
	const settings = useSettingsStore((s) => s.settings);
	const updateSetting = useSettingsStore((s) => s.updateSetting);

	return (
		<div className="space-y-5">
			<SettingRow label="Language" description="Interface language (more coming soon)">
				<select
					disabled
					className="rounded border border-border bg-background px-2 py-1.5 text-xs opacity-60"
				>
					<option>English</option>
				</select>
			</SettingRow>

			<SettingRow label="Autosave" description="Automatically save when changes are made">
				<ToggleSwitch
					checked={settings.autosaveEnabled}
					onChange={(v) => updateSetting("autosaveEnabled", v)}
				/>
			</SettingRow>

			{settings.autosaveEnabled && (
				<SettingRow
					label="Autosave interval"
					description="Seconds to wait after last change before saving"
				>
					<NumberInput
						value={settings.autosaveIntervalSeconds}
						min={5}
						max={300}
						onChange={(v) => updateSetting("autosaveIntervalSeconds", v)}
					/>
				</SettingRow>
			)}

			<SettingRow
				label="Confirm before delete"
				description="Ask for confirmation before deleting elements"
			>
				<ToggleSwitch
					checked={settings.confirmBeforeDelete}
					onChange={(v) => updateSetting("confirmBeforeDelete", v)}
				/>
			</SettingRow>
		</div>
	);
}

function AppearanceSection() {
	const settings = useSettingsStore((s) => s.settings);
	const updateSetting = useSettingsStore((s) => s.updateSetting);

	return (
		<div className="space-y-5">
			<SettingRow label="Show keytips" description="Display keyboard shortcut badges on controls">
				<ToggleSwitch
					checked={settings.keytipsVisible}
					onChange={(v) => updateSetting("keytipsVisible", v)}
				/>
			</SettingRow>

			<SettingRow label="Reduce motion" description="Minimize animations throughout the interface">
				<ToggleSwitch
					checked={settings.reduceMotion}
					onChange={(v) => updateSetting("reduceMotion", v)}
				/>
			</SettingRow>

			<div className="rounded border border-border/50 bg-muted/20 p-3">
				<p className="text-[10px] text-muted-foreground">
					Theme selection will be available here once the theme system is implemented. Currently
					using the default dark theme.
				</p>
			</div>
		</div>
	);
}

function EditorSection() {
	const settings = useSettingsStore((s) => s.settings);
	const updateSetting = useSettingsStore((s) => s.updateSetting);

	return (
		<div className="space-y-5">
			<SettingRow label="Grid snap" description="Snap elements to grid when moving on canvas">
				<ToggleSwitch checked={settings.gridSnap} onChange={(v) => updateSetting("gridSnap", v)} />
			</SettingRow>

			<SettingRow label="Grid size" description="Grid cell size in pixels">
				<NumberInput
					value={settings.gridSize}
					min={4}
					max={64}
					onChange={(v) => updateSetting("gridSize", v)}
				/>
			</SettingRow>
		</div>
	);
}

function ShortcutsSection() {
	const isMac = navigator.platform.includes("Mac");
	const categories = ["file", "view", "canvas"] as const;
	const categoryLabels = {
		file: "File",
		view: "View",
		canvas: "Canvas",
	} as const;

	return (
		<div className="space-y-4">
			{categories.map((cat) => {
				const shortcuts = KEYBOARD_SHORTCUTS.filter((s) => s.category === cat);
				if (shortcuts.length === 0) return null;
				return (
					<div key={cat}>
						<h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
							{categoryLabels[cat]}
						</h3>
						<div className="space-y-1">
							{shortcuts.map((shortcut) => (
								<div
									key={shortcut.id}
									className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-accent/30"
								>
									<span className="text-foreground">{shortcut.label}</span>
									<kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
										{isMac ? shortcut.macKeys : shortcut.winKeys}
									</kbd>
								</div>
							))}
						</div>
					</div>
				);
			})}

			<p className="text-[10px] text-muted-foreground/70">
				Custom keyboard shortcuts coming in a future release.
			</p>
		</div>
	);
}

/* ---------- Reusable UI primitives ---------- */

function SettingRow({
	label,
	description,
	children,
}: {
	label: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="min-w-0">
				<p className="text-xs font-medium text-foreground">{label}</p>
				<p className="text-[10px] text-muted-foreground">{description}</p>
			</div>
			{children}
		</div>
	);
}

function ToggleSwitch({
	checked,
	onChange,
}: {
	checked: boolean;
	onChange: (value: boolean) => void;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			onClick={() => onChange(!checked)}
			className={cn(
				"relative h-5 w-9 shrink-0 rounded-full transition-colors",
				checked ? "bg-primary" : "bg-muted",
			)}
		>
			<span
				className={cn(
					"absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background transition-transform",
					checked && "translate-x-4",
				)}
			/>
		</button>
	);
}

function NumberInput({
	value,
	min,
	max,
	onChange,
}: {
	value: number;
	min: number;
	max: number;
	onChange: (value: number) => void;
}) {
	return (
		<input
			type="number"
			value={value}
			min={min}
			max={max}
			onChange={(e) => {
				const parsed = Number.parseInt(e.target.value, 10);
				if (!Number.isNaN(parsed) && parsed >= min && parsed <= max) {
					onChange(parsed);
				}
			}}
			className="w-20 rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
		/>
	);
}
