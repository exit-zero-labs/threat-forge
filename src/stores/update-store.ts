import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isTauri } from "@/lib/platform";

interface UpdateInfo {
	version: string;
	date: string | null;
	body: string | null;
}

interface UpdateState {
	/** Whether a check is currently in progress */
	isChecking: boolean;
	/** Whether an install is currently in progress */
	isInstalling: boolean;
	/** Available update info, if any */
	updateAvailable: UpdateInfo | null;
	/** Timestamp (ms) of the last update check */
	lastCheckTime: number | null;
	/** Version the user chose to skip */
	skippedVersion: string | null;
	/** Whether the update notification bar is dismissed for this session */
	dismissed: boolean;
	/** Error message from a failed install attempt */
	installError: string | null;
	/** Error message from the last update check, cleared once one succeeds */
	checkError: string | null;

	// Actions
	checkForUpdate: () => Promise<void>;
	installUpdate: () => Promise<void>;
	dismissUpdate: () => void;
	skipVersion: (version: string) => void;
}

/** Interval between automatic checks: 24 hours in milliseconds. */
const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const useUpdateStore = create<UpdateState>()(
	persist(
		(set, get) => ({
			isChecking: false,
			isInstalling: false,
			updateAvailable: null,
			lastCheckTime: null,
			skippedVersion: null,
			dismissed: false,
			installError: null,
			checkError: null,

			checkForUpdate: async () => {
				if (!isTauri() || get().isChecking) return;

				set({ isChecking: true });
				try {
					const { invoke } = await import("@tauri-apps/api/core");
					const info = await invoke<UpdateInfo | null>("check_for_update");
					set({
						updateAvailable: info,
						lastCheckTime: Date.now(),
						dismissed: false,
						checkError: null,
					});
				} catch (err) {
					// A failed check is recorded as one, not passed off as a check that found
					// nothing. The app cannot install an update until releases are signed, so this
					// is the expected path today and the user is entitled to know it (#259).
					// The timestamp is still written, because it throttles the retry.
					const message = err instanceof Error ? err.message : String(err);
					set({ lastCheckTime: Date.now(), checkError: message });
				} finally {
					set({ isChecking: false });
				}
			},

			installUpdate: async () => {
				if (!isTauri() || get().isInstalling) return;

				set({ isInstalling: true, installError: null });
				try {
					const { invoke } = await import("@tauri-apps/api/core");
					await invoke("install_update");
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					set({ installError: message });
				} finally {
					set({ isInstalling: false });
				}
			},

			dismissUpdate: () => set({ dismissed: true }),

			skipVersion: (version) =>
				set({ skippedVersion: version, dismissed: true, updateAvailable: null }),
		}),
		{
			name: "threatforge-updates",
			// `checkError` travels with the timestamp it describes. Persisting one without the
			// other is what made the old bug survive a restart: `lastCheckTime` came back, the
			// error did not, and the next launch skipped its re-check because the stamp looked
			// recent — so Settings showed a clean "Last checked" for a check that had failed.
			partialize: (state) => ({
				lastCheckTime: state.lastCheckTime,
				skippedVersion: state.skippedVersion,
				checkError: state.checkError,
			}),
		},
	),
);

/** Check for updates on app launch if enough time has passed. */
export function checkOnLaunch(): void {
	const { lastCheckTime, checkForUpdate } = useUpdateStore.getState();
	const now = Date.now();
	if (!lastCheckTime || now - lastCheckTime > AUTO_CHECK_INTERVAL_MS) {
		void checkForUpdate();
	}
}
