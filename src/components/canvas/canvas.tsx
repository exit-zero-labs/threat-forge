import { FolderOpen, Github } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useFileOperations } from "@/hooks/use-file-operations";
import { TIPS } from "@/lib/tips";
import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";

const LazyDfdCanvas = lazy(() => import("./dfd-canvas").then((m) => ({ default: m.DfdCanvas })));

export function Canvas() {
	const model = useModelStore((s) => s.model);

	if (!model) {
		return <EmptyCanvas />;
	}

	return (
		<div data-testid="canvas-area" className="h-full w-full">
			<Suspense
				fallback={
					<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
						Loading canvas...
					</div>
				}
			>
				<LazyDfdCanvas />
			</Suspense>
		</div>
	);
}

function EmptyCanvas() {
	const { newModel, openModel } = useFileOperations();

	return (
		<div
			data-testid="empty-canvas"
			className="relative flex h-full flex-col items-center bg-background"
		>
			{/* Main content — centered with upward bias */}
			<div className="flex flex-1 flex-col items-center justify-center pb-24">
				<img src="/logo_square.png" alt="ThreatForge" className="mb-6 h-20 w-20 drop-shadow-md" />
				<h2 className="text-xl font-semibold tracking-tight">ThreatForge</h2>
				<p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
					Create a new threat model or open an existing one to get started.
				</p>

				<div className="mt-6 flex gap-3">
					<button
						type="button"
						data-testid="btn-empty-new"
						className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
						onClick={() => void newModel()}
					>
						New Model
					</button>
					<button
						type="button"
						data-testid="btn-empty-open"
						className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
						onClick={() => void openModel()}
					>
						<FolderOpen className="h-4 w-4" />
						Open Existing
					</button>
				</div>

				<div className="mt-10 h-12 max-w-md">
					<RotatingTip />
				</div>
			</div>

			{/* Footer */}
			<footer className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-4 border-t border-border/50 px-4 py-3">
				<span className="text-xs text-muted-foreground/60">Built by Exit Zero Labs LLC</span>
				<span className="text-muted-foreground/30">·</span>
				<button
					type="button"
					onClick={() =>
						window.open(
							"https://github.com/exit-zero-labs/threat-forge",
							"_blank",
							"noopener,noreferrer",
						)
					}
					className="flex items-center gap-1 text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
				>
					<Github className="h-3 w-3" />
					GitHub
				</button>
				<span className="text-muted-foreground/30">·</span>
				<span className="text-xs text-muted-foreground/40">v{__APP_VERSION__ ?? "dev"}</span>
			</footer>
		</div>
	);
}

function RotatingTip() {
	const reduceMotion = useSettingsStore((s) => s.settings.reduceMotion);
	const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));
	const [visible, setVisible] = useState(true);
	const prevIndex = useRef(tipIndex);

	const pickNextTip = useCallback(() => {
		let next: number;
		do {
			next = Math.floor(Math.random() * TIPS.length);
		} while (next === prevIndex.current && TIPS.length > 1);
		prevIndex.current = next;
		return next;
	}, []);

	useEffect(() => {
		if (reduceMotion) return;

		const interval = setInterval(() => {
			// Fade out
			setVisible(false);
			// After fade-out, swap tip and fade in
			setTimeout(() => {
				setTipIndex(pickNextTip());
				setVisible(true);
			}, 400);
		}, 7000);

		return () => clearInterval(interval);
	}, [reduceMotion, pickNextTip]);

	return (
		<p
			className="text-center text-xs italic text-muted-foreground/60"
			style={{
				opacity: visible ? 1 : 0,
				transition: reduceMotion ? "none" : "opacity 400ms ease-in-out",
			}}
		>
			{TIPS[tipIndex]}
		</p>
	);
}
