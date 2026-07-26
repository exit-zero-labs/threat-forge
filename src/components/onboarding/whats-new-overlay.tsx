import { useCallback, useEffect, useState } from "react";
import { type ChangelogEntry, markChangelogSeen, unseenChangelogEntries } from "@/lib/whats-new";

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
		markChangelogSeen();
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
