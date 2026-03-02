import { BookOpen, Check, X } from "lucide-react";
import { ALL_GUIDES } from "@/lib/onboarding/guides";
import { useOnboardingStore } from "@/stores/onboarding-store";

/**
 * Dialog listing all available guides. Users can start any guide or re-run completed ones.
 */
export function GuidePicker({ onClose }: { onClose: () => void }) {
	const completedGuideIds = useOnboardingStore((s) => s.completedGuideIds);
	const startGuide = useOnboardingStore((s) => s.startGuide);
	const resetGuide = useOnboardingStore((s) => s.resetGuide);

	const handleStart = (guideId: string) => {
		const isCompleted = completedGuideIds.includes(guideId);
		if (isCompleted) {
			resetGuide(guideId);
		}
		startGuide(guideId);
		onClose();
	};

	return (
		<div
			className="fixed inset-0 z-[9997] flex items-center justify-center"
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
		>
			{/* Backdrop */}
			<div className="absolute inset-0 bg-black/50" />

			{/* Dialog */}
			<div
				data-testid="guide-picker"
				className="relative z-10 w-80 rounded-lg border border-border bg-card p-4 shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				<div className="mb-3 flex items-center justify-between">
					<h2 className="text-sm font-semibold text-foreground">Guided Tours</h2>
					<button
						type="button"
						onClick={onClose}
						className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="space-y-2">
					{ALL_GUIDES.map((guide) => {
						const isCompleted = completedGuideIds.includes(guide.id);
						return (
							<button
								key={guide.id}
								type="button"
								onClick={() => handleStart(guide.id)}
								className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-accent"
							>
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
									{isCompleted ? <Check className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
								</div>
								<div className="min-w-0">
									<div className="text-xs font-medium text-foreground">{guide.name}</div>
									<div className="text-xs text-muted-foreground">
										{guide.steps.length} steps
										{isCompleted && " — completed"}
									</div>
								</div>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
