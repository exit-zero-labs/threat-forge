import { render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LegacyResidue } from "@/lib/adapters/keychain-adapter";
import { useDocumentRegistry } from "@/stores/document-registry";
import { createDocumentStores, setActiveStores } from "@/stores/document-stores";
import { useKeyResidueStore } from "@/stores/key-residue-store";
import type { DocumentId } from "@/types/document";
import type { ThreatModel } from "@/types/threat-model";

// Boundaries this layout test deliberately does not exercise: the ReactFlow canvas needs real
// layout, and the workspace/update hooks reach IndexedDB and the network. Stubbing them keeps the
// test on what step 5 verifies — the tab strip mount and the tabpanel relationship.
vi.mock("@/components/canvas/canvas", () => ({
	Canvas: () => <div data-testid="canvas-stub" />,
}));
vi.mock("@/hooks/use-workspace-restore", () => ({ useWorkspaceRestore: () => {} }));
vi.mock("@/hooks/use-workspace-persistence", () => ({ useWorkspacePersistence: () => {} }));
// Also a boundary: one case below fakes the Tauri global to prove the launch-time residue check
// is browser-only, and the real hook would then reach `@tauri-apps/api` for a menu event listener
// that only a webview can serve.
vi.mock("@/hooks/use-native-menu", () => ({ useNativeMenu: () => {} }));
vi.mock("@/stores/update-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/update-store")>()),
	checkOnLaunch: () => {},
}));

// The keychain adapter is the one boundary the launch-time residue check crosses. Mocked so
// this test exercises the wiring rather than IndexedDB, and recording the order of the calls,
// which is the property that matters: `hasKey` is what migrates and erases a pre-#133 slot.
let keychainLoads = 0;
let calls: string[] = [];
/** How many of the next adapter loads reject, as a failed dynamic import would. */
let adapterLoadFailures = 0;
/** The clear-text slot as the real adapter would see it, per provider. */
let slot: Record<string, LegacyResidue> = { anthropic: null, openai: null };
/** Whether `hasKey` migrates the slot away, as it does for every upgrading pre-#133 user. */
let hasKeyMigrates = false;
vi.mock("@/lib/adapters/get-keychain-adapter", () => ({
	getKeychainAdapter: async () => {
		keychainLoads += 1;
		if (adapterLoadFailures > 0) {
			adapterLoadFailures -= 1;
			throw new Error("Failed to fetch dynamically imported module: /assets/x-9f2a1c.js");
		}
		return {
			setKey: async () => undefined,
			hasKey: async (provider: string) => {
				calls.push(`hasKey:${provider}`);
				if (hasKeyMigrates) slot[provider] = null;
				return false;
			},
			deleteKey: async () => undefined,
			readLegacyResidue: async (provider: string) => {
				calls.push(`residue:${provider}`);
				return slot[provider] ?? null;
			},
		};
	},
}));

import { AppLayout } from "./app-layout";

function makeModel(title: string): ThreatModel {
	return {
		version: "1.0",
		metadata: { title, author: "", created: "", modified: "", description: "" },
		elements: [],
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [],
	};
}

function open(title: string): DocumentId {
	return useDocumentRegistry.getState().createDocument({
		model: makeModel(title),
		filePath: null,
		pendingLayout: null,
	});
}

beforeEach(() => {
	useDocumentRegistry.setState({ documents: {}, openDocumentIds: [], activeDocumentId: null });
	setActiveStores(createDocumentStores());
	keychainLoads = 0;
	calls = [];
	adapterLoadFailures = 0;
	slot = { anthropic: null, openai: null };
	hasKeyMigrates = false;
	useKeyResidueStore.setState({ residue: { anthropic: null, openai: null } });
});

describe("AppLayout document tabpanel relationship (#54 step 5)", () => {
	it("labels the tabpanel by the selected tab and resolves every tab's aria-controls", () => {
		open("A");
		const b = open("B"); // last created is active

		render(<AppLayout />);

		// The main landmark survives — role and labelling went on the wrapper, not on <main>.
		expect(screen.getByRole("main")).toBeInTheDocument();

		const tabs = screen.getAllByRole("tab");
		expect(tabs).toHaveLength(2);

		const panel = screen.getByRole("tabpanel");
		expect(panel.id).toBe("document-panel");
		const selectedTab = screen.getByRole("tab", { selected: true });
		expect(selectedTab.id).toBe(`tab-${b}`);
		expect(panel).toHaveAttribute("aria-labelledby", selectedTab.id);

		for (const tab of tabs) {
			const controlled = tab.getAttribute("aria-controls");
			expect(controlled).toBe("document-panel");
			if (controlled) expect(document.getElementById(controlled)).toBe(panel);
		}
	});

	it("renders no tablist or tabpanel with zero documents, keeping the new-document button and main landmark", () => {
		render(<AppLayout />);

		expect(screen.queryByRole("tablist")).toBeNull();
		expect(screen.queryByRole("tabpanel")).toBeNull();
		expect(screen.getByTestId("btn-new-document")).toBeInTheDocument();
		expect(screen.getByRole("main")).toBeInTheDocument();
	});
});

/**
 * #233: the whole point of escalating this out of the settings panel is that the user may never
 * open it. That requires the check to run at launch, in the browser only.
 */
describe("AppLayout clear-text key check at launch", () => {
	afterEach(() => {
		delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
		// The adapter-load case spies on `console.warn`; nothing else in this file should
		// inherit a silenced console.
		vi.restoreAllMocks();
	});

	it("reads clear-text residue at startup so the status bar can report it", async () => {
		slot = { anthropic: "retained", openai: null };

		await act(async () => {
			render(<AppLayout />);
		});

		expect(useKeyResidueStore.getState().residue).toEqual({
			anthropic: "retained",
			openai: null,
		});
		expect(screen.getByTestId("clear-text-key-status")).toBeInTheDocument();
	});

	it("settles the migration before the reading it acts on", async () => {
		slot = { anthropic: "retained", openai: "retained" };

		await act(async () => {
			render(<AppLayout />);
		});

		// The adapter's per-provider lock orders a read behind any in-flight operation, but at
		// launch there is none, so a reading taken before the migration would answer "retained"
		// for a slot the very next `hasKey` erases. Every `hasKey` must precede the reads whose
		// answers are committed to the store — which is the last read of each provider.
		let lastMigration = -1;
		calls.forEach((call, index) => {
			if (call.startsWith("hasKey:")) lastMigration = index;
		});
		expect(lastMigration).toBeGreaterThan(-1);
		expect([...calls.slice(lastMigration + 1)].sort()).toEqual([
			"residue:anthropic",
			"residue:openai",
		]);
	});

	it("does not open the key vault when there is no clear-text slot to migrate", async () => {
		await act(async () => {
			render(<AppLayout />);
		});

		// Reading the slot is a `localStorage` read; `hasKey` opens the keychain database. Doing
		// both unconditionally created that database at launch for every browser profile,
		// including the majority who never touch AI. Nothing is there to migrate here, so
		// nothing pays for the vault — and the probe's own answer is never committed, because
		// the migration it would have to be ordered behind never runs.
		expect(calls).toEqual([
			"residue:anthropic",
			"residue:openai",
			"residue:anthropic",
			"residue:openai",
		]);
		expect(useKeyResidueStore.getState().residue).toEqual({ anthropic: null, openai: null });
	});

	it("still reads the slot when the keychain adapter fails to load first", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		slot = { anthropic: "retained", openai: null };
		adapterLoadFailures = 1;

		await act(async () => {
			render(<AppLayout />);
		});

		// A failed dynamic import must not take the reading down with it. It is reported where
		// the user can act on it — the settings panel's own adapter-load message — and the store
		// makes its own attempt, so a transient chunk failure does not silence a standing claim
		// about a readable credential.
		expect(useKeyResidueStore.getState().residue.anthropic).toBe("retained");
		expect(screen.getByTestId("clear-text-key-status")).toBeInTheDocument();
		// That panel message only reaches a user who opens the panel, which is the one thing
		// this launch check exists because they may never do. A permanently broken chunk has to
		// leave a trace a bug report can carry, as `loadAdapter` already logs one.
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("Clear-text key check could not load key storage"),
			expect.objectContaining({ message: expect.stringContaining("dynamically imported") }),
		);
	});

	it("does not raise a clear-text warning over a slot the launch migration removes", async () => {
		// The ordinary upgrade path for every pre-#133 user: the slot is there when the app
		// starts and is gone a moment later, migrated into the encrypted vault. Reading it
		// first left a standing red status-bar item, all session, over a condition that had
		// already been resolved — and routed to a panel saying the browser would not delete it.
		slot = { anthropic: "retained", openai: null };
		hasKeyMigrates = true;

		await act(async () => {
			render(<AppLayout />);
		});

		expect(useKeyResidueStore.getState().residue.anthropic).toBeNull();
		expect(screen.queryByTestId("clear-text-key-status")).toBeNull();
	});

	it("does not consult the keychain at startup on the desktop", async () => {
		(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
		slot = { anthropic: "retained", openai: "retained" };

		await act(async () => {
			render(<AppLayout />);
		});

		// There is no clear-text slot on desktop, so there is nothing to check — and the launch
		// path does not load the keychain adapter to ask.
		expect(keychainLoads).toBe(0);
		expect(calls).toEqual([]);
		expect(useKeyResidueStore.getState().residue.anthropic).toBeNull();
		expect(screen.queryByTestId("clear-text-key-status")).toBeNull();
	});
});
