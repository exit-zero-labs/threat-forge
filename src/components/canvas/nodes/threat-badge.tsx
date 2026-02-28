import { useModelStore } from "@/stores/model-store";

export function ThreatBadge({ count }: { count: number }) {
	return (
		<div className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-tf-ember px-1 text-[9px] font-bold text-white">
			{count}
		</div>
	);
}

export function useThreatCount(elementId: string): number {
	return useModelStore((s) => {
		if (!s.model) return 0;
		return s.model.threats.filter((t) => t.element === elementId).length;
	});
}
