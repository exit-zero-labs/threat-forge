import { X } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { KEYBOARD_SHORTCUTS } from "@/types/settings";

export function ShortcutsDialog() {
	const closeShortcutsDialog = useSettingsStore((s) => s.closeShortcutsDialog);
	const isMac = navigator.platform.includes("Mac");

	const categories = ["file", "view", "canvas"] as const;
	const categoryLabels = {
		file: "File",
		view: "View",
		canvas: "Canvas",
	} as const;

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Escape") {
			closeShortcutsDialog();
		}
	}

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: overlay click to close is a convenience
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onClick={(e) => {
				if (e.target === e.currentTarget) closeShortcutsDialog();
			}}
		>
			<div
				className="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg"
				onKeyDown={handleKeyDown}
			>
				{/* Header */}
				<div className="mb-4 flex items-center justify-between">
					<h2 className="text-sm font-medium">Keyboard Shortcuts</h2>
					<button
						type="button"
						onClick={closeShortcutsDialog}
						className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="space-y-4">
					{categories.map((cat) => {
						const shortcuts = KEYBOARD_SHORTCUTS.filter((s) => s.category === cat);
						if (shortcuts.length === 0) return null;
						return (
							<div key={cat}>
								<h3 className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
									{categoryLabels[cat]}
								</h3>
								<div className="space-y-0.5">
									{shortcuts.map((shortcut) => (
										<div
											key={shortcut.id}
											className="flex items-center justify-between rounded px-2 py-1 text-xs"
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
				</div>
			</div>
		</div>
	);
}
