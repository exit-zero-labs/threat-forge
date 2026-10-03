import { ArrowDown } from "lucide-react";
import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";

/** Follow incoming content until the reader scrolls away from the bottom. */
export function ChatViewport({
	children,
	activity,
	runId,
}: {
	children: ReactNode;
	activity: unknown;
	runId?: number;
}) {
	const viewportRef = useRef<HTMLElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const following = useRef(true);
	const userScrolling = useRef(false);
	const [showJump, setShowJump] = useState(false);

	const jump = useCallback(() => {
		following.current = true;
		userScrolling.current = false;
		setShowJump(false);
		const viewport = viewportRef.current;
		if (viewport) {
			viewport.scrollTo({ top: viewport.scrollHeight, behavior: "instant" });
		}
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: a submitted turn starts at the latest message
	useLayoutEffect(() => {
		jump();
	}, [runId, jump]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: activity signals a transcript update after DOM layout
	useLayoutEffect(() => {
		if (following.current) jump();
	}, [activity, jump]);

	useLayoutEffect(() => {
		const viewport = viewportRef.current;
		const content = contentRef.current;
		if (!viewport || !content || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => {
			if (following.current) jump();
		});
		observer.observe(viewport);
		observer.observe(content);
		return () => observer.disconnect();
	}, [jump]);

	return (
		<div className="relative min-h-0 min-w-0 flex-1">
			<section
				ref={viewportRef}
				data-testid="chat-messages"
				aria-label="Conversation"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: the scrollable conversation needs keyboard access
				tabIndex={0}
				className="relative h-full overflow-y-auto overflow-x-hidden overscroll-contain [overflow-anchor:none]"
				onWheel={(event) => {
					userScrolling.current = true;
					if (event.deltaY < 0) following.current = false;
				}}
				onPointerDown={(event) => {
					if (event.target === event.currentTarget) {
						userScrolling.current = true;
						following.current = false;
					}
				}}
				onKeyDown={(event) => {
					if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) {
						userScrolling.current = true;
						following.current = false;
					}
				}}
				onScroll={(event) => {
					if (!userScrolling.current) return;
					const el = event.currentTarget;
					following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
					setShowJump(!following.current);
				}}
			>
				<div ref={contentRef} className="flex min-w-0 flex-col gap-5 px-0.5 pt-2 pb-6">
					{children}
				</div>
			</section>
			{showJump && (
				<button
					type="button"
					onClick={jump}
					className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background px-3 py-1.5 text-xs shadow-md transition-colors hover:bg-accent"
				>
					<ArrowDown className="size-3.5" /> Jump to latest
				</button>
			)}
		</div>
	);
}
