import { invoke } from "@tauri-apps/api/core";
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

			checkForUpdate: async () => {
				if (!isTauri() || get().isChecking) return;

				set({ isChecking: true });
				try {
					const info = await invoke<UpdateInfo | null>("check_for_update");
					set({
						updateAvailable: info,
						lastCheckTime: Date.now(),
						dismissed: false,
					});
				} catch {
					// Silently fail — updater may not be configured yet
				} finally {
					set({ isChecking: false });
				}
			},

			installUpdate: async () => {
				if (!isTauri() || get().isInstalling) return;

				set({ isInstalling: true });
				try {
					await invoke("install_update");
				} catch {
					// Install may fail if no update available or network issues
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
			partialize: (state) => ({
				lastCheckTime: state.lastCheckTime,
				skippedVersion: state.skippedVersion,
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
