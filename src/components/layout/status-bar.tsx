import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";

export function StatusBar() {
	const model = useModelStore((s) => s.model);
	const isDirty = useModelStore((s) => s.isDirty);
	const filePath = useModelStore((s) => s.filePath);
	const autosaveEnabled = useSettingsStore((s) => s.settings.autosaveEnabled);

	const elementCount = model?.elements.length ?? 0;
	const threatCount = model?.threats.length ?? 0;
	const flowCount = model?.data_flows.length ?? 0;

	function renderSaveStatus() {
		if (isDirty) {
			return autosaveEnabled && filePath ? "Autosave pending..." : "Unsaved changes";
		}
		return "Saved";
	}

	return (
		<footer className="flex h-6 shrink-0 items-center border-t border-border bg-card px-3 text-xs text-muted-foreground">
			{model ? (
				<>
					<span>
						{elementCount} element{elementCount !== 1 ? "s" : ""}
					</span>
					<Separator />
					<span>
						{flowCount} flow{flowCount !== 1 ? "s" : ""}
					</span>
					<Separator />
					<span>
						{threatCount} threat{threatCount !== 1 ? "s" : ""}
					</span>
					<Separator />
					<span>{renderSaveStatus()}</span>
					{filePath && (
						<>
							<div className="flex-1" />
							<span className="truncate max-w-64 text-right" title={filePath}>
								{filePath}
							</span>
						</>
					)}
				</>
			) : (
				<span>No model open</span>
			)}
		</footer>
	);
}

function Separator() {
	return <span className="mx-2 text-border">|</span>;
}
