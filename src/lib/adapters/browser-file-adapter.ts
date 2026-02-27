import yaml from "js-yaml";
import type { DiagramLayout, ThreatModel } from "@/types/threat-model";
import type { FileAdapter } from "./file-adapter";

function todayString(): string {
	return new Date().toISOString().split("T")[0];
}

/**
 * Browser file adapter using File API + js-yaml.
 *
 * Open: `<input type="file">` element.
 * Save: serialize to YAML string → Blob → download link.
 * Layout: no persistence — positions reset on page reload.
 */
export class BrowserFileAdapter implements FileAdapter {
	async createNewModel(title: string, author: string): Promise<ThreatModel> {
		const today = todayString();
		return {
			version: "1.0",
			metadata: {
				title,
				author,
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

	async openThreatModel(): Promise<{ model: ThreatModel; path: string | null } | null> {
		const file = await pickFile(".yaml,.yml");
		if (!file) return null;

		const text = await file.text();
		const parsed = yaml.load(text) as ThreatModel;

		// Ensure arrays exist even if YAML omits empty ones
		parsed.elements ??= [];
		parsed.data_flows ??= [];
		parsed.trust_boundaries ??= [];
		parsed.threats ??= [];
		parsed.diagrams ??= [];

		// Ensure technologies arrays exist on elements
		for (const el of parsed.elements) {
			el.technologies ??= [];
		}

		return { model: parsed, path: file.name };
	}

	async saveThreatModel(model: ThreatModel, _path: string | null): Promise<string | null> {
		const yamlString = yaml.dump(model, {
			lineWidth: -1,
			noRefs: true,
			sortKeys: false,
			quotingType: '"',
		});

		const blob = new Blob([yamlString], { type: "application/x-yaml" });
		const filename = sanitizeFilename(model.metadata.title) || "model";
		downloadBlob(blob, `${filename}.threatforge.yaml`);
		return filename;
	}

	async openLayout(_modelPath: string, _layoutFile: string): Promise<DiagramLayout | null> {
		// Browser version doesn't persist layout
		return null;
	}

	async saveLayout(_modelPath: string, _layoutFile: string, _layout: DiagramLayout): Promise<void> {
		// Browser version doesn't persist layout
	}

	async confirmDiscard(): Promise<boolean> {
		return window.confirm("You have unsaved changes. Discard them?");
	}
}

function pickFile(accept: string): Promise<File | null> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = accept;
		input.onchange = () => {
			resolve(input.files?.[0] ?? null);
		};
		// Handle cancel — resolve null if no change event fires
		input.addEventListener("cancel", () => resolve(null));
		input.click();
	});
}

function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

function sanitizeFilename(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}
