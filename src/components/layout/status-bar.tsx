import type { DocumentPersistenceState, WorkspaceUnavailableReason } from "@/lib/persistence/types";
import { useDocumentRegistry } from "@/stores/document-registry";
import { useHistoryStore } from "@/stores/history-store";
import { useModelStore } from "@/stores/model-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

/**
 * What the local-persistence indicator says. `attention` states are announced to assistive
 * technology; routine saving/saved transitions are not, so an edit burst does not produce a
 * screen-reader announcement every second.
 */
interface LocalPersistenceIndicator {
	text: string;
	detail: string;
	attention: boolean;
}

/**
 * Describe browser workspace persistence in one coalesced indicator (issue #56, D5).
 *
 * Scope: this reports fail-visible state only. Acting on it — inspecting, exporting, or clearing
 * a corrupt or oversized workspace — is `#55`'s recovery screen.
 *
 * Returns null when there is nothing to say: on the desktop, where the filesystem is the source
 * of truth and no workspace body is stored, and before the first local write of a session.
 */
function describeLocalPersistence(
	persistenceAvailable: boolean,
	unavailableReason: WorkspaceUnavailableReason | null,
	state: DocumentPersistenceState | undefined,
): LocalPersistenceIndicator | null {
	if (!persistenceAvailable) {
		if (!unavailableReason) return null;
		if (unavailableReason === "migration-failed" || unavailableReason === "corrupt") {
			return {
				text: "Recovery needed",
				detail:
					"Local storage could not be opened. Your work is safe in this tab until you close it.",
				attention: true,
			};
		}
		return {
			text: "This session won't be saved",
			detail:
				"This browser blocks local storage, so edits stay in this tab only. Save or export before closing it.",
			attention: true,
		};
	}

	switch (state?.status) {
		case "pending":
		case "writing":
			return {
				text: "Saving locally...",
				detail: "Saving this document to local storage.",
				attention: false,
			};
		case "saved":
			return {
				text: "Saved locally",
				detail: "This document is saved in this browser.",
				attention: false,
			};
		case "error":
			return {
				text: "Not saved locally",
				detail:
					state.errorKind === "quota-exceeded"
						? "Local storage is full, so recent changes are not being saved. Your work is still open here."
						: "Recent changes are not being saved locally. Your work is still open here.",
				attention: true,
			};
		case "corrupt":
			return {
				text: "Recovery needed",
				detail: "This document's stored copy could not be read. Nothing has been deleted.",
				attention: true,
			};
		default:
			return null;
	}
}

export function StatusBar() {
	const model = useModelStore((s) => s.model);
	const isDirty = useModelStore((s) => s.isDirty);
	const filePath = useModelStore((s) => s.filePath);
	const autosaveEnabled = useSettingsStore((s) => s.settings.autosaveEnabled);
	const pastLength = useHistoryStore((s) => s.past.length);
	const futureLength = useHistoryStore((s) => s.future.length);
	const activeDocumentId = useDocumentRegistry((s) => s.activeDocumentId);
	const persistenceAvailable = useWorkspaceStore((s) => s.persistenceAvailable);
	const unavailableReason = useWorkspaceStore((s) => s.unavailableReason);
	const persistenceState = useWorkspaceStore((s) =>
		activeDocumentId ? s.persistence[activeDocumentId] : undefined,
	);

	const elementCount = model?.elements.length ?? 0;
	const threatCount = model?.threats.length ?? 0;
	const flowCount = model?.data_flows.length ?? 0;

	// The file save status and the local persistence status are distinct: one tracks the on-disk
	// `.thf` file, the other the browser workspace copy.
	const localPersistence = describeLocalPersistence(
		persistenceAvailable,
		unavailableReason,
		persistenceState,
	);

	function renderSaveStatus() {
		if (isDirty) {
			return autosaveEnabled && filePath ? "Autosave pending..." : "Unsaved changes";
		}
		return "Saved";
	}

	return (
		<footer
			data-testid="status-bar"
			className="flex h-6 shrink-0 items-center border-t border-border bg-card px-3 text-xs text-muted-foreground"
		>
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
					{(pastLength > 0 || futureLength > 0) && (
						<>
							<Separator />
							<span className="tabular-nums">
								Undo: {pastLength} / Redo: {futureLength}
							</span>
						</>
					)}
				</>
			) : (
				<span>No model open</span>
			)}

			{/* Rendered whether or not a document is open: an unusable local store is worth knowing
			    about before the user starts working, not after. */}
			{localPersistence && (
				<>
					<Separator />
					<span
						data-testid="local-persistence-status"
						className={localPersistence.attention ? "text-destructive" : undefined}
						title={localPersistence.detail}
					>
						{localPersistence.text}
					</span>
				</>
			)}

			{/* A live region that is always mounted, so a state appearing for the first time is
			    still announced. It carries only the states that need attention: narrating every
			    routine "Saving.../Saved locally" transition would talk over the user as they type. */}
			<span data-testid="local-persistence-alert" role="status" className="sr-only">
				{localPersistence?.attention ? localPersistence.detail : ""}
			</span>

			{model && filePath && (
				<>
					<div className="flex-1" />
					<span className="truncate max-w-64 text-right" title={filePath}>
						{filePath}
					</span>
				</>
			)}
		</footer>
	);
}

function Separator() {
	return <span className="mx-2 text-border">|</span>;
}
