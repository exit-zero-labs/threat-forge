import { cn } from "@/lib/utils";
import type { DfdNodeData } from "@/stores/canvas-store";

export function TrustBoundaryNode({ data, selected }: { data: DfdNodeData; selected?: boolean }) {
	return (
		<div
			className={cn(
				"h-full w-full rounded-lg border-2 border-dashed p-2 transition-colors",
				selected ? "border-tf-ember/60 bg-tf-ember/5" : "border-muted-foreground/30 bg-muted/5",
			)}
		>
			<div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{data.boundaryName ?? data.label}
			</div>
		</div>
	);
}
