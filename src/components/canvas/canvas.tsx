import { FolderOpen, Shield } from "lucide-react";
import { useFileOperations } from "@/hooks/use-file-operations";
import { useModelStore } from "@/stores/model-store";
import { DfdCanvas } from "./dfd-canvas";

export function Canvas() {
	const model = useModelStore((s) => s.model);

	if (!model) {
		return <EmptyCanvas />;
	}

	return (
		<div data-testid="canvas-area" className="h-full w-full">
			<DfdCanvas />
		</div>
	);
}

function EmptyCanvas() {
	const { newModel, openModel } = useFileOperations();

	return (
		<div
			data-testid="empty-canvas"
			className="flex h-full flex-col items-center justify-center gap-4 bg-background"
		>
			<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
				<Shield className="h-8 w-8 text-tf-signal" />
			</div>
			<div className="text-center">
				<h2 className="text-lg font-semibold">ThreatForge</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Create a new threat model or open an existing one to get started.
				</p>
			</div>
			<div className="mt-4 flex gap-3">
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
		</div>
	);
}
