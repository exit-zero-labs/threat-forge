import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

interface ResizeHandleProps {
	/** Which side of the panel this handle is on */
	side: "left" | "right";
	/** Called during drag with the delta from the start position */
	onResize: (delta: number) => void;
}

export function ResizeHandle({ side, onResize }: ResizeHandleProps) {
	const isDragging = useRef(false);
	const startX = useRef(0);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			if (e.button !== 0) return;
			e.preventDefault();
			isDragging.current = true;
			startX.current = e.clientX;

			// Prevent text selection during drag
			document.body.style.userSelect = "none";
			document.body.style.cursor = "col-resize";

			const handlePointerMove = (ev: PointerEvent) => {
				if (!isDragging.current) return;
				const delta = ev.clientX - startX.current;
				startX.current = ev.clientX;
				onResize(delta);
			};

			const handlePointerUp = () => {
				isDragging.current = false;
				document.body.style.userSelect = "";
				document.body.style.cursor = "";
				document.removeEventListener("pointermove", handlePointerMove);
				document.removeEventListener("pointerup", handlePointerUp);
			};

			document.addEventListener("pointermove", handlePointerMove);
			document.addEventListener("pointerup", handlePointerUp);
		},
		[onResize],
	);

	return (
		<div
			className={cn(
				"group absolute top-0 z-10 flex h-full w-1.5 cursor-col-resize items-center justify-center",
				side === "right" ? "right-0" : "left-0",
			)}
			onPointerDown={handlePointerDown}
		>
			<div className="h-full w-px bg-transparent transition-colors group-hover:bg-primary/40 group-active:bg-primary/60" />
		</div>
	);
}
