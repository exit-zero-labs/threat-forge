import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect } from "react";
import { useAutosave } from "@/hooks/use-autosave";
import { useCloseGuard } from "@/hooks/use-close-guard";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useNativeMenu } from "@/hooks/use-native-menu";
import { useOnboardingTriggers } from "@/hooks/use-onboarding-triggers";
import { useWindowTitle } from "@/hooks/use-window-title";
import { useWorkspacePersistence } from "@/hooks/use-workspace-persistence";
import { useWorkspaceRestore } from "@/hooks/use-workspace-restore";
import { getKeychainAdapter } from "@/lib/adapters/get-keychain-adapter";
import { isTauri } from "@/lib/platform";
import { useDocumentRegistry } from "@/stores/document-registry";
import { RESIDUE_PROVIDERS, useKeyResidueStore } from "@/stores/key-residue-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";
import { checkOnLaunch } from "@/stores/update-store";
import { FONT_SIZE_PX } from "@/types/settings";
import { Canvas } from "../canvas/canvas";
import { CommandPalette } from "../command-palette";
import { GuideProvider } from "../onboarding/guide-provider";

import { WhatsNewOverlay } from "../onboarding/whats-new-overlay";
import { ComponentPalette } from "../palette/component-palette";
import { KeyboardShortcutsDialog } from "../panels/keyboard-shortcuts-dialog";
import { RightPanel } from "../panels/right-panel";
import { SettingsDialog } from "../panels/settings-dialog";
import { ResizeHandle } from "../ui/resize-handle";
import { DocumentTabStrip } from "./document-tab-strip";
import { StatusBar } from "./status-bar";
import { TopMenuBar } from "./top-menu-bar";
import { UpdateBar } from "./update-bar";

export function AppLayout() {
	const leftPanelOpen = useUiStore((s) => s.leftPanelOpen);
	const leftPanelWidth = useUiStore((s) => s.leftPanelWidth);
	const rightPanelOpen = useUiStore((s) => s.rightPanelOpen);
	const rightPanelWidth = useUiStore((s) => s.rightPanelWidth);
	const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);
	const closeCommandPalette = useUiStore((s) => s.closeCommandPalette);
	const activeDocumentId = useDocumentRegistry((s) => s.activeDocumentId);
	const keyboardShortcutsDialogOpen = useUiStore((s) => s.keyboardShortcutsDialogOpen);
	const settingsDialogOpen = useSettingsStore((s) => s.settingsDialogOpen);
	useKeyboardShortcuts();
	useNativeMenu();
	useAutosave();
	// Browser workspace persistence: restore reads storage after first paint and marks
	// availability; the autosave hook only writes once it reports available.
	useWorkspaceRestore();
	useWorkspacePersistence();
	useOnboardingTriggers();
	useWindowTitle();
	// Window/application close guards. Returns the desktop close-summary modal (or null).
	const closeGuardModal = useCloseGuard();
	useEffect(() => checkOnLaunch(), []);

	// Browser only: a clear-text API key left by a pre-encryption version is a condition the
	// user may never open AI settings to find, so the status bar has to be able to report it
	// from launch (#233). Measured cost and the decision not to defer it behind idle time are
	// in the plan's replan log (2026-07-27, "Step 5 measurement recorded").
	useEffect(() => {
		if (isTauri()) return;
		void (async () => {
			try {
				const adapter = await getKeychainAdapter();
				// Probe first, and pay for the vault only if there is something to migrate. The
				// slot read is a `localStorage` read that never opens the keychain database,
				// while `hasKey` does — so calling `hasKey` unconditionally created that database
				// at launch for every browser profile, including the ones that never touch AI.
				// The answer is deliberately not committed to the store: `migrateLegacyKey` may
				// be about to erase the slot it just reported.
				const probes = await Promise.allSettled(
					RESIDUE_PROVIDERS.map((name) => adapter.readLegacyResidue?.(name)),
				);
				const anySlot = probes.some((probe) => probe.status === "fulfilled" && probe.value != null);
				// Settle the migration before the read that *is* committed. `hasKey` is what
				// moves a pre-#133 key into the vault and erases the slot, and at launch the
				// adapter's per-provider lock orders a read behind nothing, so a committed read
				// issued first would answer "retained" for a slot the very next call removes — a
				// standing red indicator, for every upgrading user, over a resolved condition.
				// Settled independently so one provider's fault does not skip the other's.
				if (anySlot) {
					await Promise.allSettled(RESIDUE_PROVIDERS.map((name) => adapter.hasKey(name)));
				}
			} catch (err) {
				// Logged rather than swallowed: the authored `KEYCHAIN_LOAD_ERROR` reaches a user
				// who opens AI settings, and a permanently broken chunk has to leave a trace for
				// one who never does. The refresh below leaves the previous value rather than
				// claiming absence.
				console.warn("Clear-text key check could not load key storage:", err);
			}
			await useKeyResidueStore.getState().refreshAllResidue();
		})();
	}, []);

	// Apply font size preference to <html> so rem-based sizes cascade
	const fontSize = useSettingsStore((s) => s.settings.fontSize);
	useEffect(() => {
		const px = FONT_SIZE_PX[fontSize];
		if (px != null) {
			document.documentElement.style.fontSize = `${px}px`;
		}
		return () => {
			document.documentElement.style.fontSize = "";
		};
	}, [fontSize]);

	const handleLeftResize = useCallback((delta: number) => {
		const current = useUiStore.getState().leftPanelWidth;
		useUiStore.getState().setLeftPanelWidth(current + delta);
	}, []);

	const handleRightResize = useCallback((delta: number) => {
		const current = useUiStore.getState().rightPanelWidth;
		useUiStore.getState().setRightPanelWidth(current - delta);
	}, []);

	return (
		<ReactFlowProvider>
			<div
				data-testid="app-layout"
				className="flex h-full w-full flex-col bg-background text-foreground"
			>
				<TopMenuBar />
				<UpdateBar />

				<div className="flex flex-1 overflow-hidden">
					{/* Left sidebar — Component palette */}
					{leftPanelOpen && (
						<aside
							className="relative shrink-0 border-r border-border bg-card"
							style={{ width: leftPanelWidth }}
						>
							<ComponentPalette />
							<ResizeHandle side="right" onResize={handleLeftResize} />
						</aside>
					)}

					{/* Main canvas area: the tab strip sits above the canvas, which becomes the tabpanel
					    the tablist controls. The role/labelling go on the wrapper, not on <main>, so the
					    main landmark survives (`#54` D4). */}
					<main className="flex flex-1 flex-col overflow-hidden">
						<DocumentTabStrip />
						<div
							className="flex-1 overflow-hidden"
							{...(activeDocumentId
								? {
										id: "document-panel",
										role: "tabpanel",
										"aria-labelledby": `tab-${activeDocumentId}`,
									}
								: {})}
						>
							<Canvas />
						</div>
					</main>

					{/* Right panel — Properties / Threats */}
					{rightPanelOpen && (
						<aside
							className="relative shrink-0 border-l border-border bg-card"
							style={{ width: rightPanelWidth }}
						>
							<ResizeHandle side="left" onResize={handleRightResize} />
							<RightPanel />
						</aside>
					)}
				</div>

				<StatusBar />

				{/* Dialogs */}
				{settingsDialogOpen && <SettingsDialog />}
				{keyboardShortcutsDialogOpen && <KeyboardShortcutsDialog />}
				<CommandPalette open={commandPaletteOpen} onClose={closeCommandPalette} />
				<GuideProvider />
				<WhatsNewOverlay />
				{closeGuardModal}
			</div>
		</ReactFlowProvider>
	);
}
