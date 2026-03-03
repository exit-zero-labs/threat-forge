import { X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { ThemePicker } from "@/components/panels/theme-picker";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings-store";
import type { FontSize } from "@/types/settings";

interface WebsiteSettingsModalProps {
	open: boolean;
	onClose: () => void;
}

export function WebsiteSettingsModal({ open, onClose }: WebsiteSettingsModalProps) {
	const dialogRef = useRef<HTMLDivElement>(null);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		},
		[onClose],
	);

	useEffect(() => {
		if (!open) return;
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [open, handleKeyDown]);

	useEffect(() => {
		if (open) dialogRef.current?.focus();
	}, [open]);

	if (!open) return null;

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: overlay click to close is a convenience
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="settings-modal-title"
				tabIndex={-1}
				className="w-full max-w-md rounded-lg border border-border bg-background shadow-lg outline-none"
			>
				<div className="flex items-center justify-between border-b border-border px-4 py-3">
					<span id="settings-modal-title" className="text-sm font-medium text-foreground">
						Appearance
					</span>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
				<div className="max-h-[70vh] overflow-y-auto p-4">
					<SettingsContent />
				</div>
			</div>
		</div>
	);
}

function SettingsContent() {
	const settings = useSettingsStore((s) => s.settings);
	const updateSetting = useSettingsStore((s) => s.updateSetting);

	return (
		<div className="space-y-5">
			<SettingRow label="Reduce motion" description="Minimize animations throughout the interface">
				<ToggleSwitch
					checked={settings.reduceMotion}
					onChange={(v) => updateSetting("reduceMotion", v)}
				/>
			</SettingRow>

			<SettingRow label="Font size" description="Adjust the interface text size">
				<FontSizeSelector
					value={settings.fontSize}
					onChange={(v) => updateSetting("fontSize", v)}
				/>
			</SettingRow>

			<div className="mt-2">
				<ThemePicker />
			</div>
		</div>
	);
}

function SettingRow({
	label,
	description,
	children,
}: {
	label: string;
	description: string;
	children: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="min-w-0">
				<p className="text-sm font-medium text-foreground">{label}</p>
				<p className="text-xs text-muted-foreground">{description}</p>
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

const FONT_SIZE_OPTIONS: { value: FontSize; label: string }[] = [
	{ value: "small", label: "Small" },
	{ value: "default", label: "Default" },
	{ value: "large", label: "Large" },
];

function FontSizeSelector({
	value,
	onChange,
}: {
	value: FontSize;
	onChange: (value: FontSize) => void;
}) {
	return (
		<div className="flex gap-1">
			{FONT_SIZE_OPTIONS.map((opt) => (
				<button
					key={opt.value}
					type="button"
					onClick={() => onChange(opt.value)}
					className={cn(
						"rounded px-2.5 py-1 text-xs transition-colors",
						value === opt.value
							? "bg-accent text-accent-foreground"
							: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
					)}
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}
