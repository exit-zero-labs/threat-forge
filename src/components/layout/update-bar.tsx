import { Download, Loader2, X } from "lucide-react";
import { useUpdateStore } from "@/stores/update-store";

export function UpdateBar() {
	const updateAvailable = useUpdateStore((s) => s.updateAvailable);
	const skippedVersion = useUpdateStore((s) => s.skippedVersion);
	const dismissed = useUpdateStore((s) => s.dismissed);
	const isInstalling = useUpdateStore((s) => s.isInstalling);
	const installError = useUpdateStore((s) => s.installError);
	const installUpdate = useUpdateStore((s) => s.installUpdate);
	const dismissUpdate = useUpdateStore((s) => s.dismissUpdate);
	const skipVersion = useUpdateStore((s) => s.skipVersion);

	if (!updateAvailable || dismissed) return null;
	if (skippedVersion === updateAvailable.version) return null;

	return (
		<div className="flex items-center justify-between gap-3 border-b border-primary/20 bg-primary/5 px-4 py-1.5">
			<div className="flex items-center gap-2 text-sm text-foreground">
				<Download className="h-3.5 w-3.5 text-primary" />
				<span>
					Update available: <strong>v{updateAvailable.version}</strong>
				</span>
				{installError && (
					<span className="text-xs text-destructive">Install failed: {installError}</span>
				)}
			</div>
			<div className="flex items-center gap-1.5">
				<button
					type="button"
					disabled={isInstalling}
					onClick={() => void installUpdate()}
					className="rounded border border-primary/30 bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
				>
					{isInstalling ? (
						<span className="flex items-center gap-1">
							<Loader2 className="h-3 w-3 animate-spin" />
							Installing...
						</span>
					) : (
						"Install Now"
					)}
				</button>
				<button
					type="button"
					onClick={dismissUpdate}
					className="rounded px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					Later
				</button>
				<button
					type="button"
					onClick={() => skipVersion(updateAvailable.version)}
					className="rounded px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					Skip
				</button>
				<button
					type="button"
					onClick={dismissUpdate}
					className="ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
				>
					<X className="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	);
}
