import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "threatforge-last-seen-version";
const CURRENT_VERSION = "1.0.0";

/** Proper semver greater-than comparison (avoids lexicographic "1.9.0" > "1.10.0" bug) */
function semverGt(a: string, b: string): boolean {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
		if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
	}
	return false;
}

interface ChangelogEntry {
	version: string;
	date: string;
	changes: string[];
}

const CHANGELOG: ChangelogEntry[] = [
	{
		version: "1.0.0",
		date: "2026-03-02",
		changes: [
			"Component library with 28 pre-built technology components",
			"STRIDE threat analysis engine with auto-generated threats",
			"AI chat pane with BYOK support (OpenAI, Anthropic, Ollama)",
			"Human-readable YAML file format — git-diffable",
			"Undo/redo with 20-action history",
			"Copy, cut, paste, and multi-select on canvas",
			"Command palette (Cmd+K) with 16 commands",
			"Onboarding guides for new users",
			"Dark mode with 6 theme presets",
			"Native menus on macOS/Windows/Linux",
		],
	},
];

/**
 * Shows a "What's New" overlay when the app version changes.
 * Checks localStorage to determine if the user has seen the current version.
 */
export function WhatsNewOverlay() {
	const [visible, setVisible] = useState(false);
	const [unseenEntries, setUnseenEntries] = useState<ChangelogEntry[]>([]);

	useEffect(() => {
		const lastSeen = localStorage.getItem(STORAGE_KEY);
		if (lastSeen === CURRENT_VERSION) return;

		// Find entries newer than what the user last saw
		const unseen = lastSeen
			? CHANGELOG.filter((entry) => semverGt(entry.version, lastSeen))
			: CHANGELOG.slice(0, 1); // First launch: show latest only

		if (unseen.length > 0) {
			setUnseenEntries(unseen);
			setVisible(true);
		}
	}, []);

	const dismiss = useCallback(() => {
		setVisible(false);
		localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
	}, []);

	if (!visible || unseenEntries.length === 0) return null;

	return (
		<div
			data-testid="whats-new-overlay"
			className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/50"
			onClick={dismiss}
			onKeyDown={(e) => {
				if (e.key === "Escape") dismiss();
			}}
		>
			<div
				className="mx-4 max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				<h2 className="mb-1 text-lg font-semibold text-foreground">What's New</h2>
				<p className="mb-4 text-xs text-muted-foreground">Recent updates to ThreatForge</p>

				{unseenEntries.map((entry) => (
					<div key={entry.version} className="mb-4">
						<div className="mb-2 flex items-baseline gap-2">
							<span className="text-sm font-medium text-foreground">v{entry.version}</span>
							<span className="text-xs text-muted-foreground">{entry.date}</span>
						</div>
						<ul className="space-y-1">
							{entry.changes.map((change) => (
								<li key={change} className="flex gap-2 text-xs text-foreground/80">
									<span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
									{change}
								</li>
							))}
						</ul>
					</div>
				))}

				<button
					type="button"
					onClick={dismiss}
					className="mt-2 w-full rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				>
					Got it
				</button>
			</div>
		</div>
	);
}
