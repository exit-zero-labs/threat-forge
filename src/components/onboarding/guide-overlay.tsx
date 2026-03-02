import { useCallback, useEffect, useState } from "react";

interface TargetRect {
	top: number;
	left: number;
	width: number;
	height: number;
}

const PADDING = 8;

/**
 * Full-screen overlay with a spotlight cutout around the target element.
 * Uses an SVG mask to create the dimmed-background-with-hole effect.
 */
export function GuideOverlay({
	targetSelector,
	onClickOutside,
}: {
	targetSelector: string;
	onClickOutside: () => void;
}) {
	const [rect, setRect] = useState<TargetRect | null>(null);

	const measure = useCallback(() => {
		const el = document.querySelector(targetSelector);
		if (!el) {
			setRect(null);
			return;
		}
		const r = el.getBoundingClientRect();
		setRect({
			top: r.top - PADDING,
			left: r.left - PADDING,
			width: r.width + PADDING * 2,
			height: r.height + PADDING * 2,
		});
	}, [targetSelector]);

	useEffect(() => {
		measure();
		window.addEventListener("resize", measure);
		window.addEventListener("scroll", measure, true);
		return () => {
			window.removeEventListener("resize", measure);
			window.removeEventListener("scroll", measure, true);
		};
	}, [measure]);

	if (!rect) return null;

	const vw = window.innerWidth;
	const vh = window.innerHeight;

	return (
		<div
			data-testid="guide-overlay"
			className="fixed inset-0 z-[9998]"
			onClick={onClickOutside}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClickOutside();
			}}
		>
			<svg className="absolute inset-0 h-full w-full" aria-hidden="true">
				<defs>
					<mask id="spotlight-mask">
						<rect width={vw} height={vh} fill="white" />
						<rect
							x={rect.left}
							y={rect.top}
							width={rect.width}
							height={rect.height}
							rx={8}
							fill="black"
						/>
					</mask>
				</defs>
				<rect width={vw} height={vh} fill="rgba(0,0,0,0.6)" mask="url(#spotlight-mask)" />
			</svg>
			{/* Highlight border around target */}
			<div
				className="pointer-events-none absolute rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-transparent"
				style={{
					top: rect.top,
					left: rect.left,
					width: rect.width,
					height: rect.height,
				}}
			/>
		</div>
	);
}
