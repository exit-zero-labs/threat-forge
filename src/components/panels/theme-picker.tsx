import { Check, Monitor, Moon, Sun } from "lucide-react";
import { THEME_PRESETS } from "@/lib/themes/presets";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import type { ThemeMode, ThemeTokens } from "@/types/theme";

const MODE_OPTIONS: Array<{
	mode: ThemeMode;
	icon: React.ReactNode;
	label: string;
}> = [
	{ mode: "light", icon: <Sun className="h-3.5 w-3.5" />, label: "Light" },
	{ mode: "dark", icon: <Moon className="h-3.5 w-3.5" />, label: "Dark" },
	{
		mode: "system",
		icon: <Monitor className="h-3.5 w-3.5" />,
		label: "System",
	},
];

const presetList = Object.values(THEME_PRESETS);
const darkPresets = presetList.filter((p) => p.mode === "dark");
const lightPresets = presetList.filter((p) => p.mode === "light");

export function ThemePicker() {
	const themeMode = useUiStore((s) => s.themeMode);
	const lightPresetId = useUiStore((s) => s.lightPresetId);
	const darkPresetId = useUiStore((s) => s.darkPresetId);
	const setTheme = useUiStore((s) => s.setTheme);

	const handleModeChange = (mode: ThemeMode) => {
		setTheme(mode);
	};

	const handlePresetChange = (presetId: string) => {
		const preset = THEME_PRESETS[presetId];
		if (!preset) return;
		// When picking a preset, switch to its native mode (unless in system mode)
		const mode = themeMode === "system" ? "system" : preset.mode;
		setTheme(mode, presetId);
	};

	// Determine which sections should be dimmed
	const dimDark = themeMode === "light";
	const dimLight = themeMode === "dark";

	return (
		<div className="space-y-3">
			{/* Mode selector */}
			<div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
				Mode
			</div>
			<div className="mb-3 flex gap-1">
				{MODE_OPTIONS.map(({ mode, icon, label }) => (
					<button
						key={mode}
						type="button"
						onClick={() => handleModeChange(mode)}
						className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs ${
							themeMode === mode
								? "bg-accent text-accent-foreground"
								: "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
						}`}
					>
						{icon}
						{label}
					</button>
				))}
			</div>

			{/* Dark presets */}
			<div
				className={cn(
					"mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground",
					dimDark && "opacity-50",
				)}
			>
				For dark mode
			</div>
			<div className={cn("mb-3 space-y-0.5", dimDark && "opacity-60")}>
				{darkPresets.map((preset) => (
					<button
						key={preset.id}
						type="button"
						onClick={() => handlePresetChange(preset.id)}
						className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs ${
							darkPresetId === preset.id
								? "bg-accent text-accent-foreground"
								: "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
						}`}
					>
						<ThemeSwatch tokens={preset.tokens} />
						<span className="flex-1 text-left">{preset.name}</span>
						{darkPresetId === preset.id && <Check className="h-3 w-3 text-tf-signal" />}
					</button>
				))}
			</div>

			{/* Light presets */}
			<div
				className={cn(
					"mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground",
					dimLight && "opacity-50",
				)}
			>
				For light mode
			</div>
			<div className={cn("space-y-0.5", dimLight && "opacity-60")}>
				{lightPresets.map((preset) => (
					<button
						key={preset.id}
						type="button"
						onClick={() => handlePresetChange(preset.id)}
						className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs ${
							lightPresetId === preset.id
								? "bg-accent text-accent-foreground"
								: "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
						}`}
					>
						<ThemeSwatch tokens={preset.tokens} />
						<span className="flex-1 text-left">{preset.name}</span>
						{lightPresetId === preset.id && <Check className="h-3 w-3 text-tf-signal" />}
					</button>
				))}
			</div>
		</div>
	);
}

/** Shows 3 representative color dots from the theme tokens. */
function ThemeSwatch({ tokens }: { tokens: ThemeTokens }) {
	return (
		<span className="flex shrink-0 gap-0.5">
			<span
				className="h-3 w-3 rounded-full border border-border/50"
				style={{ backgroundColor: tokens.background }}
			/>
			<span
				className="h-3 w-3 rounded-full border border-border/50"
				style={{ backgroundColor: tokens.primary }}
			/>
			<span
				className="h-3 w-3 rounded-full border border-border/50"
				style={{ backgroundColor: tokens.accent }}
			/>
		</span>
	);
}
