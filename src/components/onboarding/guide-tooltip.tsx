import { useEffect, useRef, useState } from "react";
import type { OnboardingStep } from "@/types/onboarding";

interface GuideTooltipProps {
	step: OnboardingStep;
	stepIndex: number;
	totalSteps: number;
	onNext: () => void;
	onPrev: () => void;
	onDismiss: () => void;
}

const ARROW_OFFSET = 12;
const TOOLTIP_MARGIN = 16;

/**
 * Positioned tooltip showing the current onboarding step content.
 * Anchors to the target element based on the step's placement setting.
 */
export function GuideTooltip({
	step,
	stepIndex,
	totalSteps,
	onNext,
	onPrev,
	onDismiss,
}: GuideTooltipProps) {
	const tooltipRef = useRef<HTMLDivElement>(null);
	const [style, setStyle] = useState<React.CSSProperties>({});
	const isLastStep = stepIndex === totalSteps - 1;

	useEffect(() => {
		const el = document.querySelector(step.targetSelector);
		if (!el || !tooltipRef.current) return;

		const targetRect = el.getBoundingClientRect();
		const tooltipRect = tooltipRef.current.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		let top = 0;
		let left = 0;

		switch (step.placement) {
			case "bottom":
				top = targetRect.bottom + ARROW_OFFSET;
				left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
				break;
			case "top":
				top = targetRect.top - tooltipRect.height - ARROW_OFFSET;
				left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
				break;
			case "left":
				top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
				left = targetRect.left - tooltipRect.width - ARROW_OFFSET;
				break;
			case "right":
				top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
				left = targetRect.right + ARROW_OFFSET;
				break;
		}

		// Clamp to viewport
		left = Math.max(TOOLTIP_MARGIN, Math.min(left, vw - tooltipRect.width - TOOLTIP_MARGIN));
		top = Math.max(TOOLTIP_MARGIN, Math.min(top, vh - tooltipRect.height - TOOLTIP_MARGIN));

		setStyle({ top, left });
	}, [step.targetSelector, step.placement]);

	// Focus trap — auto-focus on mount
	useEffect(() => {
		tooltipRef.current?.focus();
	}, []);

	return (
		<div
			ref={tooltipRef}
			data-testid="guide-tooltip"
			role="dialog"
			aria-label={step.title}
			tabIndex={-1}
			className="fixed z-[9999] w-72 rounded-lg border border-border bg-card p-4 shadow-xl outline-none"
			style={style}
			onKeyDown={(e) => {
				if (e.key === "Escape") {
					e.stopPropagation();
					onDismiss();
				}
			}}
		>
			{/* Step counter */}
			<div className="mb-1 text-xs text-muted-foreground">
				Step {stepIndex + 1} of {totalSteps}
			</div>

			{/* Title */}
			<h3 className="mb-1.5 text-sm font-semibold text-foreground">{step.title}</h3>

			{/* Content */}
			<p className="mb-4 text-xs leading-relaxed text-muted-foreground">{step.content}</p>

			{/* Navigation */}
			<div className="flex items-center justify-between">
				<button
					type="button"
					onClick={onDismiss}
					className="text-xs text-muted-foreground hover:text-foreground"
				>
					Skip
				</button>
				<div className="flex gap-2">
					{stepIndex > 0 && (
						<button
							type="button"
							onClick={onPrev}
							className="rounded px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
						>
							Back
						</button>
					)}
					<button
						type="button"
						onClick={onNext}
						className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
					>
						{isLastStep ? "Done" : "Next"}
					</button>
				</div>
			</div>
		</div>
	);
}
