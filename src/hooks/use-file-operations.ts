import { useCallback } from "react";
import { getFileAdapter } from "@/lib/adapters/get-file-adapter";
import { generateHtmlReport } from "@/lib/export/export-html";
import { captureCanvasIntoModel } from "@/lib/model-capture";
import { buildLayoutFromModel } from "@/lib/model-layout-utils";
import { useCanvasStore } from "@/stores/canvas-store";
import { useDocumentRegistry } from "@/stores/document-registry";
import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { DiagramLayout, ThreatModel } from "@/types/threat-model";

function todayString(): string {
	return new Date().toISOString().split("T")[0];
}

function sanitizeFilename(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/** Build an author string like "Jane Doe <jane@example.com>" from settings. */
function getAuthorIdentity(): string {
	const { authorName, authorEmail } = useSettingsStore.getState().settings;
	if (authorName && authorEmail) return `${authorName} <${authorEmail}>`;
	if (authorName) return authorName;
	if (authorEmail) return authorEmail;
	return "";
}

/**
 * Keep the active document's file-scoped settings in sync with a just-saved model. The
 * document session owns `fileSettings`; `setModel` refreshes the model but not the cached
 * settings, so a save that rewrites metadata refreshes the session's copy here.
 */
function syncActiveFileSettings(model: ThreatModel): void {
	const registry = useDocumentRegistry.getState();
	const activeId = registry.activeDocumentId;
	if (!activeId) return;
	registry.setDocumentFileSettings(activeId, model.metadata.settings ?? null);
}

/** Capture the active document's live canvas geometry into a model about to be written. */
function captureActiveCanvas(model: ThreatModel): ThreatModel {
	return captureCanvasIntoModel(model, useCanvasStore.getState());
}

export function useFileOperations() {
	const model = useModelStore((s) => s.model);
	const filePath = useModelStore((s) => s.filePath);
	const isDirty = useModelStore((s) => s.isDirty);
	const setModel = useModelStore((s) => s.setModel);

	const newModel = useCallback(async () => {
		if (isDirty) {
			const adapter = await getFileAdapter();
			const discard = await adapter.confirmDiscard();
			if (!discard) return;
		}

		const adapter = await getFileAdapter();
		const identity = getAuthorIdentity();
		const { authorName } = useSettingsStore.getState().settings;
		const created = await adapter.createNewModel("Untitled Threat Model", authorName || "");
		// Populate created_by from settings
		if (identity) {
			created.metadata.created_by = identity;
		}

		const registry = useDocumentRegistry.getState();
		if (registry.activeDocumentId) registry.closeDocument(registry.activeDocumentId);
		// New models use default positions, so there is no pending layout to apply.
		// The new document owns its own file settings (seeded from metadata by createDocument).
		registry.createDocument({ model: created, filePath: null, pendingLayout: null });
		// syncFromModel runs from the DfdCanvas effect once the new bundle is active.
	}, [isDirty]);

	const openModel = useCallback(async () => {
		if (isDirty) {
			const adapter = await getFileAdapter();
			const discard = await adapter.confirmDiscard();
			if (!discard) return;
		}

		const adapter = await getFileAdapter();
		let result: { model: ThreatModel; path: string | null } | null;
		try {
			result = await adapter.openThreatModel();
		} catch (err) {
			// Both adapters reject documents they cannot read: the desktop reader on schema
			// version and reference errors, the browser parser on malformed dates and shapes.
			const msg = err instanceof Error ? err.message : String(err);
			window.alert(`Open failed: ${msg}`);
			return;
		}
		if (!result) return;

		const { model: loaded, path } = result;

		// Build layout from inline positions (new format) or try sidecar (old format).
		let pendingLayout: DiagramLayout | null;
		const inlineLayout = buildLayoutFromModel(loaded);
		if (inlineLayout) {
			pendingLayout = inlineLayout;
		} else if (loaded.diagrams.length > 0 && loaded.diagrams[0].layout_file && path) {
			// Fallback: try loading old sidecar layout file
			pendingLayout = await adapter.openLayout(path, loaded.diagrams[0].layout_file);
		} else {
			pendingLayout = null;
		}

		const registry = useDocumentRegistry.getState();
		if (registry.activeDocumentId) registry.closeDocument(registry.activeDocumentId);
		// createDocument seeds the new document's fileSettings from loaded.metadata.settings.
		registry.createDocument({ model: loaded, filePath: path, pendingLayout });
		// syncFromModel runs from the DfdCanvas effect once the new bundle is active.
	}, [isDirty]);

	const saveModel = useCallback(async () => {
		if (!model) return;

		const identity = getAuthorIdentity();
		const captured = captureActiveCanvas({
			...model,
			metadata: {
				...model.metadata,
				modified: todayString(),
				modified_by: identity || model.metadata.modified_by,
				last_edit_timestamp: Math.floor(Date.now() / 1000),
			},
		});

		const adapter = await getFileAdapter();
		const savedPath = await adapter.saveThreatModel(captured, filePath);
		if (!savedPath) return;

		setModel(captured, savedPath);
		syncActiveFileSettings(captured);
	}, [model, filePath, setModel]);

	const saveModelAs = useCallback(async () => {
		if (!model) return;

		const identity = getAuthorIdentity();
		const captured = captureActiveCanvas({
			...model,
			metadata: {
				...model.metadata,
				modified: todayString(),
				modified_by: identity || model.metadata.modified_by,
				last_edit_timestamp: Math.floor(Date.now() / 1000),
			},
		});

		const adapter = await getFileAdapter();
		const savedPath = await adapter.saveThreatModel(captured, null);
		if (!savedPath) return;

		setModel(captured, savedPath);
		syncActiveFileSettings(captured);
	}, [model, setModel]);

	const closeModel = useCallback(async () => {
		if (isDirty) {
			const adapter = await getFileAdapter();
			const discard = await adapter.confirmDiscard();
			if (!discard) return;
		}
		const registry = useDocumentRegistry.getState();
		if (registry.activeDocumentId) registry.closeDocument(registry.activeDocumentId);
		// With no active document the facades resolve to a fresh scratch bundle, so the canvas
		// is empty by construction — no explicit syncFromModel needed. File settings are disposed
		// with the closed document's session.
	}, [isDirty]);

	const importModel = useCallback(async () => {
		if (isDirty) {
			const adapter = await getFileAdapter();
			const discard = await adapter.confirmDiscard();
			if (!discard) return;
		}

		const adapter = await getFileAdapter();
		let result: { model: ThreatModel } | null;
		try {
			result = await adapter.importThreatModel();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			window.alert(`Import failed: ${msg}`);
			return;
		}
		if (!result) return;

		const { model: imported } = result;

		// Build layout from inline positions (imported models carry no sidecar reference).
		const pendingLayout = buildLayoutFromModel(imported);

		const registry = useDocumentRegistry.getState();
		if (registry.activeDocumentId) registry.closeDocument(registry.activeDocumentId);
		// Imported models have no file path — user must Save As to create a .thf file.
		// TM7 imports carry no ThreatForge file settings; createDocument seeds fileSettings to
		// null from the absent metadata.settings.
		registry.createDocument({ model: imported, filePath: null, pendingLayout });
	}, [isDirty]);

	const exportAsHtml = useCallback(async () => {
		if (!model) return;

		const captured = captureActiveCanvas(model);
		const html = generateHtmlReport(captured);
		const defaultName = sanitizeFilename(model.metadata.title) || "threat-model-report";

		const adapter = await getFileAdapter();
		await adapter.exportAsHtml(html, defaultName);
	}, [model]);

	return { newModel, openModel, importModel, saveModel, saveModelAs, closeModel, exportAsHtml };
}
