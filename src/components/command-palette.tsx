import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFileOperations } from "@/hooks/use-file-operations";
import { buildCommands, type Command, searchCommands } from "@/lib/command-registry";
import { useModelStore } from "@/stores/model-store";

interface CommandPaletteProps {
	open: boolean;
	onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
	file: "File",
	view: "View",
	canvas: "Canvas",
	navigate: "Navigate",
	settings: "Settings",
	component: "Add Component",
};

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	const { newModel, openModel, saveModel, saveModelAs } = useFileOperations();
	const hasModel = useModelStore((s) => s.model !== null);

	const allCommands = useMemo(
		() =>
			buildCommands({
				newModel: () => void newModel(),
				openModel: () => void openModel(),
				saveModel: () => void saveModel(),
				saveModelAs: () => void saveModelAs(),
				hasModel,
			}),
		[newModel, openModel, saveModel, saveModelAs, hasModel],
	);

	const filtered = useMemo(() => searchCommands(allCommands, query), [allCommands, query]);

	// Reset state when opened
	useEffect(() => {
		if (open) {
			setQuery("");
			setSelectedIndex(0);
			requestAnimationFrame(() => inputRef.current?.focus());
		}
	}, [open]);

	// Keep selected index in bounds
	useEffect(() => {
		if (selectedIndex >= filtered.length) {
			setSelectedIndex(Math.max(0, filtered.length - 1));
		}
	}, [filtered.length, selectedIndex]);

	// Scroll selected item into view
	useEffect(() => {
		const item = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
		item?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	const executeCommand = useCallback(
		(cmd: Command) => {
			onClose();
			// Defer execution slightly so the palette closes first
			requestAnimationFrame(() => cmd.action());
		},
		[onClose],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			switch (e.key) {
				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex((i) => (i + 1) % filtered.length);
					break;
				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
					break;
				case "Enter":
					e.preventDefault();
					if (filtered[selectedIndex]) {
						executeCommand(filtered[selectedIndex]);
					}
					break;
				case "Escape":
					e.preventDefault();
					onClose();
					break;
			}
		},
		[filtered, selectedIndex, executeCommand, onClose],
	);

	if (!open) return null;

	// Group filtered commands by category for display
	const grouped: { category: string; commands: { cmd: Command; globalIndex: number }[] }[] = [];
	let currentCategory = "";
	for (let i = 0; i < filtered.length; i++) {
		const cmd = filtered[i];
		if (cmd.category !== currentCategory) {
			currentCategory = cmd.category;
			grouped.push({ category: cmd.category, commands: [] });
		}
		grouped[grouped.length - 1].commands.push({ cmd, globalIndex: i });
	}

	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 z-50 bg-black/50"
				onClick={onClose}
				onKeyDown={(e) => e.key === "Escape" && onClose()}
				data-testid="command-palette-backdrop"
			/>
			{/* Palette */}
			<div
				className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 rounded-lg border border-border bg-card shadow-2xl"
				data-testid="command-palette"
			>
				{/* Search input */}
				<div className="flex items-center border-b border-border px-3">
					<svg
						className="mr-2 h-4 w-4 shrink-0 text-muted-foreground"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<title>Search</title>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => {
							setQuery(e.target.value);
							setSelectedIndex(0);
						}}
						onKeyDown={handleKeyDown}
						className="w-full bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
						placeholder="Type a command…"
						data-testid="command-palette-input"
					/>
				</div>
				{/* Command list */}
				<div ref={listRef} className="max-h-72 overflow-y-auto p-1">
					{filtered.length === 0 && (
						<div className="px-3 py-6 text-center text-sm text-muted-foreground">
							No commands found
						</div>
					)}
					{grouped.map((group) => (
						<div key={group.category}>
							<div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
								{CATEGORY_LABELS[group.category] ?? group.category}
							</div>
							{group.commands.map(({ cmd, globalIndex }) => (
								<button
									key={cmd.id}
									type="button"
									data-index={globalIndex}
									className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm ${
										globalIndex === selectedIndex
											? "bg-accent text-accent-foreground"
											: "text-foreground hover:bg-accent/50"
									}`}
									onClick={() => executeCommand(cmd)}
									onMouseEnter={() => setSelectedIndex(globalIndex)}
								>
									<span>{cmd.label}</span>
									{cmd.shortcut && (
										<span className="ml-4 text-xs text-muted-foreground">{cmd.shortcut}</span>
									)}
								</button>
							))}
						</div>
					))}
				</div>
			</div>
		</>
	);
}
