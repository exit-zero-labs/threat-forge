import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdateStore } from "./update-store";

/**
 * The update check fails on every shipped build: releases are unsigned, so there is no
 * `latest.json` to fetch. That is expected. Presenting it as a check that ran and found nothing
 * is not (#259).
 */

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@/lib/platform", () => ({ isTauri: () => true }));

function resetStore(): void {
	useUpdateStore.setState({
		isChecking: false,
		isInstalling: false,
		updateAvailable: null,
		lastCheckTime: null,
		skippedVersion: null,
		dismissed: false,
		installError: null,
		checkError: null,
	});
}

describe("update store check failures", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetStore();
	});

	it("records the reason a check failed instead of reporting a completed check", async () => {
		invokeMock.mockRejectedValue(new Error("Could not fetch a valid release JSON"));

		await useUpdateStore.getState().checkForUpdate();

		const state = useUpdateStore.getState();
		expect(state.checkError).toBe("Could not fetch a valid release JSON");
		expect(state.updateAvailable).toBeNull();
	});

	it("still stamps the time on a failure, because that is what throttles the retry", async () => {
		invokeMock.mockRejectedValue(new Error("network unreachable"));

		await useUpdateStore.getState().checkForUpdate();

		expect(useUpdateStore.getState().lastCheckTime).toBeGreaterThan(0);
	});

	it("persists the failure alongside the timestamp that describes it", () => {
		// `checkOnLaunch` skips a re-check for 24h after any stamped attempt, so if the error
		// were dropped on rehydrate the next launch would show a clean "Last checked".
		const persisted = useUpdateStore.persist.getOptions().partialize?.({
			...useUpdateStore.getState(),
			lastCheckTime: 1,
			checkError: "Could not fetch a valid release JSON",
		});
		expect(persisted).toMatchObject({
			lastCheckTime: 1,
			checkError: "Could not fetch a valid release JSON",
		});
	});

	it("clears a previous failure once a check succeeds", async () => {
		invokeMock.mockRejectedValue(new Error("network unreachable"));
		await useUpdateStore.getState().checkForUpdate();
		expect(useUpdateStore.getState().checkError).not.toBeNull();

		invokeMock.mockResolvedValue(null);
		await useUpdateStore.getState().checkForUpdate();

		expect(useUpdateStore.getState().checkError).toBeNull();
	});
});
