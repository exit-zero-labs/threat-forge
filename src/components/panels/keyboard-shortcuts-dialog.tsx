import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUiStore } from "@/stores/ui-store";
import { KEYBOARD_SHORTCUTS, type KeyboardShortcut } from "@/types/settings";

const CATEGORY_LABELS: Record<KeyboardShortcut["category"], string> = {
	file: "File",
	edit: "Edit",
	view: "View",
	canvas: "Canvas",
};

export function KeyboardShortcutsDialog() {
	const closeKeyboardShortcutsDialog = useUiStore((s) => s.closeKeyboardShortcutsDialog);
	const inputRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const isMac = navigator.platform.includes("Mac");

	useEffect(() => {
		requestAnimationFrame(() => inputRef.current?.focus());
	}, []);

	const filteredShortcuts = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) return KEYBOARD_SHORTCUTS;

		return KEYBOARD_SHORTCUTS.filter((shortcut) => {
			const searchableText = [
				shortcut.label,
				shortcut.macKeys,
				shortcut.winKeys,
				CATEGORY_LABELS[shortcut.category],
			]
				.join(" ")
				.toLowerCase();

			return searchableText.includes(normalizedQuery);
		});
	}, [query]);

	const groupedShortcuts = useMemo(() => {
		return (Object.keys(CATEGORY_LABELS) as KeyboardShortcut["category"][])
			.map((category) => ({
				category,
				shortcuts: filteredShortcuts.filter((shortcut) => shortcut.category === category),
			}))
			.filter((group) => group.shortcuts.length > 0);
	}, [filteredShortcuts]);

	function handleKeyDown(event: React.KeyboardEvent) {
		if (event.key === "Escape") {
			closeKeyboardShortcutsDialog();
		}
	}

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: overlay click to close is a convenience
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onClick={(event) => {
				if (event.target === event.currentTarget) closeKeyboardShortcutsDialog();
			}}
		>
			<div
				data-testid="keyboard-shortcuts-dialog"
				className="flex h-[620px] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg"
				onKeyDown={handleKeyDown}
			>
				<div className="flex items-center justify-between border-b border-border px-4 py-3">
					<div>
						<h2 className="text-sm font-medium text-foreground">Keyboard Shortcuts</h2>
						<p className="mt-1 text-xs text-muted-foreground">
							Search by action, key combo, or category. Press Escape to close.
						</p>
					</div>
					<button
						type="button"
						onClick={closeKeyboardShortcutsDialog}
						className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="border-b border-border px-4 py-3">
					<div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
						<Search className="h-4 w-4 text-muted-foreground" />
						<input
							ref={inputRef}
							data-testid="keyboard-shortcuts-search"
							type="text"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search shortcuts…"
							className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
						/>
					</div>
				</div>

				<div className="flex-1 overflow-y-auto px-4 py-4">
					{groupedShortcuts.length === 0 ? (
						<div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
							No shortcuts match your search.
						</div>
					) : (
						<div className="space-y-6">
							{groupedShortcuts.map((group) => (
								<section key={group.category}>
									<h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										{CATEGORY_LABELS[group.category]}
									</h3>
									<div className="overflow-hidden rounded-md border border-border">
										{group.shortcuts.map((shortcut) => {
											const primaryKeys = isMac ? shortcut.macKeys : shortcut.winKeys;
											const secondaryKeys = isMac ? shortcut.winKeys : shortcut.macKeys;

											return (
												<div
													key={shortcut.id}
													className="flex items-center justify-between gap-4 border-b border-border bg-card px-4 py-3 last:border-b-0"
												>
													<div className="min-w-0">
														<div className="text-sm font-medium text-foreground">
															{shortcut.label}
														</div>
														<div className="mt-1 text-xs text-muted-foreground">
															Also: {secondaryKeys}
														</div>
													</div>
													<kbd className="shrink-0 rounded border border-border bg-background px-2 py-1 text-xs font-medium text-foreground">
														{primaryKeys}
													</kbd>
												</div>
											);
										})}
									</div>
								</section>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
