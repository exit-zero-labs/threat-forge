import { Shield } from "lucide-react";
import { useModelStore } from "@/stores/model-store";
import type { ThreatModel } from "@/types/threat-model";
import { DfdCanvas } from "./dfd-canvas";

export function Canvas() {
	const model = useModelStore((s) => s.model);

	if (!model) {
		return <EmptyCanvas />;
	}

	return <DfdCanvas />;
}

function createEmptyModel(): ThreatModel {
	const today = new Date().toISOString().split("T")[0];
	return {
		version: "1.0",
		metadata: {
			title: "Untitled Threat Model",
			author: "",
			created: today,
			modified: today,
			description: "",
		},
		elements: [],
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [
			{
				id: "main-dfd",
				name: "Level 0 DFD",
				layout_file: ".threatforge/layouts/main-dfd.json",
			},
		],
	};
}

function EmptyCanvas() {
	const setModel = useModelStore((s) => s.setModel);

	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 bg-background">
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
					className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
					onClick={() => setModel(createEmptyModel(), null)}
				>
					New Model
				</button>
			</div>
		</div>
	);
}
