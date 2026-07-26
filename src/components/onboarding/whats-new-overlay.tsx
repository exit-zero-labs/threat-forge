import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "threatforge-last-seen-version";

/**
 * The build's own version, the same define the settings dialog, canvas badge, and site
 * footer read. Hard-coding it here once let this overlay announce a version the rest of
 * the app disagreed with (#246), so there is deliberately no second literal.
 */
const CURRENT_VERSION = __APP_VERSION__;

/** localStorage is user-writable; only an exact `major.minor.patch` value is comparable. */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

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

/** Newest first. Every version here is one that was actually tagged and released. */
const CHANGELOG: ChangelogEntry[] = [
	{
		version: "0.3.0",
		date: "2026-07-26",
		changes: [
			"AI now edits the model directly — it proposes real element, flow, and threat changes as native tool calls instead of text you copy back in",
			"You approve each proposed change on its own, and anything applied is a single undo away",
			"AI can read your current document and the component catalog before it suggests anything",
			"Refreshed OpenAI and Anthropic model catalog",
			"Open several models at once in a tabbed workspace",
			"Browser documents survive a refresh — work is saved locally as you go",
			"Browser API keys are encrypted at rest, and the web app now ships a strict Content-Security-Policy",
			"Document content sent to the AI is fenced as untrusted context",
			"Copy an individual threat as YAML, and see a summary badge for the whole model",
			"Keyboard and contrast fixes across the palette, welcome screen, and empty canvas",
		],
	},
	{
		version: "0.2.0",
		date: "2026-03-04",
		changes: [
			"AI chat: model selector, saved chat sessions, markdown rendering, and stop generating",
			"Text annotations on the canvas",
			"Rebuilt starter templates",
			"threatforge.dev — landing, downloads, and legal pages",
		],
	},
	{
		version: "0.1.0",
		date: "2026-03-02",
		changes: [
			"Component library with 44 pre-built technology components + text annotations",
			"STRIDE threat analysis engine with auto-generated threats",
			"AI chat pane with BYOK support (OpenAI, Anthropic)",
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
 * Changelog entries the user has not acknowledged yet, newest first, or an empty array
 * when there is nothing to announce.
 *
 * Exported so `useOnboardingTriggers` can ask the same question the overlay answers,
 * rather than approximating it and letting two overlays open at once.
 */
export function unseenChangelogEntries(): ChangelogEntry[] {
	const lastSeen = localStorage.getItem(STORAGE_KEY);
	if (lastSeen === CURRENT_VERSION) {
		return [];
	}

	// A stored version ahead of every version we know about cannot have come from this
	// app's own history. Builds up to 0.2.0 wrote a hard-coded "1.0.0" here (#246), so
	// treating that value as "already seen" would suppress the overlay forever. Fall
	// back to first-launch behavior instead, which self-heals on dismissal.
	const newestKnown = CHANGELOG[0]?.version ?? CURRENT_VERSION;
	const usableLastSeen =
		lastSeen !== null && SEMVER_PATTERN.test(lastSeen) && !semverGt(lastSeen, newestKnown)
			? lastSeen
			: null;

	// Entries newer than what the user last saw; on first launch, the newest one only.
	return usableLastSeen !== null
		? CHANGELOG.filter((entry) => semverGt(entry.version, usableLastSeen))
		: CHANGELOG.slice(0, 1);
}

/**
 * Shows a "What's New" overlay when the app version changes.
 * Checks localStorage to determine if the user has seen the current version.
 */
export function WhatsNewOverlay() {
	const [visible, setVisible] = useState(false);
	const [unseenEntries, setUnseenEntries] = useState<ChangelogEntry[]>([]);

	useEffect(() => {
		const unseen = unseenChangelogEntries();
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
				<p className="mb-4 text-xs text-muted-foreground">Recent updates to Threat Forge</p>

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
